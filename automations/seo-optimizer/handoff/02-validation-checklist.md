# Validation checklist — smoke test end-to-end

Ejecutar una vez después de:
1. Aplicar las 6 migraciones a Light_House (ya hecho ✅)
2. Setear `SEO_OPTIMIZER_INTERNAL_SECRET` en Supabase Vault
3. Setear secrets como env vars de Edge Functions (`supabase secrets set ...`)
4. Desplegar las 9 Edge Functions
5. Insertar al menos 1 cliente en `seo_optimizer.client_config` con un GSC property válido

---

## A. Verificación del schema y crons (DB lista — pre-deploy de funciones)

```sql
-- 1. Tablas y vistas
SELECT table_name, table_type FROM information_schema.tables
WHERE table_schema='seo_optimizer' ORDER BY table_type, table_name;
-- ✅ Esperado: 9 BASE TABLE + 6 VIEW

-- 2. Cron jobs activos
SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'seo-optimizer-%';
-- ✅ Esperado: 4 rows:
--    seo-optimizer-monthly       0 14 1 * *   → cron_post('seo-optimizer-orchestrator', ...)
--    seo-optimizer-reeval-daily  0 15 * * *   → cron_post('seo-optimizer-reeval-batch', ...)
--    seo-optimizer-outbox-worker * * * * *    → cron_post('seo-optimizer-outbox-worker', ...)
--    seo-optimizer-watchdog      */5 * * * *  → watchdog_check()

-- 3. Health view responde
SELECT * FROM seo_optimizer.v_pipeline_health;
-- ✅ Esperado: 1 row con todos los counts en 0

-- 4. Vault tiene el secret
SELECT name FROM vault.secrets WHERE name LIKE 'SEO_OPTIMIZER_%';
-- ✅ Esperado: SEO_OPTIMIZER_INTERNAL_SECRET
```

---

## B. Verificación de Edge Functions desplegadas

```bash
supabase functions list --project-ref stjugsrkrweakvzmizpq
# ✅ Esperado: las 9 funciones seo-optimizer-* listadas, status ACTIVE
```

```bash
# Health check rápido — cada función debe responder 401 sin x-internal-secret
curl -X POST "https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/seo-optimizer-outbox-worker" \
  -H "content-type: application/json" -d '{}'
# ✅ Esperado: {"error":"missing x-internal-secret header"} con status 401
```

---

## C. Onboard de un cliente de prueba

```sql
-- Asume que el cliente "Ejemplo" ya existe en public.clientes
INSERT INTO seo_optimizer.client_config (client_id, gsc_property_url, is_active, slack_channel_id)
SELECT id, 'sc-domain:ejemplo.com', TRUE, 'C09XXXXXXX'   -- tu canal de Slack de testing
FROM public.clientes
WHERE name = 'Ejemplo'
LIMIT 1;

-- Verificar
SELECT * FROM seo_optimizer.v_active_clients;
-- ✅ Esperado: 1 row con el cliente, gsc_property_url, language, etc.
```

---

## D. Smoke test — disparar orchestrator manualmente

```bash
# Reemplaza <SECRET> con el valor real de SEO_OPTIMIZER_INTERNAL_SECRET
curl -X POST "https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/seo-optimizer-orchestrator" \
  -H "x-internal-secret: <SECRET>" \
  -H "content-type: application/json" \
  -d '{"trigger":"manual","period_days":90}'
```

**Tiempos esperados:**
- Cliente con ~50 URLs: ~30-60 segundos
- Cliente con ~500 URLs: ~2-3 minutos (puede acercarse al límite de 150s de Edge Functions)

**Validar resultados:**

```sql
-- 1. Run creado y status
SELECT id, status, clients_total, clients_processed, started_at, completed_at,
       EXTRACT(EPOCH FROM (completed_at - started_at))::int AS duration_sec
FROM seo_optimizer.runs
ORDER BY started_at DESC LIMIT 1;
-- ✅ status='completed' o 'partial'

-- 2. Eventos del run
SELECT event_source, event_type, COUNT(*)
FROM seo_optimizer.run_events
WHERE run_id = (SELECT id FROM seo_optimizer.runs ORDER BY started_at DESC LIMIT 1)
GROUP BY 1, 2 ORDER BY 1, 2;
-- ✅ agent_started + agent_completed para gsc_ingestor, article_ingestor, analyst

-- 3. Data GSC ingerida
SELECT COUNT(*), COUNT(DISTINCT url), COUNT(DISTINCT query)
FROM seo_optimizer.gsc_url_query_metrics
WHERE run_id = (SELECT id FROM seo_optimizer.runs ORDER BY started_at DESC LIMIT 1);
-- ✅ COUNT(*) > 0

-- 4. Snapshots de artículos
SELECT source, COUNT(*) FROM seo_optimizer.article_snapshots
WHERE run_id = (SELECT id FROM seo_optimizer.runs ORDER BY started_at DESC LIMIT 1)
GROUP BY source;
-- ✅ live > 0; fallback_failed debería ser bajo (<10%)

-- 5. Oportunidades generadas
SELECT category, COUNT(*) FROM seo_optimizer.opportunities
WHERE run_id = (SELECT id FROM seo_optimizer.runs ORDER BY started_at DESC LIMIT 1)
GROUP BY category;
-- ✅ Hasta 10 oportunidades, repartidas entre categorías
```

---

## E. Smoke test — flujo de aprobación

```sql
-- 1. Aprobar una opportunity manualmente (esto dispara el trigger DB → /seo-optimizer-writer)
UPDATE seo_optimizer.opportunities
SET status = 'approved',
    decided_by = (SELECT id FROM auth.users LIMIT 1),
    decided_at = NOW()
WHERE id = (SELECT id FROM seo_optimizer.opportunities WHERE status = 'pending' LIMIT 1)
RETURNING id, article_url, category;

-- 2. Esperar ~30-60s para que /seo-optimizer-writer genere el rewrite
SELECT id, status, updated_at FROM seo_optimizer.opportunities WHERE id = '<id-anterior>';
-- ✅ status='ready_for_writer' (o 'writing' si todavía está generando)

-- 3. Verificar el rewrite generado
SELECT id, change_summary, tokens_input, tokens_output, generated_by_model
FROM seo_optimizer.opportunity_rewrites
WHERE opportunity_id = '<id-anterior>';
-- ✅ 1 row con change_summary no vacío, tokens > 0
```

---

## F. Smoke test — flujo de rechazo (memoria persistente)

```sql
UPDATE seo_optimizer.opportunities
SET status = 'rejected',
    decided_by = (SELECT id FROM auth.users LIMIT 1),
    decision_reason = 'Test de rechazo'
WHERE id = (SELECT id FROM seo_optimizer.opportunities WHERE status = 'pending' LIMIT 1);

-- Verificar que se copió a rejection_log
SELECT * FROM seo_optimizer.rejection_log ORDER BY rejected_at DESC LIMIT 1;
-- ✅ 1 row con la opp recién rechazada, reopened=false
```

---

## G. Smoke test — implementación + re-eval simulado

```sql
-- 1. Marcar como implementada (con fecha pasada para forzar reeval inmediato)
UPDATE seo_optimizer.opportunities
SET status = 'implemented',
    implemented_by = (SELECT id FROM auth.users LIMIT 1),
    implemented_at = NOW() - INTERVAL '46 days'
WHERE id = (SELECT id FROM seo_optimizer.opportunities WHERE status = 'ready_for_writer' LIMIT 1);

-- 2. Verificar que reeval_due_at se setó automáticamente
SELECT id, status, implemented_at, reeval_due_at
FROM seo_optimizer.opportunities
WHERE status = 'implemented' AND reeval_due_at <= CURRENT_DATE LIMIT 1;
-- ✅ reeval_due_at = implemented_at + 45 days (en pasado por el truco)
```

```bash
# 3. Disparar /seo-optimizer-reeval-batch manualmente
curl -X POST "https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/seo-optimizer-reeval-batch" \
  -H "x-internal-secret: <SECRET>" -d '{}'
# ✅ Response: {"status":"ok","processed":1,"outcomes":{...}}
```

```sql
-- 4. Verificar reeval_results
SELECT outcome, confidence_in_outcome, clicks_delta_pct, position_delta
FROM seo_optimizer.reeval_results ORDER BY created_at DESC LIMIT 1;
-- ✅ 1 row con outcome ∈ {improved, unchanged, worsened, inconclusive}
```

---

## H. Smoke test — outbox + Slack

```sql
-- 1. Verificar outbox tiene notificaciones del run
SELECT source, target_type, status, channel_id, dedupe_key
FROM public.notifications_outbox
WHERE source = 'seo_optimizer' ORDER BY created_at DESC LIMIT 5;
-- ✅ Debe haber rows con status='sent' (worker ya procesó) o 'pending' si fresco

-- 2. Esperar 1-2 min y volver a chequear
-- ✅ Las pending deberían pasar a sent

-- 3. Confirmar visualmente en Slack que llegó el mensaje al canal configurado
```

---

## I. State machine — transiciones inválidas (debe fallar)

```sql
-- Intentar saltarse pasos debe fallar
UPDATE seo_optimizer.opportunities SET status = 'implemented' WHERE status = 'pending' LIMIT 1;
-- ✅ Esperado: ERROR: Invalid status transition: pending -> implemented

UPDATE seo_optimizer.opportunities SET status = 'pending' WHERE status = 'closed' LIMIT 1;
-- ✅ Esperado: ERROR: Invalid status transition: closed -> pending
```

---

## Si algo falla → ver `03-runbook.md`
