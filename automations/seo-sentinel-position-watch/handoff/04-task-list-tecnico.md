# 04 — Lista de Tareas para el Técnico de Configuración

> **Para quién es este documento:** vos sos el técnico que va a terminar de poner en producción el sistema `seo_sentinel`. Trabajás con un asistente de IA (Claude Code u otro). Este doc te da todo el contexto y la lista exacta de pasos para que tu IA pueda ayudarte sin tener que adivinar nada.
>
> **Tiempo estimado:** 60-90 minutos si tenés todas las credenciales a mano.
>
> **Vos NO escribís código.** El código ya está hecho y commiteado. Vos solo:
> 1. Recolectás credenciales de Google, Slack y OpenRouter
> 2. Las cargás en Supabase Vault
> 3. Poblás 2 tablas con los datos de las marcas
> 4. Ejecutás un script de deploy
> 5. Disparás una prueba y verificás que llegue la alerta a Slack

---

## 0. ¿Qué es `seo_sentinel`?

Sistema agéntico que **todos los días a las 08:00 hora Colombia** hace lo siguiente:

1. Extrae datos de tráfico de cada marca desde Google Search Console (clicks, impresiones, posiciones de cada keyword)
2. Compara contra la semana anterior y detecta dos tipos de problemas:
   - **Caídas de tráfico WoW** (clicks bajan ≥20% vs. el mismo día de la semana pasada)
   - **Pérdidas de posiciones** (un keyword que estaba en pos 5 ahora está en pos 25, o salió del top 10)
3. Si encuentra una anomalía real (no festivo, no fin de semana, no falla de tracking), usa Claude vía OpenRouter para identificar el clúster temático afectado y resumir el incidente en 3 oraciones
4. **Envía 1 o 2 mensajes a Slack** por cada incidente:
   - Mensaje al canal **`#alerts-operaciones`** (ID `C0B1B3V4ZB5`) — siempre
   - DM al **especialista responsable de la marca** (`brand_team_routing.team_lead_user_id`) — solo si está configurado para esa marca

**Importante:** NO hay destinatario individual "global" tipo CEO/director. Cada marca tiene su propio especialista responsable, configurado en la BD por-marca.

El flujo es **100% automático**. No hay frontend, no hay botones, no hay dashboards. La única interacción humana es **leer la alerta en Slack y actuar**.

---

## 1. Recursos del proyecto

### GitHub

| Recurso | URL |
|---|---|
| Repo | https://github.com/accesos-seo/Agents_Automations |
| Branch | `feature/seo-sentinel-position-watch` |
| PR draft | https://github.com/accesos-seo/Agents_Automations/pull/16 |
| Path del módulo dentro del repo | `automations/seo-sentinel-position-watch/` |

### Supabase (proyecto Light_House)

| Recurso | URL |
|---|---|
| Project ID | `stjugsrkrweakvzmizpq` |
| Dashboard | https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq |
| Vault (cargar secretos) | https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/settings/vault/secrets |
| SQL Editor | https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/sql/new |
| Edge Functions | https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/functions |
| Logs (debugging) | https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/logs/edge-functions |
| Cron jobs | https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/database/extensions (buscar pg_cron) |
| URL base Edge Functions | `https://stjugsrkrweakvzmizpq.functions.supabase.co` |

### Local (cómo cloná el código)

```bash
git clone -b feature/seo-sentinel-position-watch https://github.com/accesos-seo/Agents_Automations.git
cd Agents_Automations/automations/seo-sentinel-position-watch
```

Todo el código vive bajo esa carpeta. Si querés ver la docs sin clonar:
- README: https://github.com/accesos-seo/Agents_Automations/blob/feature/seo-sentinel-position-watch/automations/seo-sentinel-position-watch/README.md
- Arquitectura: https://github.com/accesos-seo/Agents_Automations/blob/feature/seo-sentinel-position-watch/automations/seo-sentinel-position-watch/ARCHITECTURE.md
- Secrets detallados: https://github.com/accesos-seo/Agents_Automations/blob/feature/seo-sentinel-position-watch/automations/seo-sentinel-position-watch/SECRETS.md
- Contratos HTTP: https://github.com/accesos-seo/Agents_Automations/blob/feature/seo-sentinel-position-watch/automations/seo-sentinel-position-watch/handoff/01-edge-functions-contracts.md
- Checklist E2E: https://github.com/accesos-seo/Agents_Automations/blob/feature/seo-sentinel-position-watch/automations/seo-sentinel-position-watch/handoff/02-validation-checklist.md
- Runbook (qué hacer si algo falla): https://github.com/accesos-seo/Agents_Automations/blob/feature/seo-sentinel-position-watch/automations/seo-sentinel-position-watch/handoff/03-runbook.md

### Slack

- Workspace: **SeoLab Agency**
- Canal principal de alertas: **`#alerts-operaciones`** → ID confirmado: **`C0B1B3V4ZB5`**
- Bot Slack: **Orbit SeoLab** → ID confirmado: **`D0A4NMACLPP`** (bot compartido entre todas las automatizaciones de la agencia — **NO crear app nueva**)

---

## 2. Información ya confirmada (NO la busques, ya está decidida)

| Concepto | Valor |
|---|---|
| Proyecto Supabase | `Light_House` (ref `stjugsrkrweakvzmizpq`) |
| Schema operativo | `seo_sentinel` (11 tablas + 2 vistas ya aplicadas) |
| Tabla compartida | `public.notifications_outbox` (ya existe — el código la reusa) |
| Cron jobs activos | `seo-sentinel-daily` (08:00 CO), `seo-sentinel-watchdog` (cada 2 min), `seo-sentinel-outbox-worker` (cada 30s) |
| Canal Slack de alertas | `C0B1B3V4ZB5` (alerts-operaciones) |
| Bot Slack | Orbit SeoLab (`D0A4NMACLPP`) — bot compartido, NO crear app nueva |
| Modelo LLM | `anthropic/claude-sonnet-4` via OpenRouter |
| Horario cron | `0 13 * * *` UTC = 08:00 Colombia |
| Auth GSC/GA4 | Service Account (NO OAuth2) |
| Auth entre edge fns | Header `x-internal-secret` (no JWT de Supabase) |

---

## 3. Información que VOS tenés que recolectar

Tabla con todo lo que tu IA va a pedirte. **Llenala antes de arrancar**, te ahorra ida-y-vuelta:

### A. Cuentas externas

| Item | Dónde se obtiene | Formato esperado |
|---|---|---|
| **GSC Service Account JSON** | Google Cloud Console → IAM → Service Accounts → crear cuenta + Keys → Add JSON key (descarga archivo) | JSON completo con `private_key`, `client_email`, etc. |
| **OpenRouter API key** | https://openrouter.ai/keys → Create Key | String que arranca con `sk-or-...` |
| **Slack Bot Token** | **Bot existente "Orbit SeoLab"** (ID `D0A4NMACLPP`) — NO crear app nueva. https://api.slack.com/apps → app "Orbit SeoLab" → OAuth & Permissions → Bot User OAuth Token | String que arranca con `xoxb-...` |

### B. IDs de Slack (te los doy o se los pedís a quien corresponda)

| Item | Pregunta a hacer / dónde encontrarlo | Formato |
|---|---|---|
| **SLACK_FALLBACK_CHANNEL** | Canal fallback cuando una marca no tiene routing. Para SeoLab usamos el mismo canal de alertas: `C0B1B3V4ZB5` | `C0B1B3V4ZB5` (alerts-operaciones) |
| **SLACK_ADMIN_CHANNEL** | Canal donde se notifican fallos del sistema (puede ser el mismo `C0B1B3V4ZB5` si no hay uno dedicado) | `C0XXXXXXXXX` |
| **Por cada marca: Slack User ID del especialista** | El líder/responsable SEO de esa cuenta. Slack → click en su perfil → More (⋮) → "Copy member ID". **Este es el único destinatario individual** — no hay CEO ni director global. | `U05XXXXXXXX` |

### C. Datos de cada marca (cliente)

Por cada cliente que vas a monitorear, necesitás:

| Campo | Pregunta | Formato/Ejemplo |
|---|---|---|
| **Nombre interno** | ¿Cómo se llama el cliente? | "Clínica Dental Bogotá" |
| **GSC property URL** | El responsable de marketing del cliente lo tiene; si no, lo ve en su Search Console | `sc-domain:clinica-dental.com` (sin https) o `https://clinica-dental.com/` (con slash final) |
| **GA4 property ID** (opcional) | GA4 → Admin → Property Settings → "Property ID" | Numérico, ej. `123456789`. Si la marca no tiene GA4, dejar NULL |
| **Threshold de clicks** | ¿Cuánto % de caída amerita alerta? | Default 20. Subir a 30 si la marca tiene tráfico muy volátil |
| **Threshold de posiciones** | ¿Cuántas posiciones perdidas amerita alerta? | Default 10. Subir si la marca tiene muchas keywords de cola larga |
| **Especialista responsable** | ¿Quién es el lead SEO de esta cuenta? | Slack User ID, ej. `U05ABCD1234` |
| **Tipo de estacionalidad** | ¿Es B2B (cae los fines de semana) o B2C (estable)? | `'b2b_weekday'` o NULL |

---

## 4. Tareas (en orden)

### Tarea 1: Crear y configurar Service Account de Google

**Objetivo:** una sola Service Account que puede leer GSC + GA4 de todas las propiedades.

1. Ir a https://console.cloud.google.com/
2. Crear proyecto nuevo (o usar uno existente) — sugerido: nombre `seo-sentinel-seolab`
3. Habilitar 2 APIs:
   - https://console.cloud.google.com/apis/library/searchconsole.googleapis.com
   - https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com
4. IAM & Admin → Service Accounts → **Create Service Account**:
   - Name: `seo-sentinel-bot`
   - Role: dejar vacío (no necesita roles a nivel proyecto)
5. Clic en la service account creada → **Keys** → **Add Key** → **JSON** → descargar archivo
6. Por **cada propiedad GSC del cliente**: ir a Search Console → seleccionar propiedad → Settings → **Users and permissions** → **Add user** → pegar el `client_email` del JSON descargado → Permission: **Restricted**
7. Por **cada propiedad GA4 del cliente** (si tiene): GA4 → Admin → Property → **Property Access Management** → Add user → email de la SA → Role: **Viewer**

**Resultado:** un archivo JSON descargado. Guardalo seguro, lo vas a pegar en Vault en la Tarea 4.

---

### Tarea 2: Usar el bot existente "Orbit SeoLab" (NO crear app nueva)

**Objetivo:** obtener el Bot Token del bot existente del equipo. Toda la agencia usa el mismo bot para sus automatizaciones — NO hace falta crear uno nuevo.

**Datos del bot:**
- Nombre: **Orbit SeoLab**
- ID: **`D0A4NMACLPP`**
- Workspace: SeoLab Agency

1. Ir a https://api.slack.com/apps → seleccionar **"Orbit SeoLab"** del listado
   - Si no aparece, pedir a accesos@seolabagency.com que te agregue como colaborador de la app
2. **OAuth & Permissions** → revisar Bot Token Scopes. Tienen que estar los 3:
   - `chat:write` — enviar mensajes
   - `chat:write.public` — enviar a canales públicos sin invitación
   - `im:write` — abrir DMs con usuarios (necesario para el DM al especialista)

   Si alguno **falta**, agregalo y clic en **"Reinstall to Workspace"** (botón amarillo arriba). El token cambia tras reinstalar.
3. Copiar el **Bot User OAuth Token** (`xoxb-...`). Anotalo, va a Vault en Tarea 4.
4. En Slack, asegurate de que el bot esté en `#alerts-operaciones`:
   ```
   /invite @orbit-seolab
   ```
   (Si ya está invitado porque otras automatizaciones lo usan, saltea este paso — confirmá con `/who` en el canal.)
5. Para los DMs al especialista de cada marca, no necesitás nada extra. Con `im:write` el bot puede iniciar la conversación.

**Resultado:** un token `xoxb-...` del bot Orbit SeoLab. Va a Vault en Tarea 4.

---

### Tarea 3: OpenRouter API key

1. Ir a https://openrouter.ai/keys
2. **Create Key**: nombre `seo-sentinel`, dejar el límite por defecto o ponerle uno (ej. $20 USD/mes)
3. Copiar el token (`sk-or-...`)
4. **Recargar saldo**: https://openrouter.ai/settings/credits — con $10 USD alcanza para varios meses con el volumen típico (2 LLM calls por incidente)

**Resultado:** un token `sk-or-...`. Va a Vault en Tarea 4.

---

### Tarea 4: Cargar los 9 secretos en Supabase Vault

Ir a: https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/settings/vault/secrets

Por cada entry de abajo, clic en **"New Secret"** → llenar Name y Secret Value → Save.

| # | Name | Value a poner | De dónde viene |
|---|---|---|---|
| 1 | `SEO_SENTINEL_INTERNAL_SECRET` | Generá uno: en terminal `openssl rand -hex 32` (64 chars hex) | Lo creás vos, único, NO compartir |
| 2 | `SUPABASE_FUNCTIONS_URL` | `https://stjugsrkrweakvzmizpq.functions.supabase.co` | Fijo (sin slash final) |
| 3 | `GSC_SERVICE_ACCOUNT_JSON` | Pegar TODO el contenido del JSON descargado en Tarea 1 | Tarea 1 |
| 4 | `GA4_SERVICE_ACCOUNT_JSON` | Mismo JSON que `GSC_SERVICE_ACCOUNT_JSON` (reusamos la SA) | Tarea 1 |
| 5 | `OPENROUTER_API_KEY` | `sk-or-...` | Tarea 3 |
| 6 | `SEO_SENTINEL_MODEL` | `anthropic/claude-sonnet-4` | Fijo |
| 7 | `SLACK_BOT_TOKEN` | `xoxb-...` (del bot existente **Orbit SeoLab** `D0A4NMACLPP`) | Tarea 2 |
| 8 | `SLACK_FALLBACK_CHANNEL` | `C0B1B3V4ZB5` | ← **canal alerts-operaciones** confirmado |
| 9 | `SLACK_ADMIN_CHANNEL` | `C0B1B3V4ZB5` (mismo que fallback, salvo que haya un canal admin/devs distinto) | **CONFIRMAR con accesos@seolabagency.com** si hay uno separado |

> **NO hay un secreto `CEO_SLACK_USER_ID`.** El destinatario individual de cada alerta es el **especialista responsable de la marca**, y se gestiona en la base de datos vía `seo_sentinel.brand_team_routing.team_lead_user_id` (una fila por marca, ver Tarea 5).

**Importante:** ningún secreto debe quedar en `.env` local, en chats, ni en commits. Todos van solo a Vault.

---

### Tarea 5: Poblar `brands` y `brand_team_routing`

Ir a https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/sql/new

Ejecutar el siguiente SQL **una vez por marca** (reemplazar los `PENDING_CONFIG`):

```sql
-- ============================================================
-- AGREGAR UNA MARCA NUEVA (copiar este bloque por cada cliente)
-- ============================================================

-- 1. Insertar la marca y capturar su id
WITH new_brand AS (
  INSERT INTO seo_sentinel.brands (
    name,
    status,
    gsc_property_url,
    ga4_property_id,
    alert_threshold_clicks_pct,
    alert_threshold_position_delta,
    seasonality_type
  ) VALUES (
    'PENDING_CONFIG: nombre del cliente',         -- ej: 'Clínica Dental Bogotá'
    'active',
    'PENDING_CONFIG: sc-domain:cliente.com',      -- formato GSC exacto
    NULL,                                          -- o 'PENDING_CONFIG: 123456789' si tiene GA4
    20,                                            -- threshold clicks % (default OK)
    10,                                            -- threshold posiciones (default OK)
    NULL                                           -- o 'b2b_weekday' si aplica
  )
  RETURNING id
)
-- 2. Insertar el routing Slack para esa marca
INSERT INTO seo_sentinel.brand_team_routing (
  brand_id,
  slack_channel_id,                                -- canal donde se envía la alerta
  team_lead_user_id,                               -- DM del especialista responsable
  fallback_channel_id
)
SELECT
  id,
  'C0B1B3V4ZB5',                                   -- canal alerts-operaciones (fijo por ahora)
  'PENDING_CONFIG: U05XXXXXXX',                    -- Slack User ID del especialista de esta marca
  'C0B1B3V4ZB5'                                    -- mismo canal como fallback
FROM new_brand;
```

**Verificación inmediata:**

```sql
SELECT b.name, b.status, b.gsc_property_url, b.alert_threshold_clicks_pct,
       r.slack_channel_id, r.team_lead_user_id
FROM seo_sentinel.brands b
LEFT JOIN seo_sentinel.brand_team_routing r ON r.brand_id = b.id
ORDER BY b.created_at;
```

Tenés que ver una fila por cada marca con todos los campos llenos.

---

### Tarea 6: Deploy de las 7 edge functions

1. Cloná el repo si no lo hiciste:
   ```bash
   git clone -b feature/seo-sentinel-position-watch https://github.com/accesos-seo/Agents_Automations.git
   cd Agents_Automations/automations/seo-sentinel-position-watch
   ```

2. Instalá las dependencias del CLI si no las tenés:
   - **Supabase CLI**: `npm install -g supabase` (o `brew install supabase/tap/supabase` en Mac)
   - **Deno**: https://deno.land/install (Windows: `irm https://deno.land/install.ps1 | iex`)

3. Generá un Personal Access Token de Supabase:
   - Ir a https://supabase.com/dashboard/account/tokens
   - Generate new token → name "seo-sentinel-deploy" → copiar

4. Configurá el `.env`:
   ```bash
   cp .env.example .env
   ```
   Editá `.env` con tu editor preferido y reemplazá:
   - `SUPABASE_ACCESS_TOKEN=PENDING_CONFIG` → con el token del paso 3
   - El resto ya está fijo

5. Login del CLI:
   ```bash
   supabase login --token <TU_ACCESS_TOKEN>
   ```

6. Deploy:
   ```bash
   python deploy.py
   ```

   Se van a desplegar las 7 funciones:
   - `seo-sentinel-orchestrator`
   - `seo-sentinel-gsc-ingestor`
   - `seo-sentinel-ga4-ingestor`
   - `seo-sentinel-analyst`
   - `seo-sentinel-detective`
   - `seo-sentinel-dispatcher`
   - `seo-sentinel-outbox-worker`

   El script genera `deploy-report.json` y `deploy-log.txt` en la carpeta. Si alguna función falla, está en el log.

7. Verificá en el Dashboard:
   https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/functions

   Las 7 funciones deben aparecer con status "Active".

---

### Tarea 7: Validación End-to-End

Esta tarea está completa en `handoff/02-validation-checklist.md`. Lo crítico:

1. **Disparar un run manual:**

   ```bash
   curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/seo-sentinel-orchestrator \
     -H "x-internal-secret: <SEO_SENTINEL_INTERNAL_SECRET>" \
     -H "Content-Type: application/json" \
     -d '{"trigger":"manual"}'
   ```

   (En PowerShell usar `curl.exe` y comillas escapadas.)

   Esperá ~60 segundos para que termine.

2. **Verificar que las tablas se llenaron:**

   ```sql
   -- Último run
   SELECT id, status, started_at, completed_at, brands_processed, brands_failed, error_message
   FROM seo_sentinel.analysis_runs
   ORDER BY started_at DESC LIMIT 1;

   -- Eventos del pipeline (debe haber decenas, todos sin error_message)
   SELECT occurred_at, event_source, event_type, brand_id, error_message
   FROM seo_sentinel.run_events
   ORDER BY occurred_at DESC LIMIT 30;

   -- Health check (todo en 0)
   SELECT * FROM seo_sentinel.v_pipeline_health;
   ```

3. **Verificar que Slack recibió la alerta** (solo si hubo anomalías):
   - Mensaje en `#alerts-operaciones` (canal `C0B1B3V4ZB5`)
   - DM al especialista responsable de la marca (Slack User ID guardado en `brand_team_routing.team_lead_user_id`)

4. Si **no hubo anomalías** (sistema sano), no aparecerá nada en Slack — eso es esperado. Para forzar una alerta de prueba, ver Tarea 7-bis abajo.

---

### Tarea 7-bis (opcional): Forzar una alerta de prueba

Si querés validar que Slack llega sin esperar a una anomalía real, podés inyectar datos sintéticos:

```sql
-- 1. Crear un run dummy
INSERT INTO seo_sentinel.analysis_runs (trigger_source, status, brands_total, brands_processed, completed_at)
VALUES ('manual', 'completed', 1, 1, NOW())
RETURNING id;  -- copiar el run_id devuelto

-- 2. Crear una anomalía sintética (reemplazar <RUN_ID> y <BRAND_ID>)
INSERT INTO seo_sentinel.clicks_anomalies (run_id, brand_id, anomaly_date, current_clicks, previous_clicks, wow_drop_pct, anomaly_type, severity)
VALUES ('<RUN_ID>', '<BRAND_ID>', CURRENT_DATE - 1, 50, 200, -75, 'seo_drop', 'RED')
RETURNING id;  -- copiar el anomaly_id

-- 3. Disparar el detective manualmente
-- (vía curl, como en Tarea 7 pero apuntando a seo-sentinel-detective)
```

```bash
curl -X POST https://stjugsrkrweakvzmizpq.functions.supabase.co/seo-sentinel-detective \
  -H "x-internal-secret: <SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"run_id":"<RUN_ID>","brand_id":"<BRAND_ID>","anomaly_kind":"clicks_drop","anomaly_id":"<ANOMALY_ID>"}'
```

Esperar 30-60 segundos → debería llegar la alerta a Slack (mensaje en `#alerts-operaciones` + DM al especialista de esa marca).

---

## 5. Cómo arrancar tu sesión de Claude Code

Cuando abras Claude Code en la carpeta clonada, copia y pega esto como **primer mensaje** para que tu IA tenga todo el contexto:

```
Hola Claude. Voy a hacer el setup del sistema seo_sentinel (Position Watch).

Contexto:
- Estoy en el repo `accesos-seo/Agents_Automations`, branch `feature/seo-sentinel-position-watch`
- Mi rol: técnico de configuración, NO desarrollo. El código ya está hecho y commiteado.
- El doc que tengo que seguir: `automations/seo-sentinel-position-watch/handoff/04-task-list-tecnico.md`
- Proyecto Supabase: Light_House (ref stjugsrkrweakvzmizpq) — el schema seo_sentinel ya está aplicado
- Canal Slack de alertas: #alerts-operaciones (ID C0B1B3V4ZB5)
- Mi tarea: completar las 7 tareas del handoff: Service Account Google, Slack Bot, OpenRouter, cargar 10 secretos en Vault, poblar 2 tablas en BD, deploy de 7 edge functions, validar end-to-end.

Por favor:
1. Leé los siguientes archivos para tener el contexto completo:
   - `automations/seo-sentinel-position-watch/handoff/04-task-list-tecnico.md` (este es mi plan)
   - `automations/seo-sentinel-position-watch/SECRETS.md`
   - `automations/seo-sentinel-position-watch/ARCHITECTURE.md`
   - `automations/seo-sentinel-position-watch/handoff/02-validation-checklist.md`
2. Cuando termines de leer, decime "Listo, dime por qué tarea empezamos" y ayudame a ejecutar paso a paso.
3. Si en algún paso te falta info (ej. un User ID de Slack, un GSC property URL), pedímela explícitamente.
```

Tu IA te va a guiar paso a paso. Si tenés Supabase MCP conectado (recomendado), va a poder hacer queries y aplicar cambios de configuración directamente.

---

## 6. Cuándo escalar y a quién

| Síntoma | Primer paso | Si persiste, escalá a |
|---|---|---|
| `gh` / `git` no clona el repo | Verificar que tenés acceso al repo `accesos-seo/Agents_Automations` (probar `gh auth status`) | accesos@seolabagency.com |
| Supabase CLI deploy timeout en Windows | Reintentar 1 vez; si sigue, deployar 1 fn a la vez: `python deploy.py orchestrator` | accesos@seolabagency.com |
| `chat.postMessage` devuelve `not_in_channel` | Asegurarse de haber invitado al bot al canal: `/invite @orbit-seolab` | — |
| `chat.postMessage` devuelve `missing_scope` | Volver a OAuth & Permissions de la app **Orbit SeoLab** y agregar los 3 scopes (`chat:write`, `chat:write.public`, `im:write`), **reinstalar app** (el token cambia, actualizar `SLACK_BOT_TOKEN` en Vault con el nuevo) | — |
| GSC API devuelve `User does not have sufficient permission` | Verificar en Search Console que la SA está agregada como Restricted user en esa propiedad | El responsable del cliente |
| OpenRouter devuelve 401 / 402 | Verificar saldo en https://openrouter.ai/settings/credits o regenerar key | accesos@seolabagency.com |
| Cron `seo-sentinel-daily` no se disparó al día siguiente | `SELECT * FROM cron.job WHERE jobname='seo-sentinel-daily';` confirmar que `active=true`. Ver Runbook. | accesos@seolabagency.com |
| Algo más | Leer `handoff/03-runbook.md` que tiene 8 escenarios documentados con SQL de diagnóstico | accesos@seolabagency.com |

---

## 7. Apéndice: estructura del proyecto en el repo

```
automations/seo-sentinel-position-watch/
├── README.md                         ← overview general
├── ARCHITECTURE.md                   ← diagrama + decisiones técnicas
├── SECRETS.md                        ← detalle de los 10 secretos
├── .env.example                      ← copiar a .env para deploy local
├── deploy.py                         ← script de deploy (lo corrés en Tarea 6)
├── 01-database-migrations/           ← ya aplicadas, no hace falta tocar
│   ├── 001_seo_sentinel_schema.sql   ← schema + 11 tablas
│   ├── 002_seo_sentinel_views.sql    ← v_pipeline_health + v_recent_anomalies
│   ├── 003_seo_sentinel_watchdog.sql ← función watchdog + cron jobs
│   └── 004_seo_sentinel_outbox.sql   ← cron del outbox-worker
├── 02-edge-functions/                ← código TypeScript de las 7 fns
│   ├── _shared/                      ← módulos comunes (no tocar)
│   ├── seo-sentinel-orchestrator/    ← entry point del pipeline
│   ├── seo-sentinel-gsc-ingestor/    ← extrae de GSC
│   ├── seo-sentinel-ga4-ingestor/    ← extrae de GA4 (best-effort)
│   ├── seo-sentinel-analyst/         ← detecta anomalías
│   ├── seo-sentinel-detective/       ← enriquece con LLM
│   ├── seo-sentinel-dispatcher/      ← arma Block Kit + encola en outbox
│   └── seo-sentinel-outbox-worker/   ← envía a Slack
├── handoff/
│   ├── 00-data-flow.md               ← cómo fluye un evento end-to-end
│   ├── 01-edge-functions-contracts.md ← payloads HTTP exactos
│   ├── 02-validation-checklist.md    ← 11 pasos para validar después de deploy
│   ├── 03-runbook.md                 ← qué hacer si algo falla
│   └── 04-task-list-tecnico.md       ← ← este archivo
└── scripts/
    └── seed_brands.sql               ← template para Tarea 5
```

---

## Checklist final (para vos)

Cuando termines todo, debería ser cierto:

- [ ] Los 10 secretos están en Vault del proyecto Light_House
- [ ] Hay al menos 1 marca en `seo_sentinel.brands` con `status='active'`
- [ ] Hay 1 fila en `seo_sentinel.brand_team_routing` por cada marca, con `slack_channel_id='C0B1B3V4ZB5'` y un `team_lead_user_id` real
- [ ] La Service Account de Google está agregada como Restricted user en TODAS las propiedades GSC de las marcas
- [ ] El bot **Orbit SeoLab** (`D0A4NMACLPP`) está invitado al canal `#alerts-operaciones` (verificá con `/who` en el canal)
- [ ] Las 7 edge functions aparecen "Active" en el Dashboard
- [ ] Una prueba manual (`curl POST seo-sentinel-orchestrator`) devuelve `{"ok":true, "run_id":"..."}`
- [ ] `SELECT * FROM seo_sentinel.v_pipeline_health;` devuelve 4 ceros
- [ ] Si forzaste una alerta de prueba (Tarea 7-bis), llegaron 2 mensajes a Slack: 1 en `#alerts-operaciones` + 1 DM al especialista responsable de la marca de prueba

Cuando todo esto pase, marcá el PR #16 como **Ready for review** y avisame a accesos@seolabagency.com.

Mañana 08:00 CO el cron va a correr solo. Si todo está OK, las próximas alertas (cuando haya alguna) van a llegar sin que nadie haga nada.
