# 03 — Runbook (Qué hacer si algo falla)

Guía para diagnosticar y desatascar el pipeline. Cada sección lista síntoma → diagnóstico → fix.

## Quick health check

```sql
SELECT * FROM seo_sentinel.v_pipeline_health;
```

Si **todos** los counts > 0 → ver sección correspondiente abajo.

---

## El cron diario no disparó nada

**Síntoma:** El día siguiente, `SELECT * FROM seo_sentinel.analysis_runs WHERE trigger_source='cron' AND started_at::date = CURRENT_DATE` está vacío.

**Diagnóstico:**

```sql
-- 1. ¿El cron job existe y está activo?
SELECT jobname, schedule, active, command
FROM cron.job WHERE jobname = 'seo-sentinel-daily';

-- 2. ¿Última ejecución y resultado?
SELECT runid, status, return_message, start_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname='seo-sentinel-daily')
ORDER BY start_time DESC LIMIT 5;
```

**Causas comunes:**
1. `SUPABASE_FUNCTIONS_URL` no está en Vault → cron's net.http_post falla silently. Solución: agregar al Vault.
2. `SEO_SENTINEL_INTERNAL_SECRET` no está en Vault → orchestrator devuelve 401, cron lo registra como fallido.
3. `pg_cron` extension no instalada en el proyecto → schedule no funciona. Solución: `CREATE EXTENSION pg_cron;` desde SQL Editor.
4. La hora del schedule está mal: `0 13 * * *` es **13:00 UTC** = 08:00 CO. Si la oficina está en otro huso, ajustar el cron.

**Fix rápido (dispara manualmente):**

```bash
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/seo-sentinel-orchestrator \
  -H "x-internal-secret: <SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual"}'
```

---

## Run quedó stuck en 'running' > 30 min

**Síntoma:** `SELECT * FROM seo_sentinel.v_pipeline_health` muestra `runs_stuck > 0`.

**Auto-fix:** El watchdog corre cada 2 min y marca runs huérfanos como `failed` automáticamente, además de notificar al SLACK_ADMIN_CHANNEL.

**Verificación:**

```sql
SELECT id, started_at, brands_total, brands_processed, brands_failed, error_message
FROM seo_sentinel.analysis_runs
WHERE status = 'failed' AND error_message LIKE '%watchdog%'
ORDER BY started_at DESC LIMIT 5;
```

**Diagnóstico del por qué quedó stuck:**

```sql
SELECT occurred_at, event_source, event_type, brand_id, error_message
FROM seo_sentinel.run_events
WHERE run_id = '<RUN_ID_STUCK>'
ORDER BY occurred_at;
```

Buscar el último `agent_started` sin su `agent_completed` correspondiente — ese agente murió. Causas frecuentes:
- GSC API timeout (>30s)
- Edge function memory OOM
- Supabase function 60s hard timeout (con muchas brands)

**Fix:** Re-disparar manualmente con `--data '{"trigger":"watchdog_retry"}'`. Si vuelve a fallar, reducir el número de brands procesadas en paralelo (editar `orchestrator/index.ts`).

---

## Slack no recibió la alerta

**Síntoma:** Incident_diagnostics tiene `dispatch_status='pending'` pero la alerta no llegó.

**Diagnóstico:**

```sql
SELECT target_type, channel_id, status, retry_count, error_message, sent_at, next_retry_at
FROM public.notifications_outbox
WHERE source = 'seo_sentinel_alert'
  AND dedupe_key LIKE 'seo_sentinel:<INCIDENT_ID>%'
ORDER BY created_at DESC;
```

| Status | Significa | Fix |
|---|---|---|
| `pending`, locked_at NULL | Worker no la procesó aún | Esperar 30s o disparar manualmente: `curl -X POST .../seo-sentinel-outbox-worker -H 'x-internal-secret: ...'` |
| `pending`, locked_at antiguo | Worker murió mid-process | Watchdog libera locks > 5min automáticamente. Esperar |
| `pending`, retry_count > 0 | Slack falló, se reintentará | Ver `error_message` y `next_retry_at` |
| `sent` | Slack confirmó | Verificar canal/DM correcto, bot invitado |
| `failed` | 3 reintentos fallidos | Ver `error_message`, arreglar root cause y `force` re-dispatch |

### Errores Slack típicos

| `error_message` | Causa | Fix |
|---|---|---|
| `not_in_channel` | Bot no está en el canal | `/invite @seo-sentinel` en el canal |
| `channel_not_found` | channel_id incorrecto | Verificar `brand_team_routing.slack_channel_id` |
| `invalid_auth` | SLACK_BOT_TOKEN expirado/incorrecto | Regenerar token en Slack App, actualizar Vault |
| `missing_scope` | Bot scopes insuficientes | Agregar `chat:write` + `chat:write.public` + `im:write` |
| `ratelimited` | Slack rate-limit excedido | Worker hará retry automáticamente |
| `slack_http_5xx` | Slack caído | Auto-retry, no acción |

### Re-disparar manualmente

```bash
# Re-enqueue ignorando idempotencia:
curl -X POST .../seo-sentinel-dispatcher \
  -H "x-internal-secret: <SECRET>" \
  -d '{"incident_id":"<UUID>","force":true}'

# O forzar al worker a procesar ahora:
curl -X POST .../seo-sentinel-outbox-worker \
  -H "x-internal-secret: <SECRET>" \
  -d '{}'
```

---

## GSC API errores

**Síntoma:** `run_events` con `event_source='gsc-ingestor'` y `event_type='agent_failed'`.

**Diagnóstico:**

```sql
SELECT occurred_at, brand_id, error_message
FROM seo_sentinel.run_events
WHERE event_source = 'gsc-ingestor' AND event_type = 'agent_failed'
ORDER BY occurred_at DESC LIMIT 10;
```

### Errores típicos

| `error_message` | Causa | Fix |
|---|---|---|
| `User does not have sufficient permission` | Service Account no agregada a la propiedad | En GSC Settings → Users → Add user con el `client_email` de la SA |
| `Property not found` | `gsc_property_url` mal formateado | Debe ser exactamente como aparece en GSC: `sc-domain:example.com` o `https://example.com/` (con slash final) |
| `429 Too Many Requests` | Rate limit | El módulo gsc-api.ts ya hace retry exponencial. Si persiste, reducir batch sizes |
| `JWT signature verification failed` | `GSC_SERVICE_ACCOUNT_JSON` malformado | Verificar que el JSON es válido y completo (con `private_key`) |

---

## LLM (OpenRouter) errores

**Síntoma:** `incident_diagnostics.thematic_cluster = "clúster no identificado"` y/o `run_events` con `event_type='warning'` y `reason='llm_summary_failed'`.

**Diagnóstico:**

```sql
SELECT occurred_at, event_source, error_message, payload
FROM seo_sentinel.run_events
WHERE event_type = 'warning'
ORDER BY occurred_at DESC LIMIT 10;
```

### Causas comunes

1. **`OPENROUTER_API_KEY` inválida o sin crédito:**
   - Verificar en https://openrouter.ai/activity
   - Recargar saldo o regenerar key

2. **`SEO_SENTINEL_MODEL` no existe:**
   - Default es `anthropic/claude-sonnet-4`
   - Ver modelos disponibles en https://openrouter.ai/models
   - Cambiar Vault entry si necesario

3. **Rate limit OpenRouter:** Si hay muchas anomalías simultáneas, el LLM puede tirar 429. En V1 no hay retry. Mitigation: ajustar la concurrencia del detective.

**Importante:** El pipeline NO se cae si el LLM falla. El dispatcher tiene fallback degradado que envía el alert con un mensaje genérico. La alerta llega al equipo igual.

---

## Brand sin GSC property configurada

**Síntoma:** `run_events` con `error_message='no_gsc_property_url'`.

**Fix:**

```sql
UPDATE seo_sentinel.brands
SET gsc_property_url = 'sc-domain:cliente.com'  -- formato exacto de GSC
WHERE name = 'Cliente XYZ';
```

Formatos válidos:
- Domain property: `sc-domain:cliente.com`
- URL prefix property: `https://cliente.com/` (con slash final)

Para encontrar el formato exacto: GSC → seleccionar propiedad → URL en la barra del navegador.

---

## Anomalías que parecen falsos positivos

**Síntoma:** El equipo se queja de alertas RED que no son reales.

**Diagnóstico:**

```sql
-- Ver wow_drop_pct y si pasó por false-positive filter:
SELECT ca.brand_id, b.name, ca.anomaly_date, ca.wow_drop_pct, ca.severity,
       ca.false_positive, ca.false_positive_reason
FROM seo_sentinel.clicks_anomalies ca
JOIN seo_sentinel.brands b ON b.id = ca.brand_id
WHERE ca.anomaly_date > CURRENT_DATE - 7
ORDER BY ca.anomaly_date DESC;
```

### Tuning

1. **Subir umbral por brand:**
   ```sql
   UPDATE seo_sentinel.brands
   SET alert_threshold_clicks_pct = 30  -- en vez de 20
   WHERE name = 'Cliente XYZ';
   ```

2. **Marcar seasonality:**
   ```sql
   UPDATE seo_sentinel.brands
   SET seasonality_type = 'b2b_weekday'  -- ignorar caídas weekend
   WHERE name = 'Cliente B2B';
   ```

3. **Agregar festivo no incluido en el seed:**
   ```sql
   INSERT INTO seo_sentinel.holiday_calendar (date, name, country_code, expected_traffic_reduction_pct)
   VALUES ('2026-06-29', 'San Pedro y San Pablo', 'CO', 30)
   ON CONFLICT (date, country_code) DO NOTHING;
   ```

---

## Cómo limpiar runs viejos

Si la tabla `run_events` crece demasiado:

```sql
-- Mantener solo últimos 90 días
DELETE FROM seo_sentinel.run_events
WHERE occurred_at < NOW() - INTERVAL '90 days';

-- Mantener solo últimos 90 días de runs completados
DELETE FROM seo_sentinel.analysis_runs
WHERE completed_at < NOW() - INTERVAL '90 days'
  AND status IN ('completed', 'failed');
```

Las FK con `ON DELETE CASCADE` propagan a `run_events` y `traffic_daily`.

**No borrar:** `incident_log` ni `incident_diagnostics` — son auditoría permanente.

---

## Cómo apagar el sistema temporalmente

```sql
-- Pausar cron jobs
UPDATE cron.job SET active = false WHERE jobname LIKE 'seo-sentinel-%';

-- Reactivar
UPDATE cron.job SET active = true WHERE jobname LIKE 'seo-sentinel-%';
```

O dropear un brand específico sin borrar data:

```sql
UPDATE seo_sentinel.brands SET status = 'paused' WHERE name = 'Cliente X';
```

El orchestrator filtra por `status='active'` así que la brand pausada no se procesa.

---

## Cuándo escalar

- 3+ runs failed seguidos sin causa clara → revisar logs de edge functions en Dashboard
- LLM nunca responde → swappear modelo en `SEO_SENTINEL_MODEL`
- Cualquier secret expirado o regenerado → actualizar en Vault y rotar `SEO_SENTINEL_INTERNAL_SECRET` periódicamente
