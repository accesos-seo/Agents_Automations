-- Migration: schedule_ticket_hub_attention_cron
-- Applied: 2026-05-17
-- Resolves: GAP-C4 (stale "En Progreso" tickets with no follow-up)
--
-- Background:
--   fn_check_ticket_hub_attention() exists and correctly detects abandoned
--   tickets (awaiting first response, stale, overdue) and writes escalating
--   Slack notifications to notifications_outbox. However, no pg_cron job
--   was calling it, so it never ran.
--
-- Change:
--   Schedule job #15 to run Mon–Fri at 9:00 AM Bogotá time (14:00 UTC, UTC-5).
--   The function already checks business_calendar internally and exits early
--   on holidays, so the schedule is intentionally broad (Mon–Fri).
-- ===========================================================================

SELECT cron.schedule(
    'ticket-hub-attention-runner-weekdays',
    '0 14 * * 1-5',
    $$SELECT public.fn_check_ticket_hub_attention()$$
);
