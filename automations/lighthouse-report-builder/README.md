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

## Edge Function complementaria: `lighthouse-google-docs-exporter`

Toma el report generado por `agent_6` y lo deposita en Google Drive como Google Doc con la identidad visual de **SeoLab Agency**: portada con gradiente mint→navy, índice, secciones con headers/footers, tablas estilizadas con paleta corporativa.

### Identidad visual aplicada

| Color | Hex | Uso |
|---|---|---|
| Mint corporativo | `#10D9C4` | CTAs, acentos, bordes |
| Mint gradient | `#7FFFE0` | Fondos suaves de portada |
| Navy oscuro | `#0A0E27` | Headings, texto principal |
| Navy medio | `#1E2347` | Headers de tabla |
| Lavanda | `#C4B5FD` | Acentos secundarios |
| Body text | `#1A1A2E` | Cuerpo |

### Uso

```bash
curl -X POST https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/lighthouse-google-docs-exporter \
  -H "x-internal-secret: <tu-secreto>" \
  -H "Content-Type: application/json" \
  -d '{"report_id":"2efb1212-0846-4a49-8a4b-8c798ef07d22"}'
```

Devuelve:
```json
{
  "ok": true,
  "document_url": "https://docs.google.com/document/d/.../edit",
  "document_id": "...",
  "generated_at": "...",
  "cached": false
}
```

Pasá `"regenerate": true` para forzar la creación de un nuevo doc aunque ya exista.

### Drive: estructura de carpetas

```
SeoLab Informes SEO/
  ├── Fallabella/
  │   └── Informe SEO Fallabella 2026-05-19 v1
  ├── Volkswagen Perú/
  │   └── Informe SEO Volkswagen Perú 2026-05-14 v1
  └── ...
```

## Edge Function: `lighthouse-slack-notifier` (agent_7)

Última pieza del pipeline. Cuando el Google Doc está listo en Drive (file_path en `reports`), este agent envía un mensaje por Slack:

- **DM directo al especialista** (resuelto vía `public.users.slack_id` del `created_by`)
- **Copia al canal del equipo** (`#informes-seo` por default, configurable)

### Formato del mensaje (Slack Block Kit)

```
┌─────────────────────────────────────────────┐
│ 📊 Informe SEO listo: Mercado Libre         │
├─────────────────────────────────────────────┤
│ Hola Juan, tu análisis de Mercado Libre     │
│ terminó.                                     │
│                                              │
│ Dominio:           mercadolibre.com.co       │
│ Versión:           v1                        │
│ Tráfico estimado:  1,112,794/mes             │
│ Valor de tráfico:  $7,057,266 USD/mes        │
│ Risk level:        🔴 critical (200/1000)    │
│ Findings:          2 detectados              │
│                                              │
│           [ 📄 Abrir en Google Docs ]        │
│                                              │
│ SeoLab Agency · Lighthouse · 19 may, 13:42   │
└─────────────────────────────────────────────┘
```

### Manejo de casos edge

| Situación | Comportamiento |
|---|---|
| `created_by` es null | Solo envía al canal (sin DM) |
| `slack_id` mal formateado (con `\n`, espacios) | Sanitiza automáticamente con regex |
| `slack_id` inválido | Skip DM, envía solo al canal con tag de fallback |
| `report_status = generated_partial` | Header cambia a "⚠ Informe parcial" + context block explicativo |
| `published_at` ya seteado | Skip silencioso (idempotente, salvo `resend: true`) |
| Slack API falla | Reintenta canal aunque el DM haya fallado; loguea error |

### Uso

```bash
curl -X POST https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/lighthouse-slack-notifier \
  -H "x-internal-secret: <tu-secreto>" \
  -H "Content-Type: application/json" \
  -d '{"report_id":"9edef3cc-d032-4dcb-b4eb-e7d67bfad4d3"}'
```

Devuelve:
```json
{
  "ok": true,
  "report_id": "...",
  "sent_to": [
    { "channel": "U052S26EJTY", "ts": "1747856...", "fallback_used": false },
    { "channel": "informes-seo", "ts": "1747857...", "fallback_used": false }
  ],
  "specialist_dm_resolved": true,
  "is_partial": false,
  "published_at": "2026-05-19T18:40:00.000Z"
}
```

## Watchdog automático (pg_cron)

La migration `003_watchdog_full_pipeline.sql` instala una función que cada 2 minutos:

1. Detecta orquestaciones completas sin report → dispara `agent_6`
2. Detecta reports sin file_path → dispara `exporter`
3. Detecta reports con file_path sin published_at → dispara `agent_7`

Esto garantiza que **ningún informe quede colgado** aunque alguno de los 3 pasos falle puntualmente.

Para monitorear: `SELECT * FROM ahrefs_web_analysis.v_pipeline_health;`

```
 orphans_without_report | reports_without_doc | docs_without_slack | notified_last_24h
------------------------+---------------------+--------------------+-------------------
                      0 |                   2 |                  0 |                 0
```

## Próximos pasos (no en este sprint)

1. **Hookear desde `ahrefs-total-orchestrator`**: invocar agent_6 → exporter → agent_7 en cadena. Cambio en el repo del orquestador.
2. **UI del frontend**: 2 botones de descarga (markdown / Google Doc) + polling staged sobre `analysis_run_events`. Cambio en `light-house-app-agency-main`.
3. **agent_8 (user-enrichment)**: cuando se crea un usuario en `public.users`, un agente busca su `slack_id` desde el workspace de Slack y completa otros datos (timezone, foto, role) automáticamente. Elimina el problema de slack_ids faltantes / mal formateados.
4. **Plantilla Google Docs nativa**: en vez de HTML upload, copiar un Google Doc maestro vía Drive API y usar Docs API `batchUpdate` para fidelidad total.
5. **Notificación al cliente**: opcional, mandar al cliente un email (no Slack) con el link al doc cuando el especialista lo apruebe.
