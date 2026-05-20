-- ============================================================================
-- Migration: 002_seo_optimizer_views.sql
-- Purpose:   Operational and analytical views for monitoring and front-end.
-- Depends:   001_seo_optimizer_schema.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- v_pipeline_health
-- ----------------------------------------------------------------------------
-- One-row snapshot of system health. Used by /admin dashboard and watchdog.

CREATE OR REPLACE VIEW seo_optimizer.v_pipeline_health AS
SELECT
    -- Runs in flight too long
    (SELECT COUNT(*) FROM seo_optimizer.runs
        WHERE status = 'running' AND started_at < NOW() - INTERVAL '1 hour'
    ) AS runs_stuck,

    -- Pending decisions older than 7 days (SEO not reviewing)
    (SELECT COUNT(*) FROM seo_optimizer.opportunities
        WHERE status = 'pending' AND created_at < NOW() - INTERVAL '7 days'
    ) AS opportunities_pending_stale,

    -- Approved but not delivered to writer (writer agent failed?)
    (SELECT COUNT(*) FROM seo_optimizer.opportunities
        WHERE status = 'writing' AND updated_at < NOW() - INTERVAL '30 min'
    ) AS rewrites_stuck_in_writing,

    -- Ready for writer but not implemented in >30 days
    (SELECT COUNT(*) FROM seo_optimizer.opportunities
        WHERE status = 'ready_for_writer'
          AND updated_at < NOW() - INTERVAL '30 days'
    ) AS rewrites_pending_implementation,

    -- Re-evals overdue
    (SELECT COUNT(*) FROM seo_optimizer.opportunities
        WHERE status = 'implemented'
          AND reeval_due_at < CURRENT_DATE
    ) AS reevals_overdue,

    -- Outbox health (notifications stuck)
    (SELECT COUNT(*) FROM public.notifications_outbox
        WHERE source = 'seo_optimizer'
          AND status = 'pending'
          AND COALESCE(locked_at, NOW() - INTERVAL '1 hour') < NOW() - INTERVAL '10 min'
    ) AS outbox_stale_locks,

    -- Throughput indicators (last 24h)
    (SELECT COUNT(*) FROM public.notifications_outbox
        WHERE source = 'seo_optimizer'
          AND status = 'sent'
          AND sent_at > NOW() - INTERVAL '24 hours'
    ) AS alerts_sent_24h,

    -- Re-evals processed today
    (SELECT COUNT(*) FROM seo_optimizer.reeval_results
        WHERE created_at > CURRENT_DATE
    ) AS reevals_today;

COMMENT ON VIEW seo_optimizer.v_pipeline_health IS
  'One-row health snapshot. Watchdog uses this; admin dashboard displays it.';

-- ----------------------------------------------------------------------------
-- v_pending_decisions
-- ----------------------------------------------------------------------------
-- SEO specialist's inbox: opportunities awaiting approve/reject.

CREATE OR REPLACE VIEW seo_optimizer.v_pending_decisions AS
SELECT
    o.id                            AS opportunity_id,
    o.run_id,
    o.client_id,
    c.name                          AS client_name,
    o.content_item_id,
    o.article_url,
    o.article_title,
    o.article_language,
    o.category,
    o.score,
    o.rank_within_client,
    o.traffic_potential_estimate,
    o.effort_level,
    o.confidence,
    o.recommendation_summary,
    o.evidence,
    o.created_at,
    EXTRACT(DAY FROM (NOW() - o.created_at))::int AS days_since_proposed,
    -- urgency: how long has SEO been ignoring this?
    CASE
        WHEN NOW() - o.created_at > INTERVAL '30 days' THEN 'overdue'
        WHEN NOW() - o.created_at > INTERVAL '14 days' THEN 'stale'
        WHEN NOW() - o.created_at > INTERVAL '7 days'  THEN 'aging'
        ELSE 'fresh'
    END AS urgency
FROM seo_optimizer.opportunities o
LEFT JOIN public.clientes c ON c.id = o.client_id
WHERE o.status = 'pending'
ORDER BY o.client_id, o.rank_within_client;

COMMENT ON VIEW seo_optimizer.v_pending_decisions IS
  'SEO specialist inbox. Front-end queries this for the "to review" panel.';

-- ----------------------------------------------------------------------------
-- v_ready_for_writer
-- ----------------------------------------------------------------------------
-- Redactor's inbox: approved opportunities with HTML ready to paste.

CREATE OR REPLACE VIEW seo_optimizer.v_ready_for_writer AS
SELECT
    o.id                            AS opportunity_id,
    r.id                            AS rewrite_id,
    o.client_id,
    c.name                          AS client_name,
    o.article_url,
    o.article_title,
    o.article_language,
    o.category,
    o.recommendation_summary,
    r.change_summary,
    r.diff_html,
    r.proposed_title_tag,
    r.proposed_meta_description,
    r.proposed_h1,
    r.proposed_html,
    r.generated_at,
    EXTRACT(DAY FROM (NOW() - o.updated_at))::int AS days_since_approved,
    CASE
        WHEN NOW() - o.updated_at > INTERVAL '30 days' THEN 'overdue'
        WHEN NOW() - o.updated_at > INTERVAL '14 days' THEN 'stale'
        ELSE 'on_track'
    END AS urgency
FROM seo_optimizer.opportunities o
JOIN seo_optimizer.opportunity_rewrites r ON r.opportunity_id = o.id
LEFT JOIN public.clientes c ON c.id = o.client_id
WHERE o.status = 'ready_for_writer'
ORDER BY o.client_id, urgency, o.updated_at;

COMMENT ON VIEW seo_optimizer.v_ready_for_writer IS
  'Copywriter inbox. Each row has the HTML diff to paste into the CMS.';

-- ----------------------------------------------------------------------------
-- v_reeval_due_next_7d
-- ----------------------------------------------------------------------------
-- Opportunities reaching the 45-day re-evaluation mark in the next 7 days.

CREATE OR REPLACE VIEW seo_optimizer.v_reeval_due_next_7d AS
SELECT
    o.id                            AS opportunity_id,
    o.client_id,
    c.name                          AS client_name,
    o.article_url,
    o.article_title,
    o.category,
    o.implemented_at,
    o.reeval_due_at,
    (o.reeval_due_at - CURRENT_DATE) AS days_until_reeval
FROM seo_optimizer.opportunities o
LEFT JOIN public.clientes c ON c.id = o.client_id
WHERE o.status = 'implemented'
  AND o.reeval_due_at <= CURRENT_DATE + INTERVAL '7 days'
ORDER BY o.reeval_due_at;

COMMENT ON VIEW seo_optimizer.v_reeval_due_next_7d IS
  'Heads-up of upcoming re-evaluations. Daily cron processes anything with reeval_due_at <= today.';

-- ----------------------------------------------------------------------------
-- v_outcomes_summary
-- ----------------------------------------------------------------------------
-- Rolling 6-month performance of the system. Critical for credibility:
-- "did our suggestions actually improve metrics?"

CREATE OR REPLACE VIEW seo_optimizer.v_outcomes_summary AS
WITH per_category AS (
    SELECT
        o.category,
        COUNT(*)                                                                AS total_proposed,
        COUNT(*) FILTER (WHERE o.status IN ('approved','writing','ready_for_writer','implemented','observing','closed')) AS total_approved,
        COUNT(*) FILTER (WHERE o.status IN ('implemented','observing','closed'))                                         AS total_implemented,
        COUNT(*) FILTER (WHERE o.reeval_outcome = 'improved')                   AS reeval_improved,
        COUNT(*) FILTER (WHERE o.reeval_outcome = 'unchanged')                  AS reeval_unchanged,
        COUNT(*) FILTER (WHERE o.reeval_outcome = 'worsened')                   AS reeval_worsened,
        COUNT(*) FILTER (WHERE o.reeval_outcome = 'inconclusive')               AS reeval_inconclusive
    FROM seo_optimizer.opportunities o
    WHERE o.created_at > NOW() - INTERVAL '6 months'
    GROUP BY o.category
)
SELECT
    category,
    total_proposed,
    total_approved,
    total_implemented,
    reeval_improved,
    reeval_unchanged,
    reeval_worsened,
    reeval_inconclusive,
    -- Conversion rates
    CASE WHEN total_proposed > 0
         THEN ROUND(100.0 * total_approved / total_proposed, 1)
         ELSE 0 END                                                              AS approval_rate_pct,
    CASE WHEN total_approved > 0
         THEN ROUND(100.0 * total_implemented / total_approved, 1)
         ELSE 0 END                                                              AS implementation_rate_pct,
    -- Effectiveness (of reevaled ones)
    CASE WHEN (reeval_improved + reeval_unchanged + reeval_worsened) > 0
         THEN ROUND(100.0 * reeval_improved / (reeval_improved + reeval_unchanged + reeval_worsened), 1)
         ELSE NULL END                                                           AS success_rate_pct
FROM per_category
ORDER BY total_proposed DESC;

COMMENT ON VIEW seo_optimizer.v_outcomes_summary IS
  'Rolling 6-month conversion funnel: proposed → approved → implemented → improved. '
  'Critical for system credibility. Anyone reviewing system performance should look here first.';

-- ----------------------------------------------------------------------------
-- v_active_runs
-- ----------------------------------------------------------------------------
-- Quick lookup of currently running and recently completed runs.

CREATE OR REPLACE VIEW seo_optimizer.v_active_runs AS
SELECT
    r.id,
    r.trigger_source,
    r.status,
    r.period_start,
    r.period_end,
    r.clients_total,
    r.clients_processed,
    r.clients_failed,
    r.started_at,
    r.completed_at,
    EXTRACT(EPOCH FROM (COALESCE(r.completed_at, NOW()) - r.started_at))::int  AS duration_seconds,
    (SELECT COUNT(*) FROM seo_optimizer.run_events e WHERE e.run_id = r.id AND e.event_type = 'agent_failed') AS agent_failures,
    (SELECT COUNT(*) FROM seo_optimizer.opportunities o WHERE o.run_id = r.id) AS opportunities_generated
FROM seo_optimizer.runs r
WHERE r.started_at > NOW() - INTERVAL '90 days'
ORDER BY r.started_at DESC;

COMMENT ON VIEW seo_optimizer.v_active_runs IS
  'Last 90 days of runs with key counters and duration. Default view for debugging a specific run.';

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

GRANT SELECT ON ALL TABLES IN SCHEMA seo_optimizer TO service_role, authenticated;

-- ============================================================================
-- DONE.
-- ============================================================================
