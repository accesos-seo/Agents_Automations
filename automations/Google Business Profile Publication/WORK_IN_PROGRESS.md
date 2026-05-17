# WORK IN PROGRESS — Google Business Profile Publication

> Registra tu sesión ANTES de empezar a trabajar. Ciérrala cuando termines.
> Objetivo: evitar que dos agentes modifiquen los mismos componentes al mismo tiempo.

---

## Sesiones activas

| Sesión | Área | Owner | Inicio (UTC) | Tarea | Estado |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

---

## Sesiones cerradas (historial)

| Sesión | Área | Owner | Inicio (UTC) | Tarea | Estado |
|---|---|---|---|---|---|
| S-001 | A — Trigger & B — Edge Function | Claude-code-web | 2026-05-17T00:00Z | Implementación inicial: trigger SQL + Edge Function gbp-post-generator v2 | ✅ |

---

## Cómo registrar tu sesión

Agrega una fila a **Sesiones activas** con este formato:

```markdown
| S-00X | <Letra — Nombre del área> | <Tu identificador> | <YYYY-MM-DDTHH:MMZ> | <Descripción 1 línea> | en_curso |
```

Ejemplo:
```markdown
| S-002 | F — Frontend Validación | Claude-code-web | 2026-05-18T10:00Z | Implementar panel de validación GBP para el líder SEO | en_curso |
```

---

## Cómo cerrar tu sesión

1. Mueve tu fila de **Sesiones activas** a **Sesiones cerradas**.
2. Cambia el Estado a `✅` (completado), `❌` (falló) o `⏸` (pausado).
3. Si dejaste trabajo a medias, agrega una nota en el README sección 8 (Bitácora).
4. Si creaste decisiones nuevas, agrégalas a README sección 7.5.
5. Haz commit con mensaje descriptivo antes de cerrar la sesión.

---

## Reglas

1. **Una sesión por área a la vez.** Verifica la tabla antes de empezar.
2. **Áreas B + C + E son indivisibles** — viven en el mismo archivo (`index.ts`). Si trabajas en una, registra las tres.
3. **Áreas F + G deben coordinarse** — son el mismo PR de frontend.
4. **No cierres sesiones de otro agente** sin confirmación explícita del owner.
