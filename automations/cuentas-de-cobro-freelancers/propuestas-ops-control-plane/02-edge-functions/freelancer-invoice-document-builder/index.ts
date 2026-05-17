/**
 * freelancer-invoice-document-builder (v4)
 *
 * Lo que hace, en orden:
 *   1. Busca cuentas de cobro en estado 'draft' que aún no tienen document_url.
 *   2. Para cada una arma un HTML profesional con los datos del cobro.
 *   3. Sube el HTML a Google Drive y lo convierte a Google Doc.
 *   4. Guarda document_url + google_doc_id en freelancer_invoices.
 *   5. Llama a la RPC dispatch_freelancer_invoice para encolar las notificaciones.
 *
 * Diseñada para ser invocada por pg_cron cada 10 minutos (también es invocable
 * manualmente vía HTTP POST con el header x-internal-secret).
 *
 * Despliegue:
 *   supabase functions deploy freelancer-invoice-document-builder --no-verify-jwt
 *
 * Secretos requeridos:
 *   SUPABASE_URL                       (auto)
 *   SUPABASE_SERVICE_ROLE_KEY          (auto)
 *   GOOGLE_CALENDAR_CLIENT_ID
 *   GOOGLE_CALENDAR_CLIENT_SECRET
 *   GOOGLE_DOCS_REFRESH_TOKEN
 *   FREELANCER_INVOICE_INTERNAL_SECRET (requerido — sin él la función devuelve 500)
 *   FREELANCER_INVOICE_DRIVE_ROOT      (opcional, default "SeoLab Cuentas de cobro")
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("FREELANCER_INVOICE_INTERNAL_SECRET") || "";
// Requerido: configurar como secret en Supabase Functions
// (supabase secrets set FREELANCER_INVOICE_INTERNAL_SECRET=...)
const GOOGLE_CLIENT_ID = (Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID") || "").trim();
const GOOGLE_CLIENT_SECRET = (Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET") || "").trim();
const GOOGLE_REFRESH_TOKEN = (Deno.env.get("GOOGLE_DOCS_REFRESH_TOKEN") || "").trim();
const DRIVE_ROOT_FOLDER = (Deno.env.get("FREELANCER_INVOICE_DRIVE_ROOT") || "SeoLab Cuentas de cobro").trim();

const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const FOLDER_MIME = "application/vnd.google-apps.folder";

type InvoiceRow = {
  id: string;
  user_id: string;
  period_year: number;
  period_month: number;
  period_start: string;
  period_end: string;
  monthly_amount: string;
  bonus_amount: string;
  deduction_amount: string;
  total_amount: string;
  currency: string;
  status: string;
  document_url: string | null;
  writer_token: string;
  admin_token: string;
  writer: { full_name: string | null; email: string | null } | null;
};

function esc(s: string | null | undefined): string {
  return (s ?? "").toString()
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function monthLabelEs(year: number, month: number): string {
  const m = ["enero","febrero","marzo","abril","mayo","junio",
             "julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return `${m[month - 1]} ${year}`;
}

function fmtMoney(amount: string | number, currency: string): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return `${currency} ${n.toFixed(2)}`;
}

function sanitizeName(name: string): string {
  return (name || "Sin nombre").trim().slice(0, 180).replace(/[\\/:*?"<>|]/g, "-") || "Sin nombre";
}

function escapeDriveQuery(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function buildInvoiceHtml(inv: InvoiceRow): string {
  const writerName = inv.writer?.full_name || "Freelancer";
  const period = monthLabelEs(inv.period_year, inv.period_month);
  const monthly = fmtMoney(inv.monthly_amount, inv.currency);
  const bonus = fmtMoney(inv.bonus_amount, inv.currency);
  const deduction = fmtMoney(inv.deduction_amount, inv.currency);
  const total = fmtMoney(inv.total_amount, inv.currency);
  const issueDate = new Date().toISOString().slice(0, 10);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cuenta de cobro — ${esc(writerName)} — ${esc(period)}</title></head>
<body>
<h1>CUENTA DE COBRO</h1>
<p><b>SeoLab Agency</b><br>Fecha de emisión: ${esc(issueDate)}</p>

<h2>Datos del freelancer</h2>
<p><b>Nombre:</b> ${esc(writerName)}<br>
   <b>Correo:</b> ${esc(inv.writer?.email ?? "")}<br>
   <b>Periodo:</b> ${esc(period)}<br>
   <b>Inicio:</b> ${esc(inv.period_start)} — <b>Fin:</b> ${esc(inv.period_end)}</p>

<h2>Detalle</h2>
<table border="1" cellpadding="6" cellspacing="0">
  <thead><tr><th>Concepto</th><th>Importe</th></tr></thead>
  <tbody>
    <tr><td>Salario fijo mensual por servicios profesionales prestados durante ${esc(period)}.</td><td>${esc(monthly)}</td></tr>
    <tr><td>Bonificación</td><td>${esc(bonus)}</td></tr>
    <tr><td>Deducciones</td><td>- ${esc(deduction)}</td></tr>
    <tr><td><b>TOTAL A PAGAR</b></td><td><b>${esc(total)}</b></td></tr>
  </tbody>
</table>

<h2>Forma de pago</h2>
<p>Transferencia bancaria a la cuenta registrada por el freelancer.</p>

<h2>Confirmación</h2>
<p>El freelancer debe confirmar la recepción. Si encuentra inconsistencias, debe reportarlas antes de la aprobación.</p>

<p style="margin-top:48px;">__________________________________<br>Firma del freelancer<br>${esc(writerName)}</p>
<p style="margin-top:32px;">__________________________________<br>Aprobación administrador<br>SeoLab Agency</p>

<hr><p><small>Documento generado automáticamente. ID interno: ${esc(inv.id)}</small></p>
</body></html>`;
}

async function getGoogleToken(): Promise<string> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error("Faltan secretos Google: GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET o GOOGLE_DOCS_REFRESH_TOKEN");
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

async function driveFindFolder(token: string, name: string, parent: string | null): Promise<string | null> {
  const parts = [`name='${escapeDriveQuery(name)}'`, `mimeType='${FOLDER_MIME}'`, "trashed=false"];
  parts.push(parent ? `'${parent}' in parents` : "'root' in parents");
  const q = encodeURIComponent(parts.join(" and "));
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=5&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`Drive find folder: ${JSON.stringify(data)}`);
  return (data.files?.[0]?.id as string) ?? null;
}

async function driveCreateFolder(token: string, name: string, parent: string | null): Promise<string> {
  const res = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parent ? { parents: [parent] } : {}) }),
  });
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error(`Drive create folder: ${JSON.stringify(data)}`);
  return data.id as string;
}

async function ensureFolder(token: string, name: string, parent: string | null): Promise<string> {
  return (await driveFindFolder(token, name, parent)) || (await driveCreateFolder(token, name, parent));
}

async function uploadGoogleDoc(token: string, title: string, html: string, folderId: string): Promise<string> {
  const metadata: Record<string, unknown> = { name: title, mimeType: GOOGLE_DOC_MIME, parents: [folderId] };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json; charset=UTF-8" }));
  form.append("file", new Blob([html], { type: "text/html; charset=UTF-8" }));
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error(`Drive upload doc: ${JSON.stringify(data)}`);
  return data.id as string;
}

async function setPublicReader(token: string, fileId: string): Promise<void> {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "anyone", role: "reader", allowFileDiscovery: false }),
  });
}

async function createInvoiceDoc(inv: InvoiceRow): Promise<{ url: string; documentId: string }> {
  const token = await getGoogleToken();
  const root = await ensureFolder(token, DRIVE_ROOT_FOLDER, null);
  const writerFolder = await ensureFolder(token, sanitizeName(inv.writer?.full_name || "Sin nombre"), root);
  const title = sanitizeName(`Cuenta de cobro — ${inv.writer?.full_name || "Freelancer"} — ${monthLabelEs(inv.period_year, inv.period_month)}`);
  const html = buildInvoiceHtml(inv);
  const fileId = await uploadGoogleDoc(token, title, html, writerFolder);
  await setPublicReader(token, fileId);
  return { url: `https://docs.google.com/document/d/${fileId}/edit`, documentId: fileId };
}

async function fetchPendingInvoices(limit = 25): Promise<InvoiceRow[]> {
  const url = `${SUPABASE_URL}/rest/v1/freelancer_invoices?select=id,user_id,period_year,period_month,period_start,period_end,monthly_amount,bonus_amount,deduction_amount,total_amount,currency,status,document_url,writer_token,admin_token,writer:users!freelancer_invoices_user_id_fkey(full_name,email)&status=eq.draft&document_url=is.null&order=created_at.asc&limit=${limit}`;
  const res = await fetch(url, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } });
  if (!res.ok) throw new Error(`PostgREST: ${res.status} ${await res.text()}`);
  return (await res.json()) as InvoiceRow[];
}

async function updateInvoice(id: string, url: string, docId: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/freelancer_invoices?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json", apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`, Prefer: "return=minimal",
    },
    body: JSON.stringify({ document_url: url, google_doc_id: docId }),
  });
  if (!res.ok) throw new Error(`PATCH: ${res.status} ${await res.text()}`);
}

async function dispatchInvoice(id: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/dispatch_freelancer_invoice`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ p_invoice_id: id }),
  });
  if (!res.ok) throw new Error(`RPC dispatch: ${res.status} ${await res.text()}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: "server_misconfigured: FREELANCER_INVOICE_INTERNAL_SECRET missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const got = req.headers.get("x-internal-secret") || "";
  if (got !== INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const pending = await fetchPendingInvoices(25);
    const results: unknown[] = [];
    for (const inv of pending) {
      try {
        const { url, documentId } = await createInvoiceDoc(inv);
        await updateInvoice(inv.id, url, documentId);
        await dispatchInvoice(inv.id);
        results.push({ invoice_id: inv.id, status: "ok", url });
      } catch (err) {
        results.push({ invoice_id: inv.id, status: "error", error: String(err) });
      }
    }
    return new Response(JSON.stringify({
      processed: pending.length, results, ran_at: new Date().toISOString(),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
