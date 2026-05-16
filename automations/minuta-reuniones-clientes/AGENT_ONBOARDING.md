# Onboarding — Minuta de reuniones de cliente

Lee este documento antes de tomar cualquier acción sobre esta automatización. Reemplaza la necesidad de revisar la conversación anterior. Tiempo de lectura: 5 minutos.

## 1. Identidad del proyecto

| | |
|---|---|
| **Nombre** | Minuta de reuniones de cliente — automatización tl;dv → Supabase → IA → correo |
| **automation_key** | `minuta-reuniones-clientes` |
| **Versión actual** | 0.1 (diseño aprobado; implementación pendiente) |
| **Estado** | `planned / design_ready_implementation_pending` |
| **Activado** | — (pendiente Fase 1) |
| **Owner producto** | por definir |
| **Owner técnico** | por definir |

**Qué hace:** reemplaza el último eslabón manual del ciclo de reuniones de cliente. Hoy un especialista senior copia el resumen de tl;dv, lo formatea en JSON propietario, lo pega en el front, espera el render del Google Doc y envía manualmente. Eso consume 20–40 min por reunión. La automatización lo elimina: tl;dv dispara webhook → edge function persiste y enriquece → IA genera el JSON canónico → `cms-create-google-doc` arma el doc → `notifications_outbox` envía el correo. El especialista pasa a revisor (o ni eso).

**Mesa de operación:** una reunión real = una fila en `meetings_intelligence.meetings`. El estado avanza por el enum `meeting_lifecycle_state` (received → enriching → enriched → summarizing → summary_ready → rendering → ready_to_send | ready_for_review → queued → delivered).

## 2. Dónde vive cada cosa (rutas exactas)

### 2.1 En Supabase Light_House (`stjugsrkrweakvzmizpq`)

**Schema nuevo (a crear):** `meetings_intelligence` — replicando el patrón de `ahrefs_web_analysis` y `automation_orkesta`.

| Tabla principal | Rol |
|---|---|
| `providers` | Cuentas tl;dv (1 fila por API key). Secrets vía `vault.secrets`. |
| `webhook_events_raw` | Bitácora append-only de webhooks. UNIQUE `(provider_id, event_id_external)` para idempotencia. |
| `meetings` | Tabla canónica. `tldv_meeting_id` UNIQUE. Estado en `state`, modo en `review_mode`. |
| `meeting_participants` | Organizer / invitee / speaker, mapeo a `users` o cliente. |
| `meeting_transcripts` | Segmentos `{speaker, text, start_seconds, end_seconds}`. |
| `meeting_highlights` | Highlights/notes con timestamp. |
| `ai_summary_runs` | Cada llamada al LLM con modelo, tokens, costo, latencia. |
| `meeting_summaries` | JSON canónico vigente. `is_current` marca la versión activa. |
| `action_items` | Acciones extraídas con owner, due_date, status. |
| `deliverables` | Artefactos: `google_doc`, `html_email`, `pdf`, `slack_canvas`. |
| `dispatch_jobs` | Trabajo de entrega; vincula con `notifications_outbox`. |
| `sync_runs` / `sync_run_events` | Bitácora del cron de polling. |

**Tablas que toca (sin modificarlas):**
`public.proyectos_seo` (matching y RLS), `public.clientes` (matching por email), `public.users` (resolvedor), `public.notifications_outbox` (entrega), `public.meeting_reports` (compat opcional vía `legacy_meeting_report_id`), `public.project_meetings` (matching por `google_calendar_event_id`).

### 2.2 Edge Functions (a crear en Light_House)

| Slug | verify_jwt | Rol |
|---|---|---|
| `tldv-webhook-receiver` | false | Pública. Recibe webhook tl;dv, valida HMAC, persiste raw, dispara orquestador. |
| `tldv-meeting-enrich` | true | Llama `/meetings/{id}`, `/transcript`, `/highlights`, `/notes`. Hace matching de proyecto. |
| `meetings-ai-summarizer` | true | LLM → JSON canónico → `meeting_summaries` + `action_items`. |
| `meetings-html-builder` | true | Renderiza HTML del correo. |
| `meetings-email-dispatcher` | true | Resuelve destinatarios y encola en `notifications_outbox`. |
| `meetings-pipeline-orchestrator` | true | Director del pipeline; idempotente y reanudable por estado. |
| `tldv-poll-meetings` | false | Cron. Red de seguridad cada 15 min. |

### 2.3 Triggers SQL críticos

| Trigger | Tabla | Disparo |
|---|---|---|
| `trg_meetings_dispatch_on_state_change` | `meetings_intelligence.meetings` | AFTER UPDATE de `state` → llama a `meetings-pipeline-orchestrator` vía `net.http_post` |
| Reutiliza `outbox-stuck-reaper` existente | `notifications_outbox` | Ya activo (cron */10 min) |

### 2.4 Migraciones a aplicar

`meetings_intelligence_create_schema_and_enums` · `..._create_core_tables` · `..._create_ops_tables` · `..._triggers_and_functions` · `..._rls_policies` · `..._cron_jobs` · `..._seed_provider_tldv`

### 2.5 En este repo (gobierno)

```
Agents_Automations/
├── automations/
│   ├── calendario-orbit/            ← automatización hermana (mismo stack)
│   ├── crear-registrar-reunion/     ← workflow n8n complementario
│   └── minuta-reuniones-clientes/   ← ESTE DIRECTORIO
│       ├── README.md                ← Plano de control
│       ├── AGENT_ONBOARDING.md      ← Este documento
│       ├── AREAS.md                 ← Áreas separables
│       ├── WORK_IN_PROGRESS.md      ← Sesiones activas
│       ├── arquitectura.md          ← Modelo de datos y flujo
│       ├── componentes.md           ← Inventario exacto
│       ├── runbook.md               ← Operación día a día
│       └── configuracion/
│           └── guia-tldv-webhooks.md
```

## 3. Flujo end-to-end

```
1. tl;dv graba la reunión (sin acción del especialista — bot por calendario)
   ↓
2. WEBHOOK MeetingReady/TranscriptReady → POST a tldv-webhook-receiver
   2.1 Verifica HMAC con TLDV_WEBHOOK_SIGNING_SECRET
   2.2 Persiste payload crudo en webhook_events_raw (UNIQUE → idempotente)
   2.3 Responde 200 OK (<500 ms) y dispara orquestador async
   ↓
3. ORCHESTRATOR meetings-pipeline-orchestrator (idempotente, reanudable)
   ↓
4. ENRICH tldv-meeting-enrich
   GET /v1alpha1/meetings/{id}                → ficha, organizer, invitees
   GET /v1alpha1/meetings/{id}/transcript     → segmentos
   GET /v1alpha1/meetings/{id}/highlights     → highlights IA
   GET /v1alpha1/meetings/{id}/notes          → fallback humano
   Aplica matching de proyecto: organizer_email → invitee_email → google_calendar_event_id → manual
   state = 'enriched'
   ↓
5. SUMMARIZE meetings-ai-summarizer
   Llama LLM (Claude) con prompt v1.0
   Devuelve JSON canónico con shape de meeting_reports.notes
   Persiste meeting_summaries (is_current=true) + action_items
   state = 'summary_ready'
   ↓
6. RENDER cms-create-google-doc + meetings-html-builder
   Genera Google Doc con plantilla de marca
   Genera HTML del correo
   state = 'rendering' → 'ready_to_send' (auto_send) | 'ready_for_review' (human_approval)
   ↓
7. DISPATCH meetings-email-dispatcher
   Resuelve destinatarios (clientes.emailcontacto + project_meeting_recipients)
   Inserta en notifications_outbox con source='meetings_intelligence'
   state = 'queued'
   ↓
8. OUTBOX WORKER (existente) envía → dispatch_jobs.status='sent' → meetings.state='delivered'
   Opcional: sync_meeting_to_legacy() materializa fila en public.meeting_reports
```

**Tiempos esperados:** webhook→raw 0.5 s · enrich 3-8 s · summarize 5-15 s · render 5-10 s · dispatch <1 s · total mediana ≤ 30 s.

## 4. Estado actual (2026-05-16)

| Indicador | Valor |
|---|---|
| Diseño técnico + DDL | 🟢 cerrado |
| Suscripción tl;dv Business | ⚪ pendiente — bloqueante |
| Schema `meetings_intelligence` | ⚪ por crear |
| Edge functions | ⚪ ninguna desplegada |
| Plantillas Google Doc (operativa/estratégica/automation) | ⚪ por diseñar |
| Plantilla HTML del correo | 🟢 prototipo definido (ver `arquitectura.md`) |
| Prompt v1.0 del summarizer | 🟢 listo |
| Validación E2E | ⚪ requiere todo lo anterior + 10 reuniones reales |

## 5. Decisiones tomadas (historia reciente)

| ID | Fecha | Decisión | Estado |
|---|---|---|---|
| D-001 | 2026-05-16 | Schema aislado `meetings_intelligence` (no `public`) | ✅ Decidido |
| D-002 | 2026-05-16 | Persistir payload crudo del webhook antes de procesar | ✅ Decidido |
| D-003 | 2026-05-16 | Reutilizar `notifications_outbox` como motor de entrega | ✅ Decidido |
| D-004 | 2026-05-16 | Modo `human_approval` por defecto en Fase 4 | ✅ Decidido |
| D-005 | 2026-05-16 | Habilitar ambos eventos (`MeetingReady` + `TranscriptReady`) | ✅ Decidido |

Detalle completo en `README.md` sección 7.5.

## 6. Reglas no negociables específicas

- **El payload crudo del webhook nunca se borra sin pasar por retención (90 días).** Es la fuente de la verdad para reprocesar.
- **`tldv_meeting_id` es UNIQUE.** Reenvíos del mismo webhook no duplican `meetings`.
- **`match_confidence < 0.85` fuerza `human_approval`** sin importar la configuración del proyecto. Política inmutable para evitar correos al cliente equivocado.
- **El front nunca escribe en `meetings_intelligence`.** Solo lee (vista `v_meetings_in_flight`) y dispara aprobaciones vía endpoint dedicado.
- **Los secrets viven en `vault.secrets`.** Cero llaves en código fuente o este repo.
- **HMAC obligatorio en `tldv-webhook-receiver`.** Si la firma falla → 401 sin persistir.
- **Toda escritura es vía `service_role` o trigger.** RLS niega INSERT/UPDATE/DELETE a roles públicos.

## 7. Lo que está pendiente (por área)

Antes de elegir trabajo, revisa `WORK_IN_PROGRESS.md` y luego `AREAS.md`. Resumen:

- **Setup (A):** suscripción tl;dv Business, API key, signing secret, secrets en vault.
- **Schema (B):** aplicar DDL del schema en branch + main.
- **Webhook receiver (C):** desplegar `tldv-webhook-receiver` y validar con 5 webhooks reales.
- **Enrichment (D):** `tldv-meeting-enrich` + cron de polling de respaldo.
- **IA (E):** `meetings-ai-summarizer` + iteración de prompt v1.0→v1.2 contra muestra.
- **Render + entrega (F):** plantillas Google Doc, `meetings-html-builder`, `meetings-email-dispatcher`.
- **Frontend (G):** vista para revisar reuniones en `ready_for_review`, botón de aprobar/rechazar.
- **Migración legacy (H):** importar `meeting_reports.notes` histórico a `meeting_summaries`.

## 8. Cómo empezar tu sesión (los 4 pasos)

1. Identifica tu área en `AREAS.md`.
2. Verifica que el área no esté tomada en `WORK_IN_PROGRESS.md`.
3. Registra tu sesión añadiendo una fila en `WORK_IN_PROGRESS.md` con tu área, fecha, descripción. Commit y push antes de empezar.
4. Trabaja. Cuando termines, mueve la sesión a "cerradas" y actualiza la bitácora del `README.md`.

Si tu área tiene dueño activo y no puedes esperar: habla con el usuario antes de tomar. Coordinación humana, no overwrite silencioso.
