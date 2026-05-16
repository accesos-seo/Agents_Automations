# Propuestas para `accesos-seo/ops-control-plane`

Esta carpeta contiene los **textos exactos** que deben aplicarse al repo `accesos-seo/ops-control-plane`. Los cambios se documentan aquí porque los tools de GitHub MCP están restringidos a `Agents_Automations`.

**Cópialos manualmente o pásalos al desarrollador.**

## Archivos en esta carpeta

| Archivo | Acción | Destino | Estado |
|---|---|---|---|
| `01-cassino-bet-brand-voice-PATCH.md` | **Reemplazar sección** | `brands/cassino-bet/brand-voice.md` | Pendiente aplicar |
| `02-vera-bet-brand-voice-PATCH.md` | **Añadir sección al final** | `brands/vera-bet/brand-voice.md` | Pendiente aplicar |
| `03-pipeline-competitors-policy-NEW.md` | **Crear archivo nuevo** | `pipeline/competitors-policy.md` | Pendiente aplicar |
| `04-pipeline-resource-loading-contract-PATCH.md` | **Añadir sección** | `pipeline/resource-loading-contract.md` | Pendiente aplicar |
| `05-article-strategic-zone-SPEC.md` | **Crear archivo nuevo** | `pipeline/article-strategic-zone-spec.md` | Pendiente aprobación D-005 |
| `06-internal-linking-category-parent-SPEC.md` | **Crear archivo nuevo** | `pipeline/ils-category-parent-spec.md` | Pendiente confirmación P-1 a P-4 (D-007) |
| `07-orchestrator-quality-floor-PATCH.md` | **Sincronizar orquestador** | `functions/seo-content-orchestrator/index.ts` | **Supabase ya actualizado (v4.4 activa)** |

## Orden de aplicación (patches 01–04)

Aplicar en orden 03 → 04 → 01 → 02. Razón: `competitors-policy.md` (03) es referenciado por los `brand-voice.md` (01 y 02) y por el `resource-loading-contract.md` (04).

## Patch 07 — Orchestrator v4.4

El orchestrator ya está deployado en Supabase Light_House como versión 43. La propuesta 07 documenta los cambios para sincronizar el código fuente en `ops-control-plane`. No es urgente — el runtime ya está actualizado.

## Tras aplicar

1. Commit en `ops-control-plane` con mensaje sugerido: `docs(policy): prohibición de mencionar competidores — defensa en profundidad`.
2. Para el patch 07: `feat(orchestrator): quality floor 1500-2800, meta description auto, quality enforcer hook (D-009)`.
3. Confirmar en este repo actualizando el estado en la tabla de arriba.
