# /nueva-automatizacion — Crear estructura base para una automatización

El usuario quiere crear una nueva automatización. Recaba la información y genera la estructura.

Input del usuario:
---
$ARGUMENTS
---

## Paso 1 — Recabar información

Pregunta lo que no tengas:
1. **Nombre de la automatización** (ej: "Reporte semanal de posiciones")
2. **Proyecto al que pertenece** (Lighthouse, Swarm, Indurisa, etc.)
3. **¿Qué dispara la automatización?** (webhook, horario, manual)
4. **¿Qué hace?** (descripción en una línea)
5. **¿Qué herramientas usa?** (N8N, Supabase, OpenRouter, Vercel, etc.)

## Paso 2 — Crear el archivo de documentación

Crea el archivo en `automations/[proyecto]/[nombre-automatizacion].md` con esta estructura:

```markdown
# [Nombre de la automatización]

**Proyecto:** [proyecto]
**Disparador:** [webhook/cron/manual]
**Estado:** En desarrollo

## Qué hace
[descripción]

## Herramientas
- [lista de herramientas]

## Flujo
1. [paso 1]
2. [paso 2]
...

## Variables necesarias
- `VARIABLE_1`: para qué sirve
- `VARIABLE_2`: para qué sirve

## Notas
(espacio para anotaciones durante el desarrollo)
```

## Paso 3 — Subir a GitHub

Usa `/subir` para guardar el archivo en el repositorio.

## Paso 4 — Confirmar

Indica al usuario dónde quedó el archivo y cuál es el siguiente paso para implementar la automatización en N8N.
