# Agents & Automations

Centro de control para agentes, automatizaciones y skills del ecosistema.

> **Fuente de verdad:** Supabase `Swarm Agentes MD` (ref `lwurzjrghzwzxbhrulyn`).
> Este repo es el **plano de gobierno**: refleja, documenta y gobierna lo que vive en Supabase y en los repos de implementación.

## La cadena de relevo

```
/boti → brief aprobado → /sony → estructura en GitHub → Claude Code implementa
```

| Agente | Rol | Skill |
|---|---|---|
| **boti** | Consultor — analiza el problema y genera el brief | `/boti` |
| **Sony** | Arquitecto — organiza el proyecto en GitHub y consulta Supabase | `/sony` |
| **Claude Code** | Implementador — ejecuta lo que Sony dejó listo | (invocado por Sony) |

## Estructura

```
Agents_Automations/
├── .claude/commands/   ← skills (/boti, /sony)
├── agents/             ← proyectos organizados por Sony
├── automations/        ← automatizaciones bajo gobierno (una carpeta por automation_key)
├── briefs/             ← briefs generados por boti
├── handovers/          ← handovers entre sesiones e informes técnicos
├── skills/             ← skills reutilizables
├── referencias/        ← documentación técnica
└── scripts/            ← scripts utilitarios
```

## Inventario de automatizaciones

Estado a 2026-05-16. Comparación entre lo que existe en Supabase (`automation_registry`) y lo que está bajo gobierno en este repo.

| `automation_key` | En Supabase | En este repo | Estado real | Notas |
|---|---|---|---|---|
| [`seo-content-swarm-engine`](automations/seo-content-swarm-engine/) | ✅ | ✅ | `active` / `production_ready_gated` | Primera automatización bajo gobierno. Implementación en `accesos-seo/ops-control-plane`. |
| `automation-template` | ✅ | — | `active` / `healthy` | Plantilla base. No requiere gobierno propio. |
| `example-shared-automation` | ✅ | — | `pending_final_validation` | Activation `not_authorized`. Pendiente decidir. |
| `validation-shared-runtime-001` | ✅ | — | `pending_final_validation` | Manual fallback, HTTP bridge sin probar. |
| `validation-shared-runtime-002` | ✅ | — | `ready_for_controlled_activation` | Rolled back, requiere reactivación. |

## Secrets requeridos

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `OPENROUTER_API_KEY`
