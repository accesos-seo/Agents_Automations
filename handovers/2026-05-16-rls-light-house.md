# Handover — Activación de Row Level Security (RLS) en proyecto Light_House

**Fecha:** 2026-05-16
**Origen:** Auditoría Supabase ejecutada por agente (boti/Sony pipeline)
**Destino:** Técnico responsable de Supabase / Backend
**Prioridad:** ALTA (riesgo de exposición de datos en producción)
**Proyecto Supabase afectado:** `Light_House` — ref `stjugsrkrweakvzmizpq` — region `us-east-2`
**Otro proyecto (no incluido en este trabajo):** `Swarm Agentes MD` — ref `lwurzjrghzwzxbhrulyn` (centro de control de agentes; revisar RLS en una segunda fase)

---

## 1. Resumen ejecutivo (1 minuto)

El proyecto Supabase `Light_House` tiene **162 tablas con Row Level Security desactivado**, incluyendo tablas que contienen datos personales (clientes, usuarios, equipo), financieros (cuentas de cobro de freelancers, tarifas, pagos) y operacionales sensibles (tickets, conversaciones, tareas de ClickUp, contenidos).

La `anon key` de Supabase viaja en el frontend (navegador del cliente) y, mientras RLS esté apagado, cualquier persona con esa llave puede **leer y modificar todas las filas de esas tablas**. No es un riesgo teórico: es la realidad operativa actual.

El objetivo de este handover es que el técnico responsable diseñe e implemente **policies de RLS por dominio**, en fases controladas, sin romper la aplicación.

**Lo que NO se debe hacer:** ejecutar la SQL `ENABLE ROW LEVEL SECURITY` masiva que sugiere el advisor de Supabase. Activar RLS sin policies bloquea TODO acceso y rompe la aplicación de inmediato.

---

## 2. Consecuencias y riesgos

### 2.1 Riesgo actual (no hacer nada)

Cualquier persona con acceso a la `anon key` (visible en el código del frontend) puede, hoy:

- **Leer** datos de clientes, usuarios, freelancers, tarifas, montos a pagar, conversaciones internas, tickets, tareas de ClickUp, historial de contenidos.
- **Modificar** registros: alterar montos de facturas, cambiar estados de tareas, editar contenidos.
- **Borrar** registros completos: tickets, conversaciones, historial de auditoría (`content_action_history` tiene 1.394 filas), `keyword_research` (1.197 filas), `clickup_tasks` (772 filas).
- **Insertar** datos basura: tickets falsos, solicitudes, alertas.

Implicaciones:

- **Legal / regulatorio:** posible incumplimiento de protección de datos personales (Habeas Data Colombia / GDPR / LOPD según mercado). Datos de clientes y freelancers están expuestos.
- **Operacional:** integridad de datos no garantizada. No hay forma de demostrar que un registro no fue alterado por un tercero.
- **Reputacional:** una filtración de tarifas de freelancers, conversaciones con clientes o información de proyectos sería un incidente serio.

### 2.2 Riesgo de hacerlo mal (activar RLS sin policies)

Si se ejecuta `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` sin crear policies, Postgres aplica el comportamiento por defecto: **niega todo acceso a roles no privilegiados**. Esto rompería:

- La aplicación cliente (anon + authenticated roles no podrían leer ni escribir).
- Cualquier Edge Function que use la `anon key` o un JWT de usuario.
- Dashboards, formularios, pantallas internas.

Por eso el advisor de Supabase explícitamente indica no aplicar la remediation SQL automáticamente.

### 2.3 Riesgo de hacerlo bien pero sin pruebas

Aun con policies correctas en la teoría, si no se prueba en un branch/staging, se puede:

- Bloquear sin querer flujos legítimos (ej. un admin que ya no ve lo que necesita).
- Crear policies recursivas o lentas que degradan el rendimiento.
- Olvidar un rol (service_role bypasea RLS por defecto, pero authenticated/anon no).

---

## 3. Objetivo y entregables

### 3.1 Objetivo

Activar RLS en las 162 tablas del proyecto `Light_House` con policies que reflejen las reglas de negocio reales, **sin downtime** y **sin pérdida de funcionalidad**.

### 3.2 Entregables esperados del técnico

1. **Inventario clasificado** de las 162 tablas con su patrón de acceso (anexo A de este documento como punto de partida — el técnico lo completa).
2. **Migraciones SQL** versionadas, una por dominio (no una migración monolítica), aplicadas vía `supabase migration` o `mcp__2b07c2b1-9efc-4460-975b-17ff6a23ee5c__apply_migration`.
3. **Documento de policies** en `referencias/rls-policies-light-house.md` con el racional de negocio de cada patrón.
4. **Pruebas automatizadas o checklist manual** que verifique, para cada tabla crítica, que:
   - Un usuario `anon` ve solo lo que debe ver (típicamente nada).
   - Un usuario `authenticated` ve solo sus propios datos o los autorizados por su rol.
   - El backend con `service_role` sigue teniendo acceso completo.
5. **Plan de rollback** documentado y probado.
6. **Confirmación final** en `phase_events` del proyecto `Swarm Agentes MD` con `event_type='rls_hardening_completed'` y resumen de cobertura.

---

## 4. Alcance

### 4.1 Dentro del alcance

- Las 162 tablas marcadas por el advisor en el proyecto `Light_House` (ref `stjugsrkrweakvzmizpq`).
- Diseño e implementación de policies.
- Pruebas en branch de Supabase antes de aplicar a producción.
- Auditoría posterior con `get_advisors` para confirmar cobertura.

### 4.2 Fuera del alcance (proyectos separados)

- Tablas backup viejas (`*_backup_20241012`, `*_archived`, `documents_backup`, `contenidos_backup`) — el técnico debe **proponer si se borran** en lugar de aplicarles RLS, dado que no se usan.
- Proyecto `Swarm Agentes MD` (ref `lwurzjrghzwzxbhrulyn`): este proyecto ya tiene RLS activo en sus tablas, pero requiere una revisión de policies en una fase posterior.
- Rediseño de la lógica de roles del negocio (se trabaja con la lógica de roles existente: `team_members`, `agency_roles`, `user_permissions`, `cliente_users`, `roles`, `team_roles`).

---

## 5. Plan de ejecución por fases

Cada fase debe completarse, probarse y desplegarse antes de pasar a la siguiente.

### Fase 0 — Preparación (½ día)

1. Crear branch de Supabase para pruebas: `mcp__2b07c2b1...__create_branch` sobre `stjugsrkrweakvzmizpq`.
2. Tomar snapshot/backup del proyecto productivo.
3. Confirmar inventario de Edge Functions que escriben/leen con `service_role` vs con `anon`. Documentar.
4. Identificar el modelo de identidad real: ¿`auth.uid()` está poblado para todos los usuarios? ¿Hay `cliente_users` mapeando `auth.uid()` a `clientes`? ¿`team_members` está unido a `auth.users`?
5. Confirmar la lista de roles de Postgres en uso: `anon`, `authenticated`, `service_role`, y cualquier rol custom.

**Criterio de salida:** branch listo, modelo de identidad documentado en `referencias/identity-model.md`.

### Fase 1 — Tablas backup y muertas (½ día)

Decidir, con el dueño del producto, qué hacer con las tablas obsoletas:

- `agency_roles_backup_20241012`
- `roles_backup_20241012`
- `team_members_backup_20241012`
- `proyectos_seo_backup_20241012`
- `documents_backup`
- `contenidos_backup`
- `team_members_archived`

**Opción A (recomendada):** exportar a Storage como CSV y `DROP TABLE`.
**Opción B:** activar RLS con policy `false` (nadie accede) y dejarlas como referencia histórica.

**Criterio de salida:** estas tablas ya no aparecen en el advisor o están con RLS denegando todo.

### Fase 2 — Datos personales y financieros (CRÍTICO — 2 a 3 días)

Tablas y patrón sugerido (el técnico ajusta según realidad del negocio):

| Tabla | Patrón sugerido |
|---|---|
| `clientes`, `cliente_users` | Solo `service_role` lee/escribe. Cliente final ve su propio registro via Edge Function con JWT. |
| `users`, `user_permissions`, `user_sessions`, `user_notification_settings` | Usuario ve solo `auth.uid() = user_id`. Admin (`agency_roles.role = 'admin'`) ve todo. |
| `freelancer_invoices`, `freelancer_invoice_settings`, `freelancer_invoice_events`, `freelancer_payments`, `freelancer_rates`, `freelancer_payable_items` | `service_role` total. `authenticated`: solo si `auth.uid()` = freelancer dueño. Admin financiero ve todo. |
| `request_messages`, `client_requests`, `client_request_attention_alerts` | `authenticated`: solo si pertenece al `client_id` del usuario (via `cliente_users`). Admin ve todo. |
| `tickets` | Owner ve sus tickets; admin ve todos. |
| `team_members`, `team_member_skills`, `team_profile_documents` | Cada miembro ve su propio perfil; admin ve todos. |
| `team_skills`, `team_roles`, `agency_roles`, `roles` | Lectura pública para authenticated (catálogos). Escritura solo admin/service_role. |
| `chat_memory` | Solo `auth.uid() = user_id`. |

**Criterio de salida:** ninguna de estas tablas accesible con `anon` key. Pruebas pasadas en branch. Migración aplicada.

### Fase 3 — Operación interna (2 días)

| Grupo | Tablas | Patrón |
|---|---|---|
| ClickUp | `clickup_tasks`, `clickup_task_attachments`, `clickup_task_subtasks`, `clickup_task_mentions` | `authenticated` lee si pertenece al equipo/proyecto. Escritura solo service_role o admin. |
| Reuniones | `meeting_reports`, `project_meetings`, `project_meeting_recipients` (ya tiene comentario advirtiendo no usar `whatsapp_contacto` directamente) | Authenticated lee si está en `project_meeting_recipients` o pertenece al proyecto. |
| Design/UX | `design_ux_reports`, `design_ux_items`, `design_ux_time_logs`, `layout_reports`, `layout_report_comments`, `layout_breakpoints`, `page_breakpoint_hours` | Editor/diseñador ve su trabajo; admin ve todos. |
| Tiempo / tareas | `time_entries`, `recurring_tasks`, `content_tasks`, `task_dependencies`, `task_notifications`, `content_validation_notifications` | Owner ve lo suyo. |
| Marca | `brand_assets`, `brand_colors`, `brand_identities`, `external_brands`, `ai_brand_learnings`, `brand_ahrefs_competitor_cache` | Authenticated lee si pertenece al workspace de esa marca. |
| Documentos | `documents`, `documentos_base_conocimiento`, `archivos_adjuntos`, `resources_attachments`, `client_resources`, `project_resources` | Según ownership; admin acceso total. |

**Criterio de salida:** flujos internos siguen funcionando. QA manual verifica al menos: cargar dashboard de proyecto, ver tareas, ver tickets, ver contenidos.

### Fase 4 — Contenido y SEO operacional (1-2 días)

| Grupo | Tablas | Patrón |
|---|---|---|
| Contenido | `content_items` (915), `content_action_history` (1394), `content_comments`, `content_attachments`, `content_feedback`, `content_clusters` (15), `contenidos_backup`, `content_tasks`, `content_categories` | Authenticated del workspace ve. Escritura via Edge Function service_role. |
| Generación IA | `content_generation_logs` (1459, ya RLS), `content_generation_alerts` (124), `seo_content_swarm_runtime_config` (ya RLS), `audio_voice_profiles` (ya RLS), `content_audio_items` (ya RLS), `style_guides`, `writing_guides` | Service_role only. Confirmar que las RLS actuales tienen policies o si están denegando todo. |
| Backlinks | `backlinks`, `backlinks_metrics`, `backlink_history` (ya RLS), `backlink_prospects` (455, ya RLS), `backlink_prospect_projects`, `backlink_prospects_cassino`, `backlink_prospects_verabet` | Authenticated del workspace lee; escritura service_role. |
| Keyword research | `keyword_research` (1197), `keyword_research_approved` (763), `keyword_reserve_*` (4 tablas), `keywords_performance` | Authenticated lee si pertenece al proyecto; admin ve todo. |
| Ahrefs cache | `ahrefs_top_pages`, `ahrefs_traffic_history`, `ahrefs_geo_distribution`, `ahrefs_market_dominance_keywords`, `ahrefs_referring_domains`, `ahrefs_keyword_intent_metrics` | Authenticated lee si pertenece al proyecto. |
| Enlazado interno | `internal_link_candidates` (809), `internal_link_decisions` (76), `pages_articles`, `article_analysis_index` (910), `report_pages` | Idem. |
| Estrategia | `seo_strategies`, `strategy_allowed_anchors`, `strategy_anchor_distribution`, `strategy_keyword_objectives`, `strategy_verticals`, `seo_checklist_templates` (ya RLS), `seo_lab_report_runs` (ya RLS) | Authenticated del proyecto. |

**Criterio de salida:** generación de contenido sigue corriendo. Verificar `enrichment_pipeline_runs` (35) y `ils_pipeline_runs` (25) no se rompen.

### Fase 5 — Dashboards y catálogos (1 día)

| Grupo | Patrón |
|---|---|
| Catálogos (`task_priorities`, `task_statuses`, `languages`, `team_roles`, `categories` ya RLS, `categorias`, `subcategorias`, `topic_categories` 168, `business_calendar` 365) | Lectura pública para `authenticated`. Escritura solo `service_role`. |
| Dashboards (`dashboard_*` — ~30 tablas, casi todas vacías) | Si son cache de presentación: `authenticated` lee si pertenece al proyecto del registro. |
| Reputación (`rep_*` — ~15 tablas, vacías) | Idem. |
| Notificaciones (`notifications_outbox`, `projects_notifications`, `project_notification_settings`, `user_notification_settings`) | Service_role only para outbox; owner ve sus settings. |
| Comercio (`products` ya RLS, `orders` ya RLS, `cart_items` ya RLS, `order_items` ya RLS) | Revisar policies existentes. |

**Criterio de salida:** advisor de Supabase ya no reporta `rls_disabled` en `Light_House`.

### Fase 6 — Auditoría y cierre (½ día)

1. Ejecutar `mcp__2b07c2b1...__get_advisors` y confirmar 0 issues `rls_disabled` críticos.
2. Pruebas de regresión end-to-end de la aplicación con un usuario `authenticated` real (no admin) y con el frontend en producción.
3. Documentar policies finales en `referencias/rls-policies-light-house.md`.
4. Registrar evento de cierre en proyecto `Swarm Agentes MD`:
   ```sql
   INSERT INTO public.phase_events (event_type, phase, metadata)
   VALUES ('rls_hardening_completed', 'security', '{"project":"light_house","tables_covered":162,...}'::jsonb);
   ```
5. Notificar al dueño del producto y entregar el documento de policies.

---

## 6. Patrones de policy a usar (plantillas)

El técnico debe adaptar estos patrones; son referencia.

### 6.1 Service-role only (datos sensibles backend)

```sql
ALTER TABLE public.<tabla> ENABLE ROW LEVEL SECURITY;
-- Sin policies para anon/authenticated → acceso denegado.
-- service_role bypasea RLS por defecto.
```

### 6.2 Owner por `auth.uid()`

```sql
ALTER TABLE public.<tabla> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<tabla>_owner_select"
  ON public.<tabla> FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "<tabla>_owner_modify"
  ON public.<tabla> FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

### 6.3 Por workspace / proyecto (multi-tenant)

```sql
ALTER TABLE public.<tabla> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<tabla>_workspace_member_select"
  ON public.<tabla> FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_brands wb
      JOIN public.team_members tm ON tm.workspace_id = wb.workspace_id
      WHERE wb.brand_id = <tabla>.proyecto_id
        AND tm.user_id = auth.uid()
    )
  );
```

### 6.4 Catálogo público (lectura)

```sql
ALTER TABLE public.<tabla> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<tabla>_public_read"
  ON public.<tabla> FOR SELECT
  TO authenticated
  USING (true);
-- No policies de INSERT/UPDATE/DELETE → solo service_role escribe.
```

### 6.5 Admin override (combinable con anteriores)

```sql
CREATE POLICY "<tabla>_admin_all"
  ON public.<tabla> FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role IN ('admin','owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agency_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role IN ('admin','owner')
    )
  );
```

---

## 7. Plan de rollback

Si una fase rompe producción:

1. **No revertir RLS manualmente** sobre la marcha — eso reabre el agujero de seguridad.
2. Identificar la(s) tabla(s) que rompió la app (logs + reporte usuario).
3. Crear policy temporal permisiva para esa tabla mientras se diagnostica:
   ```sql
   CREATE POLICY "<tabla>_emergency_read"
     ON public.<tabla> FOR SELECT TO authenticated USING (true);
   ```
4. Diagnosticar y reemplazar la policy correcta.
5. Documentar el incidente.

**Rollback total de una fase:** revertir la migración usando el branch de Supabase, no `DROP POLICY` ad hoc.

---

## 8. Cómo verificar (criterios de aceptación)

Para cada fase, el técnico debe poder responder afirmativamente:

- [ ] La SQL está versionada como migración (no aplicada con `execute_sql`).
- [ ] Se probó en un branch de Supabase antes de producción.
- [ ] Un usuario `anon` (sin login) NO puede leer datos sensibles vía REST/PostgREST.
- [ ] Un usuario `authenticated` (login normal, no admin) ve solo lo suyo.
- [ ] El backend con `service_role` sigue operando normal.
- [ ] La aplicación frontend carga todas las pantallas previamente funcionales.
- [ ] `get_advisors` ya no reporta `rls_disabled` para las tablas de la fase.
- [ ] Las policies están documentadas en `referencias/rls-policies-light-house.md` con racional de negocio.

### Comandos de verificación rápida

```sql
-- Tablas sin RLS:
SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN (
    SELECT tablename FROM pg_tables t
    JOIN pg_class c ON c.relname = t.tablename
    WHERE c.relrowsecurity = true
  );

-- Tablas con RLS activo pero sin policies (peligroso: bloquean todo):
SELECT c.relname AS tabla
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relrowsecurity = true
  AND NOT EXISTS (
    SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
  );
```

---

## 9. Qué NO hacer

- **NO** ejecutar la `remediation_sql` masiva del advisor sin policies acompañantes.
- **NO** aplicar cambios directamente con `execute_sql` en producción. Usar `apply_migration` para trazabilidad.
- **NO** desactivar RLS de una tabla ya protegida sin documentar por qué.
- **NO** crear policies recursivas (que consulten la misma tabla en `USING`) sin testear performance.
- **NO** rotar la `anon key` durante este trabajo — no resuelve el problema y rompe la app. La rotación, si se decide, va después de tener RLS bien.
- **NO** tocar tablas del proyecto `Swarm Agentes MD` (ref `lwurzjrghzwzxbhrulyn`) en este trabajo. Es otro alcance.

---

## 10. Anexo A — Tablas con RLS ya activado (no se tocan, pero conviene auditar policies)

Estas tablas en `Light_House` ya tienen RLS activo (no aparecen en el advisor). Conviene confirmar que tienen policies definidas y no están denegando todo silenciosamente:

`clickup_tasks`, `proyectos_seo`, `team_member_skills`, `seo_content_swarm_runtime_config`, `content_generation_logs`, `content_feedback`, `audio_voice_profiles`, `content_audio_items`, `categories`, `resources_attachments`, `seo_checklist_templates`, `backlink_prospects`, `backlink_history`, `freelancer_invoice_settings`, `freelancer_invoice_events`, `freelancer_invoices`, `style_guides`, `workspace_brands`, `orbit_meetings`, `orbit_meeting_attendees`, `products`, `orders`, `order_items`, `cart_items`, `client_validation_summaries`, `smart_report_data_cache`, `smart_report_data_brand_competition`, `prospectos`, `project_resources`, `project_services`, `project_checklist_items`, `project_keyword_alerts`, `profiles`, `company_policies`, `certification_*` (varias), `agency_roles`, `team_members`, `seo_lab_report_runs`.

---

## 11. Anexo B — Contacto y trazabilidad

- **Inventario completo de tablas (162):** disponible vía `mcp__2b07c2b1...__list_tables` sobre `stjugsrkrweakvzmizpq`.
- **SQL de remediación inicial (NO ejecutar tal cual):** la entrega el advisor de Supabase como referencia de qué tablas tocar. Está guardado en el output del último `list_tables` ejecutado en esta sesión.
- **Reportar progreso en:** este mismo handover (actualizar checklist por fase) o crear un nuevo handover por fase completada.
- **Escalamiento:** dueño del producto, vía boti (`/boti`) con descripción del bloqueo.

---

## 12. Resumen de la decisión que se le pide al técnico

1. Confirma el plan de fases (puede ajustar orden si tiene mejor criterio).
2. Decide qué hacer con las tablas backup (borrar vs RLS denegando).
3. Implementa fase por fase con migraciones versionadas.
4. Documenta y entrega.

**Si algo del plan no calza con la realidad del código o el modelo de identidad, lo correcto es pausar, ajustar este handover, y continuar — no ejecutar a ciegas.**
