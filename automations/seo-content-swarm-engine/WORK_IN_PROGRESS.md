# Trabajo en curso — SEO Content Swarm Engine

> Registro vivo de qué agente está trabajando en qué área. Evita que dos chats se pisen.
> **Antes de empezar:** verifica que tu área no esté tomada y añade tu fila al final.
> **Cuando termines:** marca tu sesión como cerrada o transfiere.

---

## Sesiones activas

| Sesión | Área | Owner | Inicio | Tarea | Estado |
|---|---|---|---|---|---|
| S-008 | B. Briefs / Investigación SEO | Claude-code-web (claude/ahrfes-research-OHifu) | 2026-05-19 | Integración Ahrefs en `brief_data` — plan + artefactos Fase 0/1/2 listos. Esperando ejecución de queries Fase 0 por el usuario. | en_curso |

---

## Sesiones cerradas (historial)

| Sesión | Área | Owner | Inicio | Cierre | Resultado |
|---|---|---|---|---|---|
| S-007 | C. Writer (zona post-FAQ) | Claude-code-web | 2026-05-16 | 2026-05-16 | ✅ Footer zone implementada y desplegada: orquestador v44 activo en Light_House. Tabs Assets / Customer Journey / Lógica del contenido. Env var OPENROUTER_MODEL_FOOTER_ZONE pendiente de configurar. |
| S-006 | C. Writer (nuevo) | Claude-chat-customer-journey | 2026-05-16 | — | ⏸ Transferido a S-007 (solo registró sesión, no implementó) |
| S-001 | A. Audio (D-001) | Claude vía MCP | 2026-05-16 14:20 | 2026-05-16 14:30 | ✅ Deploy v13 limpieza HTML, prueba end-to-end OK |
| S-002 | H. Política (D-002) | Claude vía MCP | 2026-05-16 14:40 | 2026-05-16 15:00 | ✅ Política de competidores publicada, 4 patches para ops-control-plane listos |
| S-003 | C. Writer (D-003) | Claude vía MCP | 2026-05-16 15:00 | 2026-05-16 15:15 | ✅ 7 artículos pt-BR reescritos manualmente aplicando brand voice |
| S-004 | A. Audio (D-004) | Claude vía MCP | 2026-05-16 15:15 | 2026-05-16 15:20 | ✅ Deploy v14 literal-script, 7 audios regenerados |
| S-005 | I. Meta | Claude vía MCP | 2026-05-16 15:30 | 2026-05-16 15:40 | ✅ Sistema de onboarding y coordinación creado (CLAUDE.md + AGENT_ONBOARDING + AREAS + este archivo) |

---

## Cómo registrar tu sesión

Añade una fila a "Sesiones activas" con este formato, en el commit que inicia tu trabajo:

```markdown
| S-NNN | <letra y nombre del área de AREAS.md> | <tu identificador> | <fecha+hora UTC> | <descripción breve> | en_curso |
```

**Identificador:** usa algo que el usuario pueda asociar al chat. Ejemplo: `Claude-chat-audio-tts` o `Claude-chat-3`.

**Descripción breve:** 1 línea. Ejemplo: "Migrar audio a OpenAI TTS-1-HD y validar literalidad con 3 artículos".

---

## Cómo cerrar tu sesión

1. Mueve tu fila de "Sesiones activas" a "Sesiones cerradas (historial)".
2. Reemplaza el estado por `✅ <resultado en 1 línea>` o `❌ <motivo del cierre>` o `⏸ <transferido a / pausado por>`.
3. Asigna un ID de sesión incremental (S-006, S-007, …) si quedó sin asignar.
4. Si descubriste pendientes nuevos, agrégalos a la sección correspondiente de [`AREAS.md`](AREAS.md).
5. Si tomaste una decisión que afecta a otros, regístrala en la sección "7.5. Decisiones tomadas" del [`README.md`](README.md) de la automatización.

---

## Reglas

1. **Un área activa = un agente activo.** Si tu área tiene fila en "Sesiones activas" con otro owner, **NO toques esa área**. Habla con el usuario o elige otra área de [`AREAS.md`](AREAS.md).
2. **Áreas en 🔴 (alto choque):** ver matriz en `AREAS.md`. Si quieres tomar Writer (C) y alguien está en Briefs (B), espera o coordina.
3. **Política (H) bloquea todo:** si hay sesión activa en H, otras áreas deben coordinar antes de cambios que dependan de política.
4. **Si el área que necesitas está tomada y no hay forma de esperar:** crea una sesión nueva con estado `⏸ esperando S-NNN` y pide al usuario que mueva trabajo.
