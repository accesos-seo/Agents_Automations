# Trabajo en curso — Minuta de reuniones de cliente

Registro vivo de qué agente está trabajando en qué área. Evita que dos chats se pisen. Antes de empezar: verifica que tu área no esté tomada y añade tu fila al final. Cuando termines: marca tu sesión como cerrada o transfiere.

## Sesiones activas

| Sesión | Área | Owner | Inicio | Tarea | Estado |
|---|---|---|---|---|---|

## Sesiones cerradas (historial)

| Sesión | Área | Owner | Inicio | Cierre | Resultado |
|---|---|---|---|---|---|
| S-001 | D. Docs (transversal) | Claude vía Cowork (sesión con accesos@seolabagency.com) | 2026-05-16 | 2026-05-16 | ✅ Diagnóstico inicial del ecosistema de reuniones de Light_House (6 piezas existentes inventariadas: orbit_meetings, project_meetings, meeting_reports, automation_orkesta.*, edge functions boti-meeting-generator, orbit-meeting-sync, orbit-meeting-notify, cms-create-google-doc, notifications_outbox). |
| S-002 | D. Docs (transversal) | Claude vía Cowork | 2026-05-16 | 2026-05-16 | ✅ Investigación de la API de tl;dv v1alpha1 (endpoints: /meetings, /meetings/{id}, /transcript, /highlights, /notes) y de los eventos de webhook (MeetingReady incluye organizer/invitees; TranscriptReady solo trae los segmentos). |
| S-003 | B. Schema (diseño) | Claude vía Cowork | 2026-05-16 | 2026-05-16 | ✅ Diseño del schema meetings_intelligence (13 tablas + 5 enums + triggers set_updated_at + esqueleto de RLS). DDL ejecutable listo en Documentacion_Reuniones_Inteligentes_tldv_Supabase.docx (Anexo A). D-001, D-002, D-003 registradas. |
| S-004 | D. Docs (transversal) | Claude vía Cowork | 2026-05-16 | 2026-05-16 | ✅ Documentación técnica extensa (44 páginas, Word) entregada: arquitectura, flujo end-to-end, configuración tl;dv, plan por fases, KPIs, riesgos, anexos con DDL/prompt/plantilla HTML. |
| S-005 | D. Docs (transversal) | Claude vía Cowork | 2026-05-16 | 2026-05-16 | ✅ Publicación de esta automatización en Agents_Automations siguiendo la convención de calendario-orbit: README + AGENT_ONBOARDING + AREAS + este archivo + arquitectura + componentes + runbook + configuracion/guia-tldv-webhooks.md. |

## Cómo registrar tu sesión

Añade una fila a "Sesiones activas" con este formato, en el commit que inicia tu trabajo:

```
| S-NNN | <letra y nombre del área de AREAS.md> | <tu identificador> | <fecha+hora UTC> | <descripción breve> | en_curso |
```

**Identificador:** usa algo que el usuario pueda asociar al chat. Ejemplo: `Claude-chat-receiver` o `Compañero-IA-prompt-v1`.

**Descripción breve:** 1 línea. Ejemplo: "Implementar tldv-webhook-receiver con HMAC + idempotencia + dispatch async al orquestador".

## Cómo cerrar tu sesión

1. Mueve tu fila de "Sesiones activas" a "Sesiones cerradas (historial)".
2. Reemplaza el estado por `✅ <resultado en 1 línea>` o `❌ <motivo del cierre>` o `⏸ <transferido a / pausado por>`.
3. Asigna un ID de sesión incremental si quedó sin asignar.
4. Si descubriste pendientes nuevos, agrégalos a la sección correspondiente de `AREAS.md`.
5. Si tomaste una decisión que afecta a otros, regístrala en la sección "7.5. Decisiones tomadas" del `README.md`.

## Reglas

- **Un área activa = un agente activo.** Si tu área tiene fila en "Sesiones activas" con otro owner, NO toques esa área. Coordina o elige otra.
- **Áreas en 🔴 (alto choque, ver `AREAS.md`):** ej. si Schema (B) está activo y quieres agregar el receiver (C), espera o coordina porque C depende de tablas que B podría estar moviendo.
- **El área de Setup (A) bloquea todo.** Sin secrets cargados ninguna edge function funciona. Prioriza A.
- **RLS (I) puede tumbar al front (G):** coordinar siempre antes de tocar políticas de seguridad.
- **Si tu área está tomada y no puedes esperar:** crea una sesión con estado `⏸ esperando S-NNN` y avisa al usuario.
