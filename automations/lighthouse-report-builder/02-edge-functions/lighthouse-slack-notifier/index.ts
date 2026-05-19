/**
 * lighthouse-slack-notifier (agent_7) — v1
 *
 * Última pieza del pipeline Lighthouse: una vez que el Google Doc fue creado
 * por `lighthouse-google-docs-exporter`, este agent envía un mensaje por Slack
 * al especialista responsable (DM) + copia al canal del equipo.
 *
 * Disparadores:
 *   1. Invocación HTTP desde `lighthouse-google-docs-exporter` al terminar.
 *   2. Invocación manual con `x-internal-secret` para reenviar.
 *   3. Watchdog automático (reports con file_path pero sin published_at).
 *
 * Input: POST con JSON { report_id: uuid, resend?: boolean }
 *
 * Output:
 *   { ok: true, sent_to: { specialist_dm, channel }, message_ts }
 *
 * Secretos requeridos (Supabase Functions):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto)
 *   SLACK_BOT_TOKEN                          (xoxb-... con chat:write + chat:write.public)
 *   LIGHTHOUSE_REPORT_INTERNAL_SECRET
 *   LIGHTHOUSE_SLACK_CHANNEL                 (opcional, default "informes-seo")
 *
 * Despliegue:
 *   supabase functions deploy lighthouse-slack-notifier --no-verify-jwt
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
const TEAM_CHANNEL = (Deno.env.get("LIGHTHOUSE_SLACK_CHANNEL") || "informes-seo").trim().replace(/^#/, "");

const SCHEMA = "ahrefs_web_analysis";
const AGENT_NAME = "agent_7";

type ReportRow = {
  id: string;
  run_id: string;
  client_id: string;
  domain: string;
  report_type: string;
  report_status: string;
  generated_at: string;
  published_at: string | null;
  file_path: string | null;
  report_version: number;
  created_by: string | null;
};

type Specialist = {
  id: string;
  full_name: string | null;
  email: string | null;
  slack_id: string | null;
};

type SiteOverview = {
  organic_traffic: number | null;
  traffic_value: number | null;
  organic_keywords: number | null;
  backlinks_total: number | null;
};

type Diagnostic = {
  overall_risk_level: string | null;
  risk_score: number | null;
  findings_count: number | null;
};

type SendResult = {
  channel: string;
  ts: string | null;
  fallback_used: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Supabase helpers
// ─────────────────────────────────────────────────────────────────────────────
async function pgGet<T>(path: string, schema = SCHEMA): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Accept-Profile": schema,
    },
  });
  if (!res.ok) throw new Error(`PostgREST GET ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function pgPatch(path: string, body: unknown, schema = SCHEMA): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "Content-Profile": schema,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PostgREST PATCH ${path}: ${res.status} ${await res.text()}`);
}

async function emitEvent(run_id: string, type: string, message: string, payload: Record<string, unknown>) {
  await fetch(`${SUPABASE_URL}/rest/v1/analysis_run_events`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "Content-Profile": SCHEMA,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      run_id, event_type: type, event_source: "lighthouse-slack-notifier",
      message, payload,
    }),
  }).catch((e) => console.error("emitEvent failed:", e));
}

// ─────────────────────────────────────────────────────────────────────────────
// Slack helpers
// ─────────────────────────────────────────────────────────────────────────────
function sanitizeSlackId(raw: string | null | undefined): string | null {
  // slack_id viene mal formateado en algunos rows (newlines, espacios)
  if (!raw) return null;
  const cleaned = raw.replace(/[\s\r\n]+/g, "").trim();
  // Validación mínima: debe parecer un ID de Slack (U... o C... + alfanuméricos)
  if (!/^[UCW][A-Z0-9]{8,}$/i.test(cleaned)) return null;
  return cleaned;
}

async function slackPost(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; ts?: string; error?: string; channel?: string }> {
  if (!SLACK_BOT_TOKEN) throw new Error("SLACK_BOT_TOKEN missing");
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  return await res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Loaders
// ─────────────────────────────────────────────────────────────────────────────
async function loadReport(report_id: string): Promise<ReportRow> {
  const rows = await pgGet<ReportRow[]>(
    `reports?select=id,run_id,client_id,domain,report_type,report_status,generated_at,published_at,file_path,report_version,created_by&id=eq.${report_id}`
  );
  if (!rows.length) throw new Error(`Report ${report_id} not found`);
  return rows[0];
}

async function loadSpecialist(user_id: string | null): Promise<Specialist | null> {
  if (!user_id) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/users?select=id,full_name,email,slack_id&id=eq.${user_id}&limit=1`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data[0] ?? null;
}

async function loadSiteOverview(client_id: string): Promise<SiteOverview | null> {
  const rows = await pgGet<SiteOverview[]>(
    `site_overview?select=organic_traffic,traffic_value,organic_keywords,backlinks_total&client_id=eq.${client_id}&order=captured_at.desc&limit=1`
  );
  return rows[0] ?? null;
}

async function loadDiagnostic(client_id: string): Promise<Diagnostic | null> {
  const rows = await pgGet<Diagnostic[]>(
    `diagnostic_reports?select=overall_risk_level,risk_score,findings_count&client_id=eq.${client_id}&order=created_at.desc&limit=1`
  );
  return rows[0] ?? null;
}

async function loadClientName(client_id: string, domain: string): Promise<string> {
  const rows = await pgGet<Array<{ client_name: string | null }>>(
    `analysis_requests?select=client_name&request_payload->>domain=eq.${domain}&order=created_at.desc&limit=1`
  );
  return rows[0]?.client_name || domain;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Kit message builder
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

function buildBlocks(args: {
  client_name: string;
  domain: string;
  doc_url: string;
  is_partial: boolean;
  specialist_name: string | null;
  metrics: SiteOverview | null;
  diagnostic: Diagnostic | null;
  report_version: number;
  is_dm: boolean;
}): Array<Record<string, unknown>> {
  const { client_name, domain, doc_url, is_partial, specialist_name, metrics, diagnostic, report_version, is_dm } = args;

  const headerText = is_partial
    ? `:warning: Informe SEO parcial listo: ${client_name}`
    : `:bar_chart: Informe SEO listo: ${client_name}`;

  const greeting = is_dm
    ? `Hola ${specialist_name?.split(" ")[0] || ""}, tu análisis de *${client_name}* terminó.`
    : `Nuevo informe generado por ${specialist_name || "el equipo"} para *${client_name}*.`;

  const fields: Array<{ type: string; text: string }> = [
    { type: "mrkdwn", text: `*Dominio:*\n${domain}` },
    { type: "mrkdwn", text: `*Versión:*\nv${report_version}` },
  ];

  if (metrics) {
    if (metrics.organic_traffic) {
      fields.push({ type: "mrkdwn", text: `*Tráfico estimado:*\n${fmtNumber(metrics.organic_traffic)}/mes` });
    }
    if (metrics.traffic_value) {
      fields.push({ type: "mrkdwn", text: `*Valor de tráfico:*\n$${fmtNumber(Math.round(metrics.traffic_value))} USD/mes` });
    }
  }

  if (diagnostic?.overall_risk_level) {
    fields.push({
      type: "mrkdwn",
      text: `*Risk level:*\n${riskEmoji(diagnostic.overall_risk_level)} ${diagnostic.overall_risk_level}${diagnostic.risk_score ? ` (${diagnostic.risk_score}/1000)` : ""}`,
    });
  }
  if (diagnostic?.findings_count) {
    fields.push({ type: "mrkdwn", text: `*Findings:*\n${diagnostic.findings_count} detectados` });
  }

  const blocks: Array<Record<string, unknown>> = [
    {
      type: "header",
      text: { type: "plain_text", text: headerText, emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: greeting },
    },
    {
      type: "section",
      fields: fields.slice(0, 10), // Slack máximo 10 fields
    },
  ];

  if (is_partial) {
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
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: ":page_facing_up: Abrir en Google Docs", emoji: true },
        url: doc_url,
        style: "primary",
        action_id: "open_doc",
      },
    ],
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
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────
async function handle(req: Request): Promise<Response> {
  let body: { report_id?: string; resend?: boolean } = {};
  try { body = await req.json(); } catch { /* ok */ }

  if (!body.report_id) {
    return new Response(JSON.stringify({ error: "missing report_id" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const report = await loadReport(body.report_id);

  // Pre-checks
  if (!report.file_path) {
    return new Response(JSON.stringify({
      error: "report has no file_path. Run lighthouse-google-docs-exporter first.",
    }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Idempotencia: si ya fue published y no se forzó resend, skip
  if (report.published_at && !body.resend) {
    return new Response(JSON.stringify({
      ok: true, skipped: true, reason: "already published",
      published_at: report.published_at,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const specialist = await loadSpecialist(report.created_by);
  const metrics = await loadSiteOverview(report.client_id);
  const diagnostic = await loadDiagnostic(report.client_id);
  const client_name = await loadClientName(report.client_id, report.domain);

  const specialist_slack = sanitizeSlackId(specialist?.slack_id);
  const is_partial = report.report_status === "generated_partial";

  await emitEvent(report.run_id, "agent_started", "agent_7 iniciando envío Slack", {
    report_id: report.id,
    specialist_id: specialist?.id ?? null,
    specialist_slack_resolved: specialist_slack !== null,
    is_partial,
  });

  const sent: SendResult[] = [];
  let dm_error: string | null = null;

  // 1. DM al especialista (si tiene slack_id válido)
  if (specialist_slack) {
    const dmBlocks = buildBlocks({
      client_name, domain: report.domain, doc_url: report.file_path,
      is_partial, specialist_name: specialist?.full_name ?? null,
      metrics, diagnostic, report_version: report.report_version,
      is_dm: true,
    });
    const dmRes = await slackPost("chat.postMessage", {
      channel: specialist_slack,
      blocks: dmBlocks,
      text: `Informe SEO listo: ${client_name}`,
      unfurl_links: false,
    });
    if (dmRes.ok) {
      sent.push({ channel: specialist_slack, ts: dmRes.ts ?? null, fallback_used: false });
    } else {
      dm_error = dmRes.error ?? "unknown";
      console.warn(`Slack DM failed for ${specialist_slack}: ${dm_error}`);
    }
  }

  // 2. Copia al canal del equipo (siempre, salvo que sea fallback puro y ya fue al canal)
  const channelBlocks = buildBlocks({
    client_name, domain: report.domain, doc_url: report.file_path,
    is_partial, specialist_name: specialist?.full_name ?? null,
    metrics, diagnostic, report_version: report.report_version,
    is_dm: false,
  });
  const channelRes = await slackPost("chat.postMessage", {
    channel: TEAM_CHANNEL,
    blocks: channelBlocks,
    text: `Informe SEO listo: ${client_name} (por ${specialist?.full_name || "equipo"})`,
    unfurl_links: false,
  });
  if (channelRes.ok) {
    sent.push({
      channel: TEAM_CHANNEL,
      ts: channelRes.ts ?? null,
      fallback_used: !specialist_slack, // si no había DM válido, este canal cumple rol fallback
    });
  } else {
    console.warn(`Slack channel post failed for ${TEAM_CHANNEL}: ${channelRes.error}`);
  }

  if (sent.length === 0) {
    await emitEvent(report.run_id, "agent_failed", "Slack notification failed en todos los destinos", {
      report_id: report.id, dm_error, channel_error: channelRes.error,
    });
    return new Response(JSON.stringify({
      error: "Slack notification failed on all destinations",
      dm_error, channel_error: channelRes.error,
    }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Marcar como publicado
  await pgPatch(`reports?id=eq.${report.id}`, {
    published_at: new Date().toISOString(),
  });

  await emitEvent(report.run_id, "agent_completed",
    is_partial ? "Informe parcial notificado por Slack" : "Informe notificado por Slack",
    {
      report_id: report.id, sent_to: sent, specialist_name: specialist?.full_name ?? null,
      dm_resolved: specialist_slack !== null, dm_error,
    }
  );

  return new Response(JSON.stringify({
    ok: true,
    report_id: report.id,
    sent_to: sent,
    specialist_dm_resolved: specialist_slack !== null,
    is_partial,
    published_at: new Date().toISOString(),
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!INTERNAL_SECRET) {
    return new Response(JSON.stringify({
      error: "server_misconfigured: LIGHTHOUSE_REPORT_INTERNAL_SECRET missing",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if ((req.headers.get("x-internal-secret") || "") !== INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!SLACK_BOT_TOKEN) {
    return new Response(JSON.stringify({
      error: "server_misconfigured: SLACK_BOT_TOKEN missing",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    return await handle(req);
  } catch (err) {
    console.error("lighthouse-slack-notifier error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
