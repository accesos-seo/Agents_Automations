# Modelo de Datos — Google Business Profile Publication

Todas las tablas son pre-existentes en Light\_House (`stjugsrkrweakvzmizpq`). Esta automatización no crea ninguna tabla nueva.

---

## content_items — Campos GBP relevantes

Tabla principal. 917 filas al 2026-05-17.

| Columna | Tipo | Default | Descripción |
|---|---|---|---|
| `id` | uuid | gen_random_uuid() | PK |
| `title` | varchar | — | Título del artículo |
| `main_keyword` | varchar | — | Keyword principal |
| `content_type` | varchar | — | Filtrar siempre por `'blog_post'` |
| `status` | varchar | `'draft'` | Estado del artículo. El trigger actúa cuando llega a `'validated_by_content_manager'` |
| `proyecto_id` | uuid | — | FK → `proyectos_seo.id` |
| `client_id` | uuid | — | FK |
| `language` | varchar | — | Código de idioma (`'es'`, `'en'`). Controla el idioma del post GBP generado |
| `meta_description` | text | — | Fallback de contexto si no hay `summary_150_words` |
| `final_published_url` | text | — | URL del artículo. Se incluye al final del CTA del post GBP |
| **`gbp_post_content`** | text | null | **Texto del post GBP generado (60–70 palabras, emojis, CTA)** |
| **`gbp_status`** | varchar | `'pending'` | **Estado del ciclo GBP** — ver valores abajo |
| **`gbp_scheduled_date`** | timestamptz | null | **Fecha de publicación GBP calculada con `business_calendar`** |
| **`gbp_notes`** | text | null | **Notas del líder al aprobar o rechazar. Obligatorio al rechazar** |

### Valores de `gbp_status`

| Valor | Significado | Acción requerida |
|---|---|---|
| `pending` | Estado inicial. No procesado. | Ninguna — espera `validated_by_content_manager` |
| `draft_ready` | Borrador generado por la Edge Function. | El líder SEO debe revisar y aprobar/rechazar |
| `seo_approved` | Aprobado por el líder. Listo para calendizar. | Confirmar en el calendario → `scheduled` |
| `scheduled` | Confirmado en el calendario trimestral. | Esperar la fecha para publicar (Fase 2) |
| `published` | Publicado en Google Business Profile. | Ninguna |
| `rejected` | Rechazado por el líder (ver `gbp_notes`). | Manual: revisar motivo y generar nuevo si aplica |
| `over_quota` | Sin cupo en los próximos 4 meses. | Automático: se procesará en el siguiente ciclo |

---

## proyectos_seo — Campos relevantes

23 filas al 2026-05-17.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid | PK |
| `nombremarca` | text | Nombre de la marca. Se inyecta en el prompt de generación GBP |
| `dominioprincipal` | text | Dominio principal. Referencia en el frontend |
| `lider_id` | uuid | FK → `users.id`. El SEO líder que valida los borradores GBP |
| `slack_channel_id` | text | Canal Slack del proyecto. Opcional para notificaciones |

---

## project_services — Habilitación GBP por proyecto

~5 filas por proyecto. La columna `services` es un JSONB array.

### Estructura del JSONB `services`

```json
[
  {
    "service_type": "seo_local",
    "service_name": "SEO Local / Google Business Profile",
    "is_active": true,
    "is_required": false,
    "display_order": 5,
    "service_description": "Optimización para búsquedas locales"
  }
]
```

**Condición de elegibilidad GBP:**
```sql
services @> '[{"service_type": "seo_local", "is_active": true}]'
```

---

## article_analysis_index — Contexto para generación

912 filas al 2026-05-17.

| Columna | Tipo | Descripción |
|---|---|---|
| `content_item_id` | uuid | FK → `content_items.id` |
| `summary_150_words` | text | **Resumen del artículo en ~150 palabras. Primera fuente de contexto para Claude** |
| `search_intent` | text | Intento de búsqueda (`informational`, `transactional`, etc.) |
| `customer_journey_stage` | text | Etapa del funnel (`TOFU`, `MOFU`, `BOFU`) |
| `recommended_cta_type` | text | Tipo de CTA recomendado para el artículo |

---

## business_calendar — Días hábiles

365 filas. Zona horaria `America/Bogota`.

| Columna | Tipo | Descripción |
|---|---|---|
| `calendar_date` | date | Fecha |
| `is_working_day` | boolean | `true` si es día hábil |
| `timezone` | text | `'America/Bogota'` |
| `reason` | text | Motivo si no es hábil (festivo, fin de semana, etc.) |

**Uso en la automatización:** Para cada slot semanal (rangos de días 1–7, 8–14, 15–21, 22–31), se busca el primer `calendar_date` con `is_working_day = true`.

---

## notifications_outbox — Cola de notificaciones

| Columna | Tipo | Valor en esta automatización |
|---|---|---|
| `source` | text | `'gbp-post-generator'` |
| `user_id` | uuid | `proyectos_seo.lider_id` |
| `target_type` | text | `'content_item'` |
| `target_id` | text | `content_items.id` |
| `type` | text | `'gbp_draft_ready'` |
| `payload` | jsonb | `{ message, brand_name, article_title, scheduled_date, content_item_id }` |
| `priority` | smallint | `70` (por encima del default 50) |
| `status` | text | `'pending'` |
| `dedupe_key` | text | `'gbp_draft_<content_item_id>'` |
