# Handover — Inicio proyecto Agents & Automations

**Fecha:** 2026-05-16
**Origen:** accesos-seo/github-automation
**Destino:** accesos-seo/Agents_Automations
**Estado:** boti y Sony construidos y listos

## La cadena de relevo

1. **boti** `/boti` — analiza problema, pregunta `project_ref` Supabase, valida, genera brief → activa Sony automáticamente
2. **Sony** `/sony` — lee brief, consulta Supabase, organiza `agents/[proyecto]/`, genera `supabase-context.md` y `handoff.md` → activa Claude Code automáticamente
3. **Claude Code** — implementa siguiendo el `handoff.md`

## Decisiones clave

| Decisión | Valor |
|---|---|
| ¿Cómo activa Sony? | Automáticamente al aprobar el brief de boti |
| ¿Contra qué Supabase? | El `project_ref` que boti preguntó al usuario |
| ¿Cómo pasa a Claude Code? | Automáticamente al aprobar la estructura de Sony |
| ¿boti es socrático siempre? | No — si el problema es claro, salta al diagnóstico |
| ¿Agnóstico de dominio/proyecto? | Sí — cualquier nicho, cualquier Supabase |

## Próximos pasos

1. Primera prueba end-to-end con `/boti` y un problema real
2. Workflow GitHub Actions para boti (vía OpenRouter)
3. Ejemplos reales en `agents/_template/`

## Cómo continuar

```
/boti [descripción del problema]
```

La cadena se activa sola.
