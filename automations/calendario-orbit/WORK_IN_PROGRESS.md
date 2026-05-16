# Trabajo en curso — Sincronía · Calendario y reuniones de Orbit

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
| S-001 | D. Docs | Claude vía MCP | 2026-05-15 | 2026-05-15 | ✅ Diagnóstico inicial de las 6 automatizaciones de `Light_House`. Salida: [`referencias/diagnostico-automatizaciones-lighthouse.md`](../../referencias/diagnostico-automatizaciones-lighthouse.md). |
| S-002 | D. Docs | Claude vía MCP | 2026-05-15 | 2026-05-15 | ✅ Análisis del ecosistema de calendario; identificación de los dos sistemas paralelos. Salida: [`referencias/analisis-ecosistema-calendario.md`](../../referencias/analisis-ecosistema-calendario.md). |
| S-003 | A. Backend | Claude vía MCP | 2026-05-15 | 2026-05-15 | ✅ D-001 — Saneamiento del outbox: `claim_due_notifications` filtra por canal, reaper (`reset_stuck_outbox_notifications` + cron `outbox-stuck-reaper`), worker WhatsApp v18 reescrito. 8 mensajes atascados marcados como `cancelled`. |
| S-004 | A. Backend | Claude vía MCP | 2026-05-15 | 2026-05-15 | ✅ D-002 — Fase 1 con Google Calendar: columna `google_calendar_event_id`, edge function `orbit-meeting-sync` (v1) con acciones `create`/`update`/`cancel`, trigger `trg_orbit_meeting_sync`. Verificación parcial (token sin scope). |
| S-005 | B. Front-end (preparación) | Claude vía MCP | 2026-05-15 | 2026-05-15 | ✅ Handoff para el front-end + prompts para su herramienta de IA. Salidas: [`handovers/2026-05-16-sincronia-handoff-frontend.md`](../../handovers/2026-05-16-sincronia-handoff-frontend.md), [`handovers/2026-05-16-sincronia-prompts-frontend-ia.md`](../../handovers/2026-05-16-sincronia-prompts-frontend-ia.md). |
| S-006 | C. Configuración | Externo (compañero de la agencia) | 2026-05-16 | 2026-05-16 | ✅ D-003 (config) — Credenciales OAuth de Google regeneradas con scope `calendar.events`. Cuenta `accesos@seolabagency.com`, app OAuth "In production". Los 3 secrets cargados en Supabase. |
| S-007 | A. Backend | Claude vía MCP | 2026-05-16 | 2026-05-16 | ✅ D-003 (verificación) — Prueba E2E del pipeline construido en S-004 con credenciales reales: `create` (HTTP 200, evento + Meet generados, 1.2 s) y `cancel` (HTTP 200, evento eliminado, 0.8 s). **Backend operativo end-to-end.** |
| S-008 | D. Docs | Claude vía MCP | 2026-05-16 | 2026-05-16 | ✅ D-004 — Documentación migrada al repo `Agents_Automations` siguiendo la convención existente (README, AGENT_ONBOARDING, AREAS, este archivo). |

---

## Cómo registrar tu sesión

Añade una fila a "Sesiones activas" con este formato, en el commit que inicia tu trabajo:

```markdown
| S-NNN | <letra y nombre del área de AREAS.md> | <tu identificador> | <fecha+hora UTC> | <descripción breve> | en_curso |
```

**Identificador:** usa algo que el usuario pueda asociar al chat. Ejemplo: `Claude-chat-frontend` o `Compañero-frontend-Lovable`.

**Descripción breve:** 1 línea. Ejemplo: "Implementar formulario de Agendar reunión + INSERT en orbit_meetings + asistentes".

---

## Cómo cerrar tu sesión

1. Mueve tu fila de "Sesiones activas" a "Sesiones cerradas (historial)".
2. Reemplaza el estado por `✅ <resultado en 1 línea>` o `❌ <motivo del cierre>` o `⏸ <transferido a / pausado por>`.
3. Asigna un ID de sesión incremental si quedó sin asignar.
4. Si descubriste pendientes nuevos, agrégalos a la sección correspondiente de [`AREAS.md`](AREAS.md).
5. Si tomaste una decisión que afecta a otros, regístrala en la sección "7.5. Decisiones tomadas" del [`README.md`](README.md).

---

## Reglas

1. **Un área activa = un agente activo.** Si tu área tiene fila en "Sesiones activas" con otro owner, **NO toques esa área**. Coordina o elige otra.
2. **Áreas en 🔴 (alto choque, ver `AREAS.md`):** ej. si Front-end (B) está activo y quieres cambiar el contrato del backend (A), espera o coordina.
3. **RLS (I) puede tumbar al front (B):** coordinar siempre antes de tocar políticas de seguridad.
4. **Si el área que necesitas está tomada y no hay forma de esperar:** crea una sesión nueva con estado `⏸ esperando S-NNN` y avisa al usuario.
