# Módulo Frontend — Análisis SEO Ahrefs Swarm

Frontend listo para enchufar a tu sistema. Permite al usuario pegar una URL, dispara el pipeline completo del esquema `ahrefs_web_analysis` (Supabase project Light_House) y le va mostrando en vivo, con checks verdes, cada etapa que va completándose hasta entregar el informe final.

> **No hay diseño propio**: solo Tailwind utility-classes y semántica accesible. Se integra con tu Design System reescribiendo clases.

---

## 1. Arquitectura

```
Usuario pega URL
   │
   ▼
[NewAnalysisForm]  ──▶  rpc.ahrefs_enqueue_url_analysis()
                              │
                              ▼
                        analysis_requests (queued)
                              │
                              ▼ (cron cada 60s + botón "Forzar despacho")
                        rpc.ahrefs_dispatch_ready_analysis_requests()
                              │
                              ▼
                       Edge Function: ahrefs-total-orchestrator
                              │
        ┌─────────────┬───────┴───────┬─────────────┐
        ▼             ▼               ▼             ▼
  organic_keywords  top_pages     backlinks   referring_domains
        └─────────────┴───────┬───────┴─────────────┘
                              ▼
                  rpc.ahrefs_compare_latest_runs  →  historical_comparisons
                              ▼
                rpc.ahrefs_generate_latest_diagnostic → diagnostic_reports + agent_findings + diagnosis_result
                              ▼
              rpc.ahrefs_generate_latest_recovery_plan → recovery_plan
                              ▼
                        reports + report_sections
                              ▼
                   [AnalysisProgress] todo en verde
                              ▼
                   [AnalysisReport] muestra el informe
```

El frontend escucha **Postgres Realtime** sobre las tablas de `ahrefs_web_analysis` y reacciona a cada cambio sin polling.

---

## 2. Propuesta de sintaxis de URL

Sigue el patrón REST que ya usas en el resto del sistema:

| Ruta | Componente | Qué hace |
|---|---|---|
| `/seo/analisis/nuevo` | `NewAnalysisForm` | Form: domain, cliente, país, limit, snapshot_date |
| `/seo/analisis/:analysisRequestId` | `AnalysisProgress` | Checklist en vivo de las etapas |
| `/seo/analisis/:analysisRequestId/informe` | `AnalysisReport` | Render del informe (report_sections) |
| `/seo/clientes` | _(tu listing existente)_ | Tabla de `clients` |
| `/seo/clientes/:clientId` | _(tu detail existente)_ | Histórico de runs por cliente |
| `/seo/clientes/:clientId/runs/:runId/informe` | `AnalysisReport` | Acceso directo a un informe por runId |

### Slug-friendly opcional
Si querés URLs más “humanas”, podés usar el dominio del cliente como segmento:

```
/seo/c/topdoctors.es/r/1e253ecd-f851-4482-8b82-b883cf95329c
/seo/c/topdoctors.es/r/1e253ecd.../informe
```

Mapeo: `dominio → clients.domain (UNIQUE)` y `r/:id → analysis_requests.id` o `analysis_runs.id`.

---

## 3. Cómo enchufarlo en tu sistema

### 3.1. Dependencias

```bash
npm i @supabase/supabase-js react-router-dom react-markdown remark-gfm
# (asumiendo que ya tenés React + TypeScript + Tailwind)
```

### 3.2. Cliente Supabase

Usá tu cliente existente. El módulo importa de `@/lib/supabase` por defecto (cambialo si tu alias es otro):

```ts
// @/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL!, import.meta.env.VITE_SUPABASE_ANON_KEY!, {
  db: { schema: 'public' }, // RPCs viven en public
});
```

> Los datos viven en el esquema `ahrefs_web_analysis`. Para leer tablas desde el cliente JS, usá `supabase.schema('ahrefs_web_analysis').from('analysis_requests')…` o expón vistas en `public`. El módulo ya usa el primer patrón.

### 3.3. Registrar rutas (React Router v6)

```tsx
import { Routes, Route } from 'react-router-dom';
import { NewAnalysisForm } from '@/frontend/seo-analysis/components/NewAnalysisForm';
import { AnalysisProgress } from '@/frontend/seo-analysis/components/AnalysisProgress';
import { AnalysisReport } from '@/frontend/seo-analysis/components/AnalysisReport';

export function SeoAnalysisRoutes() {
  return (
    <Routes>
      <Route path="nuevo" element={<NewAnalysisForm />} />
      <Route path=":analysisRequestId" element={<AnalysisProgress />} />
      <Route path=":analysisRequestId/informe" element={<AnalysisReport />} />
    </Routes>
  );
}
```

Luego montalo en tu árbol: `<Route path="/seo/analisis/*" element={<SeoAnalysisRoutes />} />`.

### 3.4. Realtime habilitado en Supabase

Una sola vez, en el dashboard de Supabase → Database → Replication → activá replicación para el esquema `ahrefs_web_analysis` en las tablas:

```
analysis_requests
pipeline_orchestrations
analysis_runs
ingestion_batches
site_overview
historical_comparisons
diagnostic_reports
agent_findings
diagnosis_result
recovery_plan
reports
report_sections
```

> Si ya tenés RLS, asegurate que el rol `authenticated` tenga `SELECT` sobre estas tablas (o expón vistas).

---

## 4. Etapas que se muestran en el checklist

| # | Etapa | Tabla que se monitorea | Condición para ✅ |
|---|---|---|---|
| 1 | URL recibida | (cliente) | siempre al cargar la pantalla |
| 2 | Solicitud encolada | `analysis_requests.request_status` | `in ('queued','ready_for_dispatch')` |
| 3 | Despachada al orquestador | `analysis_requests.request_status` | `in ('dispatched','running','complete')` |
| 4 | Ingesta de keywords orgánicas | `analysis_runs` filtrado por dataset | row con `agent_1_completed_at IS NOT NULL` |
| 5 | Ingesta de Top Pages | idem | `agent_2_completed_at IS NOT NULL` |
| 6 | Ingesta de Backlinks | idem | `agent_3a_completed_at IS NOT NULL` |
| 7 | Ingesta de Referring Domains | idem | `agent_3b_completed_at IS NOT NULL` |
| 8 | Snapshot del dominio (DR, tráfico, valor) | `site_overview` | row insertada |
| 9 | Comparativa histórica | `historical_comparisons.comparison_status` | `= 'complete'` |
| 10 | Diagnóstico estratégico | `diagnostic_reports.diagnosis_status` | `= 'complete'` |
| 11 | Plan de recuperación | `recovery_plan` | ≥ 1 row para el run |
| 12 | Informe generado | `reports.report_status` | `= 'generated'` |

Cuando las 12 etapas están en verde, aparece el CTA **"Ver informe completo"** que redirige a `…/informe`.

---

## 5. RPCs públicos disponibles

| RPC | Para qué |
|---|---|
| `public.ahrefs_enqueue_url_analysis(p_target_url, p_client_name, p_country, p_mode, p_protocol, p_snapshot_date, p_row_limit, p_allow_partial)` | Crea la solicitud (lo llama el form) |
| `public.ahrefs_dispatch_ready_analysis_requests(p_limit)` | Fuerza despacho inmediato (botón opcional “Forzar”) |
| `public.ahrefs_compare_latest_runs(...)` | Compara runs (autoejecutado por el orquestador) |
| `public.ahrefs_generate_latest_diagnostic(...)` | Genera diagnóstico (autoejecutado) |
| `public.ahrefs_generate_latest_recovery_plan(...)` | Genera plan (autoejecutado) |

El frontend solo necesita llamar a `ahrefs_enqueue_url_analysis` y, opcionalmente, `ahrefs_dispatch_ready_analysis_requests`. Lo demás corre solo.

---

## 6. Archivos del módulo

```
frontend/seo-analysis/
├── README.md                            ← este archivo
├── types.ts                             ← Tipos TS de tablas + RPCs
├── components/
│   ├── NewAnalysisForm.tsx              ← Form de entrada
│   ├── AnalysisProgress.tsx             ← Checklist en vivo
│   ├── StageRow.tsx                     ← Una fila del checklist (✅/⏳/❌)
│   ├── MetricsSummary.tsx               ← Cards con DR / tráfico / valor / refdomains
│   └── AnalysisReport.tsx               ← Render del informe (report_sections)
└── hooks/
    ├── useAnalysisPipeline.ts           ← Suscripciones Realtime + estado derivado
    └── useReportSections.ts             ← Carga las 6 secciones del informe
```

---

## 7. Flujo de prueba end-to-end

1. Navegar a `/seo/analisis/nuevo`
2. Pegar `https://www.topdoctors.es/` + completar país `es`
3. Click en **Iniciar análisis**
4. Redirige automáticamente a `/seo/analisis/<id>`
5. Las 12 etapas se ponen ✅ en vivo (en testing tarda ~10 s)
6. Aparece **Ver informe completo** → muestra las 6 secciones renderizadas
