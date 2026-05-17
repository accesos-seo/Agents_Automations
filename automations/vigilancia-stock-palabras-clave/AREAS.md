# Áreas de trabajo — Vigilancia de Stock de Palabras Clave

> El proyecto está dividido en áreas separables para que múltiples agentes puedan trabajar en paralelo sin pisarse.  
> **Cada área = un agente activo a la vez.** Coordina vía [`WORK_IN_PROGRESS.md`](WORK_IN_PROGRESS.md).

---

## A. Activación del sistema

**Responsabilidad:** encender la automatización de forma controlada y supervisada — resetear el estado de alertas, ejecutar el primer ciclo y verificar que las notificaciones lleguen correctamente.

**Archivos / componentes que tocas:**
- Tabla `project_keyword_alerts` (UPDATE de `is_active`, `resolved_at`, `alert_level`)
- Función `fn_check_keyword_reserve()` (ejecución supervisada)
- Tabla `notifications_outbox` (verificación de filas generadas)
- n8n: schedule del trigger

**Decisiones tomadas que aplican aquí:** D-004 (sistema apagado desde 2026-05-07).

**Estado:** ⚪ pendiente — esperando decisión del equipo.

**Pendientes en esta área:**
- Definir fecha de activación.
- Resetear `project_keyword_alerts` de los proyectos en déficit (`is_active = true`, `resolved_at = null`).
- Ejecutar `SELECT * FROM fn_check_keyword_reserve()` supervisado y verificar outbox.
- Confirmar llegada de mensajes Slack en el canal correcto y DMs correctos.
- Activar el schedule en n8n.

**Áreas con las que choca:** B (datos maestros deben estar completos antes de activar), C (configuración de umbrales y canales antes de activar).

---

## B. Datos maestros — asignación de responsables

**Responsabilidad:** completar los campos de responsables en `proyectos_seo` para garantizar que todos los proyectos en déficit tengan cobertura en los 3 niveles de escalamiento.

**Archivos / componentes que tocas:**
- Tabla `proyectos_seo` (campos `seoestrategista_id`, `slack_channel_id`, `director_id`, `lider_id`)
- Tabla `users` (para verificar IDs válidos)

**Estado:** 🔴 incompleto — varios proyectos sin responsables asignados.

**Proyectos con gaps actuales:**

| Proyecto | Sin especialista | Sin canal Slack | Sin director |
|----------|-----------------|-----------------|---------------|
| Bathroom Remodel Durham | ✗ | — | — |
| Bathroom Remodeling | ✗ | ✗ | — |
| Crest View Landscaping | ✗ | ✗ | — |
| Fort Worth Siding Pros | ✗ | ✗ | — |
| Lead Gem | ✗ | — | — |
| SeoLab Agency | ✗ | — | — |
| Toonkids | ✗ | — | — |
| Tree Removel irvine | ✗ | ✗ | — |
| Water Damage Restoration | ✗ | ✗ | — |
| Grape Ideas | — | ✗ | — |
| Doug Construction | — | ✗ | — |

**Pendientes en esta área:**
- Asignar `seoestrategista_id` a los 9 proyectos que no tienen especialista (sin esto, Nivel 1 no dispara).
- Configurar `slack_channel_id` en los 8 proyectos sin canal (sin esto, Nivel 2 no dispara).
- Verificar que todos los IDs apunten a usuarios reales en la tabla `users`.

**Áreas con las que choca:** A (no activar hasta que esto esté completo).

---

## C. Configuración — umbrales y canales

**Responsabilidad:** ajustar la configuración operativa del sistema — umbral de keywords y canal de directiva para el Nivel 3.

**Archivos / componentes que tocas:**
- Campo `keyword_reserve_target` en `proyectos_seo` (umbral por proyecto)
- Tabla `keyword_reserve_settings` (agregar `alerts_directiva_channel_id`)
- Función `fn_check_keyword_reserve()` (ajustar Nivel 3 para usar canal de grupo si se decide)

**Estado:** 🟡 decisión pendiente del dueño del producto.

**Pendientes en esta área:**
- Decidir umbral correcto: 36 (actual en DB) vs 40 (política operativa del equipo).
  - Si se cambia a 40: `UPDATE proyectos_seo SET keyword_reserve_target = 40 WHERE suspendido IS NOT TRUE`.
- Decidir si el Nivel 3 va a un canal de grupo de directiva (en vez de solo DM individual).
  - Si sí: insertar `alerts_directiva_channel_id` en `keyword_reserve_settings` y actualizar la función.

**Áreas con las que choca:** A (configuración debe estar lista antes de activar), D (cambios al motor si se modifica el Nivel 3).

---

## D. Motor SQL — mejoras técnicas

**Responsabilidad:** mejoras de calidad y robustez del motor de la automatización sin cambiar el comportamiento externo observable.

**Archivos / componentes que tocas:**
- Función `fn_check_keyword_reserve()` (motor principal)
- Vista `v_keyword_reserve_status`
- Función `fn_keyword_reserve_is_business_day()`
- Función `fn_keyword_reserve_inventory_count()`
- Tabla `keyword_reserve_daily_snapshots`
- Tabla `keyword_reserve_monitored_projects`

**Estado:** 🟡 funcional con observaciones técnicas.

**Pendientes en esta área:**

1. **Unificar lógica de conteo de keywords.** Hay tres funciones con criterios distintos:
   - `v_keyword_reserve_status`: cuenta `pending`
   - `fn_keyword_reserve_inventory_count`: cuenta `pending + in_use`
   - `get_keyword_alerts_data`: cuenta `pending + approved`
   → Definir cuál es el criterio correcto y alinear las tres.

2. **Integrar `business_calendar`** en `fn_keyword_reserve_is_business_day()`. Hoy usa un check simple Mon–Vie (UTC-5 fijo). La tabla de festivos existe y no se usa.

3. **Conectar `keyword_reserve_monitored_projects`** al motor. Hoy es una tabla huérfana con 9 proyectos (todos `enabled=false`). O se conecta como filtro real, o se depreca.

4. **Enriquecer `keyword_reserve_daily_snapshots`** para registrar `reserve_status` y `alert_level` además del conteo. El historial actual es limitado.

5. **Actualizar campos `is_active` y `consecutive_days_below`** en el bucle de `fn_check_keyword_reserve()`. Hoy esos campos se escriben en el primer ciclo pero no se mantienen en ciclos posteriores.

**Áreas con las que choca:** A (no modificar el motor justo antes de la primera activación supervisada — mejor estabilizar primero, mejorar después), C (si se cambia el Nivel 3 para usar canal de grupo).

---

## E. Documentación y gobierno

**Responsabilidad:** mantener este directorio coherente y actualizado — README, AGENT_ONBOARDING, AREAS, WORK_IN_PROGRESS. Bitácora de decisiones.

**Archivos / componentes que tocas:**
- Todo este directorio (`automations/vigilancia-stock-palabras-clave/`)

**Estado:** 🟢 formalizado (2026-05-17).

**Pendientes en esta área:**
- Definir owners (producto y técnico) y registrarlos en el README.
- Mantener actualizada la bitácora del README cada vez que se cierre una sesión o se tome una decisión.

**Áreas con las que choca:** ninguna directamente.

---

## Tabla resumen — choque entre áreas

| | A. Activación | B. Datos | C. Config | D. Motor | E. Docs |
|---|---|---|---|---|---|
| **A. Activación** | — | 🔴 | 🔴 | 🟡 | |
| **B. Datos** | 🔴 | — | | | |
| **C. Config** | 🔴 | | — | 🟡 | |
| **D. Motor** | 🟡 | | 🟡 | — | |
| **E. Docs** | | | | | — |

- 🔴 alto riesgo de choque (no trabajar en paralelo sin coordinar)
- 🟡 riesgo medio (coordinar antes de tocar)
- vacío = compatibles en paralelo

---

## Orden de ejecución recomendado

1. **B (Datos)** → completar responsables en proyectos con gaps
2. **C (Config)** → decidir umbral y canal de directiva
3. **A (Activación)** → encender el sistema de forma supervisada
4. **D (Motor)** → mejoras técnicas post-activación
5. **E (Docs)** → continua, sin bloquear nada
