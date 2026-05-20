/**
 * lighthouse-outbox-worker — v1
 *
 * Worker que procesa `notifications_outbox` filtrando por `source = 'lighthouse_report'`.
 * Lee los rows pendientes, construye Block Kit, y postea a Slack vía
 * chat.postMessage.
 *
 * Mismo patrón que el worker de `client_requests_attention`: cada source
 * tiene su propio worker porque cada source tiene su Block Kit propio.
 *
 * Disparadores:
 *   1. pg_cron cada 30 segundos (recomendado).
 *   2. Invocación HTTP desde `lighthouse-slack-notifier` para procesamiento inmediato.
 *   3. Invocación manual con `x-internal-secret`.
 *
 * Input: POST con JSON opcional { batch_size?: number }
 *
 * Lock pattern:
 *   - Cada row se lockea con `locked_at + locked_by` para evitar doble envío.
 *   - Reintenta hasta 3 veces antes de marcar como `failed`.
 *
 * Secretos requeridos:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto)
 *   SLACK_BOT_TOKEN                          (xoxb-... con chat:write + chat:write.public)
 *   LIGHTHOUSE_REPORT_INTERNAL_SECRET
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = (Deno.env.get("LIGHTHOUSE_REPORT_INTERNAL_SECRET") || "").trim();
const SLACK_BOT_TOKEN = (Deno.env.get("SLACK_BOT_TOKEN") || "").trim();

const OUTBOX_SOURCE = "lighthouse_report";
const MAX_ATTEMPTS = 3;
const LOCK_TTL_SECONDS = 60;
const WORKER_ID = `worker-${crypto.randomUUID().slice(0, 8)}`;

type OutboxRow = {
  id: string;
  source: string;
  user_id: string | null;
  target_type: string;
  channel_id: string;
  type: string;
  payload: SharedPayload;
  attempts: number;
  status: string;
  dedupe_key: string;
};

type SharedPayload = {
  report_id: string;
  run_id: string;
  client_id: string;
  client_name: string;
  domain: string;
  doc_url: string;
  report_version: number;
  is_partial: boolean;
  is_dm: boolean;
  specialist: { id: string; full_name: string | null; email: string | null } | null;
  metrics: {
    organic_traffic: number | null;
    traffic_value: number | null;
    organic_keywords: number | null;
    backlinks_total: number | null;
  } | null;
  diagnostic: {
    overall_risk_level: string | null;
    risk_score: number | null;
    findings_count: number | null;
  } | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Block Kit builder
// ─────────────────────────────────────────────────────────────────────────────
function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("es-CO");
}

function riskEmoji(level: string | null): string {
  switch (level) {
    case "critical": return ":red_circle:";
    case "high": return ":large_orange_circle:";
    case "medium": return ":large_yellow_circle:";
    case "low": return ":large_green_circle:";
    default: return ":white_circle:";
  }
}

function buildBlocks(p: SharedPayload): Array<Record<string, unknown>> {
  const headerText = p.is_partial
    ? `:warning: Informe SEO parcial listo: ${p.client_name}`
    : `:bar_chart: Informe SEO listo: ${p.client_name}`;

  const greeting = p.is_dm
    ? `Hola ${p.specialist?.full_name?.split(" ")[0] || ""}, tu análisis de *${p.client_name}* terminó.`
    : `Nuevo informe generado por ${p.specialist?.full_name || "el equipo"} para *${p.client_name}*.`;

  const fields: Array<{ type: string; text: string }> = [
    { type: "mrkdwn", text: `*Dominio:*\n${p.domain}` },
    { type: "mrkdwn", text: `*Versión:*\nv${p.report_version}` },
  ];

  if (p.metrics) {
    if (p.metrics.organic_traffic) {
      fields.push({ type: "mrkdwn", text: `*Tráfico estimado:*\n${fmtNumber(p.metrics.organic_traffic)}/mes` });
    }
    if (p.metrics.traffic_value) {
      fields.push({ type: "mrkdwn", text: `*Valor de tráfico:*\n$${fmtNumber(Math.round(p.metrics.traffic_value))} USD/mes` });
    }
  }

  if (p.diagnostic?.overall_risk_level) {
    fields.push({
      type: "mrkdwn",
      text: `*Risk level:*\n${riskEmoji(p.diagnostic.overall_risk_level)} ${p.diagnostic.overall_risk_level}${p.diagnostic.risk_score ? ` (${p.diagnostic.risk_score}/1000)` : ""}`,
    });
  }
  if (p.diagnostic?.findings_count) {
    fields.push({ type: "mrkdwn", text: `*Findings:*\n${p.diagnostic.findings_count} detectados` });
  }

  const blocks: Array<Record<string, unknown>> = [
    { type: "header", text: { type: "plain_text", text: headerText, emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: greeting } },
    { type: "section", fields: fields.slice(0, 10) },
  ];

  if (p.is_partial) {
    blocks.push({
      type: "context",
      elements: [{
        type: "mrkdwn",
        text: ":warning: _Este informe se generó en modo parcial porque Ahrefs devolvió datos insuficientes. Revisá el detalle dentro del documento._",
      }],
    });
  }

  blocks.push({
    type: "actions",
    elements: [{
      type: "button",
      text: { type: "plain_text", text: ":page_facing_up: Abrir en Google Docs", emoji: true },
      url: p.doc_url,
      style: "primary",
      action_id: "open_doc",
    }],
  });

  blocks.push({
    type: "context",
    elements: [{
      type: "mrkdwn",
      text: `_SeoLab Agency · Lighthouse · ${new Date().toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}_`,
    }],
  });

  return blocks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Slack
// ─────────────────────────────────────────────────────────────────────────────
async function slackPostMessage(channel: string, blocks: unknown[], fallbackText: string): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ channel, blocks, text: fallbackText, unfurl_links: false }),
  });
  return await res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Outbox: claim + update
// ─────────────────────────────────────────────────────────────────────────────
async function claimBatch(batch_size: number): Promise<OutboxRow[]> {
  // Lockea atómicamente via RPC. Si no existe la RPC, fallback a SELECT FOR UPDATE.
  const lockCutoff = new Date(Date.now() - LOCK_TTL_SECONDS * 1000).toISOString();
  const nowIso = new Date().toISOString();

  // Patrón: PATCH WHERE source = X AND status = 'pending' AND (locked_at IS NULL OR locked_at < cutoff)
  // PostgREST PATCH no soporta LIMIT/ORDER BY directo, así que hacemos SELECT + PATCH por id.
  const selectRes = await fetch(
    `${SUPABASE_URL}/rest/v1/notifications_outbox?select=*&source=eq.${OUTBOX_SOURCE}&status=eq.pending&or=(locked_at.is.null,locked_at.lt.${encodeURIComponent(lockCutoff)})&order=priority.desc,created_at.asc&limit=${batch_size}`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
  );
  if (!selectRes.ok) throw new Error(`Outbox select: ${selectRes.status}`);
  const candidates: OutboxRow[] = await selectRes.json();
  if (!candidates.length) return [];

  const claimed: OutboxRow[] = [];
  for (const row of candidates) {
    // Intento atómico: PATCH WHERE id=X AND (locked_at IS NULL OR locked_at < cutoff)
    const patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/notifications_outbox?id=eq.${row.id}&or=(locked_at.is.null,locked_at.lt.${encodeURIComponent(lockCutoff)})`,
      {
        method: "PATCH",
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ locked_at: nowIso, locked_by: WORKER_ID }),
      }
    );
    if (!patchRes.ok) continue;
    const updated = await patchRes.json();
    if (updated.length > 0) claimed.push(updated[0]);
  }
  return claimed;
}

async function markSent(id: string, provider_message_id: string | null): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/notifications_outbox?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      status: "sent",
      sent_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      provider_message_id,
      error: null,
      error_message: null,
    }),
  });
}

async function markFailed(row: OutboxRow, errMsg: string): Promise<void> {
  const newAttempts = (row.attempts ?? 0) + 1;
  const isFinal = newAttempts >= MAX_ATTEMPTS;
  const backoffSec = Math.min(60 * Math.pow(2, newAttempts), 600); // 2,4,8,...,max 10 min
  const nextTry = new Date(Date.now() + backoffSec * 1000).toISOString();

  await fetch(`${SUPABASE_URL}/rest/v1/notifications_outbox?id=eq.${row.id}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      status: isFinal ? "failed" : "pending",
      attempts: newAttempts,
      next_try_at: isFinal ? null : nextTry,
      locked_at: null,
      locked_by: null,
      last_error: errMsg.slice(0, 1000),
      error: errMsg.slice(0, 1000),
      error_message: errMsg.slice(0, 1000),
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Process one row
// ─────────────────────────────────────────────────────────────────────────────
async function processRow(row: OutboxRow): Promise<{ ok: boolean; ts?: string; error?: string }> {
  if (row.target_type !== "slack_user" && row.target_type !== "slack_channel" && row.target_type !== "slack_dm") {
    return { ok: false, error: `unsupported target_type: ${row.target_type}` };
  }
  if (!row.channel_id) {
    return { ok: false, error: "missing channel_id" };
  }
  const blocks = buildBlocks(row.payload);
  const fallbackText = `Informe SEO listo: ${row.payload.client_name}`;
  const slackRes = await slackPostMessage(row.channel_id, blocks, fallbackText);
  if (!slackRes.ok) {
    return { ok: false, error: slackRes.error ?? "unknown_slack_error" };
  }
  return { ok: true, ts: slackRes.ts };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────
async function handle(req: Request): Promise<Response> {
  let body: { batch_size?: number } = {};
  try { body = await req.json(); } catch { /* ok */ }
  const batch_size = Math.min(Math.max(body.batch_size ?? 10, 1), 50);

  const rows = await claimBatch(batch_size);
  const results: Array<{ id: string; status: string; error?: string }> = [];

  for (const row of rows) {
    try {
      const r = await processRow(row);
      if (r.ok) {
        await markSent(row.id, r.ts ?? null);
        results.push({ id: row.id, status: "sent" });
      } else {
        await markFailed(row, r.error ?? "unknown");
        results.push({ id: row.id, status: "retry", error: r.error });
      }
    } catch (err) {
      await markFailed(row, String(err));
      results.push({ id: row.id, status: "retry", error: String(err) });
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    worker_id: WORKER_ID,
    claimed: rows.length,
    sent: results.filter(r => r.status === "sent").length,
    retried: results.filter(r => r.status === "retry").length,
    results,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if ((req.headers.get("x-internal-secret") || "") !== INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!SLACK_BOT_TOKEN) {
    return new Response(JSON.stringify({ error: "SLACK_BOT_TOKEN missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    return await handle(req);
  } catch (err) {
    console.error("lighthouse-outbox-worker error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
