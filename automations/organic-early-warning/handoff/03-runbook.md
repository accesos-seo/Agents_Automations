# 03 — Runbook (Que hacer si algo falla)

Matriz "sintoma -> diagnostico -> fix" para los problemas operativos comunes de V2. Cada seccion es copy-paste: SQL para diagnosticar, comando para resolver, criterio para escalar.

V2 son **dos sistemas encadenados**: si el hub falla el Lunes, el oew del Martes sale temprano con warning. Siempre diagnosticar primero el hub.

## Quick health check

```sql
-- Estado del hub esta semana
SELECT source, status, COUNT(*) AS runs, MAX(completed_at) AS last_success
FROM seo_data_hub.ingestion_runs
WHERE started_at > NOW() - INTERVAL '7 days'
GROUP BY source, status
ORDER BY source, status;

-- Estado de oew esta semana
SELECT status, COUNT(*) AS runs, MAX(completed_at) AS last_run
FROM organic_early_warning.analysis_runs
WHERE started_at > NOW() - INTERVAL '7 days'
GROUP BY status;

-- Outbox pendiente
SELECT status, COUNT(*) FROM public.notifications_outbox
WHERE source = 'oew_alert' AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;
```

---

## 1. El cron del hub no se disparo el Lunes

**Sintoma:** `SELECT * FROM seo_data_hub.ingestion_runs WHERE source='gsc' AND started_at::date = (date_trunc('week', CURRENT_DATE))::date` esta vacio el Martes en la manana.

**Diagnostico:**

```sql
-- 1. Jobs del hub existen y estan activos?
SELECT jobname, schedule, active, command
FROM cron.job
WHERE jobname LIKE 'hub-%'
ORDER BY jobname;

-- 2. Ultimas ejecuciones de cron (status y mensaje)
SELECT j.jobname, jrd.runid, jrd.status, jrd.return_message, jrd.start_time, jrd.end_time
FROM cron.job_run_details jrd
JOIN cron.job j ON j.jobid = jrd.jobid
WHERE j.jobname LIKE 'hub-%'
ORDER BY jrd.start_time DESC
LIMIT 20;
```

**Causas comunes:**
1. `SUPABASE_FUNCTIONS_URL` no esta en Vault -> el `net.http_post` del cron falla silenciosamente. Solucion: cargar en Vault.
2. `HUB_INTERNAL_SECRET` no esta en Vault -> la fn devuelve 401, cron lo registra como `failed`.
3. Extension `pg_cron` o `pg_net` desactivada. Solucion: `CREATE EXTENSION IF NOT EXISTS pg_cron; CREATE EXTENSION IF NOT EXISTS pg_net;` desde SQL Editor.
4. Schedule mal: `0 6 * * 1` es Lunes 06:00 UTC. Si lo definiste en otro huso, ajustar.

**Fix manual (dispara ingesta inmediata):**

```bash
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/hub-gsc-weekly \
  -H "x-internal-secret: <HUB_INTERNAL_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual"}'

curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/hub-ga4-weekly \
  -H "x-internal-secret: <HUB_INTERNAL_SECRET>" \
  -d '{"trigger":"manual"}'

curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/hub-cwv-weekly \
  -H "x-internal-secret: <HUB_INTERNAL_SECRET>" \
  -d '{"trigger":"manual"}'
```

**Escalar cuando:** 2 semanas seguidas el cron no se dispara y los re-deploys / chequeos de Vault no resuelven. Es problema de la extension de Supabase o de cuenta.

---

## 2. Una ingesta del hub quedo stuck en 'running' > 30 min

**Sintoma:** `seo_data_hub.ingestion_runs.status='running'` con `started_at` muy viejo.

**Diagnostico:**

```sql
SELECT id, source, status, started_at, period_start, period_end,
       NOW() - started_at AS age
FROM seo_data_hub.ingestion_runs
WHERE status = 'running'
ORDER BY started_at;

-- Ver donde se quedo (ultimo evento antes de morir)
SELECT occurred_at, event_source, event_type, brand_id, error_message
FROM seo_data_hub.run_events
WHERE run_id = '<RUN_ID>'
ORDER BY occurred_at DESC
LIMIT 20;
```

**Que hace el watchdog automaticamente:** `hub-watchdog` corre cada 5 min y marca como `failed` cualquier `ingestion_runs` con `status='running'` AND `started_at < NOW() - INTERVAL '30 min'`, deja un event `watchdog_triggered` y notifica al `SLACK_ADMIN_CHANNEL`.

**Forzar reset manual:**

```sql
UPDATE seo_data_hub.ingestion_runs
SET status = 'failed',
    completed_at = NOW(),
    error_message = COALESCE(error_message, '') || ' [manually reset]'
WHERE id = '<RUN_ID>'
  AND status = 'running';

INSERT INTO seo_data_hub.run_events
  (run_id, event_source, event_type, occurred_at, error_message)
VALUES ('<RUN_ID>', 'manual', 'run_failed', NOW(), 'manually reset by operator');
```

Despues re-disparar la ingesta correspondiente (ver fix manual de la seccion 1).

**Causas frecuentes:**
- Timeout del runtime de edge functions (Deno: 60s hard cap, ajustar batch size por brand)
- OOM cuando la brand tiene muchas URLs en URL Inspection
- GSC/GA4 devolvieron 5xx persistente y el retry interno se agoto sin marcar `failed`

**Escalar cuando:** el watchdog NO esta marcando los runs huerfanos (verificar que `hub-watchdog` esta en `cron.job` con `active=true` y revisar `cron.job_run_details`).

---

## 3. hub-ahrefs-monthly fallo por creditos agotados

**Sintoma:** `seo_data_hub.ingestion_runs` con `source='ahrefs'`, `status='failed'`, `error_message LIKE '%credit%'` o `%402%`. Señales mensuales S6, S7, S10 quedan sin evaluar en oew.

**Diagnostico:**

```sql
-- Resumen del ultimo intento mensual
SELECT id, status, started_at, completed_at, period_start, period_end,
       rows_inserted, error_message
FROM seo_data_hub.ingestion_runs
WHERE source = 'ahrefs'
ORDER BY started_at DESC
LIMIT 3;

-- Eventos detallados (donde se rompio)
SELECT occurred_at, event_type, brand_id, payload, error_message
FROM seo_data_hub.run_events
WHERE event_source = 'hub-ahrefs-monthly'
  AND occurred_at > NOW() - INTERVAL '7 days'
ORDER BY occurred_at DESC;
```

**Fix paso a paso:**

1. Verificar saldo real en https://app.ahrefs.com/api-settings
2. Si efectivamente esta sin creditos:
   - Comprar mas creditos / esperar al reset mensual del plan
   - Si la cuenta tiene creditos pero `AHREFS_CREDIT_BUDGET_MONTH` esta muy bajo, subir el valor en Vault
3. Re-disparar manualmente la ingesta:

   ```bash
   curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/hub-ahrefs-monthly \
     -H "x-internal-secret: <HUB_INTERNAL_SECRET>" \
     -d '{"trigger":"manual","force":true}'
   ```

4. Verificar que `ingestion_runs` queda en `completed`.

**Mitigacion a futuro:** ajustar `AHREFS_CREDIT_BUDGET_MONTH` a `(presupuesto_plan * 0.8)`. El ingestor corta antes de consumir el 100% para dejar buffer ante imprevistos.

**Escalar cuando:** el saldo esta OK pero Ahrefs devuelve 402/credit error igual — abrir ticket con Ahrefs Support.

---

## 4. oew-orchestrator no encuentra data fresca del hub (early-return)

**Sintoma:** `organic_early_warning.run_events` con `event_type='warning'` y `payload->>'reason' = 'hub_data_stale'`. No se crea `analysis_runs`.

**Diagnostico:**

```sql
-- 1. Ultimos warnings del orchestrator
SELECT occurred_at, payload, error_message
FROM organic_early_warning.run_events
WHERE event_source = 'oew-orchestrator'
  AND event_type = 'warning'
ORDER BY occurred_at DESC
LIMIT 5;

-- 2. Verificar que el hub realmente no completo
SELECT source, status, period_end, completed_at
FROM seo_data_hub.ingestion_runs
WHERE started_at > NOW() - INTERVAL '7 days'
ORDER BY source, completed_at DESC;
```

**Fix paso a paso:**

1. Si el hub fallo el Lunes: arreglar primero (secciones 1-3).
2. Re-disparar la ingesta del hub manualmente.
3. Una vez `ingestion_runs.status='completed'` con `period_end` de esta semana:

   ```bash
   curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-orchestrator \
     -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
     -d '{"trigger":"manual"}'
   ```

4. Verificar que se creo el `analysis_runs` y completo:

   ```sql
   SELECT id, status, started_at, completed_at, error_message
   FROM organic_early_warning.analysis_runs
   ORDER BY started_at DESC
   LIMIT 3;
   ```

**Cuando esto es esperado:** los primeros Martes despues del go-live si el hub aun no acumulo data (el orchestrator detecta cero filas en hub y sale).

**Escalar cuando:** el hub completo correctamente pero el orchestrator igual dice `hub_data_stale` (bug en la query de verificacion, revisar el SELECT del orchestrator contra `ingestion_runs`).

---

## 5. GSC URL Inspection devuelve "User does not have sufficient permission"

**Sintoma:** `seo_data_hub.run_events` con `event_source='hub-gsc-weekly'`, `event_type='warning'` o `run_failed`, `error_message LIKE '%sufficient permission%'`.

**Diagnostico:**

```sql
SELECT occurred_at, brand_id, payload, error_message
FROM seo_data_hub.run_events
WHERE event_source = 'hub-gsc-weekly'
  AND error_message ILIKE '%permission%'
ORDER BY occurred_at DESC
LIMIT 10;

-- A que brand corresponde
SELECT id, name, gsc_property_url, ga4_property_id
FROM seo_data_hub.brands_registry
WHERE id = '<BRAND_ID>';
```

**Fix paso a paso:**

1. Obtener el `client_email` de la Service Account:

   ```sql
   SELECT (decrypted_secret::jsonb)->>'client_email' AS sa_email
   FROM vault.decrypted_secrets
   WHERE name = 'GSC_SERVICE_ACCOUNT_JSON';
   ```

2. En Google Search Console, abrir la propiedad de la brand: `Settings -> Users and permissions -> Add user`.
3. Pegar el `client_email` y darle rol **Restricted** (minimo). Owner no es necesario.
4. Re-disparar la ingesta:

   ```bash
   curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/hub-gsc-weekly \
     -H "x-internal-secret: <HUB_INTERNAL_SECRET>" \
     -d '{"trigger":"manual","brand_id":"<BRAND_ID>"}'
   ```

5. Verificar que ya no hay warning con `permission` para esa brand.

**Mismo procedimiento para GA4:** en GA4 Admin -> Property -> Property Access Management, agregar la SA como **Viewer**.

**Escalar cuando:** la SA ya tiene acceso (confirmado en GSC UI) pero igual sale 403 — verificar `GSC_SERVICE_ACCOUNT_JSON` en Vault (clave privada completa, sin truncar).

---

## 6. CrUX no devuelve data para una URL de bajo trafico

**Sintoma:** `seo_data_hub.cwv_weekly` esta vacia o con `data_source='psi'` para URLs cuya brand espera tener CWV.

**Por que pasa:** CrUX es Real User Monitoring; solo expone data si la URL acumulo trafico suficiente en los ultimos 28 dias. URLs nuevas o de bajo trafico no tienen entrada CrUX.

**Diagnostico:**

```sql
-- Ratio de URLs con CrUX vs PSI fallback de esta semana
SELECT data_source, COUNT(*)
FROM seo_data_hub.cwv_weekly
WHERE iso_week = to_char(date_trunc('week', NOW()), 'IYYY-IW')
GROUP BY data_source;

-- Eventos donde CrUX devolvio empty y se cayo a PSI
SELECT occurred_at, brand_id, payload
FROM seo_data_hub.run_events
WHERE event_source = 'hub-cwv-weekly'
  AND payload ->> 'fallback' = 'psi'
ORDER BY occurred_at DESC
LIMIT 20;
```

**Que hace el ingestor automaticamente:** `hub-cwv-weekly` intenta CrUX primero; si devuelve `NOT_FOUND` o vacio, hace fallback a PSI (lab data). El campo `data_source` en `cwv_weekly` registra cual fuente se uso (`crux` | `psi`).

**Cuando es problematico:** si **toda** una brand cae a PSI, el costo se dispara (PSI tiene cuota mas dura). Considerar reducir `top_urls_to_measure` para esa brand.

**Fix puntual (forzar solo PSI para una brand):**

```sql
UPDATE organic_early_warning.brand_routing
SET cwv_force_psi = false   -- volver a probar CrUX la proxima semana
WHERE brand_id = '<BRAND_ID>';
```

**Escalar cuando:** PSI tambien devuelve error 500/quota — verificar `PSI_API_KEY` y cuota diaria en Google Cloud Console.

---

## 7. signal_events explotan en volumen (>1000/semana)

**Sintoma:** El digest del Viernes tiene cientos de items WATCH; el canal recibe muchas alertas YELLOW/RED falsas.

**Diagnostico:**

```sql
-- Cuantos signal_events por semana, por signal
SELECT sd.code,
       to_char(date_trunc('week', se.created_at), 'IYYY-IW') AS iso_week,
       COUNT(*) AS events
FROM organic_early_warning.signal_events se
JOIN organic_early_warning.signal_definitions sd ON sd.id = se.signal_id
WHERE se.created_at > NOW() - INTERVAL '4 weeks'
GROUP BY sd.code, iso_week
ORDER BY iso_week DESC, events DESC;

-- Top brands con mas signals (probables descalibradas)
SELECT br.brand_id, b.name, COUNT(*) AS events_last_7d
FROM organic_early_warning.signal_events se
JOIN organic_early_warning.brand_routing br   ON br.brand_id = se.brand_id
JOIN seo_data_hub.brands_registry b           ON b.id = se.brand_id
WHERE se.created_at > NOW() - INTERVAL '7 days'
GROUP BY br.brand_id, b.name
ORDER BY events_last_7d DESC
LIMIT 10;
```

**Recalibracion paso a paso:**

1. **Subir factor k del motor estadistico para una brand ruidosa** (k mas alto = banda mas ancha = menos sensible):

   ```sql
   UPDATE organic_early_warning.brand_routing
   SET k_factor_override = 4.5    -- default 3.5
   WHERE brand_id = '<BRAND_ID>';
   ```

2. **Bajar peso de una signal cuyos eventos no estan correlacionando con incidentes reales**:

   ```sql
   UPDATE organic_early_warning.signal_definitions
   SET weight = 3   -- default 5
   WHERE code = 'S8';
   ```

3. **Deshabilitar una signal temporalmente** mientras se debuggea:

   ```sql
   UPDATE organic_early_warning.signal_definitions
   SET enabled = false
   WHERE code = 'S10';
   ```

4. Esperar 1-2 semanas y volver a medir.

**Escalar cuando:** despues de 4 semanas de tuning, el volumen sigue >500/semana — probable bug en el evaluator (verificar que la SELECT de la baseline esta usando los indices `(brand_id, iso_week)` y que el periodo de ventana es 8 semanas).

---

## 8. Falsos positivos confirmados por el equipo

**Sintoma:** El team_lead responde en el thread de Slack diciendo que la alerta no era real.

**Diagnostico:**

```sql
-- Ver el incident y sus signals
SELECT i.id AS incident_id, i.severity, i.brand_id, i.created_at,
       array_length(i.signal_event_ids, 1) AS n_signals
FROM organic_early_warning.incidents i
WHERE i.id = '<INCIDENT_ID>';

SELECT se.id, sd.code, se.segment_hash, se.metric_actual, se.metric_expected,
       se.deviation_score
FROM organic_early_warning.signal_events se
JOIN organic_early_warning.signal_definitions sd ON sd.id = se.signal_id
WHERE se.incident_id = '<INCIDENT_ID>';
```

**Fix paso a paso:**

1. Marcar el incident y todos sus signal_events como falso positivo:

   ```sql
   UPDATE organic_early_warning.signal_events
   SET false_positive = true,
       false_positive_reason = '<causa, ej: campania pagada apagada, datos GA4 con tracking roto>'
   WHERE incident_id = '<INCIDENT_ID>';

   UPDATE organic_early_warning.incidents
   SET false_positive = true
   WHERE id = '<INCIDENT_ID>';
   ```

2. Forzar recompute de la baseline para esa brand+signal (el baseline-builder filtra `false_positive=true` la proxima corrida):

   ```bash
   curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-baseline-builder \
     -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
     -d '{"brand_id":"<BRAND_ID>","force":true}'
   ```

3. Si el patron se repite (mismo motivo varias semanas), agregar regla persistente en `brand_routing`:

   ```sql
   -- Ejemplo: marca con festividad recurrente
   UPDATE organic_early_warning.brand_routing
   SET seasonality_type = 'b2b_weekday',
       expected_holiday_drop_pct = 30
   WHERE brand_id = '<BRAND_ID>';
   ```

**Escalar cuando:** una misma signal genera falsos positivos en >50% de las brands — la signal esta mal disenada, revisar criterio de deteccion en su `signal_definitions.config`.

---

## 9. Slack devuelve `not_in_channel`

**Sintoma:** `public.notifications_outbox` con `source='oew_alert'`, `status='failed'`, `error_message='not_in_channel'`.

**Diagnostico:**

```sql
SELECT n.target_type, n.channel_id, n.status, n.retry_count, n.error_message,
       n.dedupe_key, n.created_at
FROM public.notifications_outbox n
WHERE n.source = 'oew_alert'
  AND n.error_message = 'not_in_channel'
ORDER BY n.created_at DESC
LIMIT 10;
```

**Fix paso a paso:**

1. Identificar el canal (ej. `C0B1B3V4ZB5` = `#alerts-operaciones`).
2. En Slack, abrir el canal y ejecutar `/invite @Orbit SeoLab`.
3. Re-disparar el outbox-worker para que reintente:

   ```bash
   curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-outbox-worker \
     -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
     -d '{}'
   ```

4. Verificar que el row paso a `status='sent'`.

**Si es DM al lead (`target_type='dm'`):** el usuario debe haber abierto al menos una vez una DM con el bot. Pedirle que mande "hola" a Orbit SeoLab por DM y reintentar.

**Escalar cuando:** despues de invitar al bot sigue saliendo `not_in_channel` — verificar que el `SLACK_BOT_TOKEN` corresponde a la workspace correcta (no a una stale de testing).

---

## 10. LLM (OpenRouter) cae

**Sintoma:** `organic_early_warning.run_events` con `event_type='warning'` y `payload->>'component' IN ('oew-detective','oew-dispatcher')` y `error_message` mencionando OpenRouter / timeout / 5xx.

**Diagnostico:**

```sql
SELECT occurred_at, event_source, payload, error_message
FROM organic_early_warning.run_events
WHERE event_type = 'warning'
  AND (payload->>'component' IN ('oew-detective','oew-dispatcher')
       OR error_message ILIKE '%openrouter%'
       OR error_message ILIKE '%llm%')
ORDER BY occurred_at DESC
LIMIT 20;
```

**Que hace el pipeline automaticamente:** ni el detective ni el dispatcher bloquean la entrega. Fallback degradado:
- Detective sin LLM -> `incident_diagnostics.thematic_cluster = 'cluster no identificado'`, summary basico armado con plantilla
- Dispatcher sin LLM -> `executive_summary` armado con plantilla a partir de signal_events crudos

La alerta llega igual al canal y al lead, solo con menos contexto narrativo.

**Causas comunes:**
1. Saldo de OpenRouter agotado. Verificar https://openrouter.ai/activity y recargar.
2. Modelo en `OEW_MODEL` deprecado o no disponible. Cambiar a `anthropic/claude-sonnet-4` o algun otro listado en https://openrouter.ai/models.
3. Rate limit (muchos incidents simultaneos). El detective lo procesa secuencialmente para evitarlo; si igual pasa, ajustar la concurrencia en codigo.

**Fix:**

```sql
-- Listar incidents que se dispatcharon sin diagnostico LLM
SELECT id, severity, brand_id, created_at
FROM organic_early_warning.incidents
WHERE id IN (
  SELECT incident_id
  FROM organic_early_warning.incident_diagnostics
  WHERE thematic_cluster = 'cluster no identificado'
    AND created_at > NOW() - INTERVAL '7 days'
);
```

Una vez restablecido el LLM, re-correr el detective para esos incidents:

```bash
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-detective \
  -H "x-internal-secret: <OEW_INTERNAL_SECRET>" \
  -d '{"incident_id":"<UUID>","force":true}'
```

**Escalar cuando:** el LLM no esta caido pero los prompts devuelven respuestas no parseables (JSON malformado). Ajustar prompt en `oew-detective/index.ts`.

---

## Apagar V2 temporalmente

Pausar todos los crons de hub y oew:

```sql
UPDATE cron.job
SET active = false
WHERE jobname LIKE 'hub-%' OR jobname LIKE 'oew-%';
```

Reactivar:

```sql
UPDATE cron.job
SET active = true
WHERE jobname LIKE 'hub-%' OR jobname LIKE 'oew-%';
```

Pausar solo una brand sin tocar los crons globales:

```sql
UPDATE organic_early_warning.brand_routing
SET active = false
WHERE brand_id = '<BRAND_ID>';
```

El orchestrator filtra por `active=true` asi que la brand pausada no se evalua, pero el hub la sigue ingiriendo (para no perder historico).

---

## Limpiar runs viejos (retencion)

Los crons del watchdog NO borran automaticamente. Limpieza manual periodica:

```sql
-- run_events del hub: mantener 90 dias
DELETE FROM seo_data_hub.run_events
WHERE occurred_at < NOW() - INTERVAL '90 days';

-- ingestion_runs completadas: mantener 180 dias
DELETE FROM seo_data_hub.ingestion_runs
WHERE completed_at < NOW() - INTERVAL '180 days'
  AND status IN ('completed','failed');

-- run_events de oew: mantener 90 dias
DELETE FROM organic_early_warning.run_events
WHERE occurred_at < NOW() - INTERVAL '90 days';

-- analysis_runs completadas: mantener 180 dias
DELETE FROM organic_early_warning.analysis_runs
WHERE completed_at < NOW() - INTERVAL '180 days'
  AND status IN ('completed','failed');

-- signal_events sin incident vinculado y viejos
DELETE FROM organic_early_warning.signal_events
WHERE created_at < NOW() - INTERVAL '180 days'
  AND incident_id IS NULL;

-- notifications_outbox de oew enviadas: mantener 60 dias
DELETE FROM public.notifications_outbox
WHERE source = 'oew_alert'
  AND status = 'sent'
  AND sent_at < NOW() - INTERVAL '60 days';
```

**NO borrar nunca:**
- `organic_early_warning.incidents`
- `organic_early_warning.incident_diagnostics`
- `organic_early_warning.incident_log`
- `seo_data_hub.brands_registry`
- `organic_early_warning.signal_definitions`
- `organic_early_warning.baselines` (se recalculan, pero el snapshot historico es util para debug)

Las tablas raw del hub (`gsc_search_analytics_weekly`, etc.) estan particionadas por mes y la retencion la maneja `seo_data_hub.ensure_monthly_partitions()` con detach automatico de particiones >24 meses.

---

## Cuando escalar (criterios generales)

- 2 semanas seguidas sin corrida exitosa del hub que no se resuelva con re-deploy ni con reseteo de secrets
- Falsos positivos en >50% de las brands para una misma signal (problema de diseno de la signal)
- LLM responde pero con JSON malformado consistente (problema de prompt)
- Outbox con backlog >50 rows pendientes sostenido por mas de 30 min (worker no esta corriendo o Slack downtime mayor)
- Cualquier secret expirado / rotado: actualizar Vault + considerar rotar `HUB_INTERNAL_SECRET` y `OEW_INTERNAL_SECRET` cada 6 meses
