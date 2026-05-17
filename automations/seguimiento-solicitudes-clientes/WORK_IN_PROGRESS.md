# Trabajo en curso — Seguimiento Escalado de Solicitudes

> Registro vivo de qué agente está trabajando en qué área. Evita que dos chats se pisen.
> **Antes de empezar:** verifica que tu área no esté tomada y añade tu fila al final.
> **Cuando termines:** marca tu sesión como cerrada o transfiere.

---

## Sesiones activas

| Sesión | Área | Owner | Inicio | Tarea | Estado |
|---|---|---|---|---|---|

---

## Sesiones cerradas (historial)

| Sesión | Área | Owner | Inicio | Cierre | Resultado |
|---|---|---|---|---|---|
| S-001 | E. SP | Claude vía MCP | 2026-05-17 | 2026-05-17 | ✅ D-002 — Corrección del bug de silencio en nivel 3. Se agregó condición OR para re-alertar cuando `alert_level = 3` y `last_notified_at < now() - interval '2 days'`. Función `run_client_requests_attention_check` actualizada en producción (`Light_House`). |
| S-002 | G. Docs | Claude vía MCP | 2026-05-17 | 2026-05-17 | ✅ Documentación inicial creada en `automations/seguimiento-solicitudes-clientes/` siguiendo la convención del repositorio. 7 archivos: README, AGENT_ONBOARDING, AREAS, WORK_IN_PROGRESS, arquitectura, componentes, runbook. |

---

## Cómo registrar tu sesión

Añade una fila a "Sesiones activas" con este formato antes de empezar:

```markdown
| S-NNN | <letra y nombre del área de AREAS.md> | <tu identificador> | <fecha UTC> | <descripción breve> | en_curso |
```

## Cómo cerrar tu sesión

1. Mueve tu fila de "Sesiones activas" a "Sesiones cerradas (historial)".
2. Reemplaza el estado por `✅ <resultado>`, `❌ <motivo>` o `⏸ <transferido/pausado>`.
3. Si descubriste pendientes nuevos, agrégalos a [`AREAS.md`](AREAS.md).
4. Si tomaste una decisión que afecta a otros, regístrala en "7.5. Decisiones tomadas" del [`README.md`](README.md).

## Reglas

1. **Un área activa = un agente activo.** Si tu área tiene fila activa, no la toques sin coordinación.
2. **Áreas en 🔴** (ver `AREAS.md`): no trabajar en paralelo sin coordinar.
3. **Documentar siempre al cerrar** — la bitácora del README es el registro permanente.
