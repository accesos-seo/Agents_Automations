# Diagnóstico de Automatizaciones — Proyecto Light_House

**Agencia:** SeoLab Agency
**Proyecto Supabase:** Light_House (`stjugsrkrweakvzmizpq`, región us-east-2)
**Fecha del diagnóstico:** 15 de mayo de 2026
**Objetivo:** dejar documentado el estado real de todas las automatizaciones y un plan para el lanzamiento previsto en ~10 días (objetivo: 25 de mayo de 2026).

---

## 1. Resumen ejecutivo

Se revisaron las tablas, funciones SQL, triggers, edge functions y trabajos programados (`cron`) del proyecto Light_House. Se identificaron **6 automatizaciones** en distinto grado de avance, **un bug de routing crítico** que afecta a todo el sistema de notificaciones, y **un problema de seguridad transversal** (RLS deshabilitado).

La mayoría de las automatizaciones están detenidas de forma intencional mientras se organiza el lanzamiento. Eso es correcto. Pero hay tres cosas que **no son intencionales** y deben corregirse antes de activar nada:

1. **El bug de routing del outbox** — el worker de WhatsApp se "come" notificaciones que no le corresponden y las deja atascadas para siempre. Ya pasó: hay 8 alertas de keywords congeladas desde el 6 de mayo.
2. **El canal privado de Slack `C09SN85SGKC`** rechaza los mensajes porque el bot no es miembro — el nivel 2 de escalación de solicitudes de clientes está roto.
3. **RLS deshabilitado en 162 tablas**, incluidas todas las de automatizaciones (con números de WhatsApp y datos de clientes expuestos).

| # | Automatización | Canal de salida | Estado | Prioridad |
|---|---|---|---|---|
| 1 | Recordatorios de reuniones | WhatsApp (Meta Cloud API) | QA / detenida — falta worker definitivo y hay desajuste de contrato | Alta |
| 2 | Escalación de solicitudes de clientes | Slack (canal/DM) | Activa (cron) — parcial: nivel 2 roto por `not_in_channel` | Alta |
| 3 | Alerta de reserva de keywords | Slack DM / canal | Bloqueada — bug de routing + 8 mensajes atascados + 2 implementaciones en conflicto | Alta |
| 4 | Alertas de calidad de contenido | (sin canal) | Bloqueada en salida — 191 alertas generadas sin destino | Media |
| 5 | Notificaciones de tareas asignadas | (sin canal) | Bloqueada en salida — 130 notificaciones solo in-app, sin salida externa | Media |
| 6 | Notificaciones por tipo de servicio / proyecto | (pendiente) | Solo esquema — 3 tablas de config vacías, sin worker | Baja |

---

## 1.bis Correcciones aplicadas — 15 de mayo de 2026

Se corrigieron **todos los bloqueos de infraestructura** que impedían que las automatizaciones funcionaran de forma fiable. Lo que queda pendiente son acciones de "puesta en marcha" (activar cron, cargar destinatarios, decisiones de producto) y dos acciones externas que no se pueden hacer desde la base de datos.

### ✅ Resuelto

| Acción | Qué se hizo | Cómo se aplicó |
|---|---|---|
| **Bug de routing del outbox (2.A)** | `claim_due_notifications` ahora es consciente del canal: acepta un parámetro `p_target_types text[]` y solo reclama notificaciones de los canales indicados. Se eliminó la versión antigua de 3 parámetros para que la ruta con el bug ya no exista. | Migraciones `fix_claim_due_notifications_channel_aware` y `drop_legacy_claim_due_notifications_overload` |
| **8 filas atascadas (2.B)** | Las 8 alertas de keywords congeladas en `processing` desde el 6 de mayo se marcaron como `cancelled` (datos del 29 de abril, ya obsoletos). El outbox quedó con **0 filas atascadas**. | `UPDATE` directo sobre `notifications_outbox` |
| **Red de seguridad anti-atascos (2.A/2.C)** | Nueva función `reset_stuck_outbox_notifications()` que recupera filas atascadas en `processing`: bajo el máximo de intentos las devuelve a `pending`, al superarlo las marca `failed`. Programada en cron cada 10 minutos (`outbox-stuck-reaper`). | Migración `add_outbox_stuck_reaper` |
| **Worker de WhatsApp (#1)** | Se reescribió `boti-whatsapp-outbox-worker` (v18). Ahora: (a) solo reclama tipos WhatsApp; (b) libera de inmediato cualquier fila que no le corresponda en vez de abandonarla; (c) resuelve el modelo de destinatarios `project_meeting_recipients` y hace fan-out (1 mensaje por destinatario), incluido el desajuste de contrato `whatsapp_recipients`; (d) en `dry_run` solo previsualiza, sin tocar el outbox. | Despliegue del edge function (v18) |
| **Cron redundante (#2)** | Se eliminó el cron job `client-requests-attention-weekdays-9am` (job 5), que ejecutaba la RPC directamente; el runner (job 6) ya la llama internamente. | `cron.unschedule` |

**Resultado:** el bug de routing está cerrado de raíz. El worker de WhatsApp ya no puede "comerse" notificaciones de otros canales, y si por cualquier motivo una fila se quedara en `processing`, el reaper la recupera en menos de 10 minutos. El contrato entre `generate_meeting_reminders()` y el worker quedó alineado.

### ⏳ Pendiente — acciones de puesta en marcha (decisión / día de lanzamiento)

Esto **no se activó a propósito**, porque implica empezar a enviar mensajes reales y tú estás organizando el lanzamiento de forma escalonada:

- **#1 WhatsApp:** activar `BOTI_ALLOW_REAL_WHATSAPP_SENDS = true`, cargar destinatarios reales con opt-in, y programar `generate_meeting_reminders()` + el worker en cron. Hoy se puede probar de extremo a extremo en modo `dry_run` sin riesgo.
- **#3 Keywords:** decidir entre las dos implementaciones (recomendado: el edge function `keyword-reserve-check`, que ya funciona y publica directo a Slack), poner los 9 proyectos en `enabled = true` y programar en cron.
- **#4 Calidad de contenido:** decidir qué severidades se notifican y por qué canal; construir el puente de salida; hacer backfill de las 191 alertas existentes.
- **#5 Tareas asignadas:** decidir si necesita salida externa o se queda como feed in-app.
- **#6:** planificada como fase 2 (post-lanzamiento).

### 🔧 Pendiente — acciones externas (no se pueden hacer desde la base de datos)

- **Invitar al bot de Slack al canal `C09SN85SGKC`** — es una acción de administración en Slack. Hasta que se haga, el nivel 2 de escalación de solicitudes de clientes seguirá fallando con `not_in_channel`. Después de invitarlo, se puede reintentar la fila que quedó en `error`.
- **RLS (2.D)** — **no se activó de forma automática a propósito**: activar RLS sin políticas previas bloquearía el acceso de la app del front-end y podría tumbar la aplicación a 10 días del lanzamiento. Requiere una revisión tabla por tabla (¿la lee el front-end o solo el `service_role`?). Es importante pero debe hacerse con un plan, no en masa. Ver sección 2.D.

---

## 2. Hallazgos transversales (afectan a varias automatizaciones)

### 2.A — Bug de routing del outbox `notifications_outbox` *(crítico — corregir primero)*

**Qué pasa:** la función `claim_due_notifications(worker_id, limit, now)` reclama **cualquier** fila pendiente del outbox sin filtrar por tipo de canal (`target_type`), origen (`source`) ni tipo (`type`). Marca la fila como `status = 'processing'`, le pone `locked_by` y `locked_at`.

El edge function `boti-whatsapp-outbox-worker` (la versión v1) llama a esa función, reclama hasta 10 filas de **cualquier** tipo, procesa solo las que son recordatorios de reunión, y **abandona el resto** (las cuenta como `skipped_unrelated_claimed` y no las vuelve a tocar).

**Por qué es un problema permanente:** las filas abandonadas quedan en `status = 'processing'`. La consulta de re-reclamo dentro de `claim_due_notifications` solo mira filas con `status = 'pending'`. Por lo tanto, una vez que el worker de WhatsApp "toca" una notificación que no es suya, esa fila queda congelada para siempre — ningún worker la vuelve a recoger.

**Evidencia:** las 8 alertas de reserva de keywords (`source = keyword_reserve_check`, `target_type = slack_dm`) están en `processing`, bloqueadas por workers `boti-whatsapp-outbox-worker-*` desde el 6 de mayo de 2026. Marcas afectadas: Leasy, Floty, SunGate Digital, Grape Ideas, Armor Corp, Doug Construction, Holisteek, Educa College Prep.

**Consecuencia para el lanzamiento:** mientras este bug exista, en cuanto dos automatizaciones compartan el outbox, el worker de WhatsApp va a contaminar las notificaciones de las demás. Esto debe corregirse **antes** de activar cualquier otra cosa.

**Opciones de corrección (requieren tu decisión):**

- **Opción 1 (recomendada):** hacer `claim_due_notifications` consciente del canal — agregar un parámetro `p_target_types text[]` para que cada worker reclame solo sus propios tipos. El worker de WhatsApp pasa `{whatsapp, whatsapp_recipients}`, un futuro worker de Slack pasa `{slack_dm, slack_channel, slack_user}`, etc.
- **Opción 2:** que el worker libere inmediatamente (volver a `pending`, limpiar lock) cualquier fila reclamada que no le corresponda.
- **Opción 3:** retirar por completo el worker v1 basado en `claim_*` y usar solo `boti-whatsapp-outbox-worker-controlled-v2` (que hace *preview*, nunca reclama ni muta el outbox) más un worker independiente por canal. Esta parece ser la dirección que ya se estaba tomando.
- **Complemento en cualquier caso:** un "reaper" (tarea programada cada N minutos) que devuelva a `pending` las filas que lleven demasiado tiempo en `processing`.

### 2.B — Recuperar las 8 filas atascadas

Las 8 filas en `processing` deben resetearse a `pending` (y limpiar `locked_by`/`locked_at`) **o** marcarse como canceladas. Dos consideraciones:

- Se generaron el 29 de abril con datos de inventario de keywords ya desactualizados. Si se resetean a `pending` tal cual, se enviarían alertas con 2+ semanas de antigüedad.
- Aunque se reseteen, **hoy no existe ningún worker que procese `slack_dm`** desde el outbox, así que se quedarían en `pending` igual.

**Recomendación:** marcarlas como `cancelled`/`expired` y dejar que la próxima corrida de la automatización de keywords genere alertas frescas. Confirmar antes de ejecutar.

### 2.C — No existe worker de outbox para Slack DM / canal de Slack

El único consumidor del outbox que está corriendo es `client-requests-attention-runner`, y está limitado a `source = 'client_requests_attention'`. No hay un worker genérico de Slack. Si la automatización de keywords se enruta por el outbox (como hace la función SQL `fn_check_keyword_reserve`), no tiene quién la procese.

### 2.D — RLS (Row Level Security) deshabilitado en 162 tablas *(seguridad — crítico)*

Todas las tablas de automatizaciones tienen RLS deshabilitado: `notifications_outbox`, `task_notifications`, `content_generation_alerts`, `project_meeting_recipients`, `business_calendar`, `client_request_attention_alerts`, `project_keyword_alerts`, `keyword_reserve_*`, etc. Cualquiera con la `anon key` puede leer o modificar todas las filas — incluidos los **números de WhatsApp con sus registros de consentimiento** (datos personales) y los IDs de canales de Slack.

**Importante:** no se debe activar RLS en masa sin antes definir políticas — activar RLS sin políticas bloquea todo acceso, incluidas las automatizaciones. La mayoría de estas tablas son de uso exclusivo del `service_role`, así que el patrón es: activar RLS y, como el `service_role` ignora RLS por diseño, las automatizaciones siguen funcionando; luego agregar políticas explícitas solo para las tablas que la app del front sí necesita leer. Esto requiere un plan de políticas tabla por tabla. Documentación: https://supabase.com/docs/guides/database/postgres/row-level-security

### 2.E — Cron jobs rotos (sincronización de smart reports)

Los trabajos programados `smart-report-sync-educa-monthly` y `smart-report-sync-all-monthly` tienen literalmente los placeholders sin reemplazar `<PROJECT_REF>` y `<SMART_REPORT_CACHE_SYNC_SECRET>` en la URL y los headers — fallan en cada ejecución. No son parte de las 6 automatizaciones núcleo, pero conviene corregirlos o desactivarlos.

### 2.F — Pipeline de generación de contenido inestable

Los edge functions `seo-content-orchestrator` y `seo-content-image-skill` están devolviendo muchos timeouts 504 (150 s) en las últimas 24 h. Este pipeline es el que *alimenta* la automatización #4 (alertas de calidad). Conviene revisarlo por separado porque afecta indirectamente al volumen y la fiabilidad de esas alertas.

---

## 3. Detalle por automatización

### Automatización 1 — Recordatorios de reuniones por WhatsApp

**Estado: QA / detenida intencionalmente. No lista para producción.**

**Componentes:**
- Función SQL `generate_meeting_reminders()` — crea filas en `project_meetings` y en `notifications_outbox` con `source = 'meeting-scheduler'`, `target_type = 'whatsapp_recipients'`, `target_id = <proyecto_id>`, `type = 'meeting_reminder'`, e incluye `recipient_model = 'project_meeting_recipients'` en el payload.
- Función SQL `get_next_meeting_date()` — calcula la próxima fecha de reunión respetando `business_calendar` (días hábiles, zona `America/Bogota`).
- Tabla `project_meeting_recipients` — destinatarios WhatsApp con opt-in. **Solo 3 registros, todos con rol `qa_internal_opt_in`** (Robert Virona, Heduin Chacin, Camila — todos QA interno). No hay destinatarios reales de cliente.
- Edge functions: `boti-whatsapp-outbox-worker` (v1, reclama vía RPC), `boti-whatsapp-outbox-worker-controlled-v2` (seguro, solo preview), `-safe-v2`, `-readonly`, `boti-meeting-generator`, `whatsapp-template-qa-controlled-test`.
- Entrega: Meta WhatsApp Cloud API. Gate de seguridad: variable `BOTI_ALLOW_REAL_WHATSAPP_SENDS` (los workers por defecto van en `dry_run`).

**Estado de los datos:**
- 1 mensaje `sent` correctamente (prueba QA a +573183061286).
- 1 mensaje `pending` (`qa_internal_whatsapp`, prueba controlada).
- **No hay cron** que ejecute `generate_meeting_reminders()` ni los workers.
- `project_meetings` tiene 3 reuniones de prueba, todas con `reminder_status = 'pending'`.

**Problemas encontrados:**
- **Desajuste de contrato:** `generate_meeting_reminders()` produce `target_type = 'whatsapp_recipients'` con `target_id = <proyecto_id>`, pero el worker v1 `boti-whatsapp-outbox-worker` espera `target_type = 'whatsapp'` con `target_id = <teléfono>`. Si el v1 procesa esas filas, las marca como `failed` con `invalid_or_missing_whatsapp_target`. El v1 no resuelve el modelo de destinatarios `project_meeting_recipients`.
- `boti-whatsapp-outbox-worker-controlled-v2` es la ruta segura de QA (solo *preview*, no reclama ni muta el outbox), pero **tampoco** hace el fan-out por destinatario contra `project_meeting_recipients` ni actualiza el estado del outbox. Solo previsualiza.
- **Ningún worker actual implementa el fan-out completo** del modelo `recipient_model = 'project_meeting_recipients'`.
- Existen **5 variantes del worker** — hay que consolidar a un único worker canónico antes del lanzamiento.
- El worker v1 es además el origen del bug de routing transversal (ver 2.A).

**Para activar:** definir y desplegar UN worker canónico que (a) reclame solo tipos WhatsApp, (b) resuelva los destinatarios desde `project_meeting_recipients`, (c) haga fan-out 1 mensaje por destinatario, (d) actualice el estado del outbox. Cargar destinatarios reales (con opt-in/consentimiento). Programar `generate_meeting_reminders()` + el worker en cron. Activar `BOTI_ALLOW_REAL_WHATSAPP_SENDS` solo al final.

---

### Automatización 2 — Escalación de solicitudes de clientes (Slack)

**Estado: ACTIVA (en cron). Funciona parcialmente — el nivel 2 está roto.**

**Componentes:**
- Función SQL `run_client_requests_attention_check(p_channel_id)` — lee la vista `client_requests_attention`, gestiona la tabla `client_request_attention_alerts`, e inserta en `notifications_outbox` con `source = 'client_requests_attention'`. Escalación: **Nivel 1** → DM de Slack del responsable asignado (o canal por defecto); **Nivel 2** → canal privado `C09SN85SGKC`; **Nivel 3** → canal directiva `C0B1B3V4ZB5`.
- Edge function `client-requests-attention-runner` — llama a la RPC, lee del outbox las filas `source = 'client_requests_attention'` y `status = 'pending'`, publica en Slack y actualiza el estado.
- Cron job 5: `run_client_requests_attention_check('C0B1B3V4ZB5')` — lunes a viernes 14:00 UTC (9:00 a. m. Bogotá).
- Cron job 6: HTTP POST a `client-requests-attention-runner?channel_id=C0B1B3V4ZB5` — lunes a viernes 14:00 UTC.

**Estado de los datos:**
- 2 filas `processed` (enviadas correctamente al canal `C0B1B3V4ZB5`).
- 1 fila `error`.
- `client_request_attention_alerts`: 5 filas activas, todas en nivel 3, canal `C0B1B3V4ZB5`.

**Problemas encontrados:**
- **1 fila en `error`:** `Slack 200: {"ok":false,"error":"not_in_channel"}` para el canal `C09SN85SGKC` (el canal "privado" del nivel 2). **El bot de Slack no es miembro de ese canal.** Todas las escalaciones de nivel 2 van a fallar hasta que se invite al bot.
- **Dos cron jobs a la misma hora (14:00 UTC):** el job 5 ejecuta la RPC directamente y el job 6 ejecuta el runner, que *también* llama a la RPC internamente. El job 5 es redundante. El `dedupe_key` evita duplicados, pero conviene dejar solo el job 6 (el runner) para simplificar.

**Para terminar de activar:** invitar al bot de Slack al canal `C09SN85SGKC` (y verificar que esté en todos los canales destino). Eliminar el cron job 5 redundante. Reintentar la fila en `error`.

---

### Automatización 3 — Alerta de reserva de keywords (Slack)

**Estado: BLOQUEADA. Detenida intencionalmente, pero con bug de routing y dos implementaciones en conflicto.**

**Componentes — hay DOS implementaciones paralelas que no concuerdan:**

- **(a) Función SQL `fn_check_keyword_reserve()`** — lee la vista `v_keyword_reserve_status`, gestiona `project_keyword_alerts`, e inserta en `notifications_outbox` con `source = 'keyword_reserve_check'`: Nivel 1 → `target_type = 'slack_dm'` (especialista SEO), Nivel 2 → `slack_channel` (equipo), Nivel 3 → `slack_dm` (directiva). **Esta es la que generó las 8 filas atascadas.**
- **(b) Edge function `keyword-reserve-check`** — lee `keyword_reserve_monitored_projects`, cuenta `keyword_research`, escribe `keyword_reserve_daily_snapshots` y `project_keyword_alerts`, y **publica en Slack directamente** (no usa el outbox). Usa `KEYWORD_ALERTS_CHANNEL_ID`, por defecto `C0B1B3V4ZB5`.

**Tablas:**
- `project_keyword_alerts` — 22 filas, **todas con `is_active = false`** (16 en nivel 0, 6 en nivel 3).
- `keyword_reserve_monitored_projects` — 9 proyectos, **todos con `enabled = false`** (consistente con "detenida intencionalmente").
- `keyword_reserve_settings` — 1 fila: `alerts_operaciones_channel_id = C0B1B3V4ZB5`.
- `keyword_reserve_daily_snapshots` — 27 filas históricas.

**Problemas encontrados:**
- **8 filas del outbox congeladas en `processing`** (ver 2.A y 2.B).
- **Dos implementaciones que se contradicen:** la función SQL enruta vía outbox (`slack_dm`/`slack_channel`); el edge function se salta el outbox y publica directo. Además los filtros de conteo difieren: `get_keyword_alerts_data` cuenta `status IN ('pending','approved')`; el edge function cuenta `status IN ('pending','in_use')`. **Hay que elegir una sola implementación.**
- **No existe worker que procese `slack_dm` en el outbox.** Aunque se corrija el bug de routing, las filas `slack_dm` no tienen a dónde ir si se usa la implementación (a).
- Los 9 proyectos monitoreados están en `enabled = false` — coherente con la pausa intencional.

**Para activar:** decidir entre la implementación (a) outbox o (b) directa. La (b) es más simple y autocontenida y ya está deployada; la (a) es más consistente con el resto del sistema pero necesita un worker de Slack y la corrección del bug de routing. Una vez elegida: poner los 9 proyectos en `enabled = true`, programar en cron, y limpiar las 8 filas atascadas.

---

### Automatización 4 — Alertas de calidad de contenido

**Estado: el trigger está ACTIVO y genera alertas, pero BLOQUEADA en la salida — 191 alertas sin destino.**

**Componentes:**
- Trigger `on_article_content_quality_gate` sobre `content_items` (AFTER UPDATE OF `article_content`) → `trigger_evaluate_seo_article_quality()` → `evaluate_seo_article_quality(content_item_id)` → escribe en `content_generation_alerts`.
- Tabla `content_generation_alerts` — **191 filas, todas en `status = 'open'`**: 63 de tipo `article_quality_gate_failed` (severidad alta) y 128 de tipo `article_quality_gate_needs_review` (severidad warning).

**Problemas encontrados:**
- **191 alertas sin enrutar.** El gate evalúa y registra, pero nadie es notificado. No hay routing a Slack, email ni al outbox para `content_generation_alerts`. No hay cron ni worker.
- Cuando se conecte un canal de salida, se dispararían **191 notificaciones de golpe** salvo que se haga backfill (marcar las viejas como ya notificadas) o throttling.
- Relacionado: el pipeline que alimenta este gate (`seo-content-orchestrator`, `seo-content-image-skill`) está inestable con muchos 504 (ver 2.F).

**Para activar:** construir el puente de salida (generador de filas de outbox o publicación directa a Slack), decidir umbral (¿solo `failed`? ¿también `needs_review`?), hacer backfill del backlog de 191, y programar.

---

### Automatización 5 — Notificaciones de tareas asignadas

**Estado: BLOQUEADA en la salida. Solo es un feed in-app, sin entrega externa.**

**Componentes:**
- Tabla `task_notifications` — **130 filas, todas `event_type = 'task_assigned'`, las 130 con `is_read = false`**. La más antigua del 11 de febrero, la más reciente del 14 de mayo (se siguen creando).

**Problemas encontrados:**
- No se encontró ningún trigger ni función que enrute `task_notifications` hacia un canal externo ni hacia `notifications_outbox`. Es puramente un feed de notificaciones dentro de la app.
- 130/130 sin leer sugiere que la superficie in-app tampoco está conectada, o que nadie la revisa.
- Si el objetivo es notificar externamente las asignaciones de tareas, falta construir el puente al outbox.

**Para activar:** definir si la notificación de tareas debe salir por un canal externo (Slack/WhatsApp/email). Si sí, construir el puente. Si no, conectar la superficie in-app y definir quién la consume.

---

### Automatización 6 — Notificaciones por tipo de servicio / configuración por proyecto

**Estado: solo esquema. No lista — es andamiaje vacío.**

**Componentes:**
- `project_notification_settings` — 0 filas. ("Configuración de responsables para recibir notificaciones automatizadas por tipo en cada proyecto.")
- `projects_notifications` — 0 filas.
- `user_notification_settings` — 0 filas.

**Problemas encontrados:**
- Las 3 tablas de configuración están vacías — el ruteo de "qué responsable recibe qué tipo de notificación por proyecto" no está configurado.
- Ninguna función, trigger ni cron referencia estas tablas para entrega.
- Es la automatización menos avanzada: existe el esquema pero no hay datos ni procesador.

**Para activar:** es trabajo de mayor alcance. Recomendación: dejarla **fuera del lanzamiento de 10 días** y planearla como fase 2. Si se necesita algo de ruteo por proyecto antes, hacerlo mínimo y manual.

---

## 4. Plan propuesto para el lanzamiento (10 días)

Hoy es viernes 15 de mayo. Objetivo de lanzamiento: ~lunes 25 de mayo. El plan separa **limpieza/correcciones** primero, **activación escalonada** después, y deja la #6 para fase 2.

### Semana 1 — Limpieza y correcciones (16–20 de mayo)

| Día | Acción | Automatización |
|---|---|---|
| 1 | **Corregir el bug de routing** (2.A): hacer `claim_due_notifications` consciente del canal, o consolidar a worker `controlled-v2`. Decidir opción. | Transversal |
| 1 | **Limpiar las 8 filas atascadas** (2.B): marcarlas `cancelled`/`expired`. | #3 |
| 2 | **Invitar el bot de Slack** al canal `C09SN85SGKC` y verificar todos los canales destino. Reintentar la fila en `error`. | #2 |
| 2 | **Eliminar el cron job 5 redundante**; dejar solo el runner (job 6). | #2 |
| 3 | **Consolidar workers de WhatsApp**: elegir UN worker canónico, implementar el fan-out por `project_meeting_recipients`, retirar las variantes sobrantes. | #1 |
| 3 | **Elegir la implementación de keywords** (outbox vs. directa) y alinear los filtros de conteo. | #3 |
| 4 | **Plan de RLS** (2.D): activar RLS + políticas de `service_role` en las tablas de automatizaciones. No en masa — tabla por tabla. | Transversal |
| 4–5 | **Construir el puente de salida** de alertas de calidad de contenido y hacer backfill del backlog de 191. | #4 |
| 5 | Desactivar o arreglar los cron jobs rotos de smart-report (2.E). | Transversal |

### Semana 2 — Activación escalonada (21–24 de mayo)

| Día | Acción | Automatización |
|---|---|---|
| 6 | Activar **#2 (solicitudes de clientes)** al 100% — ya está en cron, solo faltaba el canal del nivel 2. Monitorear 24 h. | #2 |
| 7 | Activar **#3 (reserva de keywords)** — poner los 9 proyectos en `enabled = true`, programar en cron. Monitorear. | #3 |
| 8 | Activar **#4 (calidad de contenido)** con el puente nuevo y throttling. Monitorear. | #4 |
| 9 | Activar **#1 (recordatorios WhatsApp)** — primero solo destinatarios QA internos, luego activar `BOTI_ALLOW_REAL_WHATSAPP_SENDS` y cargar destinatarios reales con opt-in. | #1 |
| 9 | Decidir alcance de **#5** — puente al outbox o quedarse in-app. | #5 |

### Día 10 — Lanzamiento (25 de mayo)

- Verificación final de las 4–5 automatizaciones activas.
- Revisar el outbox: 0 filas atascadas en `processing`, 0 en `error` sin resolver.
- Confirmar que el "reaper" de filas atascadas está corriendo.
- **#6** queda planificada como **fase 2** (post-lanzamiento).

---

## 5. Acciones que requieren tu decisión

1. ~~**Bug de routing (2.A)**~~ — **Resuelto.** Se aplicó la Opción 1 (RPC consciente del canal) + la Opción 2 (el worker libera lo que no es suyo) como defensa en profundidad.
2. ~~**Las 8 filas atascadas (2.B)**~~ — **Resuelto.** Marcadas como `cancelled`.
3. **Keywords (#3):** ¿implementación vía outbox (función SQL) o publicación directa (edge function)? Recomendación: el edge function `keyword-reserve-check`, que ya funciona.
4. **Calidad de contenido (#4):** ¿se notifican solo las `failed` o también las `needs_review`? ¿Qué canal?
5. **Tareas asignadas (#5):** ¿necesita salida externa o se queda como feed in-app?
6. **#6:** ¿confirmas dejarla para fase 2?
7. **Bot de Slack:** invitar al bot al canal `C09SN85SGKC` (acción en Slack).
8. **RLS (2.D):** aprobar el plan de activación tabla por tabla.

---

*Diagnóstico generado a partir de la inspección directa del proyecto Supabase Light_House (`stjugsrkrweakvzmizpq`): tablas, columnas, triggers, funciones SQL, edge functions, cron jobs, advisors de seguridad y logs.*
