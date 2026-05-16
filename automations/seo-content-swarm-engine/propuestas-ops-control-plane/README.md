# Propuestas para `accesos-seo/ops-control-plane`

Esta carpeta contiene los **textos exactos** que deben aplicarse al repo `accesos-seo/ops-control-plane` para reforzar la política de **prohibición de mencionar competidores**. La política canónica vive en [`referencias/politica-competidores-prohibidos.md`](../../../referencias/politica-competidores-prohibidos.md).

**Estos cambios no se pueden aplicar desde este repo** (los tools de GitHub MCP están restringidos a `Agents_Automations`). Cópialos manualmente o pásalos al desarrollador.

## Archivos en esta carpeta

| Archivo | Acción | Destino |
|---|---|---|
| `01-cassino-bet-brand-voice-PATCH.md` | **Reemplazar sección** | `automation_projects/02-seo-content-generation/brands/cassino-bet/brand-voice.md` |
| `02-vera-bet-brand-voice-PATCH.md` | **Añadir sección al final** | `automation_projects/02-seo-content-generation/brands/vera-bet/brand-voice.md` |
| `03-pipeline-competitors-policy-NEW.md` | **Crear archivo nuevo** | `automation_projects/02-seo-content-generation/pipeline/competitors-policy.md` |
| `04-pipeline-resource-loading-contract-PATCH.md` | **Añadir sección** | `automation_projects/02-seo-content-generation/pipeline/resource-loading-contract.md` |

## Orden de aplicación

Aplicar en orden 03 → 04 → 01 → 02. Razón: el `competitors-policy.md` (paso 03) es referenciado por los `brand-voice.md` (pasos 01 y 02) y por el `resource-loading-contract.md` (paso 04).

## Tras aplicar

1. Commit en `ops-control-plane` con mensaje sugerido: `docs(policy): prohibición de mencionar competidores — defensa en profundidad`.
2. Confirmar en este repo actualizando el estado en `automations/seo-content-swarm-engine/README.md` (bloque "Decisiones tomadas").
3. Disparar `brand-context-loader` para una marca piloto (Cassino Bet) y verificar que `competitors-policy.md` se carga como recurso obligatorio.
4. Avanzar al handover técnico (Bloque C de la conversación) — pendiente de aprobación del usuario.
