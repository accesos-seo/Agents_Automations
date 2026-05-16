import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * orbit-meeting-sync
 *
 * Sincroniza una reunión de `orbit_meetings` con Google Calendar.
 * Lo invocan los triggers de la base de datos (vía net.http_post) o se puede llamar a mano.
 *
 * Auth: header `x-internal-secret` (debe coincidir con el secret ORBIT_SYNC_SECRET).
 * Body: { meeting_id: string, action: "create" | "update" | "cancel" }
 *
 *  - create: crea el evento en Google Calendar con Google Meet, guarda
 *            external_video_url + google_calendar_event_id y envía el correo de invitación.
 *  - update: hace PATCH del evento (reagendar: nueva fecha/hora/título/agenda) y avisa.
 *  - cancel: hace DELETE del evento en Google y avisa de la cancelación.
 *
 * Degrada con gracia: si faltan los secrets de Google o de Mailjet, NO rompe — devuelve `warnings`.
 *
 * Secrets que usa:
 *   ORBIT_SYNC_SECRET                      (auth interno; hay un valor de respaldo si no está)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_REFRESH_TOKEN
 *   GOOGLE_CALENDAR_ID                     (opcional, default "primary")
 *   MAILJET_API_KEY, MAILJET_SECRET_KEY
 *   MAILJET_FROM_EMAIL, MAILJET_FROM_NAME  (opcionales)
 */

const INTERNAL_SECRET = Deno.env.get("ORBIT_SYNC_SECRET") ?? "orbit-sync-2026";
const DEFAULT_TZ = "America/Bogota";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Action = "create" | "update" | "cancel";

type MeetingRow = {
  id: string;
  title: string;
  agenda: string | null;
  starts_at: string;
  ends_at: string | null;
  external_video_url: string | null;
  google_calendar_event_id: string | null;
  status: string;
  proyecto_id: string;
  proyectos_seo: { nombremarca: string } | null;
};

// ---------- Google Calendar ----------

async function getGoogleAccessToken(): Promise<string | null> {
  const clientId = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET") ?? "";
  const refreshToken = Deno.env.get("GOOGLE_CALENDAR_REFRESH_TOKEN") ?? "";
  if (!clientId || !clientSecret || !refreshToken) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    console.error("[orbit-meeting-sync] Google token error:", data);
    return null;
  }
  return data.access_token as string;
}

function extractMeetLink(event: Record<string, unknown>): string | null {
  const hangout = event.hangoutLink;
  if (typeof hangout === "string" && hangout.startsWith("http")) return hangout;
  const cd = event.conferenceData as
    | { entryPoints?: Array<{ entryPointType?: string; uri?: string }> }
    | undefined;
  const video = cd?.entryPoints?.find((e) => e.entryPointType === "video");
  if (video?.uri && video.uri.startsWith("http")) return video.uri;
  return null;
}

function calendarId(): string {
  return Deno.env.get("GOOGLE_CALENDAR_ID") ?? "primary";
}

async function createEvent(args: {
  accessToken: string;
  summary: string;
  description: string;
  startIso: string;
  endIso: string;
  attendeeEmails: string[];
}): Promise<{ eventId: string | null; meetLink: string | null; rawError?: string }> {
  const event = {
    summary: args.summary,
    description: args.description,
    start: { dateTime: args.startIso },
    end: { dateTime: args.endIso },
    attendees: args.attendeeEmails.filter(Boolean).map((email) => ({ email })),
    conferenceData: {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
  const calId = encodeURIComponent(calendarId());
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?conferenceDataVersion=1`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    },
  );
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    console.error("[orbit-meeting-sync] Calendar insert error:", data);
    return { eventId: null, meetLink: null, rawError: JSON.stringify(data) };
  }
  return {
    eventId: typeof data.id === "string" ? data.id : null,
    meetLink: extractMeetLink(data),
  };
}

async function patchEvent(args: {
  accessToken: string;
  eventId: string;
  summary: string;
  description: string;
  startIso: string;
  endIso: string;
}): Promise<{ ok: boolean; meetLink: string | null; rawError?: string }> {
  const calId = encodeURIComponent(calendarId());
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${encodeURIComponent(args.eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: args.summary,
        description: args.description,
        start: { dateTime: args.startIso },
        end: { dateTime: args.endIso },
      }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    console.error("[orbit-meeting-sync] Calendar patch error:", data);
    return { ok: false, meetLink: null, rawError: JSON.stringify(data) };
  }
  return { ok: true, meetLink: extractMeetLink(data) };
}

async function deleteEvent(args: {
  accessToken: string;
  eventId: string;
}): Promise<{ ok: boolean; rawError?: string }> {
  const calId = encodeURIComponent(calendarId());
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${encodeURIComponent(args.eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${args.accessToken}` },
    },
  );
  // 204 = borrado; 410 = ya estaba borrado -> ambos cuentan como éxito.
  if (res.ok || res.status === 410) return { ok: true };
  const text = await res.text().catch(() => "");
  console.error("[orbit-meeting-sync] Calendar delete error:", res.status, text);
  return { ok: false, rawError: `${res.status}: ${text}` };
}

// ---------- Mailjet ----------

async function sendMailjet(args: {
  to: Array<{ Email: string; Name?: string }>;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; detail?: unknown }> {
  const key = Deno.env.get("MAILJET_API_KEY");
  const secret = Deno.env.get("MAILJET_SECRET_KEY");
  if (!key || !secret) return { ok: false, detail: "Mailjet no configurado" };

  const fromEmail = Deno.env.get("MAILJET_FROM_EMAIL") ?? "accesos@seolabagency.com";
  const fromName = Deno.env.get("MAILJET_FROM_NAME") ?? "Orbit · SeoLab";

  const res = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${key}:${secret}`)}`,
    },
    body: JSON.stringify({
      Messages: [
        {
          From: { Email: fromEmail, Name: fromName },
          To: args.to,
          Subject: args.subject,
          HTMLPart: args.html,
        },
      ],
    }),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok || result?.Messages?.[0]?.Status === "error") {
    console.error("[orbit-meeting-sync] Mailjet error:", result);
    return { ok: false, detail: result };
  }
  return { ok: true, detail: result };
}

function buildEmailHtml(
  action: Action,
  args: { title: string; brand: string; when: string; tz: string; agenda: string | null; meetLink: string | null },
): string {
  const label =
    action === "create"
      ? "Invitación a reunión"
      : action === "update"
      ? "Reunión reagendada"
      : "Reunión cancelada";
  const accent = action === "cancel" ? "#ef4444" : "#a855f7";

  const linkBlock =
    action === "cancel"
      ? `<p style="color:#92400e;">Esta reunión fue cancelada. Si crees que es un error, contacta al organizador.</p>`
      : args.meetLink
      ? `<p style="margin:16px 0;"><a href="${escapeHtml(args.meetLink)}" style="display:inline-block;background:${accent};color:#fff;font-weight:700;padding:14px 24px;border-radius:8px;text-decoration:none;">Unirse a la videollamada (Google Meet)</a></p><p style="font-size:13px;color:#6b7280;">${escapeHtml(args.meetLink)}</p>`
      : `<p style="color:#92400e;">Aún no hay enlace de Meet generado. Revisa la agenda en Orbit.</p>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;"><tr><td align="center">
<table width="580" style="background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#0f172a;padding:24px;text-align:center;">
<span style="color:#a855f7;font-weight:900;">ORBIT</span><span style="color:#fff;"> · SeoLab</span>
</td></tr>
<tr><td style="padding:32px;">
<p style="color:#6b7280;font-size:12px;text-transform:uppercase;font-weight:700;">${escapeHtml(label)}</p>
<h1 style="color:#111827;font-size:22px;">${escapeHtml(args.title)}</h1>
<p style="color:#374151;"><strong>Marca:</strong> ${escapeHtml(args.brand)}</p>
<p style="color:#374151;"><strong>Cuándo:</strong> ${escapeHtml(args.when)} (${escapeHtml(args.tz)})</p>
${args.agenda ? `<div style="background:#f9fafb;border-left:4px solid ${accent};padding:12px 16px;margin:16px 0;"><p style="margin:0;color:#374151;white-space:pre-wrap;">${escapeHtml(args.agenda)}</p></div>` : ""}
${linkBlock}
</td></tr>
<tr><td style="background:#f9fafb;padding:16px;text-align:center;font-size:11px;color:#9ca3af;">
Este correo fue enviado automáticamente por <strong>Orbit</strong>.
</td></tr>
</table></td></tr></table></body></html>`;
}

// ---------- Handler ----------

serve(async (req: Request) => {
  const startedAt = new Date().toISOString();

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  if (req.headers.get("x-internal-secret") !== INTERNAL_SECRET) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let body: { meeting_id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const meetingId = String(body.meeting_id ?? "").trim();
  const action = String(body.action ?? "").trim() as Action;
  if (!meetingId) return json({ ok: false, error: "meeting_id_required" }, 400);
  if (!["create", "update", "cancel"].includes(action)) {
    return json({ ok: false, error: "invalid_action", allowed: ["create", "update", "cancel"] }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, error: "missing_supabase_env" }, 500);
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Cargar la reunión.
  const { data: meeting, error: mErr } = await admin
    .from("orbit_meetings")
    .select(
      "id, title, agenda, starts_at, ends_at, external_video_url, google_calendar_event_id, status, proyecto_id, proyectos_seo ( nombremarca )",
    )
    .eq("id", meetingId)
    .single();

  if (mErr || !meeting) {
    return json({ ok: false, error: "meeting_not_found", details: mErr?.message }, 404);
  }
  const row = meeting as MeetingRow;

  // 2. Cargar asistentes -> correos.
  const { data: attRows } = await admin
    .from("orbit_meeting_attendees")
    .select("user_id")
    .eq("meeting_id", meetingId);
  const attendeeIds = (attRows ?? []).map((r: { user_id: string }) => r.user_id);

  let attendeeEmails: string[] = [];
  let recipients: Array<{ Email: string; Name?: string }> = [];
  if (attendeeIds.length > 0) {
    const { data: users } = await admin
      .from("users")
      .select("id, email, full_name")
      .in("id", attendeeIds);
    const valid = (users ?? []).filter((u: { email?: string | null }) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((u.email ?? "").trim())
    );
    attendeeEmails = valid.map((u: { email?: string | null }) => (u.email ?? "").trim());
    recipients = valid.map((u: { email?: string | null; full_name?: string | null }) => ({
      Email: (u.email ?? "").trim(),
      Name: u.full_name ?? undefined,
    }));
  }

  const tz = DEFAULT_TZ;
  const brand = row.proyectos_seo?.nombremarca ?? "Proyecto";
  const start = new Date(row.starts_at);
  const end = row.ends_at ? new Date(row.ends_at) : new Date(start.getTime() + 30 * 60 * 1000);
  const when = start.toLocaleString("es-CO", { timeZone: tz });
  const summary = `${row.title} — Orbit`;
  const description = [
    row.agenda?.trim() || "",
    "",
    `Marca: ${brand}`,
    "",
    "Evento gestionado desde la app Orbit (SeoLab).",
  ]
    .filter((l) => l.length > 0)
    .join("\n");

  const warnings: string[] = [];
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) {
    warnings.push(
      "Google Calendar no configurado: faltan GOOGLE_CALENDAR_CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN. Se omitió la sincronización con Google.",
    );
  }

  let meetLink: string | null = row.external_video_url;
  let eventId: string | null = row.google_calendar_event_id;
  let emailsSent = 0;

  // 3. Ejecutar la acción.
  if (action === "create") {
    if (eventId) {
      warnings.push("La reunión ya tenía un evento de Google (google_calendar_event_id); no se creó otro.");
    } else if (accessToken) {
      const created = await createEvent({
        accessToken,
        summary,
        description,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        attendeeEmails,
      });
      if (created.eventId) {
        eventId = created.eventId;
        meetLink = created.meetLink ?? meetLink;
        const { error: upErr } = await admin
          .from("orbit_meetings")
          .update({
            google_calendar_event_id: eventId,
            external_video_url: meetLink,
          })
          .eq("id", meetingId);
        if (upErr) warnings.push(`Evento creado pero no se pudo guardar en BD: ${upErr.message}`);
      } else {
        warnings.push(`No se pudo crear el evento en Google. ${created.rawError ?? ""}`);
      }
    }
  } else if (action === "update") {
    if (!accessToken) {
      // ya hay warning
    } else if (!eventId) {
      // Nunca se creó el evento -> crearlo ahora (fallback).
      const created = await createEvent({
        accessToken,
        summary,
        description,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        attendeeEmails,
      });
      if (created.eventId) {
        eventId = created.eventId;
        meetLink = created.meetLink ?? meetLink;
        await admin
          .from("orbit_meetings")
          .update({ google_calendar_event_id: eventId, external_video_url: meetLink })
          .eq("id", meetingId);
        warnings.push("La reunión no tenía evento de Google; se creó uno nuevo en vez de actualizar.");
      } else {
        warnings.push(`No se pudo crear el evento en Google. ${created.rawError ?? ""}`);
      }
    } else {
      const patched = await patchEvent({
        accessToken,
        eventId,
        summary,
        description,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
      });
      if (patched.ok) {
        if (patched.meetLink && patched.meetLink !== meetLink) {
          meetLink = patched.meetLink;
          await admin.from("orbit_meetings").update({ external_video_url: meetLink }).eq("id", meetingId);
        }
      } else {
        warnings.push(`No se pudo actualizar el evento en Google. ${patched.rawError ?? ""}`);
      }
    }
  } else if (action === "cancel") {
    if (accessToken && eventId) {
      const deleted = await deleteEvent({ accessToken, eventId });
      if (!deleted.ok) {
        warnings.push(`No se pudo borrar el evento en Google. ${deleted.rawError ?? ""}`);
      }
    } else if (!eventId) {
      warnings.push("La reunión no tenía evento de Google; no había nada que cancelar en Google Calendar.");
    }
  }

  // 4. Notificar por correo.
  if (recipients.length === 0) {
    warnings.push("No hay asistentes con correo válido; no se envió correo.");
  } else {
    const subjectPrefix =
      action === "create" ? "Invitación" : action === "update" ? "Reagendada" : "Cancelada";
    const html = buildEmailHtml(action, { title: row.title, brand, when, tz, agenda: row.agenda, meetLink });
    const mj = await sendMailjet({
      to: recipients,
      subject: `Orbit · ${subjectPrefix}: ${row.title} (${brand})`,
      html,
    });
    if (mj.ok) emailsSent = recipients.length;
    else warnings.push(`Mailjet: ${JSON.stringify(mj.detail)}`);
  }

  return json({
    ok: true,
    action,
    meeting_id: meetingId,
    google_calendar_event_id: eventId,
    meet_link: meetLink,
    emails_sent: emailsSent,
    warnings,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  });
});
