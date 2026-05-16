# Agents & Automations

Centro de control para agentes, automatizaciones y skills del ecosistema.

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
├── automations/        ← automatizaciones independientes
├── briefs/             ← briefs generados por boti
├── handovers/          ← handovers entre sesiones
├── skills/             ← skills reutilizables
├── referencias/        ← documentación técnica
└── scripts/            ← scripts utilitarios
```

## Secrets requeridos

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `OPENROUTER_API_KEY`
