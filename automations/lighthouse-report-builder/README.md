# lighthouse-report-builder (agent_6)

Cierra el último gap del pipeline **Ahrefs Lighthouse**: convierte los datos crudos + diagnóstico + plan de recuperación en un informe estructurado de 6 secciones que el frontend `/seo/analisis/<id>/informe` consume.

## Por qué existe

El pipeline `ahrefs-total-orchestrator` corre 7 fases (4 ingestas + comparativa + diagnóstico + recovery plan) pero **nunca generaba el row final en `reports`**. El frontend espera ese row y se queda en "Cargando informe…" indefinidamente.

Esta edge function es el "agent_6" que faltaba.

## Flujo

```
Orquestador (ahrefs-total-orchestrator)
   ↓ después de Fase 8 / recovery_plan
   ↓ POST /functions/v1/lighthouse-report-builder
   ↓ { orchestration_id, force? }
   ↓
[lighthouse-report-builder]
   1. Lee pipeline_orchestrations → diagnostic + recovery + comparison
   2. Lee organic_keywords, top_pages, backlinks, referring_domains (crudos)
   3. Calcula site_overview (DR, tráfico, valor, conteos)
   4. UPSERT en site_overview
   5. Construye prompt para OpenRouter (Claude por default)
   6. Pide al LLM 6 secciones en JSON estructurado
   7. INSERT en reports + 6 INSERTS en report_sections
   8. Emite analysis_run_events para trazabilidad
   ↓
Frontend ya tiene datos → /seo/analisis/<id>/informe carga normalmente
```

## Estructura del informe

| # | section_key | Contenido |
|---|---|---|
| 1 | `executive_summary` | Hallazgo principal + tabla métricas + próximos pasos |
| 2 | `site_snapshot` | Métricas generales, distribución por posición, top pages, top keywords |
| 3 | `traffic_loss_summary` | Comparativa histórica honesta + análisis de concentración |
| 4 | `diagnosis` | Risk score + findings detallados + lo que se descarta |
| 5 | `recovery_plan` | Plan en fases con métricas de éxito |
| 6 | `appendix` | IDs técnicos + metodología + limitaciones |

## Despliegue

```bash
# 1. Linkear el proyecto
supabase link --project-ref stjugsrkrweakvzmizpq

# 2. Configurar secretos
supabase secrets set \
  OPENROUTER_API_KEY="..." \
  LIGHTHOUSE_REPORT_INTERNAL_SECRET="genera-uno-largo" \
  LIGHTHOUSE_REPORT_MODEL="anthropic/claude-sonnet-4"

# 3. Deploy
supabase functions deploy lighthouse-report-builder --no-verify-jwt
```

Ver `SECRETS.md` para detalle de cada variable.

## Invocación manual (testing / backfill)

```bash
curl -X POST https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/lighthouse-report-builder \
  -H "x-internal-secret: <tu-secreto>" \
  -H "Content-Type: application/json" \
  -d '{"orchestration_id":"e7d27847-549f-40e9-8acb-a86756f622a5"}'
```

Respuesta exitosa:
```json
{
  "ok": true,
  "report_id": "9c8f...",
  "sections_created": 6,
  "generated_at": "2026-05-19T17:30:00.000Z"
}
```

Con `"force": true` regenera aunque ya exista (incrementa `report_version`).

## Hookear al orquestador

Una vez desplegada, hay que modificar `ahrefs-total-orchestrator` para invocar a esta función después de `recovery_plan`. Ver `01-database-migrations/001_hook_orchestrator.sql` para el SQL de referencia o ajustar directamente el código de la edge function `ahrefs-total-orchestrator`.

## Modelo LLM

Por defecto usa `anthropic/claude-sonnet-4` vía OpenRouter (balance costo/calidad). Configurable vía `LIGHTHOUSE_REPORT_MODEL`. Alternativas razonables:

- `anthropic/claude-opus-4` — máxima calidad, más caro
- `anthropic/claude-haiku-4` — más rápido y barato
- `openai/gpt-4-turbo` — alternativa de proveedor

## Idempotencia

- Si ya existe un report para el `run_id` y se invoca sin `force`, devuelve el existente sin sobreescribir.
- Con `force: true`, crea una nueva versión (`report_version = max + 1`) en lugar de modificar la anterior.

## Limitaciones conocidas

- **Asume que organic_keywords, top_pages, backlinks y referring_domains ya tienen datos.** Si el pipeline falló parcialmente, las métricas saldrán incompletas y el LLM lo reflejará en el texto.
- **Genera 1 informe por orquestación**, no por dataset. Si necesitamos informes parciales (solo backlinks, solo keywords) habría que parametrizar.
- **Sin retry automático del LLM.** Si OpenRouter falla, devuelve 500 al orquestador y debe reintentar.

## Próximos pasos (no en este sprint)

1. **Google Docs export**: agregar paso 7 que toma el report markdown y lo deposita en un Google Doc con plantilla fija (logo, portada, footer). Ver propuesta en `automations/lighthouse-report-builder/02-edge-functions/lighthouse-google-docs-exporter/` (pendiente).
2. **Caching de prompts**: usar prompt caching de Anthropic para reducir costo al 90% en re-runs.
3. **Sección 7 opcional**: análisis competitivo (requiere ingesta de SERP overview de Ahrefs).
