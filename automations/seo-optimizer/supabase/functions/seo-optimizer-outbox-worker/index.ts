// seo-optimizer-outbox-worker
// Triggered by pg_cron every minute. Drains notifications_outbox to Slack.

import { verifySecret } from "../_shared/secret.ts";
import { getSupabase } from "../_shared/supabase.ts";

const BATCH_SIZE = 10;
const MAX_RETRIES = 3;
const SLACK_API = "https://slack.com/api/chat.postMessage";

Deno.serve(async (req: Request): Promise<Response> => {
  const authErr = verifySecret(req);
  if (authErr) return authErr;

  const botToken = Deno.env.get("SLACK_BOT_TOKEN");
  if (!botToken) {
    return new Response(JSON.stringify({ status: "skipped", reason: "no_slack_token" }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }

  const workerId = `edge-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const sb = getSupabase();

  // Claim rows: take pending ones that are unlocked OR have stale locks (>10 min)
  // and whose next_retry_at is <= NOW (or null)
  const { data: claimed, error: claimErr } = await sb
    .from("notifications_outbox")
    .update({ locked_at: now, locked_by: workerId })
    .eq("source", "seo_optimizer")
    .eq("status", "pending")
    .is("locked_at", null)
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .select();

  if (claimErr) {
    console.error("[outbox-worker] claim failed:", claimErr.message);
    return new Response(JSON.stringify({ status: "failed", error: claimErr.message }), { status: 500 });
  }
  const rows = (claimed ?? []).slice(0, BATCH_SIZE);
  if (rows.length === 0) {
    return Response.json({ status: "ok", processed: 0, sent: 0, failed: 0 });
  }

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await sendSlack(botToken, row);
    if (result.ok) {
      await sb.from("notifications_outbox").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        locked_at: null, locked_by: null, error_message: null,
      }).eq("id", row.id);
      sent++;
    } else {
      const newRetry = (row.retry_count ?? 0) + 1;
      if (newRetry >= MAX_RETRIES) {
        await sb.from("notifications_outbox").update({
          status: "failed", retry_count: newRetry, error_message: result.error,
          locked_at: null, locked_by: null,
        }).eq("id", row.id);
        failed++;
      } else {
        const backoffMin = 2 ** newRetry;
        const nextRetry = new Date(Date.now() + backoffMin * 60 * 1000).toISOString();
        await sb.from("notifications_outbox").update({
          status: "pending", retry_count: newRetry, next_retry_at: nextRetry,
          error_message: result.error, locked_at: null, locked_by: null,
        }).eq("id", row.id);
      }
    }
  }

  return Response.json({ status: "ok", processed: rows.length, sent, failed });
});

async function sendSlack(botToken: string, row: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const body = {
    channel: row.channel_id,
    text: (payload.text as string) ?? "",
    blocks: (payload.blocks as unknown[]) ?? [],
  };
  try {
    const resp = await fetch(SLACK_API, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${botToken}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, error: `http ${resp.status}: ${txt.slice(0, 200)}` };
    }
    const data = await resp.json();
    if (!data.ok) return { ok: false, error: `slack error: ${data.error ?? "unknown"}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `exception: ${err}` };
  }
}
