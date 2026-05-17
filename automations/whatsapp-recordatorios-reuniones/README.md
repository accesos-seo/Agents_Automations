
**Estados del ciclo de vida de una notificacion en outbox:**

| Estado | Significado |
|--------|-------------|
| `pending` | En espera de ser procesada |
| `processing` | Reclamada por un worker |
| `sent` | Enviada exitosamente (al menos 1 destinatario) |
| `failed` | Todos los destinatarios fallaron (reintentable) |

---

## 5. Estado actual (2026-05-17)

| Indicador | Valor |
|-----------|-------|
| SQL `generate_meeting_reminders()` | Actualizada — genera 2 notifs por reunion |
| Edge Function `boti-whatsapp-outbox-worker` | v35 — soporta templates Meta |
| Edge Function `orkesta-whatsapp-webhook` | v1 — desplegada, pendiente registro en Meta |
| GitHub Actions workflow | Desplegado — modo `dry_run: true` |
| Plantillas Meta | Pendiente creacion y aprobacion |
| Credenciales Meta | Pendiente entrega por tecnico |
| Destinatarios QA internos | 3 (Robert Virona, Heduin Chacin, Camila) |
| Destinatarios produccion | 0 — ninguno cargado todavia |
| Mensajes enviados en QA | 1 exitoso (6 mayo, texto libre) |
| Mensajes pendientes en outbox | 1 (template `mensaje_de_prueba_v1`) |

---

## 6. Decisiones pendientes del dueno del producto

| Decision | Opciones | Estado |
|----------|----------|--------|
| Aprobar plantillas en Meta | Crear y enviar a revision las 2 plantillas UTILITY | Pendiente tecnico Meta |
| Destinatarios de produccion | Cargar clientes reales en `project_meeting_recipients` | Pendiente |
| Consentimiento opt-in | Registrar `consent_at` para cada destinatario real (Meta lo exige) | Pendiente |
| WABA activa | Confirmar si `938244712709748` corresponde a Orkesta o crear WABA nueva | Pendiente tecnico Meta |
| Activacion del worker | Cambiar `BOTI_ALLOW_REAL_WHATSAPP_SENDS` y `BOTI_ALLOW_GENERATOR_MUTATION` a `true` | Pendiente tras credenciales |
| Registro del webhook | Tecnico Meta registra URL en panel y completa verificacion GET | Pendiente |
| Migracion a Vault | Mover credenciales de `private.meta_whatsapp_credentials` a Supabase Vault | Pendiente |

---

## 7. Optimizaciones priorizadas

### Inmediatas (antes de activar)
1. Obtener plantillas aprobadas por Meta y actualizar sus nombres exactos en este README.
2. Cargar destinatarios reales en `project_meeting_recipients` con `consent_at` registrado.
3. Configurar los 4 secrets pendientes en Supabase Edge Functions.
4. Registrar el webhook `orkesta-whatsapp-webhook` en el panel de Meta.

### Quick wins (1-2 dias tras activacion)
5. Activar `BOTI_ALLOW_REAL_WHATSAPP_SENDS = true` y probar con 1 reunion real y 1 destinatario.
6. Verificar que las respuestas de botones llegan al webhook y actualizan `project_meetings`.
7. Monitorear los primeros 3 dias manualmente.

### Mediano plazo
8. Migrar credenciales de `private.meta_whatsapp_credentials` a Supabase Vault.
9. Conectar `meet_url` automaticamente cuando `orbit-meeting-notify` genera el Meet link, para que el recordatorio 1h siempre lleve el enlace real.
10. Agregar logica de re-envio si `reminder_status` sigue en `pending` despues de 2h del recordatorio 24h.

---

## 8. Decisiones tomadas

| ID | Fecha | Decision | Detalle |
|----|-------|----------|---------|
| D-001 | 2026-05-06 | **Primer envio exitoso QA** | Mensaje de texto libre enviado a destinatario QA via `boti-whatsapp-outbox-worker`. 1 fila `sent` en outbox. Arquitectura base validada. |
| D-002 | 2026-05-17 | **Doble recordatorio por reunion** | `generate_meeting_reminders()` actualizada para generar 2 notificaciones: -24h con template de botones y -1h sin botones. `dedupe_key` incluye offset. |
| D-003 | 2026-05-17 | **Soporte de templates Meta en el worker** | `boti-whatsapp-outbox-worker` v35 detecta `payload.template_name` y construye llamada de template con 5 variables. Retrocompatible con texto libre. |
| D-004 | 2026-05-17 | **Webhook de entrada desplegado** | `orkesta-whatsapp-webhook` v1 desplegada con `verify_jwt = false`. Valida firma HMAC-SHA256. Mapea botones a `project_meetings.reminder_status`. Pendiente de registro en Meta. |
| D-005 | 2026-05-17 | **GitHub Actions como trigger del cron** | Workflow `9-whatsapp-meeting-reminders.yml` corre cada 15 min. Job 1 genera, Job 2 despacha. Usa `dry_run: true` por defecto hasta activacion. |

---

## 9. Bitacora

| Fecha | Evento |
|-------|--------|
| 2026-05-06 | Construccion inicial: `project_meetings`, `project_meeting_recipients`, `boti-meeting-generator`, `boti-whatsapp-outbox-worker`. Primer mensaje QA enviado exitosamente. |
| 2026-05-17 | Auditoria tecnica completa. SQL actualizado para doble recordatorio (-24h y -1h). Worker v35 con soporte de templates. Webhook `orkesta-whatsapp-webhook` desplegado. Workflow GitHub Actions creado. Documentacion creada en `Agents_Automations`. |
