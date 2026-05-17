/**
 * freelancer-invoice-outbox-worker
 *
 * Procesa notifications_outbox donde:
 *   source = 'freelancer_invoice'
 *   target_type = 'email'
 *   status = 'pending'
 *   scheduled_for <= now()
 *
 * Para cada fila:
 *   1. Renderiza un HTML profesional según `type`.
 *   2. Lo envía vía Mailjet.
 *   3. Marca status='sent' (con provider_message_id) o 'error' (con backoff 30 min).
 *
 * Diseñada para correr vía pg_cron cada 5 minutos.
 *
 * Despliegue:
 *   supabase functions deploy freelancer-invoice-outbox-worker --no-verify-jwt
 *
 * Secretos requeridos:
 *   SUPABASE_URL                       (auto)
 *   SUPABASE_SERVICE_ROLE_KEY          (auto)
 *   MAILJET_API_KEY
 *   MAILJET_SECRET_KEY
 *   FREELANCER_INVOICE_INTERNAL_SECRET (requerido — sin él la función devuelve 500)
 *   FREELANCER_INVOICE_FROM_EMAIL      (opcional, default accesos@seolabagency.com)
 *   FREELANCER_INVOICE_FROM_NAME       (opcional, default "SeoLab Agency — Cuentas de cobro")
 *   FREELANCER_INVOICE_APP_BASE_URL    (opcional, default https://app.seolabagency.com)
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAILJET_API_KEY = Deno.env.get("MAILJET_API_KEY")!;
const MAILJET_SECRET_KEY = Deno.env.get("MAILJET_SECRET_KEY")!;
const FROM_EMAIL = Deno.env.get("FREELANCER_INVOICE_FROM_EMAIL") || "accesos@seolabagency.com";
const FROM_NAME  = Deno.env.get("FREELANCER_INVOICE_FROM_NAME")  || "SeoLab Agency — Cuentas de cobro";
const APP_BASE_URL = Deno.env.get("FREELANCER_INVOICE_APP_BASE_URL") || "https://app.seolabagency.com";
const INTERNAL_SECRET = Deno.env.get("FREELANCER_INVOICE_INTERNAL_SECRET") || "";
// Requerido: configurar como secret en Supabase Functions
// (supabase secrets set FREELANCER_INVOICE_INTERNAL_SECRET=...)

type OutboxRow = {
  id: string; source: string; target_type: string; target_id: string;
  type: string; payload: Record<string, unknown>; status: string;
  attempts: number; scheduled_for: string | null; dedupe_key: string | null;
};

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function fmtMoney(amount: unknown, currency: unknown): string {
  const n = typeof amount === "number" ? amount : parseFloat(String(amount ?? 0));
  return `${String(currency || "USD")} ${n.toFixed(2)}`;
}
function wrap(title: string, body: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <tr><td style="background:#0f172a;padding:24px 40px;text-align:center;">
    <span style="color:#a855f7;font-size:18px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;">SEOLAB</span>
    <span style="color:#ffffff;font-size:18px;font-weight:400;letter-spacing:0.1em;text-transform:uppercase;"> • Cuentas de cobro</span>
  </td></tr>
  <tr><td style="padding:40px;">${body}</td></tr>
  <tr><td style="background:#f9fafb;padding:18px 40px;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">SeoLab Agency • Sistema de cuentas de cobro</p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

function render(o: OutboxRow): { subject: string; html: string } | null {
  const p = o.payload || {};
  const fullName = esc(p.full_name || p.writer_full_name);
  const periodLabel = esc(p.period_label);
  const total = fmtMoney(p.total_amount, p.currency);
  const ackUrl = `${APP_BASE_URL}/invoice/ack/${esc(p.ack_token)}`;
  const rejectUrl = `${APP_BASE_URL}/invoice/reject/${esc(p.ack_token)}`;
  const approveUrl = `${APP_BASE_URL}/invoice/approve/${esc(p.approve_token)}`;
  const docUrl = p.document_url ? String(p.document_url) : null;
  const escalation = typeof p.escalation_level === "number" ? p.escalation_level : 0;

  switch (o.type) {
    case "invoice_sent": {
      const subject = `Tu cuenta de cobro de ${periodLabel} está lista (${total})`;
      const html = wrap(subject, `<p style="margin:0 0 8px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Cuenta de cobro</p><h1 style="margin:0 0 20px;font-size:24px;font-weight:800;color:#111827;">Hola ${fullName},</h1><p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">Hemos preparado tu cuenta de cobro de <b>${periodLabel}</b> por un total de <b>${total}</b>.</p>${docUrl ? `<p style="font-size:15px;margin:0 0 24px;">Documento:<br><a href="${esc(docUrl)}" style="color:#a855f7;font-weight:700;">${esc(docUrl)}</a></p>` : ""}<p style="font-size:15px;color:#374151;margin:0 0 16px;">Confírmanos la recepción:</p><p style="margin:0 0 12px;"><a href="${ackUrl}" style="display:inline-block;background:#10b981;color:#fff;font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;padding:14px 28px;border-radius:8px;text-decoration:none;">✅ He recibido</a></p><p style="font-size:13px;color:#6b7280;margin:24px 0 0;">¿Observación? <a href="${rejectUrl}" style="color:#dc2626;font-weight:700;">Reportar</a>.</p>`);
      return { subject, html };
    }
    case "invoice_reminder_writer": {
      const subject = `Recordatorio: tu cuenta de cobro de ${periodLabel} sigue pendiente`;
      const html = wrap(subject, `<p style="margin:0 0 8px;font-size:13px;color:#dc2626;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Recordatorio — nivel ${escalation}</p><h1 style="margin:0 0 20px;font-size:24px;font-weight:800;">Hola ${fullName},</h1><p style="font-size:15px;color:#374151;margin:0 0 20px;">Tu cuenta de cobro de <b>${periodLabel}</b> (<b>${total}</b>) sigue sin confirmar.</p><p style="margin:0 0 12px;"><a href="${ackUrl}" style="display:inline-block;background:#10b981;color:#fff;font-size:14px;font-weight:800;text-transform:uppercase;padding:14px 28px;border-radius:8px;text-decoration:none;">✅ He recibido</a></p><p style="font-size:13px;color:#6b7280;margin:24px 0 0;">¿Observación? <a href="${rejectUrl}" style="color:#dc2626;font-weight:700;">Reportar</a>.</p>`);
      return { subject, html };
    }
    case "invoice_pending_approval": {
      const subject = `Aprobación requerida: ${fullName} — ${periodLabel}`;
      const html = wrap(subject, `<p style="margin:0 0 8px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Aprobación requerida</p><h1 style="margin:0 0 20px;font-size:24px;font-weight:800;">${fullName} confirmó su cuenta</h1><p style="font-size:15px;color:#374151;margin:0 0 16px;">Periodo: <b>${periodLabel}</b><br>Total: <b>${total}</b></p><p style="margin:0;"><a href="${approveUrl}" style="display:inline-block;background:#a855f7;color:#fff;font-size:14px;font-weight:800;text-transform:uppercase;padding:14px 28px;border-radius:8px;text-decoration:none;">🔓 Aprobar</a></p>`);
      return { subject, html };
    }
    case "invoice_reminder_admin": {
      const subject = `Recordatorio admin: aprobar cuenta de ${fullName}`;
      const html = wrap(subject, `<p style="margin:0 0 8px;font-size:13px;color:#dc2626;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Recordatorio — nivel ${escalation}</p><h1 style="margin:0 0 20px;font-size:24px;font-weight:800;">Falta tu aprobación</h1><p style="font-size:15px;color:#374151;margin:0 0 16px;">La cuenta de cobro de <b>${fullName}</b> (<b>${periodLabel}</b>, <b>${total}</b>) está pendiente de tu aprobación.</p><p style="margin:0;"><a href="${approveUrl}" style="display:inline-block;background:#a855f7;color:#fff;font-size:14px;font-weight:800;text-transform:uppercase;padding:14px 28px;border-radius:8px;text-decoration:none;">🔓 Aprobar</a></p>`);
      return { subject, html };
    }
    case "invoice_approved": {
      const subject = `Tu cuenta de cobro de ${periodLabel} fue aprobada`;
      const html = wrap(subject, `<p style="margin:0 0 8px;font-size:13px;color:#10b981;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Aprobada</p><h1 style="margin:0 0 20px;font-size:24px;font-weight:800;">¡Listo, ${fullName}!</h1><p style="font-size:15px;color:#374151;margin:0 0 16px;">Tu cuenta de cobro de <b>${periodLabel}</b> (<b>${total}</b>) fue aprobada.</p><p style="font-size:14px;color:#6b7280;margin:0;">Recibirás una nueva notificación cuando se procese el pago.</p>`);
      return { subject, html };
    }
    case "invoice_rejected_by_writer": {
      const reason = esc(p.rejection_reason);
      const subject = `${fullName} reportó observación en su cuenta`;
      const html = wrap(subject, `<p style="margin:0 0 8px;font-size:13px;color:#dc2626;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Observación</p><h1 style="margin:0 0 20px;font-size:24px;font-weight:800;">${fullName} no aceptó la cuenta</h1><p style="font-size:15px;color:#374151;margin:0 0 16px;"><b>Motivo:</b></p><div style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:20px;"><p style="margin:0;font-size:14px;color:#7f1d1d;line-height:1.6;">${reason}</p></div><p style="font-size:14px;color:#6b7280;margin:0;">Revisa la cuenta y comunícate con el freelancer.</p>`);
      return { subject, html };
    }
    default: return null;
  }
}

async function fetchPending(limit = 25): Promise<OutboxRow[]> {
  const url = `${SUPABASE_URL}/rest/v1/notifications_outbox?source=eq.freelancer_invoice&target_type=eq.email&status=eq.pending&order=priority.desc.nullslast,created_at.asc&limit=${limit}`;
  const res = await fetch(url, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } });
  if (!res.ok) throw new Error(`PostgREST: ${res.status} ${await res.text()}`);
  return (await res.json()) as OutboxRow[];
}

async function markOutbox(id: string, fields: Record<string, unknown>): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/notifications_outbox?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json", apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`, Prefer: "return=minimal",
    },
    body: JSON.stringify(fields),
  });
}

async function sendMailjet(to: string, subject: string, html: string) {
  const creds = btoa(`${MAILJET_API_KEY}:${MAILJET_SECRET_KEY}`);
  const res = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${creds}` },
    body: JSON.stringify({
      Messages: [{
        From: { Email: FROM_EMAIL, Name: FROM_NAME },
        To: [{ Email: to }],
        Subject: subject,
        HTMLPart: html,
      }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.Messages?.[0]?.Status === "error") return { ok: false, err: JSON.stringify(data) };
  return { ok: true, messageId: data?.Messages?.[0]?.To?.[0]?.MessageID };
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
  if (!MAILJET_API_KEY || !MAILJET_SECRET_KEY) {
    return new Response(JSON.stringify({ error: "MAILJET creds missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const rows = await fetchPending(25);
    const results: unknown[] = [];
    for (const o of rows) {
      const r = render(o);
      if (!r) {
        await markOutbox(o.id, {
          status: "error", error_message: `unknown type: ${o.type}`,
          attempts: (o.attempts ?? 0) + 1, processed_at: new Date().toISOString(),
        });
        results.push({ id: o.id, status: "skipped" });
        continue;
      }
      const sent = await sendMailjet(o.target_id, r.subject, r.html);
      if (sent.ok) {
        await markOutbox(o.id, {
          status: "sent", sent_at: new Date().toISOString(),
          processed_at: new Date().toISOString(),
          provider_message_id: sent.messageId, attempts: (o.attempts ?? 0) + 1,
        });
        results.push({ id: o.id, status: "sent", to: o.target_id });
      } else {
        await markOutbox(o.id, {
          status: "error", error_message: sent.err,
          attempts: (o.attempts ?? 0) + 1,
          next_try_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        });
        results.push({ id: o.id, status: "error" });
      }
    }
    return new Response(JSON.stringify({
      processed: rows.length, results, ran_at: new Date().toISOString(),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
