-- Migration: fix_webhook_urls_and_add_business_hours_filter
-- Applied: 2026-05-17
-- Resolves: GAP-C1 (all /webhook-test/ URLs → /webhook/)
--           GAP-C2 (business_calendar working-day gate on all ticket-hub webhooks)
--
-- Background:
--   All Ticket Hub triggers were pointing to N8N /webhook-test/ endpoints,
--   which only respond when a developer has the workflow open in the editor.
--   In addition, webhooks fired 7×24 with no working-day filter, spamming
--   the team on weekends and holidays.
--
-- Changes:
--   1. notify_ticket_closed           — /webhook-test/aviso-cierre-ticket
--                                     → /webhook/aviso-cierre-ticket
--                                       + business_calendar gate
--   2. tg_notify_nuevo_mensaje_ticket — /webhook-test/nuevo-mensaje-ticket
--                                     → /webhook/nuevo-mensaje-ticket
--                                       + business_calendar gate
--   3. tg_notify_nuevo_mensaje_solicitud — /webhook-test/nuevo-mensaje-solicitud
--                                        → /webhook/nuevo-mensaje-solicitud
--                                          + business_calendar gate
--   4. "Enviar a n8n - Nuevo Ticket" trigger
--        replaced supabase_functions.http_request (no filter possible)
--        with new PL/pgSQL function tg_notify_nuevo_ticket()
--        → /webhook/nuevo-tickets-cliente + business_calendar gate
--   5. notificar_nueva_solicitud trigger
--        replaced supabase_functions.http_request
--        with new PL/pgSQL function tg_notify_nueva_solicitud()
--        → /webhook/nueva-solicitud-cliente + business_calendar gate
--   6. "n8n-ux-requests" trigger
--        replaced supabase_functions.http_request
--        with new PL/pgSQL function tg_notify_ux_requests()
--        → /webhook/notificaciones-ux-supabase + business_calendar gate
-- ===========================================================================

-- ── 1. notify_ticket_closed ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_ticket_closed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
declare
  payload jsonb;
begin
  if new.status = 'Cerrado' and (old.status is distinct from new.status) then

    if not exists (
        select 1 from public.business_calendar
        where calendar_date = (now() at time zone 'America/Bogota')::date
          and is_working_day = true
    ) then
        return new;
    end if;

    payload = jsonb_build_object(
      'ticket_display_id', new.ticket_id,
      'subject',           new.ticket_subject,
      'client_id',         new.client_id,
      'closed_at',         now()
    );

    perform net.http_post(
      url     := 'https://estancias-atlas-n8n.heh8a3.easypanel.host/webhook/aviso-cierre-ticket',
      body    := payload,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );

  end if;
  return new;
end;
$$;

-- ── 2. tg_notify_nuevo_mensaje_ticket ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_notify_nuevo_mensaje_ticket()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    if NEW.ticket_id IS NULL THEN
        RETURN NEW;
    END IF;

    if not exists (
        select 1 from public.business_calendar
        where calendar_date = (now() at time zone 'America/Bogota')::date
          and is_working_day = true
    ) then
        RETURN NEW;
    end if;

    PERFORM net.http_post(
        url     := 'https://estancias-atlas-n8n.heh8a3.easypanel.host/webhook/nuevo-mensaje-ticket',
        headers := '{"Content-type":"application/json"}'::jsonb,
        body    := row_to_json(NEW)::text,
        timeout_milliseconds := 5000
    );
    RETURN NEW;
END;
$$;

-- ── 3. tg_notify_nuevo_mensaje_solicitud ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_notify_nuevo_mensaje_solicitud()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    if NEW.request_id IS NULL THEN
        RETURN NEW;
    END IF;

    if not exists (
        select 1 from public.business_calendar
        where calendar_date = (now() at time zone 'America/Bogota')::date
          and is_working_day = true
    ) then
        RETURN NEW;
    end if;

    PERFORM net.http_post(
        url     := 'https://estancias-atlas-n8n.heh8a3.easypanel.host/webhook/nuevo-mensaje-solicitud',
        headers := '{"Content-type":"application/json"}'::jsonb,
        body    := row_to_json(NEW)::text,
        timeout_milliseconds := 5000
    );
    RETURN NEW;
END;
$$;

-- ── 4. "Enviar a n8n - Nuevo Ticket" ────────────────────────────────────────
DROP TRIGGER IF EXISTS "Enviar a n8n - Nuevo Ticket" ON public.tickets;

CREATE OR REPLACE FUNCTION public.tg_notify_nuevo_ticket()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    if not exists (
        select 1 from public.business_calendar
        where calendar_date = (now() at time zone 'America/Bogota')::date
          and is_working_day = true
    ) then
        RETURN NEW;
    end if;

    PERFORM net.http_post(
        url     := 'https://estancias-atlas-n8n.heh8a3.easypanel.host/webhook/nuevo-tickets-cliente',
        headers := '{"Content-type":"application/json"}'::jsonb,
        body    := row_to_json(NEW)::text,
        timeout_milliseconds := 5000
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER "Enviar a n8n - Nuevo Ticket"
AFTER INSERT ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_nuevo_ticket();

-- ── 5. notificar_nueva_solicitud ────────────────────────────────────────────
DROP TRIGGER IF EXISTS notificar_nueva_solicitud ON public.client_requests;

CREATE OR REPLACE FUNCTION public.tg_notify_nueva_solicitud()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    if not exists (
        select 1 from public.business_calendar
        where calendar_date = (now() at time zone 'America/Bogota')::date
          and is_working_day = true
    ) then
        RETURN NEW;
    end if;

    PERFORM net.http_post(
        url     := 'https://estancias-atlas-n8n.heh8a3.easypanel.host/webhook/nueva-solicitud-cliente',
        headers := '{"Content-type":"application/json"}'::jsonb,
        body    := row_to_json(NEW)::text,
        timeout_milliseconds := 5000
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER notificar_nueva_solicitud
AFTER INSERT ON public.client_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_nueva_solicitud();

-- ── 6. "n8n-ux-requests" ────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS "n8n-ux-requests" ON public.client_requests;

CREATE OR REPLACE FUNCTION public.tg_notify_ux_requests()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    if not exists (
        select 1 from public.business_calendar
        where calendar_date = (now() at time zone 'America/Bogota')::date
          and is_working_day = true
    ) then
        RETURN NEW;
    end if;

    PERFORM net.http_post(
        url     := 'https://estancias-atlas-n8n.heh8a3.easypanel.host/webhook/notificaciones-ux-supabase',
        headers := '{"Content-type":"application/json"}'::jsonb,
        body    := row_to_json(NEW)::text,
        timeout_milliseconds := 5000
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER "n8n-ux-requests"
AFTER INSERT OR UPDATE ON public.client_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_ux_requests();
