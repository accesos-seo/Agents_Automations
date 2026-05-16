# Guia de configuracion - tl;dv.io webhooks y API

Esta guia cubre la activacion del lado de tl;dv (cuenta + API + webhook) para que la automatizacion `minuta-reuniones-clientes` funcione. Tiempo estimado: 30-45 min si todos los accesos estan listos.

## 0. Prerrequisitos

- Cuenta admin del workspace de tl;dv (`accesos@seolabagency.com`).
- Permisos para Settings -> Personal Settings y Settings -> Webhooks.
- Acceso a Supabase Light_House (proyecto stjugsrkrweakvzmizpq) -> Edge Functions -> Secrets, o a vault directamente.
- La edge function `tldv-webhook-receiver` desplegada (puede ser una version stub que solo loguee, para esta etapa solo importa que la URL responda 200).

## 1. Suscribirse al plan Business de tl;dv

El acceso a la API publica y a webhooks requiere el plan Business.

- Pricing reportado: ~USD 98/usuario/mes facturado mensual, ~USD 59/u/m con facturacion anual.
- El plan tambien habilita CRM integrations profundas, multi-team management y AI objection handling.
- El plan Pro (USD 29/u/m) NO expone API ni webhooks. Si la cuenta esta en Pro, hay que hacer upgrade.

Como verificar: `tldv.io/app/pricing` o panel de billing del workspace.

## 2. Generar la API key

1. Ingresar a `https://tldv.io/app/settings/personal-settings/api-keys` con la cuenta admin.
2. Pulsar `Generate new API key` (o equivalente).
3. Asignar un nombre descriptivo: `light-house-minuta-prod` (o `light-house-minuta-sandbox` para pruebas).
4. **Copiar el valor inmediatamente** — no se vuelve a mostrar despues.
5. Cargar en Supabase Vault:
   - Opcion A (Studio): Database -> Vault -> Add new secret. Name: `tldv_api_key_primary`, Secret: <el valor>. Copiar el UUID devuelto.
   - Opcion B (SQL): `SELECT vault.create_secret('PEGAR_VALOR', 'tldv_api_key_primary', 'API key tl;dv para minuta-reuniones-clientes');` (devuelve el UUID).
6. Cargar tambien como secret de Edge Functions con el nombre `TLDV_API_KEY` para que las edge functions lo puedan leer.
7. Crear (o actualizar) la fila correspondiente en meetings_intelligence.providers con `api_key_secret_id` = UUID del paso 5.

## 3. Configurar el webhook

1. Ir a `Settings -> Webhooks -> Configure new Webhook` en el panel de tl;dv.
2. **Endpoint URL:** `https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/tldv-webhook-receiver`
3. **Event Action:** habilitar AMBOS:
   - `MeetingReady` (trae metadatos de calendario: organizer, invitees, duration)
   - `TranscriptReady` (trae los segmentos transcritos)
4. Capturar el **Signing Secret** que tl;dv ofrece (si el panel lo permite). Si tl;dv genera la firma automaticamente sin mostrarla, anotar el algoritmo y la cabecera donde llega (tipicamente `x-tldv-signature` con HMAC-SHA256).
5. Cargar el signing secret en vault:
   - `SELECT vault.create_secret('PEGAR_SECRET', 'tldv_webhook_signing_primary', 'Signing secret webhook tl;dv');`
6. Cargar tambien como secret de Edge Functions con el nombre `TLDV_WEBHOOK_SIGNING_SECRET`.
7. Actualizar la fila de providers con `webhook_signing_secret_id` = UUID del paso 5.

## 4. Verificacion end-to-end

### 4.1 Webhook de prueba desde el panel de tl;dv

1. En el panel de webhooks de tl;dv, hay un boton "Send test event" (o similar). Disparar.
2. Verificar en Supabase:
   ```sql
   SELECT id, event_type, signature_verified, payload->'event' AS event, received_at
     FROM meetings_intelligence.webhook_events_raw
    ORDER BY received_at DESC LIMIT 5;
   ```
3. Debe aparecer una fila con `signature_verified=true`. Si `signature_verified=false`, revisar paso 3.4 (signing secret).

### 4.2 Llamada a la API con la key

```bash
curl -H "x-api-key: <TU_API_KEY>" \
     "https://pasta.tldv.io/v1alpha1/meetings?page=1&pageSize=5"
```

Debe devolver una lista de reuniones (puede ser vacia si no hay grabaciones aun). Si devuelve 401, la API key esta mal o no esta en plan Business.

### 4.3 Reunion real

1. Programar una reunion en Google Calendar, invitar a alguien con dominio `@seolabagency.com`.
2. Grabar con tl;dv. Esperar a que tl;dv termine de procesar (~2-5 min).
3. Verificar que llegaron 2 webhooks (MeetingReady + TranscriptReady) en `webhook_events_raw`.
4. Verificar que se creo la reunion canonica en `meetings`:
   ```sql
   SELECT id, title, state, matched_strategy, match_confidence, proyecto_id
     FROM meetings_intelligence.meetings
    ORDER BY created_at DESC LIMIT 5;
   ```

## 5. Errores comunes

| Sintoma | Causa probable | Solucion |
|---|---|---|
| Webhook no llega | URL incorrecta, o el webhook esta deshabilitado en tl;dv | Verificar URL exacta y estado activo en panel de tl;dv |
| signature_verified=false | Signing secret mal cargado, o algoritmo diferente al esperado | Re-capturar en tl;dv. Confirmar que el receiver usa HMAC-SHA256 con el secret crudo |
| 401 al llamar a /v1alpha1/meetings | API key mal o plan insuficiente | Re-generar key; confirmar plan Business activo |
| 429 al llamar a la API | Rate limit | Backoff exponencial en el enrich. Si persiste, escalar plan |
| 404 al llamar a /meetings/{id}/transcript | Reunion sin transcribir o eliminada | Esperar y reintentar via cron; si persiste, marcar reunion como failed |
| Match de proyecto siempre 0 | organizer_email no coincide con clientes.emailcontacto ni users.email | Limpiar clientes.emailcontacto; o aceptar override manual |
| Webhooks duplicados ocupando espacio | UNIQUE constraint ya lo previene, pero raw acumula payloads grandes | El cron webhook-events-raw-prune borra > 90 dias |

## 6. Rotacion de credenciales

- **API key**: cuando un especialista deja la agencia o cada 12 meses por buena practica. Generar nueva en tl;dv, cargar en vault, actualizar `api_key_secret_id` del provider, desactivar la vieja en tl;dv.
- **Signing secret**: solo si hubo exposicion (commit accidental, log con cleartext, etc.). Re-generar webhook en tl;dv, capturar nuevo secret, cargar en vault, actualizar `webhook_signing_secret_id` del provider.

## 7. Cuotas y costos a vigilar

- tl;dv Business: por usuario activo. Si el workspace crece, prever el costo.
- LLM (Claude / OpenAI): vigilar v_ai_cost_daily. Presupuesto inicial sugerido: USD 50/mes (ajustar tras 30 dias).
- Mailjet: reutiliza la cuota de calendario-orbit. No deberia haber impacto significativo (~1-2 correos por reunion).

## 8. Referencias

- Documentacion oficial tl;dv API: `https://doc.tldv.io/index.html`
- API and Webhooks (help): `https://intercom.help/tldv/en/articles/11583137-api-and-webhooks`
- Panel tl;dv: `https://tldv.io/app`
- Panel de API keys: `https://tldv.io/app/settings/personal-settings/api-keys`
- Panel de webhooks: `https://tldv.io/app/settings/webhooks` (ruta aproximada; navegar desde Settings)
- Documentacion tecnica completa de esta automatizacion: `Documentacion_Reuniones_Inteligentes_tldv_Supabase.docx` (Anexos A-D)

Ultima actualizacion: 16 de mayo de 2026.
