// seo-sentinel-outbox-worker
// Cron-triggered (cada 30s). Claim pessimista de hasta 10 rows pending del outbox,
// POST a Slack chat.postMessage, marca sent/failed con backoff exponencial.
// Pensado para correr en paralelo a otros workers sin pisar (locked_by = workerId).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase, supabasePublic } from "../_shared/supabase.ts";
import { emitEvent } from "../_shared/run-events.ts";
import { verifyInternalSecret } from "../_shared/secret.ts";

const EVENT_SOURCE = "outbox-worker";
const BATCH_SIZE = 10;
const MAX_RETRIES = 3;
// Lock expira en 5 min para que el watchdog libere si el worker murió.
const LOCK_TTL_MS = 5 * 60 * 1000;

interface OutboxRow {
  id: string;
  source: string;
  target_type: string;
  channel_id: string;
  payload: { blocks?: unknown[]; text?: string } | null;
  dedupe_key: string;
  status: string;
  attempts: number;
}

interface SlackResponse {
  ok: boolean;
  ts?: string;
  error?: string;
}

interface ProcessResult {
  id: string;
  outcome: "sent" | "retry" | "failed" | "error";
  error?: string;
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extractIncidentId(dedupeKey: string): string | null {
  // Formato esperado: seo_sentinel:<UUID>:v1:<target>
  const parts = dedupeKey.split(":");
  if (parts.length < 3 || parts[0] !== "seo_sentinel") return null;
  return parts[1] ?? null;
}

async function sendSlack(channelId: string, blocks: unknown[], text: string): Promise<SlackResponse> {
  const token = Deno.env.get("SLACK_BOT_TOKEN");
  if (!token) {
    return { ok: false, error: "SLACK_BOT_TOKEN not configured" };
  }
  try {
    const resp = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ channel: channelId, blocks, text }),
    });
    const data = await resp.json().catch(() => ({ ok: false, error: "invalid_json_from_slack" }));
    if (typeof data?.ok === "boolean") {
      return { ok: data.ok, ts: data.ts, error: data.error };
    }
    return { ok: false, error: `slack_http_${resp.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

interface DiagSummary {
  run_id: string | null;
  brand_id: string;
  anomaly_date: string;
  anomaly_kind: string;
  brand_name: string | null;
}

async function loadDiagSummary(incidentId: string): Promise<DiagSummary | null> {
  const { data: diag, error: diagErr } = await supabase
    .from("incident_diagnostics")
    .select("run_id, brand_id, anomaly_date, anomaly_kind, brands(name)")
    .eq("id", incidentId)
    .maybeSingle<{
      run_id: string | null;
      brand_id: string;
      anomaly_date: string;
      anomaly_kind: string;
      brands: { name: string } | null;
    }>();
  if (diagErr || !diag) {
    console.error(`[outbox-worker] no diagnostic for incident ${incidentId}: ${diagErr?.message ?? "not_found"}`);
    return null;
  }
  return {
    run_id: diag.run_id,
    brand_id: diag.brand_id,
    anomaly_date: diag.anomaly_date,
    anomaly_kind: diag.anomaly_kind,
    brand_name: diag.brands?.name ?? null,
  };
}

async function ensureIncidentLog(
  incidentId: string,
  channelId: string,
  diag: DiagSummary,
  severityHint?: string,
): Promise<void> {
  const { data: existing, error: existingErr } = await supabase
    .from("incident_log")
    .select("id, alert_sent_to")
    .eq("incident_id", incidentId)
    .maybeSingle();
  if (existingErr) {
    console.error(`[outbox-worker] incident_log lookup failed: ${existingErr.message}`);
    return;
  }

  if (existing) {
    const current = Array.isArray(existing.alert_sent_to) ? (existing.alert_sent_to as string[]) : [];
    if (!current.includes(channelId)) {
      const merged = [...current, channelId];
      const { error: updErr } = await supabase
        .from("incident_log")
        .update({ alert_sent_to: merged })
        .eq("id", existing.id);
      if (updErr) console.error(`[outbox-worker] incident_log update failed: ${updErr.message}`);
    }
    return;
  }

  const { error: insErr } = await supabase
    .from("incident_log")
    .insert({
      incident_id: incidentId,
      brand_id: diag.brand_id,
      brand_name: diag.brand_name,
      anomaly_date: diag.anomaly_date,
      anomaly_kind: diag.anomaly_kind,
      alert_sent_to: [channelId],
      final_status: severityHint === "fallback" ? "alert_fallback" : "alert_sent",
    });
  // 23505 = unique_violation: otro envio paralelo ya inserto la fila, es ok.
  if (insErr && !insErr.message.includes("duplicate key")) {
    console.error(`[outbox-worker] incident_log insert failed: ${insErr.message}`);
  }
}

async function releaseLock(rowId: string): Promise<void> {
  const { error } = await supabasePublic
    .from("notifications_outbox")
    .update({ locked_at: null, locked_by: null })
    .eq("id", rowId);
  if (error) console.error(`[outbox-worker] release lock failed for ${rowId}: ${error.message}`);
}

async function processRow(row: OutboxRow): Promise<ProcessResult> {
  const blocks = row.payload?.blocks ?? [];
  const text = row.payload?.text ?? "Alerta seo_sentinel";
  if (!Array.isArray(blocks) || blocks.length === 0) {
    const { error } = await supabasePublic
      .from("notifications_outbox")
      .update({
        status: "failed",
        error_message: "payload_missing_blocks",
        locked_at: null,
        locked_by: null,
      })
      .eq("id", row.id);
    if (error) console.error(`[outbox-worker] mark failed (no blocks) ${row.id}: ${error.message}`);
    return { id: row.id, outcome: "failed", error: "payload_missing_blocks" };
  }

  const slack = await sendSlack(row.channel_id, blocks, text);

  if (slack.ok) {
    const { error: updErr } = await supabasePublic
      .from("notifications_outbox")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
        error_message: null,
      })
      .eq("id", row.id);
    if (updErr) console.error(`[outbox-worker] mark sent ${row.id}: ${updErr.message}`);

    const incidentId = extractIncidentId(row.dedupe_key);
    if (incidentId) {
      const diag = await loadDiagSummary(incidentId);
      if (diag) {
        await ensureIncidentLog(incidentId, row.channel_id, diag);
        if (diag.run_id) {
          await emitEvent({
            run_id: diag.run_id,
            brand_id: diag.brand_id,
            event_source: EVENT_SOURCE,
            event_type: "alert_sent",
            payload: {
              incident_id: incidentId,
              channel_id: row.channel_id,
              target_type: row.target_type,
              slack_ts: slack.ts,
            },
          });
        }
      }
    }
    return { id: row.id, outcome: "sent" };
  }

  const nextRetry = (row.attempts ?? 0) + 1;
  if (nextRetry < MAX_RETRIES) {
    const delayMin = Math.pow(2, nextRetry);
    const nextTryAt = new Date(Date.now() + delayMin * 60 * 1000).toISOString();
    const { error: retryErr } = await supabasePublic
      .from("notifications_outbox")
      .update({
        attempts: nextRetry,
        next_try_at: nextTryAt,
        error_message: slack.error ?? "unknown",
        locked_at: null,
        locked_by: null,
      })
      .eq("id", row.id);
    if (retryErr) console.error(`[outbox-worker] schedule retry ${row.id}: ${retryErr.message}`);
    return { id: row.id, outcome: "retry", error: slack.error };
  }

  const { error: failErr } = await supabasePublic
    .from("notifications_outbox")
    .update({
      status: "failed",
      error_message: slack.error ?? "unknown",
      attempts: nextRetry,
      locked_at: null,
      locked_by: null,
    })
    .eq("id", row.id);
  if (failErr) console.error(`[outbox-worker] mark failed ${row.id}: ${failErr.message}`);

  const incidentId = extractIncidentId(row.dedupe_key);
  if (incidentId) {
    const diag = await loadDiagSummary(incidentId);
    if (diag?.run_id) {
      await emitEvent({
        run_id: diag.run_id,
        brand_id: diag.brand_id,
        event_source: EVENT_SOURCE,
        event_type: "agent_failed",
        payload: { incident_id: incidentId, channel_id: row.channel_id },
        error_message: slack.error ?? "unknown",
      });
    }
  }
  return { id: row.id, outcome: "failed", error: slack.error };
}

serve(async (req: Request) => {
  const authFail = verifyInternalSecret(req);
  if (authFail) return authFail;

  const workerId = crypto.randomUUID();

  try {
    const now = new Date();
    const lockCutoff = new Date(now.getTime() - LOCK_TTL_MS).toISOString();
    const nowIso = now.toISOString();

    // Claim pessimista. Combinamos en un solo UPDATE...RETURNING via supabase-js:
    //   - status pending
    //   - lock libre o expirado
    //   - next_retry_at no esta en el futuro
    const { data: claimed, error: claimErr } = await supabasePublic
      .from("notifications_outbox")
      .update({ locked_at: nowIso, locked_by: workerId })
      .eq("source", "seo_sentinel_alert")
      .eq("status", "pending")
      .or(`locked_at.is.null,locked_at.lt.${lockCutoff}`)
      .or(`next_try_at.is.null,next_try_at.lte.${nowIso}`)
      .select("id, source, target_type, channel_id, payload, dedupe_key, status, attempts")
      .limit(BATCH_SIZE);

    if (claimErr) throw new Error(`claim failed: ${claimErr.message}`);

    const rows = (claimed ?? []) as OutboxRow[];
    if (rows.length === 0) {
      return jsonResp({ ok: true, worker_id: workerId, processed: 0 });
    }

    const results = await Promise.allSettled(rows.map((r) => processRow(r)));

    let sent = 0;
    let failed = 0;
    let retried = 0;
    let errored = 0;

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled") {
        if (r.value.outcome === "sent") sent++;
        else if (r.value.outcome === "failed") failed++;
        else if (r.value.outcome === "retry") retried++;
        else errored++;
      } else {
        errored++;
        // Promise.allSettled rejected: liberamos lock manualmente para no dejar la fila atascada.
        const rowId = rows[i]?.id;
        if (rowId) await releaseLock(rowId);
        console.error(`[outbox-worker] processRow rejected: ${String(r.reason)}`);
      }
    }

    return jsonResp({
      ok: true,
      worker_id: workerId,
      processed: rows.length,
      sent,
      retried,
      failed,
      errored,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[outbox-worker] fatal: ${msg}`);
    return jsonResp({ ok: false, worker_id: workerId, error: msg }, 500);
  }
});
