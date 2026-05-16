# Onboarding — SEO Content Swarm Engine

> Lee este documento antes de tomar cualquier acción. Reemplaza la necesidad de revisar la conversación anterior.
> Tiempo de lectura: 5 minutos.

---

## 1. Identidad del proyecto

| | |
|---|---|
| **Nombre** | SEO Content Swarm Engine |
| **automation_key** | `seo-content-swarm-engine` |
| **Versión actual en producción** | Legacy v16 (en uso) + v3.1 desplegado pero apagado |
| **Estado** | `active` / `production_ready_gated` |
| **`production_go`** | `true` |
| **`publication_auto`** | `false` (publicación manual por Content Manager) |
| **Activado** | 2026-05-09 |
| **Owner producto** | _por definir_ |
| **Owner técnico** | _por definir_ |

**Qué hace:** genera artículos SEO completos en pt-BR / es-MX / en-US a partir de un brief en `content_items`. Cada artículo pasa por: investigación SEO (n8n) → orquestador → contrato → contexto de marca → SEO expert → writer → contract gate → humanizer → EEAT validator → persistencia. Paralelamente: imagen destacada, audio "listen this article", ILS (enlazado interno), enrichment.

**Marcas vivas (9):** armor-corp, cassino-bet, doug-construction, educa-college-prep, floty, holisteek, leasy, vera-bet, vozy-ai. De estas, 2 están bajo trabajo activo (cassino-bet, vera-bet); las demás están a la espera de definiciones (ver áreas).

---

## 2. Dónde vive cada cosa (rutas exactas)

### 2.1. En Supabase

**Control plane** — proyecto `Swarm Agentes MD` (`lwurzjrghzwzxbhrulyn`):
- `automation_registry` — registro de la automatización
- `agent_registry` — 7 agentes (seo-expert, content-writer, optimizer, etc.)
- `skill_registry` — 9 skills
- `automation_rules` — reglas del pipeline
- `deployment_configs` — configs y secrets
- `runtime_events` — eventos del orquestador
- `execution_tasks` — tareas en cola y completadas

**Runtime productivo** — proyecto `Light_House` (`stjugsrkrweakvzmizpq`):
- `content_items` (915 filas) — tabla maestra de artículos. Campo clave: `article_content` (HTML final).
- `content_generation_logs` (1.459 filas) — traza por step del pipeline.
- `content_generation_alerts` (124 abiertas) — alertas de calidad post-generación.
- `content_audio_items` — un audio por content_item × audio_mode × language × voice_profile.
- `audio_voice_profiles` — perfiles TTS (es-MX, pt-BR).
- `content_feedback` (0 filas) — bucle de mejora editorial vía n8n.
- `seo_content_swarm_runtime_config` — feature flag del swarm v3.1 (`enabled=false` hoy).
- `style_guides` (0 filas) — destino del feedback semanal de n8n.
- `ils_pipeline_runs` (25), `enrichment_pipeline_runs` (35) — pipelines secundarios.
- `internal_link_candidates` (809), `internal_link_decisions` (76) — ILS.
- `proyectos_seo` (23) — proyectos con datos de marca (campo `nombremarca`, `dominioprincipal`).
- `audit_voice_profiles` — voice profiles del TTS.

### 2.2. Edge Functions (en Light_House)

**Activas en el flujo productivo:**

| Slug | Versión | Rol |
|---|---|---|
| `seo-content-orchestrator` | 42 | Orquestador legacy v16 |
| `seo-content-image-skill` | 37 | Imagen destacada (Flux / Gemini) |
| `seo-content-audio-skill` | 33 (v14-literal-script) | Audio "listen this article" |
| `ils-orchestrator` | 32 | Enlazado interno fase 1 |
| `ils-contextual-injector` | 19 | Inserta enlaces en HTML |
| `seo-internal-linking-skill` | 15 | Skill atómico de linking |
| `content-enrichment-skill` | 29 | Enrichment post-publicación (videos, tablas, schema) |
| `submit-content-feedback` | 1 | Recibe feedback del CMS |

**Desplegadas pero apagadas (swarm v3.1):**

| Slug | Versión |
|---|---|
| `seo-content-swarm-router` | 19 |
| `seo-content-brief-contract-agent` | 20 |
| `seo-content-contract-validator-agent` | 20 |
| `seo-content-swarm-qa-runner` | 22 |

### 2.3. Triggers SQL críticos (en Light_House, tabla `content_items`)

| Trigger | Función | Disparo |
|---|---|---|
| `tr_investigar_seo_en_n8n` | `fn_trigger_seo_investigation()` | AFTER INSERT — **Ingreso n8n A** (investigación SEO) |
| `on_ai_extraction_completed` | `trigger_article_generation()` | AFTER INS/UPD — Dispara orchestrator |
| `trg_seo_content_image_generation` | `trigger_seo_content_image_generation()` | AFTER INS/UPD — Dispara imágenes |
| `trg_request_content_audio_generation` | `request_content_audio_generation()` | AFTER INS/UPD — Dispara audio |
| `trg_ils_on_image_ready` | `trigger_ils_on_image_ready()` | Dispara ILS |
| `trg_enrichment_on_ils_completed` | `trigger_enrichment_on_ils_completed()` | Dispara enrichment |
| `on_article_content_quality_gate` | `trigger_evaluate_seo_article_quality()` | Genera alertas de quality gate |

Y en tabla `content_feedback`:
- `content_feedback_notify_n8n` → **Ingreso n8n B** (bucle de feedback editorial).

### 2.4. Implementación en GitHub

**Repo de implementación:** `accesos-seo/ops-control-plane`
**Path:** `automation_projects/02-seo-content-generation/`

Estructura del path:
- `agents/` — definiciones markdown de cada agente
- `brands/<brand_slug>/` — recursos por marca: `brand-voice.md`, `auditoria-referencia.md`
- `skills/<skill_key>/` — skills atómicos
- `pipeline/` — `resource-loading-contract.md`, `competitors-policy.md` (pendiente de aplicar)
- `edge-functions/` — código fuente de las Edge Functions
- `database/` — migraciones SQL
- `seo-content-swarm/` — recursos del swarm v3.1
- `informes/` — informes históricos

⚠ **No tengo acceso de escritura a `ops-control-plane` desde este repo.** Los cambios para ese repo se redactan en `automations/seo-content-swarm-engine/propuestas-ops-control-plane/` y se aplican manualmente.

### 2.5. En este repo (gobierno)

```
Agents_Automations/
├── CLAUDE.md                                          ← Punto de entrada general
├── README.md                                          ← Inventario de automatizaciones
├── referencias/
│   └── politica-competidores-prohibidos.md           ← Política canónica
├── handovers/
│   ├── 2026-05-16-inicio-proyecto-agentes.md
│   ├── 2026-05-16-rls-light-house.md                 ← RLS pendiente (otro tema)
│   └── 2026-05-16-analisis-seo-content-swarm.md      ← Auditoría completa del swarm
└── automations/seo-content-swarm-engine/
    ├── README.md                                      ← Plano de control de la automatización
    ├── AGENT_ONBOARDING.md                            ← Este documento
    ├── AREAS.md                                       ← Áreas de trabajo separables
    ├── WORK_IN_PROGRESS.md                            ← Registro de sesiones activas
    ├── politicas/
    │   └── competidores-prohibidos.yaml              ← Lista operativa machine-readable
    └── propuestas-ops-control-plane/
        ├── README.md                                  ← Cómo aplicar los patches
        ├── 01-cassino-bet-brand-voice-PATCH.md
        ├── 02-vera-bet-brand-voice-PATCH.md
        ├── 03-pipeline-competitors-policy-NEW.md
        └── 04-pipeline-resource-loading-contract-PATCH.md
```

---

## 3. Flujo end-to-end (cómo funciona)

```
1. INTAKE: brief llega a content_items (INSERT)
   ↓
2. INGRESO N8N #A (tr_investigar_seo_en_n8n)
   Webhook n8n hace investigación SEO → UPDATE content_items con brief_data, ai_context
   ↓
3. TRIGGER on_ai_extraction_completed → orchestrator
   ↓
4. EDGE FUNCTION seo-content-orchestrator (v42)
   4.1 brief_contract       (contract-extractor)
   4.2 brand_context        (brand-voice loader) [GATE: bloquea si placeholder]
   4.3 seo_expert           (seo-expert agent)
   4.4 content-writer:
        section_intro, section_h2_1..6, section_faq, section_cta
   4.5 sectioned_contract_gate (contract-validator)
   4.6 final_repair         (si gate falla, max 2 reintentos)
   4.7 humanizer
   4.8 eeat                 (eeat-validator)
   4.9 complete             → UPDATE content_items.article_content
   ↓
5. TRIGGERS PARALELOS:
   - trg_seo_content_image_generation → imagen
   - trg_request_content_audio_generation → audio
   - on_article_content_quality_gate → alertas
   ↓
6. ILS (Internal Linking Strategy)
   ↓
7. ENRICHMENT (videos, tablas, schema)
   ↓
8. Content Manager revisa → validated → approved → scheduled → published
   ↓
9. INGRESO N8N #B (content_feedback_notify_n8n)
   Feedback editorial → n8n acumula semanal → genera nueva style_guides
```

**Tiempo total típico:** ~6 minutos brief → artículo terminado.

---

## 4. Estado actual con datos reales (2026-05-16)

| Indicador | Valor |
|---|---|
| Total `content_items` | 915 |
| Publicados | 644 |
| Draft / validated / approved / scheduled / etc. | 271 |
| Enrichment pending | **895** (cola colapsada — pendiente decisión) |
| Alertas Quality Gate abiertas | **124** (82 warning + 42 high) |
| Fallos recientes de imagen | 61 (Flux roto + OpenAI billing limit) |
| Visibilidad de costos / latencia | **0%** (campos NULL) |
| Auditoría de competidores | **0 contaminaciones** (de 153 con contenido) |
| Audios pt-BR de Cassino + Vera (7) | Status `ready`, version v14-literal-script |
| Artículos pt-BR de Cassino + Vera (7) | Reescritos manualmente con brand voice (D-003) |

---

## 5. Decisiones tomadas (historia reciente)

| ID | Fecha | Decisión | Estado |
|---|---|---|---|
| D-001 | 2026-05-16 | Audio v13: limpieza HTML estricta (`copy-article-block`, entities, segundo strip) | ✅ Productivo |
| D-002 | 2026-05-16 | Política global de prohibición de competidores — no negociable | ✅ Documentada. Patches a ops-control-plane pendientes de aplicar. |
| D-003 | 2026-05-16 | Reescritura manual de los 7 artículos pt-BR (Cassino + Vera) aplicando brand voice | ✅ Persistidos en Supabase |
| D-004 | 2026-05-16 | Audio v14-literal-script: eliminados reemplazos agresivos (`CTA`, `FAQ schema`, `H[1-6]`) | ✅ Productivo. 7 audios regenerados. |

Detalle completo en [`README.md`](README.md) sección 7.5.

---

## 6. Reglas no negociables específicas del swarm

1. **Cero menciones de competidores.** Lista canónica en [`politicas/competidores-prohibidos.yaml`](politicas/competidores-prohibidos.yaml). 16 marcas iGaming pt-BR.
2. **Brand voice canónico vive en `ops-control-plane`** (no en este repo).
3. **`article_content` debe ir limpio.** Sin `copy-article-block`, sin scripts JS, sin metadatos del CMS (`ESTRATEGIA DE CONTENIDO`, etc.). Si encuentras basura, repórtala antes de avanzar.
4. **`publication_auto = false`**. NUNCA cambies este flag sin autorización escrita del owner producto. Publicación pasa por revisión humana.
5. **Marca `vozy-ai` está bloqueada** (placeholder en brand-voice + auditoria-referencia). No procesar artículos suyos hasta que se completen los archivos en `ops-control-plane`.

---

## 7. Lo que está pendiente (por área)

Para evitar elegir trabajo que ya está siendo hecho, revisa primero [`WORK_IN_PROGRESS.md`](WORK_IN_PROGRESS.md) y luego [`AREAS.md`](AREAS.md) para entender el alcance exacto de tu área. Resumen de pendientes:

- **Política / governance:** aplicar los 4 patches en `ops-control-plane` (B1-B4).
- **Briefs / n8n A:** redactar handover técnico para que el desarrollador refuerce n8n A (filtro de competidores, inyección de `brand_contract`).
- **Validator:** ampliar `contract-validator-agent` con regla bloqueante de competidores prohibidos.
- **Imágenes:** modelo Flux roto en OpenRouter, fallback OpenAI con billing limit. Decidir proveedor.
- **Enrichment:** drenar la cola de 895 pending.
- **Audio:** considerar migración Camino B (TTS puro: OpenAI TTS o ElevenLabs) para garantizar literalidad por arquitectura. Hoy con v14 es prompt engineering.
- **Quality gate:** 124 alertas abiertas. Decidir bulk close / 1 a 1 / re-procesar masivo.
- **Marcas pendientes:** completar lista de competidores prohibidos por cada una de las otras 7 marcas (armor-corp, doug-construction, etc.).

---

## 8. Cómo empezar tu sesión (los 4 pasos)

1. Identifica tu **área de trabajo** en [`AREAS.md`](AREAS.md).
2. Verifica que el área **no esté tomada** en [`WORK_IN_PROGRESS.md`](WORK_IN_PROGRESS.md).
3. **Registra tu sesión** añadiendo una fila en `WORK_IN_PROGRESS.md` con tu área, fecha, descripción breve. Commit y push antes de empezar.
4. **Trabaja.** Cuando termines, marca la sesión como cerrada (o transfiere) y actualiza la bitácora del README.

Si tu área tiene dueño activo y no puedes esperar: habla con el usuario antes de tomar. La regla es coordinación humana, no overwrite silencioso.
