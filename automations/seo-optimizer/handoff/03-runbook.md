# Runbook — deploy + troubleshooting + procedimientos comunes

---

## 1. Setup inicial (una sola vez)

### 1.1 Setear el internal secret en Vault

```sql
-- En SQL Editor de Supabase (Dashboard → SQL Editor):
SELECT vault.create_secret('<el-valor-de-openssl-rand-hex-32>', 'SEO_OPTIMIZER_INTERNAL_SECRET');
```

O via Dashboard → Project Settings → Vault → New Secret. Nombre exacto: `SEO_OPTIMIZER_INTERNAL_SECRET`.

### 1.2 Setear secrets para las Edge Functions

```bash
cd seo-optimizer
supabase secrets set --project-ref stjugsrkrweakvzmizpq \
  SEO_OPTIMIZER_INTERNAL_SECRET="<MISMO valor que en Vault>" \
  OPENROUTER_API_KEY="<sk-or-v1-...>" \
  SLACK_BOT_TOKEN="<xoxb-...>" \
  SLACK_FALLBACK_CHANNEL="<C09...>" \
  SLACK_ADMIN_CHANNEL="<C09...>" \
  GSC_SERVICE_ACCOUNT_JSON='<JSON entero como string en una sola línea>' \
  ORBIT_FRONTEND_URL="https://orbit.<tu-dominio>"
```

Verifica con `supabase secrets list --project-ref stjugsrkrweakvzmizpq`.

### 1.3 Desplegar las 9 Edge Functions

```bash
cd seo-optimizer
for fn in seo-optimizer-orchestrator seo-optimizer-gsc-ingestor seo-optimizer-article-ingestor \
          seo-optimizer-analyst seo-optimizer-writer seo-optimizer-dispatcher \
          seo-optimizer-outbox-worker seo-optimizer-reeval seo-optimizer-reeval-batch; do
  supabase functions deploy "$fn" --project-ref stjugsrkrweakvzmizpq --no-verify-jwt
done
```

---

## 2. Acciones operativas frecuentes

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
) VALUES (
    '<client-uuid>',
    'sc-domain:ejemplo.com',
    TRUE, NULL, 'C09XXXXXXX', NULL, NULL
);
```

**IMPORTANTE**: Verifica que la Service Account de GSC tenga acceso "Full" a esa property en Search Console.

### Pausar un cliente sin borrarlo

```sql
UPDATE seo_optimizer.client_config SET is_active = FALSE WHERE client_id = '<uuid>';
```

### Disparar un run manual

```bash
curl -X POST "https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/seo-optimizer-orchestrator" \
  -H "x-internal-secret: <SEO_OPTIMIZER_INTERNAL_SECRET>" \
  -H "content-type: application/json" \
  -d '{"trigger":"manual","period_days":90}'
```

Solo para un cliente específico:
```bash
... -d '{"trigger":"manual","client_ids":["<uuid>"],"period_days":90}'
```

### Re-generar el rewrite de una opportunity

```bash
curl -X POST "https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/seo-optimizer-writer" \
  -H "x-internal-secret: <SECRET>" \
  -d '{"opportunity_id":"<uuid>","regenerate":true}'
```

### Reabrir un rechazo

```sql
UPDATE seo_optimizer.rejection_log
SET reopened = TRUE, reopened_at = NOW(), reopened_by = '<user-uuid>'
WHERE dedupe_key = '<dedupe-key>';
```

---

## 3. Síntomas comunes y soluciones

### "Los runs nunca arrancan / cron no parece estar funcionando"

```sql
SELECT j.jobname, r.start_time, r.end_time, r.status, r.return_message
FROM cron.job_run_details r
JOIN cron.job j ON j.jobid = r.jobid
WHERE j.jobname LIKE 'seo-optimizer-%'
ORDER BY r.start_time DESC LIMIT 20;
```

Si `status='failed'` con mensaje "missing SEO_OPTIMIZER_INTERNAL_SECRET":
→ Falta el secret en Vault. Setearlo (sección 1.1).

### "Edge Function devuelve 401"

→ El header `x-internal-secret` está mal o no coincide. Verificar que el valor en Vault sea idéntico al de `supabase secrets set ...`.

### "Edge Function devuelve 500 con missing env var"

```bash
supabase functions logs <function-name> --project-ref stjugsrkrweakvzmizpq
```

→ Setear el secret faltante con `supabase secrets set`.

### "Orchestrator se cuelga en 'running'"

Watchdog lo arregla solo a los 60 minutos. Para forzar:
```sql
UPDATE seo_optimizer.runs SET status='failed', completed_at=NOW(),
       error_message='manual abort' WHERE id='<run-id>';
```

### "Un cliente nunca aparece en los resultados"

```sql
-- ¿Está activo en client_config?
SELECT * FROM seo_optimizer.v_active_clients WHERE client_id='<uuid>';

-- ¿La GSC ingestion falló?
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
SELECT trigger_name FROM information_schema.triggers
WHERE event_object_schema='seo_optimizer' AND event_object_table='opportunities';
-- Debe incluir: opportunities_approved_dispatch

-- ¿Hay warnings de vault en run_events?
SELECT * FROM seo_optimizer.run_events
WHERE event_source='db_trigger' AND event_type='warning'
ORDER BY occurred_at DESC LIMIT 5;
```

### "Slack no llega"

```sql
-- ¿Outbox tiene la row?
SELECT id, channel_id, status, retry_count, error_message
FROM public.notifications_outbox
WHERE source='seo_optimizer' ORDER BY created_at DESC LIMIT 10;
```

Errores típicos:
- `channel_not_found`: canal id mal o bot no invitado.
- `not_in_channel`: bot no invitado al canal privado → `/invite @<nombre-del-bot>` en Slack.
- `invalid_auth`: bot token vencido → regenerar en Slack app config + actualizar secret.

### "El LLM (writer) está fallando consistentemente"

```sql
SELECT error_message, COUNT(*) FROM seo_optimizer.run_events
WHERE event_source='writer' AND event_type='agent_failed'
  AND occurred_at > NOW() - INTERVAL '24h'
GROUP BY error_message;
```

Causas:
- OpenRouter rate limit / sin créditos: agregar créditos en openrouter.ai
- `parse_error`: el LLM no devolvió JSON parseable. Ver logs de la función para el output real.

### "Edge Function timeout (>150s)"

Edge Functions tienen un límite de 150s. Si el orchestrator se queda corto:
- El watchdog detectará el run colgado y lo marcará failed después de 60 min.
- Las ingestores siguen ejecutándose en segundo plano aunque el orchestrator haya retornado.
- Para clientes con muchas URLs (>1000), considerar bajar `max_urls` en article-ingestor o procesar clientes en batches separados.

---

## 4. TBDs y resoluciones recomendadas

| TBD | Estado actual | Cuándo resolver | Cómo |
|---|---|---|---|
| `public.clientes.gsc_property_url` no existe | Usamos `seo_optimizer.client_config.gsc_property_url` | Cuando se onboarde el 1er cliente | Insert manual per client (ver arriba) |
| `client_config.seo_specialist_user_id` sin uso | Front no construido todavía | Cuando se construya el front | Pasa a usarse en dispatcher para DM directo |
| `client_config.slack_channel_id` opcional | Usa `SLACK_FALLBACK_CHANNEL` si NULL | Per client al onboardar | Setear con el canal del cliente |
| `ORBIT_FRONTEND_URL` placeholder | Hardcoded `https://orbit.example.com` | Al desplegar front | Setear secret en Edge Functions |

---

## 5. Backups y rollback

- **Backups**: Supabase hace backups automáticos diarios. No requiere acción.
- **Rollback de migración**: no hay scripts de down. Las migraciones son idempotentes (`IF EXISTS`/`IF NOT EXISTS`).
- **Empezar de cero** (cuidado — pierde toda la historia):
  ```sql
  DROP SCHEMA seo_optimizer CASCADE;
  -- Re-aplicar las 6 migraciones en orden via SQL Editor o MCP
  ```

---

## 6. Métricas de salud a vigilar

Query única para snapshot completo:
```sql
SELECT * FROM seo_optimizer.v_pipeline_health;
```

Alertas recomendadas (configurar donde uses alerting):
- `runs_stuck > 0` durante >2h → algo grave
- `outbox_stale_locks > 0` durante >30 min → worker probablemente caído
- `opportunities_pending_stale > 20` → SEO no está revisando
- `rewrites_pending_implementation > 30` → redactor backlogged

---

## 7. Métricas de éxito (reporte mensual)

```sql
SELECT * FROM seo_optimizer.v_outcomes_summary;
```

Si `success_rate_pct` cae por debajo de 50% sostenido 3 meses → revisar prompts y scoring.
