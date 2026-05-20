// oew-outbox-worker
// Cron cada 30s. Claim pessimista (locked_at/locked_by) de hasta 25 rows pending
// del outbox WHERE source='oew_alert', POST a Slack chat.postMessage, marca
// sent/failed/retry con backoff exponencial. Idempotencia natural: locked_at
// previene doble-pickup; dedupe_key UNIQUE previene re-encolar el mismo incident.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getOewClient, getPublicClient, getVaultSecret } from "../_shared/supabase.ts";
import { verifyInternalSecret } from "../_shared/secret.ts";
import { emitEvent } from "../_shared/run-events.ts";

const EVENT_SOURCE = "outbox-worker";
const BATCH_SIZE = 25;
const MAX_RETRIES = 5;
const LOCK_TTL_MS = 5 * 60 * 1000;

const TERMINAL_SLACK_ERRORS = new Set([
  "channel_not_found",
  "not_in_channel",
  "invalid_auth",
  "token_revoked",
  "missing_scope",
  "user_not_found",
  "is_archived",
]);

const RATE_LIMIT_ERROR = "rate_limited";

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
  http_status?: number;
  retry_after_seconds?: number;
}

interface ProcessOutcome {
  outcome: "sent" | "retry" | "failed" | "dead_letter";
  error?: string;
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extractIncidentId(dedupeKey: string): string | null {
  const parts = dedupeKey.split(":");
  if (parts.length < 3 || parts[0] !== "oew") return null;
  if (parts[1] === "digest") return null;
  return parts[1] ?? null;
}

async function sendSlack(
  token: string,
  channelId: string,
  blocks: unknown[],
  text: string,
): Promise<SlackResponse> {
  try {
    const resp = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ channel: channelId, blocks, text }),
    });

    if (resp.status === 429) {
      const retryAfter = Number(resp.headers.get("retry-after") ?? "0");
      return {
        ok: false,
        error: RATE_LIMIT_ERROR,
        http_status: 429,
        retry_after_seconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60,
      };
    }

    let data: { ok?: boolean; ts?: string; error?: string } = {};
    try {
      data = await resp.json();
    } catch (_) {
      return { ok: false, error: `slack_invalid_json_${resp.status}`, http_status: resp.status };
    }

    if (data?.ok === true) {
      return { ok: true, ts: data.ts, http_status: resp.status };
    }
    return {
      ok: false,
      error: data?.error ?? `slack_http_${resp.status}`,
      http_status: resp.status,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function nextBackoffIso(retryCount: number, rateLimitSeconds?: number): string {
  if (rateLimitSeconds && rateLimitSeconds > 0) {
    return new Date(Date.now() + rateLimitSeconds * 1000).toISOString();
  }
  const minutes = Math.pow(2, retryCount);
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

serve(async (req: Request) => {
  const authFail = verifyInternalSecret(req);
  if (authFail) return authFail;

  const oew = getOewClient();
  const pub = getPublicClient();
  const workerId = `oew-outbox-worker:${crypto.randomUUID()}`;

  try {
    const token = await getVaultSecret("SLACK_BOT_TOKEN");
    if (!token) {
      return jsonResp({ ok: false, error: "slack_bot_token_missing" }, 500);
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const lockCutoffIso = new Date(now.getTime() - LOCK_TTL_MS).toISOString();

    const { data: claimed, error: claimErr } = await pub
      .from("notifications_outbox")
      .update({ locked_at: nowIso, locked_by: workerId })
      .eq("source", "oew_alert")
      .eq("status", "pending")
      .or(`locked_at.is.null,locked_at.lt.${lockCutoffIso}`)
      .or(`next_try_at.is.null,next_try_at.lte.${nowIso}`)
      .select("id, source, target_type, channel_id, payload, dedupe_key, status, attempts")
      .limit(BATCH_SIZE);

    if (claimErr) throw new Error(`claim: ${claimErr.message}`);
    const rows = (claimed ?? []) as OutboxRow[];

    if (rows.length === 0) {
      return jsonResp({ ok: true, worker_id: workerId, processed: 0, sent: 0, failed: 0, retried: 0 });
    }

    let sent = 0;
    let failed = 0;
    let retried = 0;
    let deadLettered = 0;

    const processRow = async (row: OutboxRow): Promise<ProcessOutcome> => {
      const blocks = row.payload?.blocks ?? [];
      const text = row.payload?.text ?? "Alerta OEW";

      if (!Array.isArray(blocks) || blocks.length === 0) {
        await pub
          .from("notifications_outbox")
          .update({
            status: "failed",
            error_message: "payload_missing_blocks",
            locked_at: null,
            locked_by: null,
          })
          .eq("id", row.id);
        return { outcome: "failed", error: "payload_missing_blocks" };
      }

      const result = await sendSlack(token, row.channel_id, blocks, text);

      if (result.ok) {
        const { error: updErr } = await pub
          .from("notifications_outbox")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            locked_at: null,
            locked_by: null,
            error_message: null,
          })
          .eq("id", row.id);
        if (updErr) console.error(`[oew-outbox-worker] mark sent ${row.id}: ${updErr.message}`);

        const incidentId = extractIncidentId(row.dedupe_key);
        if (incidentId) {
          const { data: incRow } = await oew
            .from("incidents")
            .select("run_id, brand_id")
            .eq("id", incidentId)
            .maybeSingle<{ run_id: string; brand_id: string }>();
          if (incRow?.run_id) {
            await emitEvent({
              client: oew,
              run_id: incRow.run_id,
              brand_id: incRow.brand_id,
              event_source: EVENT_SOURCE,
              event_type: "alert_sent",
              payload: {
                incident_id: incidentId,
                channel_id: row.channel_id,
                target_type: row.target_type,
                slack_ts: result.ts,
              },
            });
          }
        }
        return { outcome: "sent" };
      }

      const errCode = result.error ?? "unknown";
      const nextAttempts = (row.attempts ?? 0) + 1;

      if (TERMINAL_SLACK_ERRORS.has(errCode)) {
        await pub
          .from("notifications_outbox")
          .update({
            status: "failed",
            attempts: nextAttempts,
            error_message: errCode,
            locked_at: null,
            locked_by: null,
          })
          .eq("id", row.id);
        return { outcome: "failed", error: errCode };
      }

      if (nextAttempts >= MAX_RETRIES) {
        await pub
          .from("notifications_outbox")
          .update({
            status: "dead_letter",
            attempts: nextAttempts,
            error_message: "max_retries_exceeded",
            locked_at: null,
            locked_by: null,
          })
          .eq("id", row.id);
        return { outcome: "dead_letter", error: "max_retries_exceeded" };
      }

      const nextTryAt = nextBackoffIso(nextAttempts, result.retry_after_seconds);
      await pub
        .from("notifications_outbox")
        .update({
          status: "pending",
          attempts: nextAttempts,
          next_try_at: nextTryAt,
          error_message: errCode,
          locked_at: null,
          locked_by: null,
        })
        .eq("id", row.id);
      return { outcome: "retry", error: errCode };
    };

    const results = await Promise.allSettled(rows.map((r) => processRow(r)));

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled") {
        const o = r.value.outcome;
        if (o === "sent") sent++;
        else if (o === "failed") failed++;
        else if (o === "retry") retried++;
        else if (o === "dead_letter") deadLettered++;
      } else {
        failed++;
        const rowId = rows[i]?.id;
        if (rowId) {
          await pub
            .from("notifications_outbox")
            .update({ locked_at: null, locked_by: null })
            .eq("id", rowId);
        }
        console.error(`[oew-outbox-worker] processRow rejected: ${String(r.reason)}`);
      }
    }

    return jsonResp({
      ok: true,
      worker_id: workerId,
      processed: rows.length,
      sent,
      failed,
      retried,
      dead_lettered: deadLettered,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[oew-outbox-worker] fatal: ${msg}`);
    return jsonResp({ ok: false, worker_id: workerId, error: msg }, 500);
  }
});
