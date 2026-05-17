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
| S-001 | E. SP | Claude vía MCP | 2026-05-17 | 2026-05-17 | ✅ D-002 — Corrección del bug de silencio en nivel 3. Se agregó condición OR para re-alertar cuando `alert_level = 3` y `last_notified_at < now() - interval '2 days'`. Función actualizada en producción. |
| S-002 | G. Docs | Claude vía MCP | 2026-05-17 | 2026-05-17 | ✅ Documentación completa creada en `automations/seguimiento-solicitudes-clientes/` (7 archivos). |

---

## Cómo registrar tu sesión

```markdown
| S-NNN | <letra y nombre del área> | <identificador> | <fecha UTC> | <tarea breve> | en_curso |
```

## Cómo cerrar tu sesión

1. Mueve la fila a “Sesiones cerradas”.
2. Reemplaza el estado por `✅`, `❌` o `⏸`.
3. Si hay nuevos pendientes, agrégalos a [`AREAS.md`](AREAS.md).
4. Si tomaste una decisión importante, regístrala en “7.5. Decisiones tomadas” del [`README.md`](README.md).

## Reglas

1. **Un área activa = un agente activo.**
2. **Áreas en 🔴:** no trabajar en paralelo sin coordinar.
3. **Documentar siempre al cerrar.**
