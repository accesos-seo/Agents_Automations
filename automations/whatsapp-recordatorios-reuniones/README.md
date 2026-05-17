# WhatsApp — Recordatorios de Reuniones

**Automation key:** `google_calendar_whatsapp_meeting_reminders`  
**Version:** 1.1 (backend completo; pendiente plantillas Meta aprobadas)  
**Estado:** `ready` / `pending_activation`  
**Construida:** 2026-05-06  
**Ultima revision:** 2026-05-17  
**Owner producto:** _por definir_  
**Owner tecnico:** _por definir_

Automatizacion de recordatorios de reuniones por WhatsApp. El codigo vive **dentro del proyecto Supabase `Light_House`** (`stjugsrkrweakvzmizpq`) — no hay repo de implementacion externo. Este directorio es el **plano de control** y **bitacora viva** de la automatizacion.

---

## 1. Que hace

Detecta las reuniones proximas configuradas por proyecto en `proyectos_seo` y envia recordatorios por WhatsApp a los destinatarios registrados en `project_meeting_recipients`. Se generan dos mensajes por reunion usando plantillas aprobadas por Meta:

| Mensaje | Cuando | Plantilla | Botones |
|---------|--------|-----------|---------|
| Recordatorio 24h | 24 horas antes de la reunion | `orkesta_meeting_reminder_24h` | Confirmar / Reprogramar / Cancelar |
| Recordatorio 1h | 1 hora antes de la reunion | `orkesta_meeting_reminder_1h` | Ninguno |

**Flujo resumido:**

```
proyectos_seo (reunion_*_dia / hora activos)
       |
       v
generate_meeting_reminders()  [SQL function]
  Crea fila en project_meetings
  Inserta 2 filas en notifications_outbox (-24h y -1h)
       |
       v
GitHub Actions cron cada 15 min
  Job 1: boti-meeting-generator  (invoca la SQL function)
  Job 2: boti-whatsapp-outbox-worker  (despacha mensajes)
       |
       v
Meta WhatsApp Cloud API --> destinatario
       |
       v
orkesta-whatsapp-webhook (recibe respuesta de botones)
  ORKESTA_CONFIRM     --> project_meetings.reminder_status = 'confirmed'
  ORKESTA_RESCHEDULE  --> project_meetings.reminder_status = 'reschedule_requested'
  ORKESTA_CANCEL      --> project_meetings.reminder_status = 'cancelled'
```

Tipos de reunion monitoreados: `operativa`, `estrategica`, `automation`.

---

## 2. Configuracion

| Config | Valor |
|--------|-------|
| Runtime | Supabase `Light_House` (`stjugsrkrweakvzmizpq`) + GitHub Actions |
| Trigger | Cron cada 15 min (`.github/workflows/9-whatsapp-meeting-reminders.yml`) |
| Zona horaria operativa | `America/Bogota` (UTC-5) |
| Offset recordatorio 24h | `scheduled_for = reunion - 24h` |
| Offset recordatorio 1h | `scheduled_for = reunion - 1h` |
| Prioridad outbox 24h | 70 |
| Prioridad outbox 1h | 80 |
| API Meta | `graph.facebook.com/v20.0/{PHONE_NUMBER_ID}/messages` |
| Phone Number ID actual | `938244712709748` (confirmar si corresponde a Orkesta) |

**Secrets requeridos en Supabase `Light_House` → Edge Functions → Secrets:**

| Secret | Estado |
|--------|--------|
| `META_WHATSAPP_TOKEN` | Pendiente — entregar por tecnico Meta |
| `META_WHATSAPP_PHONE_NUMBER_ID` | Configurado: `938244712709748` (confirmar) |
| `BOTI_ALLOW_REAL_WHATSAPP_SENDS` | `false` (cambiar a `true` para produccion) |
| `BOTI_ALLOW_GENERATOR_MUTATION` | `false` (cambiar a `true` para produccion) |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Pendiente — definir junto al tecnico Meta |
| `WHATSAPP_APP_SECRET` | Pendiente — entregar por tecnico Meta |
| `SUPABASE_URL` | Automatico (Supabase lo inyecta) |
| `SUPABASE_SERVICE_ROLE_KEY` | Automatico (Supabase lo inyecta) |

---

## 3. Componentes

### 3.1 Edge Functions (en `Light_House`)

| Slug | `verify_jwt` | Version | Funcion |
|------|-------------|---------|---------|
| `boti-meeting-generator` | `true` | v33 | Invoca `generate_meeting_reminders()`. Controlado por `BOTI_ALLOW_GENERATOR_MUTATION`. |
| `boti-whatsapp-outbox-worker` | `true` | v35 | Procesa `notifications_outbox` y envia via Meta API. Soporta templates y texto libre. |
| `orkesta-whatsapp-webhook` | `false` | v1 | Recibe respuestas de botones de Meta. Valida firma HMAC-SHA256. |

### 3.2 Tablas (en `Light_House`)

| Tabla | Rol |
|-------|-----|
| `project_meetings` | Registro de cada reunion generada. Campos clave: `meeting_date`, `meeting_time`, `meet_url`, `reminder_status`. |
| `project_meeting_recipients` | Destinatarios WhatsApp por proyecto. Requiere `is_active = true` y `consent_at NOT NULL`. |
| `notifications_outbox` | Cola central de notificaciones salientes. Source: `meeting-scheduler`. |
| `proyectos_seo` | Fuente de configuracion de reuniones: `reunion_*_dia`, `reunion_*_hora`, `idioma_objetivo`. |

### 3.3 Funciones SQL

| Funcion | Rol |
|---------|-----|
| `generate_meeting_reminders()` | Motor principal. Itera proyectos activos, calcula proxima fecha, crea `project_meetings` e inserta 2 filas en `notifications_outbox`. |
| `get_next_meeting_date(dia, desde, incluir_hoy)` | Calcula la fecha del proximo dia de semana indicado. |
| `claim_due_notifications(worker_id, limit, now, target_types)` | Claim atomico del outbox. Filtra solo `target_type IN ('whatsapp', 'whatsapp_recipients', 'qa_internal_whatsapp')`. |

### 3.4 Plantillas Meta (pendientes de aprobacion)

| Nombre | Categoria | Idiomas | Variables | Botones |
|--------|-----------|---------|-----------|---------|
| `orkesta_meeting_reminder_24h` | `UTILITY` | `es`, `en` | `{{1}}` nombre, `{{2}}` titulo, `{{3}}` fecha, `{{4}}` hora, `{{5}}` meet_url | Confirmar / Reprogramar / Cancelar |
| `orkesta_meeting_reminder_1h` | `UTILITY` | `es`, `en` | `{{1}}` nombre, `{{2}}` titulo, `{{3}}` fecha, `{{4}}` hora, `{{5}}` meet_url | Ninguno |

### 3.5 GitHub Actions

| Workflow | Trigger | Funcion |
|----------|---------|---------|
| `9-whatsapp-meeting-reminders.yml` | Cron `*/15 * * * *` + dispatch manual | Job 1: genera recordatorios. Job 2: despacha mensajes. |

---

## 4. Flujo end-to-end

```
1. CRON GitHub Actions cada 15 min
   |
   v
2. boti-meeting-generator
   Invoca generate_meeting_reminders()
   Para cada proyecto activo con reunion configurada:
   |  Calcula proxima fecha del dia de semana indicado
   |  INSERT project_meetings (si no existe ya)
   |  INSERT notifications_outbox x2:
   |    - scheduled_for = base_ts - 24h | template = orkesta_meeting_reminder_24h | priority 70
   |    - scheduled_for = base_ts - 1h  | template = orkesta_meeting_reminder_1h  | priority 80
   |  dedupe_key = {proyecto_id}::{fecha}::{tipo}::{offset}::whatsapp_reminder
   |
   v
3. boti-whatsapp-outbox-worker
   Claim atomico via claim_due_notifications()
   Solo target_type IN ('whatsapp', 'whatsapp_recipients', 'qa_internal_whatsapp')
   Para target_type = 'whatsapp_recipients':
   |  Busca destinatarios en project_meeting_recipients
   |  WHERE proyecto_id = target_id AND is_active = true AND consent_at IS NOT NULL
   Fan-out: un mensaje por destinatario
   |  Si payload.template_name presente --> tipo template
   |  Si no --> tipo texto libre (retrocompatible QA)
   |
   v
4. Meta WhatsApp Cloud API
   POST /v20.0/{PHONE_NUMBER_ID}/messages
   Respuesta: provider_message_id guardado en notifications_outbox
   |
   v
5. Destinatario recibe el mensaje
   Si presiona boton (solo plantilla 24h):
   |
   v
6. orkesta-whatsapp-webhook (POST de Meta)
   Verifica firma X-Hub-Signature-256
   Busca notifications_outbox.provider_message_id = context.id
   Actualiza project_meetings.reminder_status
   Registra inbound event en notifications_outbox (trazabilidad)
```

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

---

Copia desde `# WhatsApp` hasta la última línea de la bitácora. **No incluyas las líneas `---` del inicio ni el texto de este mensaje.**
