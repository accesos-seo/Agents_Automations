# Checklist de validación end-to-end — Lighthouse

Este checklist se ejecuta **después** de aplicar el fix de "No user ID available". El objetivo es validar que todo el pipeline funcione desde el click en "Iniciar análisis" hasta la notificación en Slack.

**Tiempo estimado:** 5-10 minutos.

---

## Pre-requisitos

- [ ] Acceso al frontend en producción (la pantalla "Análisis Ahrefs (Lighthouse)")
- [ ] Acceso al SQL Editor del Dashboard de Supabase Light_House: https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/sql/new
- [ ] Acceso al canal Slack `#informes-seo` o equivalente
- [ ] El usuario logueado en ORBIT tiene `slack_id` válido en `public.users` (para recibir DM)

Verificá esto último con:
```sql
SELECT id, full_name, email, slack_id
FROM public.users
WHERE id = '<TU_AUTH_UID>';
```

Si `slack_id` es NULL, no vas a recibir DM (pero igual va al canal).

---

## Paso 1 — Auth resuelto en el frontend

- [ ] Recargar la pantalla en el browser (Ctrl+R)
- [ ] Abrir DevTools (F12) → Console
- [ ] Pegar:
  ```js
  await window.supabase.auth.getUser()
  ```
- [ ] **Resultado esperado:** objeto con `data.user.id` siendo un UUID, NO null

```
{ data: { user: { id: "8d36a3...", email: "...", ... } } }
```

Si sigue siendo null → volver al archivo `00-DIAGNOSTICO-NO-USER-ID.md`.

---

## Paso 2 — Disparar nuevo análisis

- [ ] Ir a "Análisis Ahrefs (Lighthouse)" → tab **"Marcas externas"**
- [ ] Click en "Nuevo análisis"
- [ ] Llenar:
  - URL del sitio: `https://lovable.dev`
  - Nombre del cliente: `lovable.dev test`
  - Mercado: Colombia
  - Profundidad: 100 filas
- [ ] Click en **"Iniciar análisis"**
- [ ] **Resultado esperado:** sin errores en consola, el botón cambia a estado "Iniciando..." o navega a la pantalla de progreso

---

## Paso 3 — Validar el INSERT en BD

En SQL Editor:

```sql
SELECT id, target_url, client_name, created_by, request_status, orchestration_id, created_at
FROM ahrefs_web_analysis.analysis_requests
ORDER BY created_at DESC
LIMIT 1;
```

- [ ] **El row más reciente corresponde a tu análisis** (`target_url` = `https://lovable.dev`)
- [ ] **`created_by` NO es NULL** ← este es el fix crítico
- [ ] `request_status` está en `queued` o `dispatched`
- [ ] `orchestration_id` puede ser NULL si todavía no se invocó el orchestrator

Si `created_by` es NULL → el fix no se aplicó. Volver al diagnóstico.

---

## Paso 4 — Pipeline arranca

Esperá 5-10 segundos y consultá:

```sql
SELECT id, orchestration_status, started_at, completed_at, error_message
FROM ahrefs_web_analysis.pipeline_orchestrations
ORDER BY started_at DESC LIMIT 1;
```

- [ ] Existe un row reciente
- [ ] `orchestration_status` está en `running` o `complete`
- [ ] `error_message` es NULL

En el frontend, las 10 etapas deberían empezar a cerrarse una por una (con la animación staged que ya implementaron).

---

## Paso 5 — Eventos del pipeline en tiempo real

Para ver el progreso paso a paso:

```sql
SELECT event_source, event_type, message, occurred_at
FROM ahrefs_web_analysis.analysis_run_events
WHERE occurred_at > NOW() - INTERVAL '5 minutes'
ORDER BY occurred_at DESC
LIMIT 50;
```

- [ ] Vés eventos de los agentes: `ahrefs-organic-keywords-runner`, `ahrefs-top-pages-runner`, `ahrefs-backlinks-runner`, `ahrefs-referring-domains-runner`, `ahrefs-historical-comparison`, `ahrefs-automated-diagnostics`, `ahrefs-recovery-plan`, `lighthouse-report-builder`, `lighthouse-google-docs-exporter`, `lighthouse-slack-notifier`
- [ ] Cada uno tiene un `agent_started` y un `agent_completed`
- [ ] No hay ningún `agent_failed`

---

## Paso 6 — Informe generado

Esperá 10-20 segundos más:

```sql
SELECT id, domain, report_status, report_version, file_path, published_at, generated_at
FROM ahrefs_web_analysis.reports
WHERE domain = 'lovable.dev'
ORDER BY generated_at DESC LIMIT 1;
```

- [ ] Existe un row reciente
- [ ] `report_status` = `generated` (ideal) o `generated_partial` (aceptable si Ahrefs devolvió poca data)
- [ ] `report_version` = 1 (la primera ejecución)

Las 6 secciones markdown:

```sql
SELECT section_key, section_title, section_order, section_status, LENGTH(body_markdown) AS chars
FROM ahrefs_web_analysis.report_sections
WHERE report_id = '<ID-DEL-REPORT>'
ORDER BY section_order;
```

- [ ] 6 filas: `executive_summary`, `site_snapshot`, `traffic_loss_summary`, `diagnosis`, `recovery_plan`, `appendix`
- [ ] Todas con `section_status = 'generated'`
- [ ] Todas con `chars > 200` (no están vacías)

---

## Paso 7 — Frontend muestra el informe

Volver al frontend, navegar a la pantalla del informe (debería abrirse automáticamente o estar disponible desde el historial).

- [ ] Se renderizan las 6 secciones markdown con headers, tablas, callouts
- [ ] En el header dice **"Preparado por: \<nombre del especialista\>"** (gracias al join con `public.users` via `created_by`)
- [ ] Si el report es `generated_partial`, aparece un badge **\[INFORME PARCIAL\]** en naranja con tooltip

---

## Paso 8 — Botón "Descargar Markdown"

- [ ] Click en "Descargar Markdown"
- [ ] Se descarga un archivo `informe-lovable.dev-2026-05-20.md`
- [ ] El archivo contiene las 6 secciones concatenadas con `---` entre cada una

---

## Paso 9 — Botón "Crear Google Doc"

- [ ] Click en "Crear Google Doc" (o "Abrir Google Doc" si ya existe)
- [ ] Espera 3-5 segundos
- [ ] Se abre una pestaña nueva con el Google Doc
- [ ] El Doc tiene la identidad SeoLab (logo, colores)
- [ ] El Doc tiene las 6 secciones formateadas (no markdown crudo)

Validar en BD:

```sql
SELECT id, file_path, published_at
FROM ahrefs_web_analysis.reports
WHERE domain = 'lovable.dev'
ORDER BY generated_at DESC LIMIT 1;
```

- [ ] `file_path` ya no es NULL, contiene la URL del Doc

---

## Paso 10 — Slack notification

Esperá hasta 30 segundos (el cron del worker corre cada 30s).

- [ ] **Si tenés `slack_id`:** recibís un DM en Slack del bot con título "Informe SEO listo: lovable.dev test" y botón "Abrir en Google Docs"
- [ ] En el canal `#informes-seo`: aparece una copia del mismo mensaje

Validar el outbox:

```sql
SELECT target_type, channel_id, status, sent_at, error_message
FROM public.notifications_outbox
WHERE source = 'lighthouse_report'
  AND payload->>'domain' = 'lovable.dev'
ORDER BY created_at DESC
LIMIT 5;
```

- [ ] 1 o 2 filas (DM + channel, o solo channel si no hay `slack_id`)
- [ ] Todas con `status = 'sent'` y `sent_at` poblado
- [ ] `error_message` es NULL

---

## Paso 11 — Pipeline health

Última verificación general:

```sql
SELECT * FROM ahrefs_web_analysis.v_pipeline_health;
```

- [ ] `orchestrations_running_old` = 0 (no hay huérfanos)
- [ ] `reports_without_doc` = 0 (todos los reports tienen Google Doc)
- [ ] `reports_unpublished` = 0 (todos fueron notificados)
- [ ] `outbox_pending_old` = 0 (no hay notificaciones atascadas)

Si algún número es > 0, investigar en logs:

```sql
SELECT * FROM ahrefs_web_analysis.analysis_run_events
WHERE event_type = 'agent_failed'
ORDER BY occurred_at DESC LIMIT 10;
```

---

## Definition of Done

- ✅ Todos los pasos del 1 al 11 pasaron sin errores
- ✅ El especialista recibió el DM de Slack
- ✅ El Google Doc se abre correctamente
- ✅ El informe se ve en el frontend con las 6 secciones

Si todo OK → marcar el issue como **closed** y notificar al equipo de SeoLab que Lighthouse está operativo.

Si algún paso falla → escribir un comentario en el issue con:
1. ¿Cuál paso falló?
2. Screenshot del frontend si aplica
3. Output del SQL ejecutado
4. Output relevante de DevTools Console
