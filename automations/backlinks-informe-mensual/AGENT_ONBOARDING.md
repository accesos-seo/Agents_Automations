# Backlinks — Informe Mensual — Onboarding

## Resumen del proyecto

Automatización que supervisa el cierre del informe mensual de backlinks por parte del especialista off-page. Si el informe no se registra antes del día 28, escala por Slack en tres niveles: DM al especialista (día 25) → canal interno `#interno-equipo-seo` (día 29) → canal directiva `#leadership-team` (~día 33). Un proyecto se considera cerrado cuando tiene `status = submitted` o `status = no_backlinks` en la tabla `backlink_monthly_reports` para el mes en curso.

## Infraestructura clave

**Base de datos (Supabase `Light_House` — `stjugsrkrweakvzmizpq`):**
- `backlink_monthly_reports`: registro central — una fila por proyecto por mes, con el informe redactado y el status
- `backlink_report_escalations`: control de deduplicación — evita reenvíos del mismo nivel en el mismo mes
- `proyectos_seo`: fuente de proyectos activos (filtro: `valida_backlinks = true`, `suspendido IS NOT TRUE`)
- `notifications_outbox`: cola de salida procesada por el worker de Slack

**GitHub Actions (`accesos-seo/github-automation`):**
- Workflow: `9-backlinks-report-escalation.yml`
- Schedule: diario a las 8 AM Bogotá
- Secrets: `SUPABASE_URL`, `SUPABASE_KEY` (ya existentes en el repo)

**Slack:**
- Responsable: Richard Virona — `U055CS6HE3T`
- Canal interno: `C09SN85SGKC` (`#interno-equipo-seo`)
- Canal directiva: `C0AFHECQWRX` (`#leadership-team`)

## Estado actual (2026-05-17)

Sistema completamente operativo desde el día de construcción. El primer disparo real ocurrirá el día 25 del mes en curso. La tabla `backlink_monthly_reports` está vacía — ningún informe registrado aún para 2026-05. El worker de Slack procesa el outbox de forma activa.

## Reglas no negociables

1. No modificar el workflow sin revisar que `SUPABASE_URL` y `SUPABASE_KEY` siguen disponibles como secrets.
2. No eliminar filas de `backlink_report_escalations` — son el único mecanismo de deduplicación; si se borran, los mensajes se reenvían.
3. No cambiar los IDs de canal Slack (`C09SN85SGKC`, `C0AFHECQWRX`) sin verificar primero que el bot tenga acceso al nuevo canal.
4. Cuando se limpia `notifications_outbox`, filtrar siempre por `source = 'backlinks_report_escalation'` para no afectar otras automatizaciones.
5. El campo `no_backlinks_reason` es obligatorio cuando `status = no_backlinks`. No crear registros con ese status sin justificación escrita.

## Para empezar

Revisa `AREAS.md` para identificar el área de trabajo disponible, verifica `WORK_IN_PROGRESS.md` para detectar conflictos con sesiones activas, registra tu sesión y procede.
