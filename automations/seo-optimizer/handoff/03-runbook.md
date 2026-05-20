# Runbook — troubleshooting + procedimientos comunes

---

## Acciones operativas frecuentes

### Onboarding de un nuevo cliente

```sql
INSERT INTO seo_optimizer.client_config (
    client_id,                              -- UUID de public.clientes
    gsc_property_url,                       -- 'sc-domain:cliente.com' o 'https://cliente.com/'
    is_active,                              -- TRUE para procesar en próximo run
    language_override,                      -- 'es' | 'en' | 'pt-BR' o NULL para usar clientes.language
    slack_channel_id,                       -- 'C09XXXXXXX' o NULL para usar SLACK_FALLBACK_CHANNEL
    seo_specialist_user_id,                 -- UUID del SEO en auth.users (opcional)
    redactor_user_id                        -- UUID del redactor (opcional)
)
VALUES (
    '<client-uuid>',
    'sc-domain:ejemplo.com',
    TRUE, NULL, 'C09XXXXXXX', NULL, NULL
);
```

**IMPORTANTE**: Verifica que la Service Account de GSC (`GSC_SERVICE_ACCOUNT_JSON`) tenga acceso "Full" a esa property en Search Console.

### Pausar un cliente sin borrarlo

```sql
UPDATE seo_optimizer.client_config SET is_active = FALSE WHERE client_id = '<uuid>';
```

### Disparar un run manual (fuera del cron mensual)

```bash
curl -X POST https://<railway>/orchestrator \
  -H "x-internal-secret: <SEO_OPTIMIZER_INTERNAL_SECRET>" \
  -d '{"trigger":"manual","period_days":90}'
```

Solo para un cliente específico:
```bash
curl -X POST https://<railway>/orchestrator \
  -H "x-internal-secret: ..." \
  -d '{"trigger":"manual","client_ids":["<uuid>"],"period_days":90}'
```

### Re-generar el rewrite de una opportunity

Si el SEO no le gustó la primera reescritura:
```bash
curl -X POST https://<railway>/writer \
  -H "x-internal-secret: ..." \
  -d '{"opportunity_id":"<uuid>","regenerate":true}'
```

### Reabrir un rechazo (permitir que se vuelva a proponer)

```sql
UPDATE seo_optimizer.rejection_log
SET reopened = TRUE, reopened_at = NOW(), reopened_by = '<user-uuid>'
WHERE dedupe_key = '<dedupe-key>';
```

---

## Síntomas comunes y soluciones

### "Los runs nunca arrancan / cron no parece estar funcionando"

```sql
-- Ver últimas ejecuciones del cron
SELECT j.jobname, r.start_time, r.end_time, r.status, r.return_message
FROM cron.job_run_details r
JOIN cron.job j ON j.jobid = r.jobid
WHERE j.jobname LIKE 'seo-optimizer-%'
ORDER BY r.start_time DESC LIMIT 20;
```

Si `status='failed'` con `return_message` mencionando "vault secrets":
→ Faltan `SEO_OPTIMIZER_RAILWAY_URL` o `SEO_OPTIMIZER_INTERNAL_SECRET` en Vault.

### "Orchestrator se cuelga en 'running'"

Watchdog lo arregla solo a los 60 minutos. Para forzar:
```sql
UPDATE seo_optimizer.runs SET status='failed', completed_at=NOW(),
       error_message='manual abort' WHERE id='<run-id>';
```

### "Un cliente nunca aparece en los resultados"

```sql
-- 1. ¿Está activo?
SELECT * FROM seo_optimizer.v_active_clients WHERE client_id='<uuid>';

-- 2. ¿La GSC ingestion falló?
SELECT * FROM seo_optimizer.run_events
WHERE client_id='<uuid>' AND event_type IN ('agent_failed','warning')
ORDER BY occurred_at DESC LIMIT 10;
```

Causas frecuentes:
- 403 de GSC: la Service Account no tiene acceso a esa property.
- `gsc_property_url` mal escrito: debe ser `sc-domain:dominio.com` (sin https) o URL exacta con slash final.

### "El writer agente no se dispara al aprobar"

```sql
-- ¿El trigger existe?
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_schema='seo_optimizer'
  AND event_object_table='opportunities';

-- ¿Hay warnings de vault en run_events?
SELECT * FROM seo_optimizer.run_events
WHERE event_source='db_trigger' AND event_type='warning'
ORDER BY occurred_at DESC LIMIT 5;
```

Si "missing_vault_secrets": setear `SEO_OPTIMIZER_RAILWAY_URL` y `SEO_OPTIMIZER_INTERNAL_SECRET` en Vault.

### "Slack no llega — pero el outbox tiene rows 'sent'"

Verificar que el `SLACK_BOT_TOKEN` tenga el scope `chat:write.public` y que el bot esté invitado al canal (`/invite @<bot-name>` desde el canal).

### "Slack no llega — outbox tiene rows 'failed'"

```sql
SELECT id, channel_id, error_message, retry_count
FROM public.notifications_outbox
WHERE source='seo_optimizer' AND status='failed'
ORDER BY created_at DESC LIMIT 10;
```

Errores típicos:
- `channel_not_found`: canal id mal o bot no invitado.
- `not_in_channel`: bot no invitado al canal privado.
- `invalid_auth`: bot token vencido/regenerado.

### "El LLM (writer) está fallando consistentemente"

```sql
SELECT error_message, COUNT(*) FROM seo_optimizer.run_events
WHERE event_source='writer' AND event_type='agent_failed'
  AND occurred_at > NOW() - INTERVAL '24h'
GROUP BY error_message;
```

Causas:
- OpenRouter rate limit: bajar concurrencia o aumentar plan.
- `parse_error`: prompt necesita ajuste. Ver `02-agents/writer/prompts/*.txt`.
- `tokens exceeded`: el artículo es muy largo. El prompt instruye salida por secciones — verificar que LLM esté siguiendo la regla.

---

## TBDs y resoluciones recomendadas

| TBD | Estado actual | Cuándo resolver | Cómo |
|---|---|---|---|
| `public.clientes.gsc_property_url` no existe | Usamos `seo_optimizer.client_config.gsc_property_url` | Cuando se onboarde el 1er cliente | Insert manual per client (ver arriba) |
| `client_config.seo_specialist_user_id` sin uso | Front no construido todavía | Cuando se construya el front | Pasa a usarse en dispatcher para DM directo en lugar de canal |
| `client_config.slack_channel_id` opcional | Usa `SLACK_FALLBACK_CHANNEL` si NULL | Per client al onboardar | Setear con el canal del cliente |
| `ORBIT_FRONTEND_URL` placeholder | Hardcoded `https://orbit.example.com` | Al desplegar front | Setear env var en Railway |
| Sub-minute outbox worker | Actualmente cada 1 min | Si necesitas notificaciones más rápidas | Cambiar schedule a `'30 seconds'` (requiere pg_cron 1.6+) |

---

## Backups y migraciones futuras

- Toda la data está en Light_House. Backups automáticos diarios de Supabase aplican.
- Para revertir una migración: no hay scripts de down. Las migraciones están diseñadas idempotentes (`IF EXISTS`/`IF NOT EXISTS`).
- Para destruir todo y empezar de cero (cuidado — pierde toda la historia):
  ```sql
  DROP SCHEMA seo_optimizer CASCADE;
  -- Re-aplicar las 5 migraciones en orden
  ```

---

## Métricas de salud a vigilar (dashboard / monitoreo)

```sql
-- Una sola query que da el snapshot completo:
SELECT * FROM seo_optimizer.v_pipeline_health;
```

Alertas recomendadas (a configurar en lo que uses para alerting):
- `runs_stuck > 0` durante >2h → algo grave
- `outbox_stale_locks > 0` durante >30 min → worker probablemente caído
- `opportunities_pending_stale > 20` → SEO no está revisando
- `rewrites_pending_implementation > 30` → redactor backlogged

---

## Métricas de éxito a reportar mensualmente

```sql
SELECT * FROM seo_optimizer.v_outcomes_summary;
```

Si la columna `success_rate_pct` cae por debajo de 50% sostenido 3 meses → revisar prompts y scoring.
