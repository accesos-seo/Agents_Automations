# Contratos de Edge Functions — Lighthouse

Documento de referencia con el contrato HTTP exacto de cada edge function del pipeline Lighthouse. Todas viven bajo:

```
https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/<nombre>
```

## Tabla resumen

| Edge function | Quién invoca | Frecuencia | Frontend involucrado |
|---|---|---|---|
| `ahrefs-total-orchestrator` | Frontend al disparar análisis | 1 vez por análisis | **Sí** |
| `lighthouse-report-builder` | Watchdog / Manual retry | Por análisis cuando termina pipeline | Opcional (retry) |
| `lighthouse-google-docs-exporter` | Watchdog / Frontend on-demand | 1 vez por report | **Sí** (botón "Crear Google Doc") |
| `lighthouse-slack-notifier` | Watchdog | 1 vez por report | Opcional (botón "Reenviar Slack") |
| `lighthouse-outbox-worker` | pg_cron cada 30s | Continuo | **No** |

## Manejo del `x-internal-secret`

Todas las edge functions requieren el header `x-internal-secret` con el valor de `LIGHTHOUSE_REPORT_INTERNAL_SECRET`. **Este valor NO debe quedar en el frontend.**

### Opción A (recomendada): Proxy en el backend de ORBIT

Crear en el backend de ORBIT un endpoint por cada edge function que necesite invocarse desde el frontend:

```
POST /api/lighthouse/start-analysis
POST /api/lighthouse/export-google-doc
POST /api/lighthouse/resend-slack
```

El backend de ORBIT recibe la request del frontend (con la auth de ORBIT validada), agrega el header `x-internal-secret` con el valor del env var, y reenvía a la edge function. Devuelve la respuesta al frontend.

### Opción B (provisional): Frontend invoca directo con secret

**No recomendada** porque expone el secret en el bundle. Pero si es necesario por velocidad, el secret debe ir en variables de entorno de build:

```
VITE_LIGHTHOUSE_INTERNAL_SECRET=...
```

⚠️ Cualquiera que inspeccione el bundle JS puede ver el secret. Aceptable solo durante development.

---

## 1. `ahrefs-total-orchestrator` — Dispara el pipeline

Esta es la que el frontend invoca al hacer click en **"Iniciar análisis"**.

**Importante:** primero el frontend hace el INSERT en `analysis_requests`, después invoca esta función pasándole el `request_id`.

### Request

```http
POST /functions/v1/ahrefs-total-orchestrator
Headers:
  x-internal-secret: <SECRET>
  Content-Type: application/json
Body:
  {
    "request_id": "<UUID del row recién creado en analysis_requests>"
  }
```

### Response 200

```json
{
  "ok": true,
  "request_id": "uuid",
  "orchestration_id": "uuid",
  "ingestion_results": [...],
  "diagnostic_result": {...},
  "recovery_plan_result": {...}
}
```

### Errores comunes

| Status | Mensaje | Causa | Qué hacer |
|---|---|---|---|
| 400 | `missing request_id` | No mandaste el body | Verificar payload |
| 404 | `request not found` | El UUID no existe en `analysis_requests` | Verificar que el INSERT haya funcionado antes |
| 409 | `request already dispatched` | Ya se ejecutó para ese request | Idempotente, ignorar |
| 500 | `ingestion failed: ...` | Algún agente Ahrefs falló | Verificar tokens de Ahrefs, ver logs |

### Comportamiento async

La función dispara los agentes en paralelo y **devuelve cuando el pipeline está completo** (8-15 seg típicos). Si el frontend hace fetch sin timeout, esperá ese tiempo. Si querés respuesta inmediata, ignorá la response y solo confirmá que el `request_status` cambió a `dispatched` consultando la BD.

---

## 2. `lighthouse-report-builder` (agent_6)

Genera las 6 secciones markdown del informe. Se dispara automáticamente cuando el pipeline termina, vía watchdog (cada 2 min). **El frontend solo lo invoca manualmente como retry.**

### Request

```http
POST /functions/v1/lighthouse-report-builder
Headers:
  x-internal-secret: <SECRET>
  Content-Type: application/json
Body:
  {
    "orchestration_id": "<UUID>",
    "force": false
  }
```

- `force: true` → re-genera el report aunque ya exista (incrementa `report_version`).

### Response 200

```json
{
  "ok": true,
  "report_id": "uuid",
  "report_status": "generated",
  "sections_created": 6,
  "generated_at": "2026-05-20T18:00:00Z",
  "data_sufficient": true,
  "specialist": "Juan Pérez",
  "is_partial": false
}
```

Si los datos son insuficientes (poco organic_traffic, sin keywords, etc):

```json
{
  "ok": true,
  "report_status": "generated_partial",
  "is_partial": true,
  ...
}
```

### Errores comunes

| Status | Mensaje | Causa |
|---|---|---|
| 404 | `orchestration not found` | UUID inválido |
| 409 | `report already exists. Use force=true to regenerate.` | Idempotencia, ya existe |
| 500 | `OpenRouter call failed` | Token OpenRouter agotado o LLM falló |

---

## 3. `lighthouse-google-docs-exporter`

Crea el Google Doc con la identidad SeoLab y lo guarda en Drive. Idempotente: si `reports.file_path` ya existe, devuelve esa URL sin crear uno nuevo.

### Request

```http
POST /functions/v1/lighthouse-google-docs-exporter
Headers:
  x-internal-secret: <SECRET>
  Content-Type: application/json
Body:
  {
    "report_id": "<UUID>",
    "regenerate": false
  }
```

- `regenerate: true` → archiva el Doc anterior y crea uno nuevo.

### Response 200

```json
{
  "ok": true,
  "document_id": "1XYZ...",
  "document_url": "https://docs.google.com/document/d/1XYZ.../edit",
  "cached": false,
  "drive_folder_path": "SeoLab Informes SEO/Cliente XYZ/2026-05/"
}
```

- `cached: true` → ya existía, se devolvió sin crear nada.

### Errores comunes

| Status | Mensaje | Causa |
|---|---|---|
| 404 | `report not found` | UUID inválido |
| 409 | `report not ready (status: generating)` | El report todavía no terminó. Esperar. |
| 500 | `Google Drive auth failed` | El refresh token de Google expiró. Re-autorizar. |

### Uso típico desde el frontend

```ts
async function openGoogleDoc(report) {
  if (report.file_path) {
    // Ya existe, abrir directo
    window.open(report.file_path, "_blank");
    return;
  }
  // Pedir al backend que lo cree
  const res = await fetch("/api/lighthouse/export-google-doc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report_id: report.id }),
  });
  const data = await res.json();
  if (data.ok) {
    window.open(data.document_url, "_blank");
    // Re-fetch del report para actualizar file_path local
  }
}
```

---

## 4. `lighthouse-slack-notifier` (agent_7)

Encola 1 row por destino en `notifications_outbox`. El worker se encarga de enviar.

### Request

```http
POST /functions/v1/lighthouse-slack-notifier
Headers:
  x-internal-secret: <SECRET>
  Content-Type: application/json
Body:
  {
    "report_id": "<UUID>",
    "resend": false
  }
```

- `resend: true` → encola de nuevo aunque ya se haya publicado.

### Response 200

```json
{
  "ok": true,
  "report_id": "uuid",
  "enqueued": [
    {
      "target_type": "slack_user",
      "channel_id": "U05ABC123",
      "dedupe_key": "lighthouse_report:<report_id>:v1:dm"
    },
    {
      "target_type": "slack_channel",
      "channel_id": "informes-seo",
      "dedupe_key": "lighthouse_report:<report_id>:v1:channel"
    }
  ],
  "specialist_dm_resolved": true,
  "is_partial": false,
  "published_at": "2026-05-20T18:01:00Z"
}
```

- `specialist_dm_resolved: false` → el specialist no tenía `slack_id` válido. Solo se notificó al canal.

### Errores comunes

| Status | Mensaje | Causa |
|---|---|---|
| 404 | `report not found` | UUID inválido |
| 409 | `report has no file_path` | Hay que correr el exporter primero |
| 409 | `already enqueued` | Idempotencia (sin `resend: true`) |

---

## 5. `lighthouse-outbox-worker`

**El frontend NO invoca esto.** Es disparado por `pg_cron` cada 30 segundos.

Procesa filas de `notifications_outbox` donde `source = 'lighthouse_report'` y `status = 'pending'`. Para cada una arma el Block Kit de Slack y envía via `chat.postMessage`. Lock pattern con `locked_at + locked_by` para evitar doble envío.

Solo documentado para que el técnico del frontend sepa que existe y entienda por qué después de invocar `lighthouse-slack-notifier` la notificación tarda 0-30s en llegar a Slack.

---

## Diagrama de invocaciones

```
Frontend                Backend ORBIT          Supabase Edge Functions
   │                          │                          │
   │── POST /start-analysis ──▶                          │
   │                          │── x-internal-secret ────▶│
   │                          │    ahrefs-total-         │
   │                          │    orchestrator           │
   │                          │                          │── corre 4 ingestas
   │                          │                          │── diagnostico
   │                          │                          │── recovery plan
   │                          │   200 OK                 │
   │                          ◀──────────────────────────│
   │   200 OK                 │                          │
   ◀──────────────────────────│                          │
   │                          │                          │
   │  (pg_cron watchdog cada 2 min dispara automáticamente:)
   │                          │                          │── lighthouse-report-builder
   │                          │                          │── lighthouse-google-docs-exporter
   │                          │                          │── lighthouse-slack-notifier
   │                          │                          │
   │  (pg_cron worker cada 30s:)
   │                          │                          │── lighthouse-outbox-worker
   │                          │                          │    └─▶ Slack API
```

## Pruebas con curl desde terminal

Útil para validar que las edge functions responden correctamente sin pasar por el frontend.

```bash
# Test del exporter (necesita un report_id válido):
curl -X POST https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/lighthouse-google-docs-exporter \
  -H "x-internal-secret: <SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"report_id":"<UUID-VALIDO>"}'
```

```powershell
# PowerShell equivalente:
curl -X POST https://stjugsrkrweakvzmizpq.supabase.co/functions/v1/lighthouse-google-docs-exporter `
  -H "x-internal-secret: <SECRET>" `
  -H "Content-Type: application/json" `
  -d "{\"report_id\":\"<UUID-VALIDO>\"}"
```

Para obtener un `report_id` reciente:

```sql
SELECT id, domain, report_status, file_path
FROM ahrefs_web_analysis.reports
ORDER BY generated_at DESC LIMIT 5;
```
