// seo-sentinel-dispatcher
// Enriquece el diagnostico con LLM y encola las alertas en notifications_outbox.
// NO envia a Slack directamente: el outbox-worker lo hace para garantizar idempotencia
// global (dedupe_key) y retries con backoff.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase, supabasePublic } from "../_shared/supabase.ts";
import { emitEvent } from "../_shared/run-events.ts";
import { verifyInternalSecret } from "../_shared/secret.ts";
import { chat } from "../_shared/openrouter.ts";
import { buildAlertBlocks, AnomalyKind, Severity } from "../_shared/slack-blockkit.ts";

const EVENT_SOURCE = "dispatcher";

interface DispatcherInput {
  incident_id: string;
  force?: boolean;
}

interface IncidentRow {
  id: string;
  run_id: string | null;
  brand_id: string;
  anomaly_date: string;
  anomaly_kind: AnomalyKind;
  source_anomaly_id: string | null;
  top_affected_urls: unknown;
  top_lost_keywords: unknown;
  thematic_cluster: string | null;
  executive_summary: string | null;
  brands: { name: string } | null;
}

interface TopUrlEntry {
  url?: string;
  clicks_lost?: number;
  drop_percentage?: number;
  top_lost_keywords?: Array<{ keyword?: string; query?: string }>;
}

interface TopKeywordEntry {
  query?: string;
  keyword?: string;
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extractTop(
  diag: IncidentRow,
): { topUrl?: string; topKeyword?: string; metricValue: number; clicksWowPct?: number } {
  const urls = Array.isArray(diag.top_affected_urls)
    ? (diag.top_affected_urls as TopUrlEntry[])
    : [];
  const keywords = Array.isArray(diag.top_lost_keywords)
    ? (diag.top_lost_keywords as TopKeywordEntry[])
    : [];

  const topUrl = urls[0]?.url;
  const topKeyword =
    urls[0]?.top_lost_keywords?.[0]?.keyword ??
    urls[0]?.top_lost_keywords?.[0]?.query ??
    keywords[0]?.keyword ??
    keywords[0]?.query;

  return { topUrl, topKeyword, metricValue: 0, clicksWowPct: urls[0]?.drop_percentage };
}

serve(async (req: Request) => {
  const authFail = verifyInternalSecret(req);
  if (authFail) return authFail;

  let body: DispatcherInput;
  try {
    body = await req.json();
  } catch {
    return jsonResp({ ok: false, error: "invalid_json" }, 400);
  }
  if (!body?.incident_id) {
    return jsonResp({ ok: false, error: "missing_incident_id" }, 400);
  }

  const incidentId = body.incident_id;
  const force = body.force === true;
  let runId: string | null = null;

  try {
    const { data: diag, error: diagErr } = await supabase
      .from("incident_diagnostics")
      .select(
        "id, run_id, brand_id, anomaly_date, anomaly_kind, source_anomaly_id, top_affected_urls, top_lost_keywords, thematic_cluster, executive_summary, brands(name)",
      )
      .eq("id", incidentId)
      .maybeSingle<IncidentRow>();

    if (diagErr) throw new Error(`incident lookup: ${diagErr.message}`);
    if (!diag) return jsonResp({ ok: false, error: "incident_not_found" }, 404);

    runId = diag.run_id;
    const brandName = diag.brands?.name ?? "Marca desconocida";

    if (!force) {
      const { data: existingLog, error: existingErr } = await supabase
        .from("incident_log")
        .select("id")
        .eq("incident_id", incidentId)
        .maybeSingle();
      if (existingErr) throw new Error(`incident_log lookup: ${existingErr.message}`);
      if (existingLog) {
        return jsonResp({ ok: true, status: "already_dispatched", incident_id: incidentId }, 409);
      }
    }

    if (runId) {
      await emitEvent({
        run_id: runId,
        brand_id: diag.brand_id,
        event_source: EVENT_SOURCE,
        event_type: "agent_started",
        payload: { incident_id: incidentId, force },
      });
    }

    // Severity calc
    let severity: Severity = "YELLOW";
    let metricValue = 0;
    const tops = extractTop(diag);

    if (diag.anomaly_kind === "clicks_drop") {
      const { data: clickRows, error: clickErr } = await supabase
        .from("clicks_anomalies")
        .select("wow_drop_pct, severity")
        .eq("brand_id", diag.brand_id)
        .eq("anomaly_date", diag.anomaly_date)
        .order("created_at", { ascending: false })
        .limit(1);
      if (clickErr) throw new Error(`clicks_anomalies lookup: ${clickErr.message}`);
      const row = clickRows?.[0];
      const wow = row?.wow_drop_pct != null ? Number(row.wow_drop_pct) : (tops.clicksWowPct ?? 0);
      metricValue = wow;
      severity = Math.abs(wow) >= 30 ? "RED" : "YELLOW";
    } else {
      // position_drop: la severidad sale de position_anomalies (puede haber varias; pick worst)
      const { data: posRows, error: posErr } = await supabase
        .from("position_anomalies")
        .select("position_delta, severity")
        .eq("brand_id", diag.brand_id)
        .eq("anomaly_date", diag.anomaly_date)
        .order("position_delta", { ascending: false })
        .limit(1);
      if (posErr) throw new Error(`position_anomalies lookup: ${posErr.message}`);
      const row = posRows?.[0];
      if (row?.severity === "RED" || row?.severity === "YELLOW") {
        severity = row.severity;
      }
      metricValue = row?.position_delta != null ? Number(row.position_delta) : 0;
    }

    // Executive summary via LLM (reusa si ya existe y no es force)
    let summary = diag.executive_summary ?? "";
    if (force || !summary) {
      const metricLabel =
        diag.anomaly_kind === "clicks_drop"
          ? `${metricValue.toFixed(1)}%`
          : `cayó ${Math.abs(metricValue).toFixed(1)} posiciones`;
      const tipoLabel =
        diag.anomaly_kind === "clicks_drop"
          ? "caída de tráfico WoW"
          : "pérdida de posiciones por keyword";
      const prompt = `Eres un analista SEO. En máximo 3 oraciones directas (sin rodeos, para un equipo técnico), resume este incidente. No uses emojis.

Datos:
- Marca: ${brandName}
- Tipo: ${tipoLabel}
- Métrica: ${metricLabel}
- URL más afectada: ${tops.topUrl ?? "N/A"}
- Top keyword: ${tops.topKeyword ?? "N/A"}
- Clúster temático: ${diag.thematic_cluster ?? "N/A"}

Responde solo el resumen, sin introducción.`;
      try {
        summary = await chat(prompt, 200);
      } catch (e) {
        // Fallback: NO bloqueamos el envio si el LLM falla — el equipo necesita la alerta.
        summary = `Incidente automático en ${brandName}: ${metricLabel}. URL: ${tops.topUrl ?? "N/A"}. Revisar Supabase para detalle completo.`;
        if (runId) {
          await emitEvent({
            run_id: runId,
            brand_id: diag.brand_id,
            event_source: EVENT_SOURCE,
            event_type: "warning",
            payload: { reason: "llm_summary_failed", incident_id: incidentId },
            error_message: String(e),
          });
        }
      }
      const { error: updErr } = await supabase
        .from("incident_diagnostics")
        .update({ executive_summary: summary, updated_at: new Date().toISOString() })
        .eq("id", incidentId);
      if (updErr) throw new Error(`update summary: ${updErr.message}`);
    }

    // Lookup destinatarios
    const ceoUserId = Deno.env.get("CEO_SLACK_USER_ID");
    if (!ceoUserId) throw new Error("CEO_SLACK_USER_ID not configured");

    const { data: routing, error: routingErr } = await supabase
      .from("brand_team_routing")
      .select("slack_channel_id, team_lead_user_id, fallback_channel_id")
      .eq("brand_id", diag.brand_id)
      .maybeSingle();
    if (routingErr) throw new Error(`brand_team_routing lookup: ${routingErr.message}`);

    const fallbackChannel = Deno.env.get("SLACK_FALLBACK_CHANNEL") ?? null;
    const brandChannel =
      routing?.slack_channel_id ?? routing?.fallback_channel_id ?? fallbackChannel;
    if (!brandChannel) {
      throw new Error("no brand channel and SLACK_FALLBACK_CHANNEL not configured");
    }
    const teamLead = routing?.team_lead_user_id ?? undefined;

    // Build blocks
    const { blocks, text } = buildAlertBlocks({
      brand_name: brandName,
      anomaly_kind: diag.anomaly_kind,
      severity,
      metric_value: metricValue,
      top_url: tops.topUrl,
      top_keyword: tops.topKeyword,
      thematic_cluster: diag.thematic_cluster ?? undefined,
      executive_summary: summary,
      incident_id: incidentId,
      team_lead_user_id: teamLead,
    });

    const ceoRow = {
      source: "seo_sentinel_alert",
      target_type: "slack_dm",
      channel_id: ceoUserId,
      payload: { blocks, text },
      dedupe_key: `seo_sentinel:${incidentId}:v1:ceo_dm`,
      status: "pending",
    };
    const channelRow = {
      source: "seo_sentinel_alert",
      target_type: "slack_channel",
      channel_id: brandChannel,
      payload: { blocks, text },
      dedupe_key: `seo_sentinel:${incidentId}:v1:channel:${brandChannel}`,
      status: "pending",
    };

    const { error: enqueueErr } = await supabasePublic
      .from("notifications_outbox")
      .upsert([ceoRow, channelRow], { onConflict: "dedupe_key", ignoreDuplicates: true });
    if (enqueueErr) throw new Error(`outbox upsert: ${enqueueErr.message}`);

    const { error: statusErr } = await supabase
      .from("incident_diagnostics")
      .update({ dispatch_status: "pending", updated_at: new Date().toISOString() })
      .eq("id", incidentId);
    if (statusErr) throw new Error(`update dispatch_status: ${statusErr.message}`);

    if (runId) {
      await emitEvent({
        run_id: runId,
        brand_id: diag.brand_id,
        event_source: EVENT_SOURCE,
        event_type: "alert_enqueued",
        payload: {
          incident_id: incidentId,
          severity,
          targets: ["ceo_dm", brandChannel],
        },
      });
    }

    return jsonResp({
      ok: true,
      incident_id: incidentId,
      enqueued_count: 2,
      severity,
      channel_id: brandChannel,
      ceo_user_id: ceoUserId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[dispatcher] ${msg}`);
    if (runId) {
      try {
        await emitEvent({
          run_id: runId,
          event_source: EVENT_SOURCE,
          event_type: "agent_failed",
          payload: { incident_id: incidentId },
          error_message: msg,
        });
      } catch (_) { /* swallow */ }
    }
    return jsonResp({ ok: false, error: msg }, 500);
  }
});
