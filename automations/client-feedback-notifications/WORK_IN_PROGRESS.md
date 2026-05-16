# Trabajo en curso — Client Feedback Notifications

> Registro vivo de qué agente está trabajando en esta automatización. Evita que dos chats se pisen.

---

## Sesiones activas

| Sesión | Área | Owner | Inicio | Tarea | Estado |
|---|---|---|---|---|---|
| _(ninguna)_ |  |  |  |  |  |

---

## Sesiones cerradas (historial)

| Sesión | Área | Owner | Inicio | Cierre | Resultado |
|---|---|---|---|---|---|
| S-016 (origen) | Edge Function v1 | Claude-chat-qa-reviewer | 2026-05-16 | 2026-05-16 | ✅ Tabla `client_article_feedback` + RLS (3 políticas) + 2 triggers + Edge Function v1 ACTIVE. `client_approval_status` se actualiza automáticamente. Sin email aún. (Sesión registrada en `seo-content-swarm-engine/WORK_IN_PROGRESS.md`.) |
| S-017 | Email confirmación v2 | Claude-chat-principal | 2026-05-16 | 2026-05-16 | ✅ Email Mailjet integrado tras INSERT exitoso. Bilingüe pt/es desde `content_items.language`. No-fatal. |
| S-018 | Email v3 + automatización documentada | Claude-chat-principal | 2026-05-16 | 2026-05-16 | ✅ v3 desplegado: idioma resuelto desde `cliente_users.language` → `clientes.language` → `"es"`. Plantilla en inglés añadida. Automatización separada y documentada en su propio folder. D-010 (v3) actualizado. |

---

## ID siguiente

**S-019** (verifica antes de elegir, puede haber sesiones paralelas en `seo-content-swarm-engine`).

---

## Cómo registrar tu sesión

Añade una fila a "Sesiones activas" en el mismo commit donde inicias el trabajo:

```markdown
| S-NNN | <subárea> | <tu identificador> | <YYYY-MM-DD HH:MM UTC> | <descripción 1 línea> | en_curso |
```

---

## Reglas

1. Esta automatización es **pequeña en superficie pero crítica para la experiencia del cliente**. Cualquier cambio que pueda afectar el envío de emails debe probarse end-to-end antes de mergear.
2. Si necesitas tocar `client_article_feedback`, `cliente_users` o `clientes`, **coordina con `seo-content-swarm-engine`** — esas tablas son compartidas.
3. El envío de email debe permanecer **no-fatal**: nunca debe bloquear la respuesta al cliente.
