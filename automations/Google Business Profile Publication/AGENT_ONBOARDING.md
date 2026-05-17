# AGENT ONBOARDING — Google Business Profile Publication

> Lee este documento completo antes de tocar cualquier archivo o ejecutar cualquier comando.
> Tiempo estimado de lectura: 6 minutos.

---

## 1. Identidad del proyecto

| Campo | Valor |
|---|---|
| Nombre completo | Google Business Profile Publication |
| Automation key | `gbp-post-generator` |
| Proyecto Supabase | Light\_House (`stjugsrkrweakvzmizpq`) · región `us-east-2` |
| Estado | Backend en producción · Frontend pendiente |
| Activado | 2026-05-17 |
| Owner producto | SEO Líder por proyecto (`proyectos_seo.lider_id`) |
| Ruta en este repo | `automations/Google Business Profile Publication/` |
| Código Supabase en repo | `automations/gbp-post-generator/` |

---

## 2. Dónde vive cada cosa (rutas exactas)

### 2.1 En Supabase — tablas relevantes

| Tabla | Filas (2026-05-17) | Rol en esta automatización |
|---|---|---|
| `content_items` | 917 | Tabla central: artículos + campos GBP (`gbp_status`, `gbp_post_content`, `gbp_scheduled_date`, `gbp_notes`) |
| `proyectos_seo` | 23 | Proyectos/marcas. Campo clave: `lider_id` (validador GBP) |
| `project_services` | ~5 por proyecto | Habilitación GBP vía `services[].service_type='seo_local'` + `is_active=true` |
| `article_analysis_index` | 912 | Resumen del artículo (`summary_150_words`) — contexto para Claude |
| `business_calendar` | 365 | Días hábiles Colombia (`America/Bogota`). Base para calcular fechas GBP |
| `notifications_outbox` | 21 | Cola de notificaciones al líder. `type='gbp_draft_ready'`, `dedupe_key='gbp_draft_<id>'` |

### 2.2 Edge Functions

| Slug | Versión | Estado | `verify_jwt` | Llamado desde |
|---|---|---|---|---|
| `gbp-post-generator` | 2 | ACTIVE | false | Trigger `trg_gbp_draft_on_validated` vía `pg_net` |

### 2.3 Funciones SQL y triggers

| Nombre | Tipo | Tabla | Evento |
|---|---|---|---|
| `fn_gbp_draft_on_validated()` | FUNCTION (plpgsql) | — | Llamada por el trigger |
| `trg_gbp_draft_on_validated` | TRIGGER AFTER UPDATE | `content_items` | FOR EACH ROW |

### 2.4 Código fuente en este repo

```
automations/gbp-post-generator/
├── supabase/
│   ├── functions/gbp-post-generator/index.ts   ← Edge Function fuente
│   └── migrations/
│       └── 20260517_gbp_automation_trigger.sql ← Migración SQL del trigger
```

```
automations/Google Business Profile Publication/
├── README.md                                   ← Control plane (este doc de gov.)
├── AGENT_ONBOARDING.md                         ← Este archivo
├── AREAS.md                                    ← Áreas de trabajo paralelas
├── WORK_IN_PROGRESS.md                         ← Sesiones activas
└── propuestas-ops-control-plane/
    ├── README.md                               ← Índice de propuestas
    ├── CHANGELOG.md                            ← Historial de cambios
    ├── SECRETS.md                              ← Mapa de secrets requeridos
    ├── architecture.md                         ← Diagrama de arquitectura
    ├── data-model.md                           ← Modelo de datos detallado
    ├── runbook.md                              ← Procedimientos operacionales
    ├── 01-database-migrations/
    │   └── 001_gbp_trigger.sql                 ← Copia de la migración
    ├── 02-edge-functions/
    │   └── gbp-post-generator/index.ts         ← Copia de la Edge Function
    └── 03-frontend-spec/
        └── frontend-spec.md                    ← Prompt/spec completa para frontend
```

---

## 3. Flujo end-to-end (cómo funciona)

```
[ARTÍCULO VALIDADO]
        │
        │  UPDATE content_items
        │  SET status = 'validated_by_content_manager'
        │
        ▼
┌─────────────────────────────────────┐
│  trg_gbp_draft_on_validated         │  AFTER UPDATE · FOR EACH ROW
│  fn_gbp_draft_on_validated()        │
│                                     │
│  Guards activos:                    │
│  ✓ content_type = 'blog_post'       │
│  ✓ gbp_status = 'pending'           │
│  ✓ gbp_post_content IS NULL         │
│  ✓ proyecto_id IS NOT NULL          │
└─────────────────┬───────────────────┘
                  │ pg_net.http_post (async, 5s timeout)
                  ▼
┌─────────────────────────────────────────────────────┐
│  Edge Function: gbp-post-generator                  │
│                                                     │
│  ① ¿project_services.seo_local.is_active = true?   │──NO──→ skip silencioso
│                                                     │
│  ② ¿cupo mensual < 4 posts por proyecto?            │──NO──→ gbp_status='over_quota'
│     (cuenta draft_ready+seo_approved+scheduled+     │
│      published en el mes objetivo)                  │
│                                                     │
│  ③ Fetch en paralelo:                               │
│     · content_items (title, keyword, url, lang)     │
│     · article_analysis_index (summary_150_words)    │
│     · proyectos_seo (nombremarca, lider_id)         │
│                                                     │
│  ④ Calcular slot trimestral:                        │
│     · Mes actual → mes+1 → mes+2 → mes+3            │
│     · Slot = WEEK_SLOTS[existing_count]             │
│     · Primer día hábil del rango en business_cal.   │
│                                                     │
│  ⑤ Generar post GBP con Claude Haiku:               │
│     · Sistema: copywriter GBP expert                │
│     · Contexto: summary_150_words (o meta_desc)     │
│     · Output: 60-70 palabras, 1-2 emojis, CTA+URL  │
│                                                     │
│  ⑥ PATCH content_items:                             │
│     · gbp_post_content = <texto generado>           │
│     · gbp_scheduled_date = <fecha calculada>        │
│     · gbp_status = 'draft_ready'                    │
│                                                     │
│  ⑦ INSERT notifications_outbox:                     │
│     · user_id = lider_id                            │
│     · type = 'gbp_draft_ready'                      │
│     · dedupe_key = 'gbp_draft_<content_item_id>'    │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
              [gbp_status = 'draft_ready']
                       │
          ┌────────────┴─────────────┐
          │   FRONTEND (pendiente)   │
          │   Local SEO Hub / GBP   │
          └────────────┬─────────────┘
                       │
          ┌────────────┴──────────────┐
          │                           │
          ▼                           ▼
   [APROBAR]                    [RECHAZAR]
   gbp_status='seo_approved'    gbp_status='rejected'
   gbp_post_content (editable)  gbp_notes (obligatorio)
          │
          ▼
   [CONFIRMAR EN CALENDARIO]
   gbp_status='scheduled'
          │
          ▼
   [PUBLICAR — Fase 2]
   gbp_status='published'
```

**Timing:** El trigger es asíncrono (pg_net). La Edge Function responde en ~3–8 segundos (incluye llamada a Claude Haiku). El artículo no se bloquea durante la generación GBP.

---

## 4. Estado actual (2026-05-17)

| Componente | Estado | Detalle |
|---|---|---|
| Trigger `trg_gbp_draft_on_validated` | 🟢 Producción | Verificado en `information_schema.triggers` |
| Función `fn_gbp_draft_on_validated()` | 🟢 Producción | Usa anon key del proyecto, timeout 5s |
| Edge Function `gbp-post-generator` | 🟢 ACTIVE v2 | Light\_House `stjugsrkrweakvzmizpq` |
| Panel validación frontend | 🔴 Pendiente | Ver spec en `03-frontend-spec/frontend-spec.md` |
| Calendario trimestral frontend | 🔴 Pendiente | Parte del mismo panel |
| Publicación automática GBP API | ⚪ Fase 2 | Requiere Google My Business OAuth2 |

**Métricas actuales en `content_items`:**

| `gbp_status` | Cantidad |
|---|---|
| `pending` | 900 |
| `scheduled` | 17 |
| `published` | 2 |
| `draft_ready` | 0 |

---

## 5. Decisiones tomadas (historia reciente)

Ver sección 7.5 del [`README.md`](./README.md) para el log completo (D-001 a D-008).

Resumen de las más importantes:
- **D-001:** Dispara en `validated_by_content_manager`, no en `approved` ni `published`.
- **D-003:** Solo `blog_post`. Las `service_page` están excluidas por el trigger.
- **D-005:** Habilitación por proyecto vía `project_services.seo_local.is_active = true`.
- **D-008:** Los 900 artículos existentes NO se procesan retroactivamente.

---

## 6. Reglas no negociables

1. **Nunca modificar `gbp_scheduled_date` desde el frontend.** Es calculada por la Edge Function con `business_calendar`. Si necesitas cambiarla, hazlo vía PATCH desde backend con justificación en `gbp_notes`.

2. **El trigger tiene exactamente 5 guards.** No elimines ninguno. Si falta uno, la Edge Function se llama en cascada con cada UPDATE de `content_items`:
   ```sql
   NEW.status = 'validated_by_content_manager'
   AND (OLD.status IS DISTINCT FROM 'validated_by_content_manager')
   AND NEW.content_type = 'blog_post'
   AND COALESCE(NEW.gbp_status, 'pending') = 'pending'
   AND NEW.gbp_post_content IS NULL
   AND NEW.proyecto_id IS NOT NULL
   ```

3. **El rechazo requiere `gbp_notes` obligatorio.** Si el frontend no valida esto, el líder puede rechazar sin motivo y se pierde el historial. Bloquea el botón si `gbp_notes` está vacío.

4. **`over_quota` no es un error.** Es un estado operacional válido. No reintentes automáticamente. El siguiente artículo del mismo proyecto encontrará el slot del mes siguiente.

5. **La Edge Function usa `SUPABASE_SERVICE_ROLE_KEY`.** Nunca expongas la service role key en el frontend. Todas las operaciones de PATCH deben ir vía Server Component, API Route o Edge Function con JWT verificado.

6. **`dedupe_key = 'gbp_draft_<content_item_id>'`** en `notifications_outbox` previene notificaciones duplicadas. No lo elimines si actualizas la lógica de notificación.

7. **Máximo 70 palabras en `gbp_post_content`.** El frontend debe mostrar contador en tiempo real y bloquear guardar si supera 80. Google Business Profile trunca posts largos.

8. **No crear tablas nuevas para esta automatización.** Toda la infraestructura ya existe en `content_items`, `proyectos_seo`, `project_services`, `article_analysis_index`, `business_calendar` y `notifications_outbox`.

---

## 7. Lo que está pendiente (por área)

| Área | Descripción | Prioridad |
|---|---|---|
| F — Frontend Validación | Panel del líder: lista `draft_ready`, editar, aprobar, rechazar | 🔴 Alta |
| G — Frontend Calendario | Vista trimestral por marca: `seo_approved`, `scheduled`, `published` | 🔴 Alta |
| H — GBP API Publication | Worker que publica en Google My Business cuando llega la fecha | ⚪ Fase 2 |
| I — Monitoreo | Dashboard de métricas GBP por proyecto (tasa aprobación, tiempo validación) | 🟡 Media |

Ver detalles en [`./AREAS.md`](./AREAS.md).

---

## 8. Cómo empezar tu sesión (los 4 pasos)

1. **Lee este documento** (ya lo estás haciendo ✅).

2. **Registra tu sesión** en [`WORK_IN_PROGRESS.md`](./WORK_IN_PROGRESS.md). Elige un área de [`AREAS.md`](./AREAS.md) que no tenga sesión activa.

3. **Verifica el estado actual** antes de actuar:
   ```sql
   -- En Light_House (stjugsrkrweakvzmizpq)
   SELECT gbp_status, COUNT(*) FROM content_items GROUP BY gbp_status;
   SELECT trigger_name FROM information_schema.triggers 
     WHERE event_object_table = 'content_items' AND trigger_name = 'trg_gbp_draft_on_validated';
   ```

4. **Al terminar,** cierra tu sesión en `WORK_IN_PROGRESS.md` con el resultado (`✅` / `❌` / `⏸`).
