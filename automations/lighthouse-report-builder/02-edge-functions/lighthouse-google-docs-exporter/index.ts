/**
 * lighthouse-google-docs-exporter — v1
 *
 * Convierte un report ya generado (markdown en `report_sections`) en un
 * Google Doc con la identidad visual de SeoLab Agency: portada, header,
 * footer, tablas estilizadas, paleta corporativa (mint + navy).
 *
 * Disparadores:
 *   - Invocación HTTP desde el frontend al hacer click en "Descargar Google Doc".
 *   - Invocación manual con `x-internal-secret` para backfill.
 *
 * Input: POST con JSON { report_id: uuid, regenerate?: boolean }
 *
 * Output:
 *   { ok: true, document_url, document_id, generated_at }
 *
 * Secretos requeridos (Supabase Functions):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto)
 *   GOOGLE_CALENDAR_CLIENT_ID
 *   GOOGLE_CALENDAR_CLIENT_SECRET
 *   GOOGLE_DOCS_REFRESH_TOKEN
 *   LIGHTHOUSE_REPORT_INTERNAL_SECRET
 *   LIGHTHOUSE_DRIVE_ROOT (opcional, default "SeoLab Informes SEO")
 *
 * Despliegue:
 *   supabase functions deploy lighthouse-google-docs-exporter --no-verify-jwt
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
const GOOGLE_CLIENT_ID = (Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID") || "").trim();
const GOOGLE_CLIENT_SECRET = (Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET") || "").trim();
const GOOGLE_REFRESH_TOKEN = (Deno.env.get("GOOGLE_DOCS_REFRESH_TOKEN") || "").trim();
const DRIVE_ROOT = (Deno.env.get("LIGHTHOUSE_DRIVE_ROOT") || "SeoLab Informes SEO").trim();

const SCHEMA = "ahrefs_web_analysis";
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const FOLDER_MIME = "application/vnd.google-apps.folder";

// Identidad visual SeoLab Agency (extraída de seolabagency.com)
const BRAND = {
  mintBright: "#10D9C4",   // verde menta corporativo, CTAs y acentos
  mintGradient: "#7FFFE0", // tono claro para gradients
  navyDark: "#0A0E27",     // texto/headings principales
  navyMid: "#1E2347",      // headers de tabla
  lavender: "#C4B5FD",     // acentos suaves
  softBlue: "#93C5FD",     // acentos secundarios
  bgWhite: "#FFFFFF",
  bgSoftGray: "#F8FAFC",   // fondos de cards
  borderLight: "#E2E8F0",  // bordes sutiles
  textBody: "#1A1A2E",     // texto cuerpo
  textMuted: "#64748B",    // texto secundario
  successGreen: "#10B981",
  warningAmber: "#F59E0B",
  dangerRed: "#EF4444",
};

type ReportRow = {
  id: string;
  run_id: string;
  client_id: string;
  domain: string;
  report_type: string;
  generated_at: string;
  report_version: number;
};

type SectionRow = {
  section_key: string;
  section_title: string;
  section_order: number;
  body_markdown: string;
};

type Context = {
  report: ReportRow;
  sections: SectionRow[];
  client_name: string;
  country: string;
  target_url: string;
  snapshot_date: string;
};

async function pgGet<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Accept-Profile": SCHEMA,
    },
  });
  if (!res.ok) throw new Error(`PostgREST GET ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function pgPatch(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "Content-Profile": SCHEMA,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PostgREST PATCH ${path}: ${res.status} ${await res.text()}`);
}

async function loadContext(report_id: string): Promise<Context> {
  const reports = await pgGet<ReportRow[]>(
    `reports?select=id,run_id,client_id,domain,report_type,generated_at,report_version&id=eq.${report_id}`
  );
  if (!reports.length) throw new Error(`Report ${report_id} not found`);
  const report = reports[0];

  const sections = await pgGet<SectionRow[]>(
    `report_sections?select=section_key,section_title,section_order,body_markdown&report_id=eq.${report_id}&order=section_order.asc`
  );

  // Enriquecemos con datos del request (cliente_name, país, url, snapshot_date)
  const runs = await pgGet<Array<{ client_id: string; domain: string }>>(
    `analysis_runs?select=client_id,domain&id=eq.${report.run_id}`
  );
  const requests = await pgGet<Array<{ client_name: string | null; country: string | null; target_url: string; snapshot_date: string }>>(
    `analysis_requests?select=client_name,country,target_url,snapshot_date&request_payload->>domain=eq.${report.domain}&order=created_at.desc&limit=1`
  );
  const req = requests[0] ?? { client_name: null, country: null, target_url: `https://${report.domain}/`, snapshot_date: new Date().toISOString().slice(0, 10) };

  return {
    report,
    sections,
    client_name: req.client_name || report.domain,
    country: (req.country || "").toUpperCase(),
    target_url: req.target_url,
    snapshot_date: req.snapshot_date,
  };
}

function esc(s: string | null | undefined): string {
  return (s ?? "").toString()
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown → HTML con estilos SeoLab
// ─────────────────────────────────────────────────────────────────────────────
function renderMarkdown(md: string): string {
  let html = md;

  // Tablas markdown → HTML
  html = html.replace(/((?:^\|.*\|\s*$\n?)+)/gm, (match) => {
    const lines = match.trim().split("\n");
    const headerCells = lines[0].split("|").map(c => c.trim()).filter(Boolean);
    const bodyRows = lines.slice(2).map(line => line.split("|").map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length));
    const thead = `<thead><tr>${headerCells.map(c => `<th style="background:${BRAND.navyMid};color:#fff;padding:10px 14px;text-align:left;font-weight:600;font-size:13px;letter-spacing:0.3px;">${renderInline(c)}</th>`).join("")}</tr></thead>`;
    const tbody = `<tbody>${bodyRows.map((row, idx) => `<tr style="background:${idx % 2 === 0 ? BRAND.bgWhite : BRAND.bgSoftGray};">${row.map(c => `<td style="padding:10px 14px;border-bottom:1px solid ${BRAND.borderLight};font-size:13px;color:${BRAND.textBody};">${renderInline(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
    return `<table style="width:100%;border-collapse:collapse;margin:18px 0;font-family:'Inter','Helvetica',sans-serif;border:1px solid ${BRAND.borderLight};border-radius:8px;overflow:hidden;">${thead}${tbody}</table>`;
  });

  // Blockquotes (callouts SeoLab)
  html = html.replace(/^>\s*\*\*(.+?)\*\*\s*(.*)/gm, (_, label, rest) => {
    return `<div style="margin:16px 0;padding:14px 18px;background:linear-gradient(135deg, ${BRAND.mintGradient}22, ${BRAND.mintBright}11);border-left:4px solid ${BRAND.mintBright};border-radius:6px;"><strong style="color:${BRAND.navyDark};">${renderInline(label)}</strong> <span style="color:${BRAND.textBody};">${renderInline(rest)}</span></div>`;
  });
  html = html.replace(/^>\s*(.+)$/gm, (_, rest) => {
    return `<div style="margin:14px 0;padding:12px 16px;background:${BRAND.bgSoftGray};border-left:3px solid ${BRAND.lavender};border-radius:4px;color:${BRAND.textBody};font-style:italic;">${renderInline(rest)}</div>`;
  });

  // Headings
  html = html.replace(/^####\s+(.+)$/gm, `<h4 style="color:${BRAND.navyDark};font-family:'Inter','Helvetica',sans-serif;font-size:14px;font-weight:600;margin:18px 0 8px 0;">$1</h4>`);
  html = html.replace(/^###\s+(.+)$/gm, `<h3 style="color:${BRAND.navyDark};font-family:'Inter','Helvetica',sans-serif;font-size:16px;font-weight:700;margin:22px 0 10px 0;border-left:3px solid ${BRAND.mintBright};padding-left:12px;">$1</h3>`);
  html = html.replace(/^##\s+(.+)$/gm, `<h2 style="color:${BRAND.navyDark};font-family:'Inter','Helvetica',sans-serif;font-size:22px;font-weight:700;margin:28px 0 14px 0;">$1</h2>`);
  html = html.replace(/^#\s+(.+)$/gm, `<h1 style="color:${BRAND.navyDark};font-family:'Inter','Helvetica',sans-serif;font-size:28px;font-weight:800;margin:32px 0 16px 0;letter-spacing:-0.5px;">$1</h1>`);

  // Listas
  html = html.replace(/((?:^[\s]*[-*]\s+.+$\n?)+)/gm, (match) => {
    const items = match.trim().split("\n").map(l => l.replace(/^[\s]*[-*]\s+/, "").trim());
    return `<ul style="margin:12px 0;padding-left:24px;color:${BRAND.textBody};font-family:'Inter','Helvetica',sans-serif;font-size:14px;line-height:1.7;">${items.map(i => `<li style="margin:4px 0;">${renderInline(i)}</li>`).join("")}</ul>`;
  });
  html = html.replace(/((?:^\s*\d+\.\s+.+$\n?)+)/gm, (match) => {
    const items = match.trim().split("\n").map(l => l.replace(/^\s*\d+\.\s+/, "").trim());
    return `<ol style="margin:12px 0;padding-left:24px;color:${BRAND.textBody};font-family:'Inter','Helvetica',sans-serif;font-size:14px;line-height:1.7;">${items.map(i => `<li style="margin:4px 0;">${renderInline(i)}</li>`).join("")}</ol>`;
  });

  // Párrafos
  html = html.split(/\n{2,}/).map(block => {
    const trimmed = block.trim();
    if (!trimmed) return "";
    if (trimmed.match(/^<(h[1-6]|table|ul|ol|div|blockquote)/)) return trimmed;
    return `<p style="color:${BRAND.textBody};font-family:'Inter','Helvetica',sans-serif;font-size:14px;line-height:1.7;margin:10px 0;">${renderInline(trimmed.replace(/\n/g, " "))}</p>`;
  }).join("\n");

  return html;
}

function renderInline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, `<strong style="color:${BRAND.navyDark};font-weight:700;">$1</strong>`)
    .replace(/\*(.+?)\*/g, `<em>$1</em>`)
    .replace(/`(.+?)`/g, `<code style="background:${BRAND.bgSoftGray};color:${BRAND.navyDark};padding:2px 6px;border-radius:4px;font-family:'JetBrains Mono','Courier New',monospace;font-size:12px;">$1</code>`)
    .replace(/\[(.+?)\]\((.+?)\)/g, `<a href="$2" style="color:${BRAND.mintBright};text-decoration:none;font-weight:600;">$1</a>`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Construcción del HTML completo (portada + secciones)
// ─────────────────────────────────────────────────────────────────────────────
function buildCoverPage(ctx: Context): string {
  const date = new Date(ctx.snapshot_date).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  return `
<div style="page-break-after:always;padding:60px 40px;font-family:'Inter','Helvetica',sans-serif;min-height:900px;position:relative;background:linear-gradient(180deg, ${BRAND.bgWhite} 0%, ${BRAND.bgWhite} 70%, ${BRAND.mintGradient}22 100%);">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:80px;">
    <div style="width:36px;height:36px;background:linear-gradient(135deg, ${BRAND.mintBright}, ${BRAND.mintGradient});border-radius:50%;display:inline-block;"></div>
    <span style="font-size:20px;font-weight:800;color:${BRAND.navyDark};letter-spacing:-0.5px;">SeoLab</span>
  </div>

  <div style="margin-top:120px;">
    <div style="display:inline-block;background:linear-gradient(135deg, ${BRAND.mintBright}, ${BRAND.mintGradient});padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:1.5px;color:${BRAND.navyDark};text-transform:uppercase;margin-bottom:20px;">
      Informe SEO Confidencial
    </div>
    <h1 style="font-size:42px;font-weight:800;color:${BRAND.navyDark};line-height:1.15;letter-spacing:-1px;margin:0 0 14px 0;">
      Diagnóstico de<br/>Tráfico Orgánico
    </h1>
    <div style="font-size:18px;color:${BRAND.textBody};margin-bottom:48px;">
      <a href="${esc(ctx.target_url)}" style="color:${BRAND.mintBright};text-decoration:none;font-weight:600;">${esc(ctx.target_url)}</a>
    </div>
  </div>

  <div style="margin-top:100px;padding:24px;background:${BRAND.bgSoftGray};border-radius:12px;border-left:4px solid ${BRAND.mintBright};">
    <table style="width:100%;font-family:'Inter','Helvetica',sans-serif;font-size:13px;color:${BRAND.textBody};">
      <tr><td style="padding:6px 0;color:${BRAND.textMuted};width:140px;">Cliente</td><td style="padding:6px 0;font-weight:600;color:${BRAND.navyDark};">${esc(ctx.client_name)}</td></tr>
      <tr><td style="padding:6px 0;color:${BRAND.textMuted};">Mercado</td><td style="padding:6px 0;font-weight:600;color:${BRAND.navyDark};">${esc(ctx.country)}</td></tr>
      <tr><td style="padding:6px 0;color:${BRAND.textMuted};">Fecha de análisis</td><td style="padding:6px 0;font-weight:600;color:${BRAND.navyDark};">${esc(date)}</td></tr>
      <tr><td style="padding:6px 0;color:${BRAND.textMuted};">Herramienta</td><td style="padding:6px 0;font-weight:600;color:${BRAND.navyDark};">Ahrefs — Base de datos SEO global</td></tr>
      <tr><td style="padding:6px 0;color:${BRAND.textMuted};">Preparado por</td><td style="padding:6px 0;font-weight:600;color:${BRAND.navyDark};">SeoLab Agency</td></tr>
      <tr><td style="padding:6px 0;color:${BRAND.textMuted};">Versión</td><td style="padding:6px 0;font-weight:600;color:${BRAND.navyDark};">v${ctx.report.report_version}</td></tr>
    </table>
  </div>

  <div style="position:absolute;bottom:40px;left:40px;right:40px;display:flex;justify-content:space-between;font-size:11px;color:${BRAND.textMuted};letter-spacing:0.5px;text-transform:uppercase;">
    <span>Confidencial · Uso exclusivo del cliente</span>
    <span>seolabagency.com</span>
  </div>
</div>`;
}

function buildTableOfContents(ctx: Context): string {
  return `
<div style="page-break-after:always;padding:50px 40px;font-family:'Inter','Helvetica',sans-serif;">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:40px;">
    <div style="width:24px;height:24px;background:linear-gradient(135deg, ${BRAND.mintBright}, ${BRAND.mintGradient});border-radius:50%;"></div>
    <span style="font-size:14px;font-weight:700;color:${BRAND.navyDark};">SeoLab Agency</span>
  </div>
  <h2 style="font-size:28px;font-weight:800;color:${BRAND.navyDark};margin-bottom:24px;letter-spacing:-0.5px;">Contenido</h2>
  <div style="border-top:1px solid ${BRAND.borderLight};padding-top:8px;">
    ${ctx.sections.map(s => `
    <div style="display:flex;justify-content:space-between;padding:14px 0;border-bottom:1px solid ${BRAND.borderLight};">
      <span style="font-size:14px;color:${BRAND.textBody};"><span style="font-weight:700;color:${BRAND.mintBright};margin-right:14px;">${String(s.section_order).padStart(2, "0")}</span>${esc(s.section_title)}</span>
      <span style="font-size:12px;color:${BRAND.textMuted};font-weight:600;">Sección ${s.section_order}</span>
    </div>
    `).join("")}
  </div>
</div>`;
}

function buildContentPages(ctx: Context): string {
  return ctx.sections.map(s => `
<div style="padding:40px;font-family:'Inter','Helvetica',sans-serif;page-break-after:always;">
  <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;border-bottom:2px solid ${BRAND.mintBright};margin-bottom:24px;">
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="width:20px;height:20px;background:linear-gradient(135deg, ${BRAND.mintBright}, ${BRAND.mintGradient});border-radius:50%;"></div>
      <span style="font-size:12px;font-weight:700;color:${BRAND.navyDark};letter-spacing:0.5px;text-transform:uppercase;">SeoLab · Informe SEO</span>
    </div>
    <span style="font-size:11px;color:${BRAND.textMuted};letter-spacing:0.5px;text-transform:uppercase;">Sección ${s.section_order} de ${ctx.sections.length}</span>
  </div>
  ${renderMarkdown(s.body_markdown)}
  <div style="margin-top:60px;padding-top:14px;border-top:1px solid ${BRAND.borderLight};display:flex;justify-content:space-between;font-size:10px;color:${BRAND.textMuted};letter-spacing:0.5px;text-transform:uppercase;">
    <span>Confidencial · ${esc(ctx.client_name)}</span>
    <span>seolabagency.com</span>
  </div>
</div>`).join("\n");
}

function buildHtml(ctx: Context): string {
  const title = `Informe SEO ${ctx.client_name} — ${ctx.snapshot_date}`;
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${esc(title)}</title>
  <style>
    body { margin:0; padding:0; background:${BRAND.bgWhite}; color:${BRAND.textBody}; font-family:'Inter','Helvetica',Arial,sans-serif; }
    @page { size: A4; margin: 0; }
  </style>
</head>
<body>
${buildCoverPage(ctx)}
${buildTableOfContents(ctx)}
${buildContentPages(ctx)}
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Drive / Docs API
// ─────────────────────────────────────────────────────────────────────────────
async function getGoogleToken(): Promise<string> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error("Missing Google OAuth secrets (CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN)");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`Google token error: ${JSON.stringify(data)}`);
  return data.access_token as string;
}

function escapeDriveQuery(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function sanitizeName(name: string): string {
  return (name || "Sin nombre").trim().slice(0, 180).replace(/[\\/:*?"<>|]/g, "-") || "Sin nombre";
}

async function ensureFolder(token: string, name: string, parent: string | null): Promise<string> {
  const parts = [`name='${escapeDriveQuery(name)}'`, `mimeType='${FOLDER_MIME}'`, "trashed=false"];
  parts.push(parent ? `'${parent}' in parents` : "'root' in parents");
  const q = encodeURIComponent(parts.join(" and "));
  const find = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=5&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const findData = await find.json();
  if (find.ok && findData.files?.[0]?.id) return findData.files[0].id;

  const create = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parent ? { parents: [parent] } : {}) }),
  });
  const data = await create.json();
  if (!create.ok || !data.id) throw new Error(`Drive create folder: ${JSON.stringify(data)}`);
  return data.id;
}

async function uploadGoogleDoc(token: string, title: string, html: string, folderId: string): Promise<string> {
  const metadata = { name: title, mimeType: GOOGLE_DOC_MIME, parents: [folderId] };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json; charset=UTF-8" }));
  form.append("file", new Blob([html], { type: "text/html; charset=UTF-8" }));
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error(`Drive upload: ${JSON.stringify(data)}`);
  return data.id;
}

async function setPublicReader(token: string, fileId: string): Promise<void> {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "anyone", role: "reader", allowFileDiscovery: false }),
  });
}

async function createDoc(ctx: Context): Promise<{ url: string; documentId: string }> {
  const token = await getGoogleToken();
  const root = await ensureFolder(token, DRIVE_ROOT, null);
  const clientFolder = await ensureFolder(token, sanitizeName(ctx.client_name), root);
  const title = sanitizeName(`Informe SEO ${ctx.client_name} ${ctx.snapshot_date} v${ctx.report.report_version}`);
  const html = buildHtml(ctx);
  const fileId = await uploadGoogleDoc(token, title, html, clientFolder);
  await setPublicReader(token, fileId);
  return { url: `https://docs.google.com/document/d/${fileId}/edit`, documentId: fileId };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────
async function handle(req: Request): Promise<Response> {
  let body: { report_id?: string; regenerate?: boolean } = {};
  try { body = await req.json(); } catch { /* ok */ }

  if (!body.report_id) {
    return new Response(JSON.stringify({ error: "missing report_id" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ctx = await loadContext(body.report_id);

  // Idempotencia: si ya existe file_path y no se pidió regenerar, devolverlo
  if (!body.regenerate) {
    const existing = await pgGet<Array<{ file_path: string | null }>>(
      `reports?select=file_path&id=eq.${body.report_id}&file_path=not.is.null`
    );
    if (existing.length && existing[0].file_path) {
      const match = existing[0].file_path.match(/\/d\/([^/]+)/);
      const documentId = match ? match[1] : null;
      return new Response(JSON.stringify({
        ok: true, document_url: existing[0].file_path, document_id: documentId,
        cached: true,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  const { url, documentId } = await createDoc(ctx);

  await pgPatch(`reports?id=eq.${body.report_id}`, {
    file_path: url,
    output_format: "google_doc",
    mime_type: GOOGLE_DOC_MIME,
    updated_at: new Date().toISOString(),
  });

  return new Response(JSON.stringify({
    ok: true,
    document_url: url,
    document_id: documentId,
    generated_at: new Date().toISOString(),
    cached: false,
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

  try {
    return await handle(req);
  } catch (err) {
    console.error("lighthouse-google-docs-exporter error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
