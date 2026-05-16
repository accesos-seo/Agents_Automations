# Runbook - Minuta de reuniones de cliente

Como operar esta automatizacion en el dia a dia: probar, monitorear, resolver problemas. Para entender que es, ver README.md; para el detalle tecnico, arquitectura.md.

## Probar sin riesgo

Antes de cualquier prueba real, recuerda que el pipeline tiene modos seguros:

- meetings.review_mode='human_approval' por defecto: el correo no sale hasta que un especialista lo aprueba en el frontend (o forzando UPDATE state='ready_to_send').
- meetings-email-dispatcher acepta dry_run=true en el body: simula la encolada sin escribir en notifications_outbox.
- Cualquier reunion puede ser eliminada con DELETE FROM meetings_intelligence.meetings WHERE id = '...'; el CASCADE limpia transcripts, highlights, summaries, action_items, deliverables y dispatch_jobs.

## Probar el flujo end-to-end con una reunion real

1. Programar una reunion en Google Calendar e invitar a alguien de prueba con dominio @seolabagency.com como organizer (asegura match al proyecto interno).
2. Grabar con tl;dv normalmente. Despues de finalizar, esperar a que tl;dv termine de procesar (~2-5 min).
3. Verificar que llego el webhook:
   ```sql
   SELECT id, event_type, tldv_meeting_id, signature_verified, received_at
     FROM meetings_intelligence.webhook_events_raw
    ORDER BY received_at DESC LIMIT 5;
   ```
4. Verificar que se creo la reunion canonica:
   ```sql
   SELECT id, title, state, matched_strategy, match_confidence, proyecto_id
     FROM meetings_intelligence.meetings
    ORDER BY created_at DESC LIMIT 5;
   ```
5. Si state='ready_for_review', abrir el Google Doc generado y validar contenido. Si OK, aprobar via endpoint o UPDATE manual.

## Monitorear

| Que revisar | Como | Que esperar |
|---|---|---|
| Webhooks llegan firmados | SELECT count(*) FILTER (WHERE signature_verified) AS ok, count(*) FILTER (WHERE NOT signature_verified) AS bad FROM meetings_intelligence.webhook_events_raw WHERE received_at > now() - interval '1 day' | bad debe ser 0 |
| Reuniones atascadas | SELECT * FROM meetings_intelligence.v_meetings_in_flight | Nada mas de 30 min en estados intermedios |
| Match automatico funciona | SELECT avg(match_confidence) FROM meetings_intelligence.meetings WHERE created_at > now() - interval '7 days' | Objetivo: >= 0.85 |
| Coste IA bajo control | SELECT * FROM meetings_intelligence.v_ai_cost_daily ORDER BY day DESC LIMIT 7 | Dentro del presupuesto del provider |
| Outbox sano (compartido) | SELECT status, count(*) FROM notifications_outbox WHERE source='meetings_intelligence' GROUP BY status | 0 en processing > 15 min |
| Cron de polling activo | SELECT * FROM cron.job WHERE jobname = 'tldv-poll-meetings' | active=true |

## Procedimientos

### Aprobar manualmente una reunion en ready_for_review

```sql
UPDATE meetings_intelligence.meetings
   SET state = 'ready_to_send',
       review_mode = 'auto_send',
       approved_by = 'UUID-del-especialista',
       approved_at = now()
 WHERE id = 'UUID-de-la-reunion';
```

El trigger `trg_meetings_dispatch_on_state` invoca al orchestrator que llama a meetings-email-dispatcher.

### Re-procesar una reunion (cambiar prompt, probar otro modelo)

```sql
-- Marca el summary actual como historico
UPDATE meetings_intelligence.meeting_summaries SET is_current = false WHERE meeting_id = '...' AND is_current = true;
-- Vuelve la reunion a 'enriched' para re-disparar el summarizer
UPDATE meetings_intelligence.meetings SET state = 'enriched' WHERE id = '...';
```

El orchestrator detecta el nuevo estado y vuelve a llamar al summarizer (que generara una nueva fila en meeting_summaries con is_current=true).

### Forzar un re-envio (correo no llego al cliente)

```sql
-- Marcar el dispatch_job anterior como failed
UPDATE meetings_intelligence.dispatch_jobs SET status='failed', last_error='re-envio manual' WHERE meeting_id = '...';
-- Bajar la reunion a ready_to_send
UPDATE meetings_intelligence.meetings SET state='ready_to_send' WHERE id = '...';
```

### Procesar manualmente un webhook que llego sin procesarse

```sql
-- Disparar el orchestrator manualmente para un evento raw
SELECT net.http_post(
  url := 'https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/meetings-pipeline-orchestrator',
  headers := jsonb_build_object('Content-Type', 'application/json',
                                'x-internal-secret', current_setting('app.internal_secret', true)),
  body := jsonb_build_object('source','manual_replay', 'raw_event_id', 'UUID-del-evento-raw')
);
```

### Pausar la automatizacion completa

- Para que tl;dv deje de enviar webhooks: desactivar el webhook en `tldv.io/app/settings/webhooks`.
- Para que la API de tl;dv responda 401 (kill switch): rotar TLDV_API_KEY en vault.
- Para que el LLM no se llame: setear UPDATE meetings_intelligence.providers SET is_active=false WHERE provider_code='tldv'; (los orchestrators chequean is_active al inicio).
- Para detener crones: `SELECT cron.unschedule('tldv-poll-meetings');`

### Recuperar reuniones atascadas

El reaper (`meetings-stuck-reaper`, cada 10 min) lo hace solo. Para forzar manual:

```sql
SELECT * FROM meetings_intelligence.reap_stuck_meetings();
```

Devuelve cuantas reuniones volvieron a estados anteriores y cuantas se marcaron failed definitivo.

## Errores comunes

| Sintoma | Causa | Solucion |
|---|---|---|
| Webhook llega con signature_verified=false | TLDV_WEBHOOK_SIGNING_SECRET incorrecto | Re-capturar en tl;dv > Settings > Webhooks; actualizar vault |
| state='failed' tras enrich | API de tl;dv devolvio 401 | Rotar TLDV_API_KEY en vault.secrets |
| state='failed' tras summarizing | LLM devolvio JSON invalido x2 | Revisar ai_summary_runs.error. Iterar prompt o reintentar manualmente |
| match_confidence=0 (proyecto no detectado) | Ningun email coincide con clientes.emailcontacto | Editar matched_strategy='manual', proyecto_id='...', match_confidence=1.0 y bajar state='enriched' para re-pipeline |
| Correo no llega al cliente | clientes.emailcontacto vacio o invalido | Actualizar clientes.emailcontacto y re-disparar dispatch |
| Filas atascadas en processing en notifications_outbox | Worker tomado y no soltado | El reaper outbox-stuck-reaper las recupera en <=10 min; o ejecutar reset_stuck_outbox_notifications() |
| Reunion no aparece en meeting_reports legacy | Funcion sync_meeting_to_legacy() no se llamo | Llamar manualmente: SELECT meetings_intelligence.sync_meeting_to_legacy('UUID'); |
| tl;dv API rate limit (429) | Demasiadas reuniones simultaneas | El orchestrator hace backoff exponencial. Si persiste, escalar plan tl;dv. |

## A quien escalar

- Backend / DB / edge functions: responsable del backend de automatizaciones de Light_House.
- Cuenta tl;dv / API key / webhook: quien administra el workspace de `accesos@seolabagency.com`.
- LLM (Claude / OpenAI): quien gestiona los API keys en vault.
- Plantillas Google Doc: equipo de diseno de la agencia.
- Bug en el flujo o nueva feature: abrir issue en este repo con etiqueta `automation:minuta-reuniones-clientes`.

Mantener este runbook al dia cada vez que cambie la operacion.
