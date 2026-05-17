# Áreas de trabajo — Backlinks Informe Mensual

> El proyecto está dividido en áreas separables para que múltiples agentes puedan trabajar en paralelo sin pisarse.  
> **Cada área = un agente activo a la vez.** Coordina vía [`WORK_IN_PROGRESS.md`](WORK_IN_PROGRESS.md).

---

## A. Integración frontend

**Responsabilidad:** construir o conectar el formulario de la aplicación para que el especialista off-page pueda registrar el informe mensual directamente desde la UI — marcando cada marca como `submitted` (con resumen) o `no_backlinks` (con justificación obligatoria).

**Archivos / componentes que tocas:**
- Tabla `backlink_monthly_reports` (INSERT / UPDATE de `status`, `report_summary`, `no_backlinks_reason`, `submitted_by`, `submitted_at`)
- Frontend: sección Off-Page → Backlinks → Informe Mensual por marca

**Estado:** 🔴 pendiente — hoy la actualización solo es posible directamente en BD.

**Pendientes en esta área:**
- Identificar el componente frontend existente de backlinks donde se añadirá el formulario de informe mensual.
- Diseñar el flujo: selector de mes, lista de marcas del especialista, campo de resumen / motivo, botón de cierre.
- Asegurar que el cierre de una marca actualice `backlink_monthly_reports` con `submitted_at = now()` y `submitted_by = user_id`.
- Validar que `no_backlinks_reason` sea obligatorio antes de permitir guardar con `status = no_backlinks`.

**Áreas con las que choca:** B (los datos de proyectos deben estar completos para que la lista de marcas sea correcta).

---

## B. Datos maestros — asignación de responsables

**Responsabilidad:** completar el campo `estrategaoffpage_id` en los proyectos que actualmente no tienen especialista off-page asignado. Sin este dato, esos proyectos igualmente generan escalación pero no tienen responsable explícito.

**Archivos / componentes que tocas:**
- Tabla `proyectos_seo` (campo `estrategaoffpage_id`)
- Tabla `users` (para verificar IDs válidos)

**Estado:** 🟡 parcial — 8 proyectos sin `estrategaoffpage_id` asignado.

**Proyectos con gap:**

| Proyecto | Dominio |
|----------|---------|
| Bathroom Remodeling | bathroomremodelbellevuewa.com |
| Crest View Landscaping | crestview-landscaping.com |
| Fort Worth Siding Pros | sidingfortworthpros.com |
| Grape Ideas | grapeideassite.com |
| Lead Gem | bathroomremodelbellevuewa.com |
| Tecsup | tecsup.edu.pe |
| Tree Removel Irvine | treeremovalirvineca.com |
| Water Damage Restoration | miamiflwaterdamagerestoration.com |

**Pendientes en esta área:**
- Confirmar con el equipo quién es el responsable de cada uno de estos 8 proyectos.
- Actualizar `estrategaoffpage_id` en `proyectos_seo` con el UUID correcto del usuario.

**Áreas con las que choca:** A (el frontend debe mostrar la lista correcta de marcas por responsable).

---

## C. Monitoreo y operación mensual

**Responsabilidad:** supervisar el ciclo mensual — verificar que los tres niveles de escalación se disparen correctamente, que el outbox se procese, y que el worker de Slack entregue los mensajes.

**Archivos / componentes que tocas:**
- Tabla `notifications_outbox` (revisión de `status`: `pending → sent / error`)
- Tabla `backlink_report_escalations` (verificar que los niveles se registren correctamente)
- GitHub Actions: logs del workflow `9-backlinks-report-escalation.yml`

**Estado:** 🟢 operativo — en espera del primer ciclo real (día 25 del mes en curso).

**Pendientes en esta área:**
- Verificar los logs del workflow el día 25 para confirmar que el Nivel 1 se disparó y llegó el DM.
- Verificar el día 29 si aplica (informe no completado).
- Confirmar que `backlink_report_escalations` registra correctamente cada nivel con `projects_pending`.
- Si hay mensajes con `status = error` en el outbox, diagnosticar y resolver.

**Áreas con las que choca:** D (mejoras técnicas no deben desplegarse en la ventana de días 25-33 del mes activo).

---

## D. Mejoras técnicas

**Responsabilidad:** mejoras de calidad y visibilidad del sistema sin cambiar el comportamiento externo observable.

**Archivos / componentes que tocas:**
- Workflow `9-backlinks-report-escalation.yml`
- Tablas `backlink_monthly_reports` y `backlink_report_escalations`
- Posible vista `v_backlinks_report_status`

**Estado:** 🟡 funcional, con mejoras identificadas.

**Pendientes en esta área:**

1. **Crear vista `v_backlinks_report_status`** que muestre en tiempo real el estado de todos los proyectos para el mes actual (qué marcas tienen `submitted`, `no_backlinks` o `pending`).

2. **Agregar campo `escalation_level_reached`** en `backlink_monthly_reports` para registrar si el informe se cerró antes de cualquier escalación, después del Nivel 1, Nivel 2 o Nivel 3.

3. **Índice de rendimiento** en `backlink_monthly_reports(proyecto_id, report_month)` si el volumen crece considerablemente.

4. **Notificación de cierre exitoso** — enviar un DM de confirmación a Richard cuando cierre el 100% de las marcas antes del plazo del día 28.

**Áreas con las que choca:** C (no desplegar cambios al workflow durante la ventana de escalación activa del mes).

---

## E. Documentación y gobierno

**Responsabilidad:** mantener este directorio coherente y actualizado — README, AGENT_ONBOARDING, AREAS, WORK_IN_PROGRESS. Bitácora de decisiones.

**Archivos / componentes que tocas:**
- Todo este directorio (`automations/backlinks-informe-mensual/`)

**Estado:** 🟢 formalizado (2026-05-17).

**Pendientes en esta área:**
- Definir owners (producto y técnico) y registrarlos en el README.
- Mantener actualizada la bitácora del README cada vez que se cierre una sesión o se tome una decisión.

**Áreas con las que choca:** ninguna directamente.

---

## Tabla resumen — choque entre áreas

| | A. Frontend | B. Datos | C. Monitoreo | D. Mejoras | E. Docs |
|---|---|---|---|---|---|
| **A. Frontend** | — | 🔴 | | 🟡 | |
| **B. Datos** | 🔴 | — | | | |
| **C. Monitoreo** | | | — | 🔴 | |
| **D. Mejoras** | 🟡 | | 🔴 | — | |
| **E. Docs** | | | | | — |

- 🔴 alto riesgo de choque (no trabajar en paralelo sin coordinar)
- 🟡 riesgo medio (coordinar antes de tocar)
- vacío = compatibles en paralelo

---

## Orden de ejecución recomendado

1. **B (Datos)** → asignar `estrategaoffpage_id` a proyectos sin responsable
2. **A (Frontend)** → integrar formulario de cierre de informe mensual
3. **C (Monitoreo)** → supervisar primer ciclo real (día 25 del mes activo)
4. **D (Mejoras)** → mejoras técnicas post-primer ciclo verificado
5. **E (Docs)** → continua, sin bloquear nada
