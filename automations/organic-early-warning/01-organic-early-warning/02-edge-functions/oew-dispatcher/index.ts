// oew-dispatcher
// Lee incident + incident_diagnostics + brand_routing, calcula severidad final
// vs threshold, encola en public.notifications_outbox con source='oew_alert'.
// NUNCA hace POST directo a Slack — solo encola. La idempotencia es doble:
// lookup previo a incident_log + UNIQUE dedupe_key en outbox.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getOewClient, getHubClient, getPublicClient } from "../_shared/supabase.ts";
import { verifyInternalSecret } from "../_shared/secret.ts";
import { emitEvent } from "../_shared/run-events.ts";
import { buildIncidentAlertBlocks } from "../_shared/slack-blockkit-v2.ts";

const EVENT_SOURCE = "dispatcher";

type Severity = "WATCH" | "YELLOW" | "RED";

interface DispatcherRequest {
  incident_id?: string;
  force?: boolean;
}

interface IncidentRow {
  id: string;
  run_id: string;
  brand_id: string;
  severity: Severity;
  signal_count: number;
  signal_event_ids: string[];
  status: "open" | "resolved";
  dispatch_status: string;
  window_start: string | null;
  window_end: string | null;
  first_seen_at: string;
  payload: Record<string, unknown> | null;
}

interface DiagnosticRow {
  thematic_cluster: string | null;
  executive_summary: string | null;
  recommended_actions: string | null;
  top_urls: unknown;
  top_keywords: unknown;
  degraded: boolean;
}

interface BrandRoutingRow {
  slack_channel_id: string | null;
  team_lead_user_id: string | null;
  severity_threshold: Severity;
}

interface BrandRow {
  id: string;
  name: string | null;
  domain: string | null;
}

const SEVERITY_RANK: Record<Severity, number> = { WATCH: 1, YELLOW: 2, RED: 3 };

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function minutesBetween(start: string, end: Date): number {
  const startMs = Date.parse(start);
  if (!Number.isFinite(startMs)) return 0;
  return Math.max(0, Math.round((end.getTime() - startMs) / 60_000));
}

serve(async (req: Request) => {
  const authFail = verifyInternalSecret(req);
  if (authFail) return authFail;

  let body: DispatcherRequest;
  try {
    body = (await req.json()) as DispatcherRequest;
  } catch {
    return jsonResp({ ok: false, error: "invalid_json" }, 400);
  }

  const incidentId = body?.incident_id;
  const force = body?.force === true;
  if (!incidentId) return jsonResp({ ok: false, error: "missing_incident_id" }, 400);

  const oew = getOewClient();
  const hub = getHubClient();
  const pub = getPublicClient();

  let runId: string | null = null;
  let brandId: string | null = null;

  try {
    const { data: incident, error: incErr } = await oew
      .from("incidents")
      .select(
        "id, run_id, brand_id, severity, signal_count, signal_event_ids, status, dispatch_status, window_start, window_end, first_seen_at, payload",
      )
      .eq("id", incidentId)
      .maybeSingle<IncidentRow>();
    if (incErr) throw new Error(`incident lookup: ${incErr.message}`);
    if (!incident) return jsonResp({ ok: false, error: "incident_not_found" }, 404);

    runId = incident.run_id;
    brandId = incident.brand_id;

    if (incident.status === "resolved" && !force) {
      return jsonResp({ ok: false, error: "incident_status_resolved" }, 409);
    }

    if (!force) {
      const { data: existingLog, error: logErr } = await oew
        .from("incident_log")
        .select("id")
        .eq("incident_id", incidentId)
        .maybeSingle();
      if (logErr) throw new Error(`incident_log lookup: ${logErr.message}`);
      if (existingLog) {
        return jsonResp({
          ok: true,
          incident_id: incidentId,
          status: "already_dispatched",
          enqueued_count: 0,
        });
      }
    }

    const { data: diag, error: diagErr } = await oew
      .from("incident_diagnostics")
      .select("thematic_cluster, executive_summary, recommended_actions, top_urls, top_keywords, degraded")
      .eq("incident_id", incidentId)
      .maybeSingle<DiagnosticRow>();
    if (diagErr) throw new Error(`diagnostic lookup: ${diagErr.message}`);
    if (!diag) return jsonResp({ ok: false, error: "incident_diagnostics_not_found" }, 404);

    await emitEvent({
      client: oew,
      run_id: runId,
      brand_id: brandId,
      event_source: EVENT_SOURCE,
      event_type: "agent_started",
      payload: { incident_id: incidentId, force },
    });

    const { data: routing, error: routingErr } = await oew
      .from("brand_routing")
      .select("slack_channel_id, team_lead_user_id, severity_threshold")
      .eq("brand_id", brandId)
      .maybeSingle<BrandRoutingRow>();
    if (routingErr) throw new Error(`brand_routing lookup: ${routingErr.message}`);

    const fallbackChannel = Deno.env.get("SLACK_FALLBACK_CHANNEL") ?? null;
    const channelId = routing?.slack_channel_id ?? fallbackChannel;
    if (!channelId) {
      throw new Error("brand_routing_missing_and_no_fallback");
    }

    const severity = incident.severity;
    const threshold: Severity = routing?.severity_threshold ?? "YELLOW";

    if (SEVERITY_RANK[severity] < SEVERITY_RANK[threshold]) {
      const { error: updErr } = await oew
        .from("incidents")
        .update({ dispatch_status: "suppressed" })
        .eq("id", incidentId);
      if (updErr) throw new Error(`update suppressed: ${updErr.message}`);

      await emitEvent({
        client: oew,
        run_id: runId,
        brand_id: brandId,
        event_source: EVENT_SOURCE,
        event_type: "agent_completed",
        payload: { incident_id: incidentId, status: "suppressed_below_threshold" },
      });

      return jsonResp({
        ok: true,
        incident_id: incidentId,
        severity,
        status: "suppressed_below_threshold",
        brand_severity_threshold: threshold,
        enqueued_count: 0,
      });
    }

    const { data: brandRow, error: brandErr } = await hub
      .from("brands_registry")
      .select("id, name, domain")
      .eq("id", brandId)
      .maybeSingle<BrandRow>();
    if (brandErr) throw new Error(`brand lookup: ${brandErr.message}`);
    const brand: BrandRow = brandRow ?? { id: brandId, name: null, domain: null };

    const { blocks, text } = buildIncidentAlertBlocks({
      incident_id: incidentId,
      brand_name: brand.name ?? "Marca desconocida",
      brand_domain: brand.domain ?? undefined,
      severity,
      signal_count: incident.signal_count,
      thematic_cluster: diag.thematic_cluster ?? "",
      executive_summary: diag.executive_summary ?? "",
      recommended_actions: diag.recommended_actions ?? "",
      top_urls: diag.top_urls,
      top_keywords: diag.top_keywords,
      window_start: incident.window_start,
      window_end: incident.window_end,
      degraded: diag.degraded,
      team_lead_user_id: routing?.team_lead_user_id ?? undefined,
    });

    const dedupeChannel = `oew:${incidentId}:v1:${channelId}`;
    const enqueueRows: Array<Record<string, unknown>> = [
      {
        source: "oew_alert",
        target_type: "channel",
        channel_id: channelId,
        payload: { blocks, text },
        dedupe_key: dedupeChannel,
        status: "pending",
      },
    ];

    const dedupeKeys = [dedupeChannel];
    const teamLead = routing?.team_lead_user_id ?? null;

    if (teamLead && SEVERITY_RANK[severity] >= SEVERITY_RANK[threshold]) {
      const dedupeUser = `oew:${incidentId}:v1:${teamLead}`;
      enqueueRows.push({
        source: "oew_alert",
        target_type: "user",
        channel_id: teamLead,
        payload: { blocks, text },
        dedupe_key: dedupeUser,
        status: "pending",
      });
      dedupeKeys.push(dedupeUser);
    }

    const { error: enqErr } = await pub
      .from("notifications_outbox")
      .upsert(enqueueRows, { onConflict: "dedupe_key", ignoreDuplicates: true });
    if (enqErr) throw new Error(`outbox enqueue: ${enqErr.message}`);

    const dispatchedAt = new Date();
    const alertSentTo: string[] = [channelId];
    if (teamLead && SEVERITY_RANK[severity] >= SEVERITY_RANK[threshold]) alertSentTo.push(teamLead);

    const { error: logErr } = await oew
      .from("incident_log")
      .insert({
        incident_id: incidentId,
        run_id: runId,
        brand_name: brand.name,
        severity,
        signal_count: incident.signal_count,
        alert_sent_to: alertSentTo,
        executive_summary: diag.executive_summary,
        slack_channel_id: channelId,
        slack_user_id: teamLead && SEVERITY_RANK[severity] >= SEVERITY_RANK[threshold] ? teamLead : null,
        dedupe_key: dedupeChannel,
        time_to_detect_minutes: minutesBetween(incident.first_seen_at, dispatchedAt),
        final_status: "alert_enqueued",
        dispatched_at: dispatchedAt.toISOString(),
      });
    if (logErr) throw new Error(`incident_log insert: ${logErr.message}`);

    const { error: updErr } = await oew
      .from("incidents")
      .update({ dispatch_status: "dispatched" })
      .eq("id", incidentId);
    if (updErr) throw new Error(`update dispatch_status: ${updErr.message}`);

    await emitEvent({
      client: oew,
      run_id: runId,
      brand_id: brandId,
      event_source: EVENT_SOURCE,
      event_type: "alert_enqueued",
      payload: {
        incident_id: incidentId,
        severity,
        enqueued_count: enqueueRows.length,
        targets: alertSentTo,
      },
    });

    return jsonResp({
      ok: true,
      incident_id: incidentId,
      severity,
      enqueued_count: enqueueRows.length,
      channel_id: channelId,
      specialist_user_id: teamLead,
      dedupe_keys: dedupeKeys,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[oew-dispatcher] ${msg}`);
    if (runId) {
      try {
        await emitEvent({
          client: oew,
          run_id: runId,
          brand_id: brandId ?? undefined,
          event_source: EVENT_SOURCE,
          event_type: "agent_failed",
          payload: { incident_id: incidentId },
          error_message: msg,
        });
      } catch (_) { /* swallow */ }
    }
    if (msg.includes("brand_routing_missing_and_no_fallback")) {
      return jsonResp({ ok: false, error: "brand_routing_missing_and_no_fallback" }, 500);
    }
    return jsonResp({ ok: false, error: "outbox_enqueue_failed" }, 500);
  }
});
