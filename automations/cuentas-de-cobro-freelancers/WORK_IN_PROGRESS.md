# Trabajo en curso — Cuentas de Cobro Automáticas para Freelancers

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
| S-001 | B. Pipeline + D. RPCs + C. Notificaciones | Claude vía MCP | 2026-05-15 | 2026-05-15 | ✅ Backend completo: 3 tablas + RLS + 10 funciones SQL + 4 cron jobs + 2 Edge Functions + Mailjet + Google Doc. Verificado E2E con correo real a robert@seolabagency.com (Mailjet message id 1152921541807296800). |
| S-002 | F. Política + H. Meta | Claude vía MCP | 2026-05-16 | 2026-05-16 | ✅ Sanitización para repo público: secretos movidos a Vault, .gitignore, .env.example, SECRETS.md. Reorganización completa según convención del repo: README + AGENT_ONBOARDING + AREAS + WORK_IN_PROGRESS + politicas/ + propuestas-ops-control-plane/. |

---

## Cómo registrar tu sesión

Añade una fila a "Sesiones activas" con este formato, en el commit que inicia tu trabajo:

```markdown
| S-NNN | <letra y nombre del área de AREAS.md> | <tu identificador> | <fecha+hora UTC> | <descripción breve> | en_curso |
```

**Identificador:** usa algo que el usuario pueda asociar al chat. Ejemplo: `Claude-chat-frontend` o `Claude-chat-3`.

**Descripción breve:** 1 línea. Ejemplo: "Construir página /admin/freelancer-settings con CRUD inline".

---

## Cómo cerrar tu sesión

1. Mueve tu fila de "Sesiones activas" a "Sesiones cerradas (historial)".
2. Reemplaza el estado por `✅ <resultado en 1 línea>` o `❌ <motivo del cierre>` o `⏸ <transferido a / pausado por>`.
3. Asigna un ID de sesión incremental (S-003, S-004, …) si quedó sin asignar.
4. Si descubriste pendientes nuevos, agrégalos a la sección correspondiente de [`AREAS.md`](AREAS.md).
5. Si tomaste una decisión que afecta a otros, regístrala en la sección "7.5. Decisiones tomadas" del [`README.md`](README.md).

---

## Reglas

1. **Un área activa = un agente activo.** Si tu área tiene fila en "Sesiones activas" con otro owner, **NO toques esa área**. Habla con el usuario o elige otra área de [`AREAS.md`](AREAS.md).
2. **Áreas en 🔴 (alto choque):** ver matriz en `AREAS.md`. D (RPCs) y E (Frontend) no se trabajan en paralelo.
3. **Política (F) bloquea todo:** si hay sesión activa en F, otras áreas deben coordinar antes de cambios que dependan de política.
4. **Si el área que necesitas está tomada y no hay forma de esperar:** crea una sesión nueva con estado `⏸ esperando S-NNN` y pide al usuario que mueva trabajo.
