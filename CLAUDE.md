# Claude Code — punto de entrada del repo

> **Estás trabajando en `accesos-seo/Agents_Automations`, el plano de gobierno de las automatizaciones de la agencia.**
> Antes de hacer cualquier cosa, lee este archivo entero. Toma <1 minuto y te ahorra horas de confusión.

---

## 1. Qué es este repositorio

Este repo **NO contiene la implementación** de las automatizaciones. Contiene su **gobierno**: decisiones, políticas, brand voices, handovers, bitácoras, inventarios y handoffs entre humanos y agentes.

La implementación real de la automatización principal vive en `accesos-seo/ops-control-plane` (path `automation_projects/02-seo-content-generation`) y en Supabase Edge Functions.

```
La fuente de verdad es Supabase:
  - Swarm Agentes MD  (ref: lwurzjrghzwzxbhrulyn) — control plane: automation_registry, agent_registry, runtime_events
  - Light_House       (ref: stjugsrkrweakvzmizpq) — runtime productivo: content_items, content_audio_items, etc.

La implementación canónica del SEO Swarm:
  - accesos-seo/ops-control-plane:automation_projects/02-seo-content-generation/

Este repo (Agents_Automations) es el plano de gobierno que orquesta lo anterior.
```

---

## 2. Cómo orientarte si llegas nuevo a una sesión

Si vas a tocar la automatización **`seo-content-swarm-engine`** (lo más común hoy), sigue esta secuencia exacta:

1. **Lee `automations/seo-content-swarm-engine/AGENT_ONBOARDING.md`** — contexto completo del proyecto, estado actual, decisiones tomadas. Reemplaza la necesidad de leer la conversación anterior.
2. **Lee `automations/seo-content-swarm-engine/AREAS.md`** — el proyecto está dividido en áreas de trabajo (audio, briefs, writer, validator, etc.). Identifica qué área vas a tocar.
3. **Lee `automations/seo-content-swarm-engine/WORK_IN_PROGRESS.md`** — quién está tocando qué ahora mismo. Si tu área ya tiene dueño activo, coordina con el usuario antes de avanzar.
4. **Registra tu sesión** en `WORK_IN_PROGRESS.md` con un PR/commit antes de empezar el trabajo. Esto evita choques con chats paralelos.

Si vas a tocar **otra automatización o un tema transversal** (RLS, política global, etc.), lee el `handovers/` correspondiente y avísale al usuario qué tomarás.

---

## 3. Reglas no negociables (todas las automatizaciones)

Estas reglas aplican a cualquier trabajo en este ecosistema. Romperlas es defecto, no decisión editorial.

### 3.1. Nunca mencionar competidores

- Política canónica: [`referencias/politica-competidores-prohibidos.md`](referencias/politica-competidores-prohibidos.md)
- Lista operativa: [`automations/seo-content-swarm-engine/politicas/competidores-prohibidos.yaml`](automations/seo-content-swarm-engine/politicas/competidores-prohibidos.yaml)
- Aplica a contenido, briefs, prompts, audio, imágenes, copys.

### 3.2. Brand voice canónico vive en `ops-control-plane`

- Path: `automation_projects/02-seo-content-generation/brands/<brand_slug>/brand-voice.md`
- No editar desde este repo. Si necesitas un cambio, redactarlo como patch en `automations/seo-content-swarm-engine/propuestas-ops-control-plane/` y pedir aplicación al desarrollador.

### 3.3. Supabase es la fuente de verdad de estado

- No inferir estado de la conversación. Consultar Supabase para confirmar (status, ready, version).
- Cambios productivos pasan por `apply_migration` o `execute_sql` documentado, no por dejar comentarios.

### 3.4. RLS de Light_House sigue desactivada en 162 tablas

- Riesgo de seguridad documentado en [`handovers/2026-05-16-rls-light-house.md`](handovers/2026-05-16-rls-light-house.md).
- NO ejecutar `ENABLE ROW LEVEL SECURITY` masivo sin policies — rompe la app. Esperar al plan por fases del handover.

---

## 4. Cómo se trabaja en paralelo (varios chats al mismo tiempo)

El usuario abre múltiples ventanas para acelerar el trabajo. Cada agente toma un área distinta del proyecto y registra su sesión en `WORK_IN_PROGRESS.md` para evitar pisarse:

| Área | Archivos / Tablas que tocas | Riesgo de choque alto con |
|---|---|---|
| Audio | Edge Function `seo-content-audio-skill`, tablas `content_audio_items`, `audio_voice_profiles` | — |
| Briefs / n8n A | `content_items.brief_data`, webhook n8n, función `fn_trigger_seo_investigation` | Writer, Validator |
| Writer / Agentes | Edge Function `seo-content-orchestrator` y agentes registrados | Briefs, Validator |
| Validator | `contract-validator` (legacy) y `seo-content-contract-validator-agent` (v3.1) | Writer, Briefs |
| Imágenes | Edge Function `seo-content-image-skill`, tabla `content_items.og_image_url` | — |
| ILS | Edge Function `ils-orchestrator`, tablas `internal_link_*` | Enrichment |
| Enrichment | Edge Function `content-enrichment-skill`, `enrichment_pipeline_runs` | ILS |
| Política / Governance | `referencias/`, `politicas/`, README, brand-voice patches | Todo |

**Regla:** un área = un agente activo a la vez. Si ves un área tomada en `WORK_IN_PROGRESS.md`, NO la toques. Habla con el usuario para que reasigne o espera al cierre del otro chat.

---

## 5. Convenciones del repo

- **`handovers/YYYY-MM-DD-<tema>.md`** — informes técnicos y handovers entre sesiones.
- **`referencias/<tema>.md`** — políticas canónicas y documentación transversal.
- **`automations/<key>/`** — una carpeta por automation_key registrada en Supabase.
- **`automations/<key>/propuestas-ops-control-plane/`** — patches preparados para aplicar en el otro repo.
- **`briefs/`** — briefs generados por boti (vacía por ahora).
- **`skills/`** — skills reutilizables compartidas (vacía por ahora).
- **`.claude/commands/`** — slash commands del Claude Code del usuario (`/boti`, `/sony`).

Cuando crees archivos nuevos: respeta esta convención. Cuando edites: registra el cambio en la bitácora del README correspondiente.

---

## 6. Cómo cerrar una sesión

Antes de terminar tu turno:

1. Asegúrate de que tus cambios están commiteados y pusheados.
2. Actualiza `WORK_IN_PROGRESS.md`: marca tu sesión como cerrada o transfiere a otro agente.
3. Actualiza la bitácora del README de la automatización con la decisión que tomaste.
4. Reporta al usuario en chat con: qué hiciste, qué quedó pendiente, qué requiere su decisión.

---

## 7. Atajos útiles

- **Inventario de automatizaciones en Supabase:** consultar `automation_registry` en `lwurzjrghzwzxbhrulyn`.
- **Edge Functions de un proyecto:** `list_edge_functions` MCP tool.
- **Estado del SEO Swarm hoy:** [`automations/seo-content-swarm-engine/README.md`](automations/seo-content-swarm-engine/README.md) sección "Bitácora".
- **Auditoría completa del SEO Swarm:** [`handovers/2026-05-16-analisis-seo-content-swarm.md`](handovers/2026-05-16-analisis-seo-content-swarm.md).
- **Política de competidores:** [`referencias/politica-competidores-prohibidos.md`](referencias/politica-competidores-prohibidos.md).
