-- ============================================================
-- GBP Post Automation Trigger
-- Project: Light_House (stjugsrkrweakvzmizpq)
-- Fires when a blog_post reaches validated_by_content_manager
-- and the project has seo_local enabled in project_services.
-- Quota: 4 GBP posts/month per project (enforced in Edge Function).
-- ============================================================

CREATE OR REPLACE FUNCTION fn_gbp_draft_on_validated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_anon_key   text    := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0anVnc3JrcndlYWt2em1penBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc3ODM3MjAsImV4cCI6MjA3MzM1OTcyMH0.CvD-96577u18Z9u5KvjnP36gcpPa3mJltCM2L1A74TE';
  v_edge_url   text    := 'https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/gbp-post-generator';
  v_request_id bigint;
BEGIN
  -- Guard: all conditions must hold before calling the Edge Function.
  -- 1. Status transitions TO validated_by_content_manager (not already there)
  -- 2. Only blog_post content type
  -- 3. GBP not yet processed (pending + no content)
  -- 4. proyecto_id must exist for brand/service lookup
  IF NOT (
    NEW.status = 'validated_by_content_manager'
    AND (OLD.status IS DISTINCT FROM 'validated_by_content_manager')
    AND NEW.content_type = 'blog_post'
    AND COALESCE(NEW.gbp_status, 'pending') = 'pending'
    AND NEW.gbp_post_content IS NULL
    AND NEW.proyecto_id IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;

  SELECT net.http_post(
    url     := v_edge_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        v_anon_key,
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body    := jsonb_build_object(
      'content_item_id', NEW.id::text,
      'proyecto_id',     NEW.proyecto_id::text,
      'client_id',       NEW.client_id::text
    )::text,
    timeout_milliseconds := 5000
  ) INTO v_request_id;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never block the article validation transaction.
    RAISE WARNING 'GBP draft trigger failed for content_item %, error: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_gbp_draft_on_validated() IS
  'Llama a gbp-post-generator cuando un blog_post llega a validated_by_content_manager. '
  'La Edge Function verifica: (1) seo_local activo en project_services, '
  '(2) cuota de 4 posts/mes por proyecto, (3) genera borrador con Claude Haiku, '
  '(4) calcula fecha trimestral con business_calendar, (5) notifica al lider_id.';

DROP TRIGGER IF EXISTS trg_gbp_draft_on_validated ON content_items;

CREATE TRIGGER trg_gbp_draft_on_validated
  AFTER UPDATE ON content_items
  FOR EACH ROW
  EXECUTE FUNCTION fn_gbp_draft_on_validated();

COMMENT ON TRIGGER trg_gbp_draft_on_validated ON content_items IS
  'Dispara la automatización GBP cuando un blog_post pasa a validated_by_content_manager. '
  'Solo actúa si gbp_status=pending y gbp_post_content IS NULL.';
