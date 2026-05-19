/**
 * lighthouse-slack-notifier (agent_7) — v2 (refactor a outbox)
 *
 * Última pieza del pipeline Lighthouse: una vez que el Google Doc fue creado
 * por `lighthouse-google-docs-exporter`, este agent encola UN row por destino
 * en `public.notifications_outbox` para que `lighthouse-outbox-worker` los
 * procese.
 *
 * Este enfoque sigue el patrón de la plataforma (mismo modelo que
 * `gbp-post-generator`, `client_requests_attention`, `freelancer_invoice`):
 * cada source produce rows en outbox, un worker dedicado los consume.
 *
 * Disparadores:
 *   1. Invocación HTTP desde `lighthouse-google-docs-exporter` al terminar.
 *   2. Invocación manual con `x-internal-secret` para reencolar.
 *   3. Watchdog automático (reports con file_path pero sin published_at).
 *
 * Input: POST con JSON { report_id: uuid, resend?: boolean }
 *
 * Output:
 *   { ok: true, enqueued: [{ target_type, channel_id, dedupe_key }] }
 *
 * Secretos requeridos:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto)
 *   LIGHTHOUSE_REPORT_INTERNAL_SECRET
 *   LIGHTHOUSE_SLACK_CHANNEL                 (opcional, default "informes-seo")
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
const TEAM_CHANNEL = (Deno.env.get("LIGHTHOUSE_SLACK_CHANNEL") || "informes-seo").trim().replace(/^#/, "");

const SCHEMA = "ahrefs_web_analysis";
const OUTBOX_SOURCE = "lighthouse_report";

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

function sanitizeSlackId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s\r\n]+/g, "").trim();
  if (!/^[UCW][A-Z0-9]{8,}$/i.test(cleaned)) return null;
  return cleaned;
}

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

async function pgInsertOutbox(row: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notifications_outbox`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal,resolution=ignore-duplicates",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`Outbox insert: ${res.status} ${await res.text()}`);
  }
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

async function loadClientName(domain: string): Promise<string> {
  const rows = await pgGet<Array<{ client_name: string | null }>>(
    `analysis_requests?select=client_name&request_payload->>domain=eq.${domain}&order=created_at.desc&limit=1`
  );
  return rows[0]?.client_name || domain;
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

  if (!report.file_path) {
    return new Response(JSON.stringify({
      error: "report has no file_path. Run lighthouse-google-docs-exporter first.",
    }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (report.published_at && !body.resend) {
    return new Response(JSON.stringify({
      ok: true, skipped: true, reason: "already enqueued",
      published_at: report.published_at,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const specialist = await loadSpecialist(report.created_by);
  const metrics = await loadSiteOverview(report.client_id);
  const diagnostic = await loadDiagnostic(report.client_id);
  const client_name = await loadClientName(report.domain);
  const specialist_slack = sanitizeSlackId(specialist?.slack_id);
  const is_partial = report.report_status === "generated_partial";

  // Payload compartido (el worker arma Block Kit a partir de esto)
  const sharedPayload = {
    report_id: report.id,
    run_id: report.run_id,
    client_id: report.client_id,
    client_name,
    domain: report.domain,
    doc_url: report.file_path,
    report_version: report.report_version,
    is_partial,
    specialist: specialist ? {
      id: specialist.id,
      full_name: specialist.full_name,
      email: specialist.email,
    } : null,
    metrics,
    diagnostic,
  };

  const enqueued: Array<{ target_type: string; channel_id: string; dedupe_key: string }> = [];
  const dedupeBase = body.resend
    ? `${OUTBOX_SOURCE}:${report.id}:v${report.report_version}:${Date.now()}`
    : `${OUTBOX_SOURCE}:${report.id}:v${report.report_version}`;

  // 1. DM al especialista (solo si tiene slack_id válido)
  if (specialist_slack) {
    const dedupe_key = `${dedupeBase}:dm`;
    await pgInsertOutbox({
      source: OUTBOX_SOURCE,
      user_id: specialist?.id ?? null,
      target_type: "slack_user",
      target_id: report.id,
      channel_id: specialist_slack,
      type: is_partial ? "report_ready_partial" : "report_ready",
      payload: { ...sharedPayload, is_dm: true },
      priority: 70,
      status: "pending",
      dedupe_key,
      scheduled_for: new Date().toISOString(),
    });
    enqueued.push({ target_type: "slack_user", channel_id: specialist_slack, dedupe_key });
  }

  // 2. Canal del equipo (siempre)
  const channelDedupeKey = `${dedupeBase}:channel`;
  await pgInsertOutbox({
    source: OUTBOX_SOURCE,
    user_id: null,
    target_type: "slack_channel",
    target_id: report.id,
    channel_id: TEAM_CHANNEL,
    type: is_partial ? "report_ready_partial" : "report_ready",
    payload: { ...sharedPayload, is_dm: false },
    priority: 70,
    status: "pending",
    dedupe_key: channelDedupeKey,
    scheduled_for: new Date().toISOString(),
  });
  enqueued.push({ target_type: "slack_channel", channel_id: TEAM_CHANNEL, dedupe_key: channelDedupeKey });

  // Marcar como publicado (encolado). El worker hará el envío real.
  await pgPatch(`reports?id=eq.${report.id}`, {
    published_at: new Date().toISOString(),
  });

  await emitEvent(report.run_id, "agent_completed",
    is_partial ? "Informe parcial encolado en outbox" : "Informe encolado en outbox",
    {
      report_id: report.id,
      enqueued_count: enqueued.length,
      destinations: enqueued.map(e => `${e.target_type}:${e.channel_id}`),
      specialist_dm_resolved: specialist_slack !== null,
    }
  );

  return new Response(JSON.stringify({
    ok: true,
    report_id: report.id,
    enqueued,
    specialist_dm_resolved: specialist_slack !== null,
    is_partial,
    published_at: new Date().toISOString(),
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
  try {
    return await handle(req);
  } catch (err) {
    console.error("lighthouse-slack-notifier error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
