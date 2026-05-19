# Brief técnico — Integración Frontend con backend Lighthouse

> **Para:** desarrollador del frontend `light-house-app-agency-main` (Vite + React + TypeScript + Supabase JS Client).
> **Objetivo:** integrar el frontend con el pipeline backend de generación de informes SEO.
> **Stack del frontend:** este brief asume Vite + React. Si es otro stack, adaptar las llamadas pero el contrato HTTP/SQL no cambia.

Este documento es el **único contexto** que necesitás para hacer los cambios. No hace falta abrir tickets ni preguntar más. Pegáselo a tu IA del IDE (Cursor / Copilot / Claude Code) junto con el código del frontend.

---

## 1. Contexto del sistema

**Lighthouse** es un módulo SEO que vive dentro de **ORBIT** (plataforma host de SeoLab Agency). Genera informes de diagnóstico de tráfico orgánico para clientes usando datos de Ahrefs.

**Flujo end-to-end:**

```
[Usuario logueado en ORBIT]
   |
   v
[Frontend Lighthouse] -- INSERT en analysis_requests -- inicia pipeline
   |
   v
[ahrefs-total-orchestrator]
   |  - 4 ingestas (organic_keywords, top_pages, backlinks, referring_domains)
   |  - comparativa historica
   |  - diagnostico automatico (2-5 findings)
   |  - recovery plan (2-5 acciones)
   v
[lighthouse-report-builder]  (agent_6)
   |  - llama OpenRouter con Claude Sonnet 4
   |  - genera 6 secciones markdown del informe
   v
[lighthouse-google-docs-exporter]
   |  - convierte el report a Google Doc con identidad SeoLab
   |  - guarda en Drive bajo "SeoLab Informes SEO / <cliente> / ..."
   |  - escribe file_path en reports.file_path
   v
[lighthouse-slack-notifier]
   |  - encola en notifications_outbox 1 row por destino
   v
[lighthouse-outbox-worker]
   |  - cron cada 30s, procesa cola
   |  - envia Block Kit a Slack: DM al especialista + canal del equipo
   v
[Especialista recibe notificacion]
```

Todo el pipeline tarda **8-15 segundos** en condiciones normales. El frontend hace polling sobre tablas de Supabase para mostrar progreso.

---

## 2. Configuracion del proyecto Supabase

| Item | Valor |
|---|---|
| Project ref | `stjugsrkrweakvzmizpq` |
| Project URL | `https://stjugsrkrweakvzmizpq.supabase.co` |
| Schema principal | `ahrefs_web_analysis` |
| Usuarios | `public.users` (joineable con `auth.users.id`) |
| Cola de notificaciones | `public.notifications_outbox` |

**Importante**: el schema `ahrefs_web_analysis` esta expuesto en PostgREST. Cuando uses el cliente Supabase JS:

```ts
const supabase = createClient(url, anonKey, {
  db: { schema: "ahrefs_web_analysis" }
})
// o por query:
await supabase.schema("ahrefs_web_analysis").from("reports").select("*")
```

---

## 3. Tablas que el frontend lee

### 3.1 `analysis_requests` (estado del request del usuario)

```ts
type AnalysisRequest = {
  id: string;                    // UUID, viene en la URL: /seo/analisis/<id>
  target_url: string;            // "https://www.cliente.com/"
  client_name: string | null;
  country: string | null;        // "co", "es", "pe"...
  request_status: "queued" | "dispatched" | "running" | "complete" | "failed";
  enqueued_at: string;
  dispatched_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
  orchestration_id: string | null;
  created_by: string | null;     // auth.users.id del especialista
  last_dispatch_error: string | null;
  request_payload: { domain: string; [k: string]: unknown };
}
```

**Query tipica:** obtener el request por ID:
```ts
const { data } = await supabase
  .schema("ahrefs_web_analysis")
  .from("analysis_requests")
  .select("*")
  .eq("id", requestId)
  .single();
```

### 3.2 `analysis_run_events` (eventos del pipeline en tiempo real)

Tabla append-only con eventos emitidos por cada agente. Es la **fuente de verdad para mostrar progreso paso a paso**.

```ts
type AnalysisRunEvent = {
  id: string;
  run_id: string;
  event_type: "run_created" | "agent_started" | "agent_completed" | "agent_failed" | "pipeline_note";
  event_source: string;          // "ahrefs-organic-keywords-runner", "lighthouse-report-builder", etc.
  message: string;
  payload: Record<string, unknown>;
  occurred_at: string;
}
```

**Para mostrar progreso staged:** suscribirse via Realtime a los eventos del orchestration, ordenados por `occurred_at`:

```ts
// 1. Buscar todos los runs del orchestration
const { data: runs } = await supabase.schema("ahrefs_web_analysis")
  .from("analysis_runs")
  .select("id")
  .eq("domain", domain);

const runIds = runs.map(r => r.id);

// 2. Suscribirse a eventos en tiempo real
const channel = supabase
  .channel(`events:${orchestrationId}`)
  .on("postgres_changes", {
    event: "INSERT",
    schema: "ahrefs_web_analysis",
    table: "analysis_run_events",
    filter: `run_id=in.(${runIds.join(",")})`,
  }, (payload) => {
    // payload.new tiene el evento nuevo
    updateProgressUI(payload.new);
  })
  .subscribe();
```

### 3.3 `pipeline_orchestrations` (estado global del pipeline)

```ts
type Orchestration = {
  id: string;
  domain: string;
  target_url: string;
  client_name: string | null;
  country: string | null;
  snapshot_date: string;
  orchestration_status: "running" | "complete" | "failed";
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  diagnostic_result: Record<string, unknown> | null;
  recovery_plan_result: Record<string, unknown> | null;
  comparison_result: Record<string, unknown> | null;
  ingestion_results: Array<Record<string, unknown>> | null;
}
```

### 3.4 `reports` (informe generado)

**Esta es la tabla que indica si el informe esta listo para mostrar.**

```ts
type Report = {
  id: string;
  run_id: string;
  client_id: string;
  domain: string;
  report_type: "traffic_loss_analysis";
  report_status: "generating" | "generated" | "generated_partial" | "failed";
  report_version: number;
  output_format: "markdown" | "google_doc";
  file_path: string | null;          // URL al Google Doc (cuando esta listo)
  generated_at: string;
  published_at: string | null;       // cuando se notifico por Slack
  created_by: string | null;          // especialista responsable
  generated_by_agent: string;
}
```

**Query del frontend para detectar informe listo:**
```ts
const { data: report } = await supabase
  .schema("ahrefs_web_analysis")
  .from("reports")
  .select("*")
  .eq("client_id", clientId)
  .order("generated_at", { ascending: false })
  .limit(1)
  .single();

const isPartial = report?.report_status === "generated_partial";
const hasGoogleDoc = !!report?.file_path;
```

### 3.5 `report_sections` (las 6 secciones markdown)

```ts
type ReportSection = {
  id: string;
  report_id: string;
  section_key: "executive_summary" | "site_snapshot" | "traffic_loss_summary" |
               "diagnosis" | "recovery_plan" | "appendix";
  section_title: string;             // titulo legible
  section_order: number;             // 1..6
  body_markdown: string;             // contenido en markdown
  section_status: "generated" | "failed";
}
```

**Query:**
```ts
const { data: sections } = await supabase
  .schema("ahrefs_web_analysis")
  .from("report_sections")
  .select("*")
  .eq("report_id", report.id)
  .order("section_order", { ascending: true });
```

### 3.6 `site_overview` (metricas agregadas del dominio)

```ts
type SiteOverview = {
  id: string;
  client_id: string;
  domain: string;
  domain_rating: number | null;
  ahrefs_rank: number | null;
  organic_traffic: number | null;        // visitas/mes estimadas
  organic_keywords: number | null;
  backlinks_total: number | null;
  referring_domains: number | null;
  traffic_value: number | null;          // USD/mes
  url_rating: number | null;
  captured_at: string;
}
```

### 3.7 Tablas de data cruda (opcionales, para tablas detalladas)

- `organic_keywords` - lista de keywords con `position`, `volume`, `cpc`, `traffic_estimate`
- `top_pages` - paginas con `url`, `traffic_estimate`, `keywords_count`, `url_rating`
- `backlinks` - enlaces entrantes con `source_url`, `domain_rating_source`, `is_dofollow`
- `referring_domains` - dominios referentes con `domain_rating`, `backlinks_count`
- `agent_findings` - hallazgos con `finding_type`, `title`, `description`, `impact_score`
- `recovery_plan` - acciones con `phase`, `action_title`, `expected_traffic_recovery`
- `diagnostic_reports` - resumen del diagnostico (risk_score, overall_risk_level)

Todas filtran por `client_id` y la mayoria ordenan por `priority_rank` o por algun valor.

### 3.8 Vista helper: `v_analysis_with_specialist`

Joinea `analysis_requests` con `public.users` para obtener nombre del especialista en una sola query:

```ts
const { data } = await supabase
  .schema("ahrefs_web_analysis")
  .from("v_analysis_with_specialist")
  .select("*")
  .eq("request_id", requestId)
  .single();

// data.specialist_name, data.specialist_email, data.specialist_photo
```

---

## 4. Tablas que el frontend escribe

### 4.1 `analysis_requests` (al disparar un nuevo analisis)

**CAMBIO CRITICO:** el insert ahora DEBE incluir `created_by` con el `auth.uid()`. Si esta NULL, el informe no sabe a quien notificar.

```ts
const user = (await supabase.auth.getUser()).data.user;

const { data, error } = await supabase
  .schema("ahrefs_web_analysis")
  .from("analysis_requests")
  .insert({
    target_url: form.url,
    client_name: form.clientName,
    country: form.country.toLowerCase(),
    mode: "domain",
    protocol: "both",
    row_limit: form.depth,           // 100 / 500 / 1000 / 5000
    request_status: "queued",
    enqueued_at: new Date().toISOString(),
    snapshot_date: new Date().toISOString().slice(0, 10),
    request_payload: { domain: extractDomain(form.url) },
    created_by: user.id,             // <-- NUEVO. Sin esto no hay notificacion Slack
  })
  .select()
  .single();
```

> **Nada mas se escribe desde el frontend.** Todas las demas tablas son escritas por el orquestador y agentes.

---

## 5. Edge Functions (endpoints HTTP)

Todas viven bajo: `https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/<nombre>`

**TODAS requieren header `x-internal-secret`** con el valor de `LIGHTHOUSE_REPORT_INTERNAL_SECRET`. Este secreto **NO** debe quedar en el cliente. Hay 2 opciones:

**Opcion A (recomendada):** crear un proxy en el backend de ORBIT que agregue el header. El frontend llama a `/api/lighthouse/<accion>` y el backend reenvia con el header.

**Opcion B (provisional):** usar Supabase Edge Functions sin `--no-verify-jwt`, validando contra JWT del usuario logueado. Implica modificar las edge functions actuales.

### 5.1 `lighthouse-report-builder` (agent_6)

Genera el report a partir de un orchestration. Solo se invoca manualmente o como retry; el watchdog lo dispara automaticamente cada 2 min para huerfanos.

```ts
POST /functions/v1/lighthouse-report-builder
Headers:
  x-internal-secret: <SECRET>
  Content-Type: application/json
Body:
  { "orchestration_id": "uuid", "force": false }

Response 200:
  {
    "ok": true,
    "report_id": "uuid",
    "sections_created": 6,
    "generated_at": "iso",
    "data_sufficient": true,
    "specialist": "Juan Perez"
  }
```

### 5.2 `lighthouse-google-docs-exporter`

Crea el Google Doc. Idempotente: si ya existe `file_path`, devuelve ese.

```ts
POST /functions/v1/lighthouse-google-docs-exporter
Body:
  { "report_id": "uuid", "regenerate": false }

Response 200:
  {
    "ok": true,
    "document_url": "https://docs.google.com/document/d/.../edit",
    "document_id": "...",
    "cached": false
  }
```

**El frontend invoca esto cuando el usuario hace click en "Abrir en Google Docs" si todavia no existe `report.file_path`.** Si ya existe, abre directo el link.

### 5.3 `lighthouse-slack-notifier` (agent_7)

Encola en `notifications_outbox`. Idempotente via `published_at`.

```ts
POST /functions/v1/lighthouse-slack-notifier
Body:
  { "report_id": "uuid", "resend": false }

Response 200:
  {
    "ok": true,
    "enqueued": [
      { "target_type": "slack_user", "channel_id": "U05...", "dedupe_key": "..." },
      { "target_type": "slack_channel", "channel_id": "informes-seo", "dedupe_key": "..." }
    ],
    "specialist_dm_resolved": true,
    "published_at": "iso"
  }
```

**El frontend NO suele invocar esto directamente.** Se dispara desde el watchdog. Pero podes ofrecer un boton "Reenviar a Slack" en el detalle del informe con `resend: true`.

### 5.4 `lighthouse-outbox-worker`

Worker interno. **El frontend nunca invoca esto.** Solo el cron `pg_cron`.

### 5.5 `ahrefs-total-orchestrator`

Este SI lo invoca el frontend al crear un analisis (probablemente ya esta integrado). Documentado por completitud:

```ts
POST /functions/v1/ahrefs-total-orchestrator
Body:
  { "request_id": "uuid" }    // del analysis_requests recien creado
```

---

## 6. Modulos del frontend que cambian

### 6.1 Pantalla "Nuevo analisis" — INSERT con `created_by`

**Cambio puntual:** agregar `created_by: user.id` al payload del insert (ver seccion 4.1).

---

### 6.2 Pantalla "Analisis en curso" — Progreso staged en tiempo real

**Estado actual:** muestra 12 etapas con polling crudo. Cuando el pipeline termina en 8 segundos, todas las etapas saltan a "LISTO" al mismo tiempo. Mala UX.

**Cambio:**

1. Suscribirse a `analysis_run_events` via Realtime (ver seccion 3.2).
2. Mapear cada `event_source` a una etapa de la UI:

```ts
const STAGE_MAP: Record<string, { id: string; label: string }> = {
  "ahrefs-organic-keywords-runner":  { id: "keywords",  label: "Ingesta de keywords organicas" },
  "ahrefs-top-pages-runner":         { id: "top_pages", label: "Ingesta de Top Pages" },
  "ahrefs-backlinks-runner":         { id: "backlinks", label: "Ingesta de Backlinks" },
  "ahrefs-referring-domains-runner": { id: "ref_doms",  label: "Ingesta de Referring Domains" },
  "ahrefs-historical-comparison":    { id: "historic",  label: "Comparativa historica" },
  "ahrefs-automated-diagnostics":    { id: "diagnosis", label: "Diagnostico estrategico" },
  "ahrefs-recovery-plan":            { id: "plan",      label: "Plan de recuperacion" },
  "lighthouse-report-builder":       { id: "report",    label: "Informe final generado" },
  "lighthouse-google-docs-exporter": { id: "doc",       label: "Google Doc preparado" },
  "lighthouse-slack-notifier":       { id: "notify",    label: "Notificacion encolada" },
};
```

3. Cuando llega un evento `agent_started` -> estado "running"; `agent_completed` -> "done"; `agent_failed` -> "error".

4. Si el pipeline es muy rapido (todo viene completo de una), animar visualmente el cierre uno a uno con setTimeout (300ms entre cada uno), porque la percepcion de progreso vale tanto como el dato real.

5. **Fallback timeout:** si pasan 60 segundos sin cambios de estado, mostrar un componente con:
   - Mensaje calmo: "Tu informe esta tardando mas de lo esperado."
   - Boton "Forzar regeneracion" -> POST a `lighthouse-report-builder` con `force: true`
   - Boton "Volver al tablero".

---

### 6.3 Pantalla "Informe del cliente" — Botones de descarga

**Header del informe actual:**
```
INFORME SEO CONFIDENCIAL
https://www.cliente.com/
Cliente · Snapshot fecha · Mercado XX
```

**Agregar arriba a la derecha del titulo:**

```tsx
<div className="report-actions">
  <button onClick={downloadMarkdown}>Descargar Markdown</button>
  <button onClick={openGoogleDoc} disabled={!report.file_path && exporterLoading}>
    {report.file_path ? "Abrir en Google Doc" : exporterLoading ? "Generando..." : "Crear Google Doc"}
  </button>
</div>
```

**Implementacion:**

```ts
function downloadMarkdown() {
  const md = sections
    .sort((a, b) => a.section_order - b.section_order)
    .map(s => s.body_markdown)
    .join("\n\n---\n\n");
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `informe-${report.domain}-${report.generated_at.slice(0,10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

async function openGoogleDoc() {
  if (report.file_path) {
    window.open(report.file_path, "_blank");
    return;
  }
  setExporterLoading(true);
  try {
    const res = await fetch(
      `${BACKEND_PROXY}/lighthouse/export-google-doc`,   // proxy del backend
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: report.id }),
      }
    );
    const data = await res.json();
    if (data.ok) {
      window.open(data.document_url, "_blank");
      // re-fetch del report para actualizar file_path local
      refetchReport();
    }
  } finally {
    setExporterLoading(false);
  }
}
```

**Otros cambios en la pantalla:**

- **Mostrar especialista** debajo del titulo: "Preparado por: Juan Perez". Joinear con `v_analysis_with_specialist` o resolver `created_by` -> `public.users.full_name`.

- **Badge `[INFORME PARCIAL]`** en naranja si `report.report_status === "generated_partial"`. Mostrar tooltip explicando que se detecto data insuficiente.

- **Renderizar las 6 secciones** con un parser markdown (recomendado: `react-markdown` con `remark-gfm` para tablas). Las secciones ya vienen formateadas con tablas markdown, callouts (`>`), headings, etc.

---

### 6.4 Pantalla "Tablero general" — Indicadores de estado del informe

**Cambio:** agregar columna "Estado del informe" que muestra:

| Indicador visual | Significado |
|---|---|
| Spinner | analisis en curso |
| `[Generado]` verde | report existe pero sin Google Doc |
| `[Doc listo]` azul | tiene file_path pero published_at es null |
| `[Enviado]` morado | publicado en Slack (published_at no null) |
| `[!] Parcial` naranja | report_status = generated_partial |
| `[X] Falla` rojo | algun agente fallo |

Query unica con vista compuesta o joins:

```ts
const { data } = await supabase
  .schema("ahrefs_web_analysis")
  .from("analysis_requests")
  .select(`
    id, target_url, client_name, country, request_status,
    completed_at, created_by,
    orchestration:pipeline_orchestrations!orchestration_id(orchestration_status)
  `)
  .order("created_at", { ascending: false })
  .limit(50);

// Luego para cada uno, hacer una query a reports.client_id... o crear una vista en BD que lo precomponga.
```

> **Opcional:** pedir al backend que cree una vista `v_dashboard_analyses` que joinee todo y devuelva una fila por analisis con su estado actual.

---

## 7. Variables de entorno del frontend

```env
# .env.local
VITE_SUPABASE_URL=https://stjugsrkrweakvzmizpq.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key-publica>

# URL del backend de ORBIT que actua de proxy para las edge functions con internal-secret
VITE_BACKEND_PROXY=https://orbit.seolabagency.com/api
```

**NO incluir `LIGHTHOUSE_REPORT_INTERNAL_SECRET` en el frontend.** Ese secret se queda en el backend de ORBIT que actua como proxy.

---

## 8. Permisos / RLS

Por ahora la mayoria de las tablas de `ahrefs_web_analysis` **no tienen RLS habilitada**, por lo que con el `anon key` y autenticacion via Supabase Auth ya podes leer. **Si en el futuro se activa RLS**, necesitamos politicas como:

```sql
-- Lectura: cualquier usuario autenticado puede ver todos los analisis
CREATE POLICY "auth users can read reports" ON ahrefs_web_analysis.reports
  FOR SELECT TO authenticated USING (true);

-- Escritura: solo en analysis_requests, y solo con created_by = auth.uid()
CREATE POLICY "auth users can insert their own requests" ON ahrefs_web_analysis.analysis_requests
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
```

Si las queries empiezan a devolver 0 filas inesperadamente, lo primero a chequear es RLS.

---

## 9. Testing end-to-end

Despues de implementar todo:

1. **Login en ORBIT** con un usuario que tenga `slack_id` configurado (chequear: `SELECT id, full_name, slack_id FROM public.users WHERE id = '<tu-uuid>'`).

2. **Disparar un analisis nuevo** desde la pantalla. Verificar en la BD:
   ```sql
   SELECT id, target_url, request_status, created_by FROM ahrefs_web_analysis.analysis_requests
   ORDER BY created_at DESC LIMIT 1;
   ```
   `created_by` no debe ser NULL.

3. **Esperar 10-20 segundos**. La pantalla de progreso debe ir cerrando etapas una a una (gracias al polling de `analysis_run_events`).

4. **Cuando aparezca el informe**, verificar:
   - 6 secciones renderizadas
   - Nombre del especialista en el header
   - Boton "Descargar Markdown" funciona (descarga .md)
   - Boton "Crear Google Doc" -> espera 3-5s -> abre la pestaña con el Doc

5. **Verificar Slack** del especialista:
   - Llego DM con header "Informe SEO listo: <cliente>"
   - Llego copia al canal #informes-seo
   - El boton "Abrir en Google Docs" del Slack lleva al mismo Doc

6. **Verificar estado en BD**:
   ```sql
   SELECT * FROM ahrefs_web_analysis.v_pipeline_health;
   -- Todos los counts deben ser 0 (no hay huerfanos)
   ```

---

## 10. Recursos de referencia

- Repo del backend con todas las edge functions: `accesos-seo/Agents_Automations`, branch `claude/setup-vite-dev-server-PMMGE`, carpeta `automations/lighthouse-report-builder/`
- README detallado del backend: `automations/lighthouse-report-builder/README.md`
- Schemas SQL completos: `automations/lighthouse-report-builder/01-database-migrations/`
- PR en GitHub: `#15` (draft)

---

## 11. Cosas que NO hace falta tocar

- **Estilos / colores / branding:** la app ya tiene su sistema de diseño. Este brief es solo conexion con backend.
- **Auth:** ORBIT ya provee `auth.getUser()`. Usar lo que ya esta.
- **Routing:** las URLs ya existen (`/seo/analisis/<id>`, `/seo/analisis/<id>/informe`).
- **Servicios de Slack/Google directamente:** todo va via edge functions.

---

## 12. Resumen ejecutivo (TL;DR para la IA)

1. En "Nuevo analisis": agregar `created_by: user.id` al insert. **1 linea de cambio.**
2. En "Progreso": polling sobre `analysis_run_events` + animacion staged + fallback timeout. **~150 lineas, 1 componente nuevo.**
3. En "Informe": 2 botones (Markdown + Google Doc) + especialista + badge parcial. **~80 lineas.**
4. En "Tablero": indicador visual del estado del informe por fila. **~40 lineas.**

Total: **4 cambios localizados, ~300 lineas de codigo nuevo**, todo en TypeScript/React, sin tocar backend.

---

*Brief generado para SeoLab Agency. Cualquier ajuste de contrato (nombres de columnas, payloads de edge functions) se documenta aca y se actualiza el backend en paralelo.*
