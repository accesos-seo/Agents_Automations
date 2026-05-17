# Backlinks — Informe Mensual

**Automation key:** `backlinks-informe-mensual`  
**Versión actual:** 1.0 (operativa)  
**Estado:** `active` / `operational`  
**Construida:** 2026-05-17  
**Última revisión:** 2026-05-17  
**Owner producto:** _por definir_  
**Owner técnico:** _por definir_

Automatización de seguimiento y escalación del informe mensual de backlinks. El código vive **dentro del proyecto Supabase `Light_House`** (`stjugsrkrweakvzmizpq`) y en el workflow de GitHub Actions del repositorio `accesos-seo/github-automation`. Este directorio es el **plano de control** y **bitácora viva** de la automatización.

---

## 1. Qué hace

Supervisa que el especialista off-page (Richard Virona) registre el informe mensual de backlinks para cada marca activa antes del **día 28 de cada mes**. Si no lo hace, dispara una cadena de escalación automática por Slack en tres niveles — sin intervención manual.

El especialista puede cerrar el informe de dos formas:
- **`submitted`** — registró backlinks reales para esa marca en el mes.
- **`no_backlinks`** — declara explícitamente que la marca no tuvo actividad de backlinks ese mes, con una nota justificativa obligatoria.

Ambas formas cierran el ciclo para esa marca. Solo las marcas sin ninguna de estas dos entradas generan escalación.

**Flujo de escalación:**

| Nivel | Cuándo | Destinatario | Canal |
|-------|--------|--------------|-------|
| 1 — Aviso previo | Día 25 del mes (3 días antes del plazo) | Especialista off-page | DM Slack |
| 2 — Alerta interna | Día 29 del mes (1 día después del plazo + 4 días del aviso) | Grupo interno SEO | `#interno-equipo-seo` |
| 3 — Escalación directiva | Día ~33 del mes (8 días después del aviso inicial, ~día 2-5 del mes siguiente) | Grupo directiva | `#leadership-team` |

> Para el detalle técnico del flujo ver la sección 4 de este documento.

---

## 2. Configuración

| Config | Valor |
|--------|-------|
| Runtime Supabase | `stjugsrkrweakvzmizpq` (`Light_House`) |
| Workflow GitHub Actions | `accesos-seo/github-automation` — `9-backlinks-report-escalation.yml` |
| Schedule del workflow | Diario — `0 13 * * *` (1 PM UTC = 8 AM Bogotá) |
| Zona horaria operativa | `America/Bogota` (UTC-5, sin DST) |
| Plazo mensual del informe | Día 28 de cada mes |
| Especialista responsable | Richard Virona (`84843461-b748-43cc-840e-74aaa7ab3526`) |
| Slack ID del especialista | `U055CS6HE3T` |
| Canal nivel 2 (interno) | `C09SN85SGKC` (`#interno-equipo-seo`) |
| Canal nivel 3 (directiva) | `C0AFHECQWRX` (`#leadership-team`) |

---

## 3. Componentes (inventario)

### 3.1 Tablas (en `Light_House`)

| Tabla | Rol |
|-------|-----|
| `proyectos_seo` | Fuente de proyectos activos. Se filtran con `valida_backlinks = true` y `suspendido IS NOT TRUE`. |
| `backlink_monthly_reports` | **Registro central.** Una fila por proyecto por mes. Almacena el status del informe, el resumen redactado y el motivo de ausencia si aplica. |
| `backlink_report_escalations` | **Control de deduplicación.** Garantiza que cada nivel de escalación se envíe como máximo una vez por mes, aunque el workflow se ejecute varias veces. |
| `notifications_outbox` | Cola de salida de notificaciones procesada por el worker de Slack. Source: `backlinks_report_escalation`. |

### 3.2 Esquema de `backlink_monthly_reports`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | PK |
| `proyecto_id` | UUID | FK a `proyectos_seo`. Clave compuesta con `report_month`. |
| `report_month` | VARCHAR(7) | Formato `YYYY-MM`. Ej: `2026-05`. |
| `status` | VARCHAR(20) | `pending` / `submitted` / `no_backlinks` |
| `submitted_by` | UUID | Usuario que cerró el informe |
| `submitted_at` | TIMESTAMPTZ | Momento del cierre |
| `report_summary` | TEXT | Resumen libre del trabajo realizado ese mes |
| `no_backlinks_reason` | TEXT | Obligatorio cuando `status = no_backlinks` |
| `total_backlinks_added` | INTEGER | Cantidad de backlinks del mes |
| `total_cost` | NUMERIC | Inversión total del mes |

### 3.3 Esquema de `backlink_report_escalations`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | PK |
| `report_month` | VARCHAR(7) | Mes evaluado (`YYYY-MM`) |
| `escalation_level` | INTEGER | 1, 2 o 3 |
| `triggered_at` | TIMESTAMPTZ | Momento del disparo |
| `projects_pending` | JSONB | Lista de proyectos pendientes al momento del disparo |
| `notification_count` | INTEGER | Filas insertadas en `notifications_outbox` |

### 3.4 Workflow GitHub Actions

| Campo | Detalle |
|-------|---------|
| Archivo | `.github/workflows/9-backlinks-report-escalation.yml` |
| Repo | `accesos-seo/github-automation` |
| Trigger automático | Cron diario `0 13 * * *` |
| Trigger manual | `workflow_dispatch` con parámetros `force_level` y `force_month` |
| Secrets requeridos | `SUPABASE_URL`, `SUPABASE_KEY` (ya existentes) |
| Canales Slack | Hardcodeados directamente — no requieren secrets adicionales |

### 3.5 Mensajes generados (texto exacto por nivel)

**Nivel 1 — DM al especialista (día 25):**
```
📋 *Recordatorio — Informe de Backlinks · Mayo 2026*

Hola Richard 👋 El plazo para cerrar el informe mensual de backlinks
es el *28 de mayo*. Tienes 3 días.

Por favor registra el informe de cada marca en el sistema.
Si una marca *no tuvo actividad este mes*, márcala como
*"Sin backlinks este mes"* y deja una nota explicativa —
ese registro también cierra el informe de esa marca.

*Marcas pendientes (N):*
  • *Armor Corp* — blindajes360.com
  • *Bethaus* — Bethaus.com
  • ...

Ingresa el informe desde *Off-Page → Backlinks → Informe Mensual* de cada marca.
```

**Nivel 2 — Canal interno (día 29):**
```
⚠️ *Informe de Backlinks sin entregar — Mayo 2026*

El plazo venció el 28 de mayo. El especialista off-page no ha registrado
el informe mensual de backlinks para N marca(s).

*Marcas pendientes:*
  • *Armor Corp* — blindajes360.com
  • *Bethaus* — Bethaus.com
  • ...

Responsable: <@U055CS6HE3T>

_Si una marca no tuvo backlinks este mes, debe igualmente registrar una
nota en el sistema indicándolo._
```

**Nivel 3 — Canal directiva (día ~33):**
```
🚨 *Escalación Directiva — Informe de Backlinks — Mayo 2026*

Han transcurrido 8 días desde el primer aviso y el especialista off-page
<@U055CS6HE3T> *no ha completado* el informe mensual de backlinks
para N marca(s).

*Marcas sin informe:*
  • *Armor Corp* — blindajes360.com
  • *Bethaus* — Bethaus.com
  • ...

Este es el nivel de escalación máximo. Se requiere intervención.
```

---

## 4. Flujo end-to-end

```
1. SCHEDULE: GitHub Actions ejecuta el workflow diariamente a las 8 AM Bogotá
   ↓
2. DETERMINACIÓN DEL NIVEL
   ├── Día 25 del mes → Nivel 1 (DM al especialista)
   ├── Día 29 del mes → Nivel 2 (canal interno)
   └── Día 25 del mes anterior + 8 días → Nivel 3 (canal directiva)
   ↓
3. VERIFICACIÓN DE DEDUPLICACIÓN
   Consulta backlink_report_escalations:
   ├── Si ya existe fila con (report_month, escalation_level) → STOP, ya se envió
   └── Si no existe → continúa
   ↓
4. PROYECTOS PENDIENTES
   Consulta proyectos_seo (valida_backlinks=true, suspendido=false)
   Consulta backlink_monthly_reports (status IN submitted, no_backlinks)
   Calcula: pending = all_projects - submitted_projects
   ├── Si pending = [] → registra escalación sin notificaciones, STOP
   └── Si pending > 0 → construye mensaje con lista completa
   ↓
5. OUTBOX notifications_outbox
   Inserta 1 fila con source='backlinks_report_escalation'
   dedupe_key = 'backlinks_report_L{level}_{report_month}'
   ↓
6. REGISTRO DE ESCALACIÓN
   Inserta fila en backlink_report_escalations
   (report_month, escalation_level, projects_pending, notification_count)
   ↓
7. WORKER DE SLACK
   Lee el outbox, envía mensaje (DM o canal), actualiza status='sent'
```

**Estados del informe por proyecto:**

| Status | Significado | ¿Detiene la escalación? |
|--------|-------------|------------------------|
| `pending` | Sin informe registrado | No — aparece en todos los avisos |
| `submitted` | Backlinks reales registrados | Sí — no aparece en avisos |
| `no_backlinks` | Sin actividad declarada + nota | Sí — no aparece en avisos |

---

## 5. Estado actual (2026-05-17)

| Indicador | Valor |
|-----------|-------|
| Workflow GitHub Actions | 🟢 desplegado y activo |
| Tablas en Supabase | 🟢 `backlink_monthly_reports` y `backlink_report_escalations` creadas |
| Canales Slack verificados | 🟢 DM, `#interno-equipo-seo`, `#leadership-team` confirmados |
| Primer ciclo ejecutado | ⚪ pendiente — primer disparo será el día 25 del mes en curso |
| Proyectos activos en scope | 22 (todos con `valida_backlinks = true`) |
| Informes cerrados para 2026-05 | 0 (tabla `backlink_monthly_reports` vacía — mes en curso) |

**Proyectos activos en scope:**

| Proyecto | Dominio | Estratega off-page asignado |
|----------|---------|----------------------------|
| Armor Corp | blindajes360.com | Richard Virona ✅ |
| Bathroom Remodel Durham | bathroomremodelingdurham.com | Richard Virona ✅ |
| Bathroom Remodeling | bathroomremodelbellevuewa.com | Sin asignar |
| Bethaus | Bethaus.com | Richard Virona ✅ |
| Cassino Bet | cassino.bet.br | Richard Virona ✅ |
| Crest View Landscaping | crestview-landscaping.com | Sin asignar |
| Doug Construction | dougconstructionllc.com | Richard Virona ✅ |
| Educa College Prep | educacollegeprep.com | Richard Virona ✅ |
| Floty | floty.mx | Richard Virona ✅ |
| Fort Worth Siding Pros | sidingfortworthpros.com | Sin asignar |
| Grape Ideas | grapeideassite.com | Sin asignar |
| Holisteek | holisteek.com | Richard Virona ✅ |
| Lead Gem | bathroomremodelbellevuewa.com | Sin asignar |
| Leasy | leasyauto.com | Richard Virona ✅ |
| SeoLab Agency | seolabagency.com | Richard Virona ✅ |
| SunGate Digital | sungatedigital.com | Richard Virona ✅ |
| Tecsup | tecsup.edu.pe | Sin asignar |
| Toonkids | toonkids.com | Richard Virona ✅ |
| Tree Removel Irvine | treeremovalirvineca.com | Sin asignar |
| Vera Bet | vera.bet.br | Richard Virona ✅ |
| Vozy.ai | vozy.ai | Richard Virona ✅ |
| Water Damage Restoration | miamiflwaterdamagerestoration.com | Sin asignar |

---

## 6. Decisiones pendientes del dueño del producto

| Decisión | Opciones | Estado |
|----------|----------|--------|
| ¿Asignar `estrategaoffpage_id` a proyectos sin responsable? | 8 proyectos sin asignar — hoy igual se escalará por ellos | Pendiente |
| ¿Integrar el formulario del frontend? | Permitir al especialista marcar `submitted` / `no_backlinks` desde la UI | Pendiente — hoy requiere actualización directa en BD |
| ¿Extender el scope a proyectos con `valida_backlinks = false`? | Excluidos actualmente | Pendiente |

---

## 7. Optimizaciones priorizadas

### Inmediatas (antes del día 25)
1. Confirmar que el worker de Slack está activo y procesando el outbox correctamente para DMs y canales.
2. Integrar el formulario del frontend para que Richard pueda marcar informes desde la UI.

### Quick wins (1-2 días)
3. Asignar `estrategaoffpage_id` a los 8 proyectos sin responsable definido.
4. Agregar índice en `backlink_monthly_reports(proyecto_id, report_month)` si la tabla crece.

### Medianas (3-5 días)
5. Crear vista `v_backlinks_report_status` que muestre en tiempo real el estado de todos los proyectos para el mes actual.
6. Añadir campo `escalation_level_reached` en `backlink_monthly_reports` para trazabilidad (saber si un proyecto se cerró antes o después de recibir escalación).

### Estratégicas (1-2 semanas)
7. Dashboard interno con estado del informe por marca y mes (cuántas pendientes, cuántas en `no_backlinks`, historial de cumplimiento por responsable).
8. Notificación de confirmación a Richard cuando cierra el informe de todas las marcas antes del plazo.

---

## 8. Decisiones tomadas

| ID | Fecha | Decisión | Detalle |
|----|-------|----------|---------|
| D-001 | 2026-05-17 | **Arquitectura de tablas** | Se crean `backlink_monthly_reports` y `backlink_report_escalations`. La primera registra el informe; la segunda garantiza deduplicación. El campo `no_backlinks_reason` es obligatorio para el fallback. |
| D-002 | 2026-05-17 | **Canales Slack hardcodeados** | Los IDs de canal se verificaron directamente vía Slack MCP y se hardcodean en el workflow. No se requieren secrets adicionales de GitHub. Canal interno: `C09SN85SGKC`. Canal directiva: `C0AFHECQWRX`. |
| D-003 | 2026-05-17 | **Mensaje único por nivel** | Un solo mensaje por nivel de escalación con la lista completa de marcas pendientes. No un mensaje por marca. El workflow recalcula en tiempo real qué marcas siguen pendientes antes de cada envío. |
| D-004 | 2026-05-17 | **Scope: todos los proyectos con `valida_backlinks = true`** | Se incluyen los 22 proyectos activos, independientemente de si tienen `estrategaoffpage_id` asignado. |

---

## 9. Bitácora

| Fecha | Evento |
|-------|--------|
| 2026-05-17 | Construcción inicial del sistema: tablas en Supabase, workflow `9-backlinks-report-escalation.yml` en `github-automation`, canales Slack verificados. Documentación creada en `Agents_Automations`. |
