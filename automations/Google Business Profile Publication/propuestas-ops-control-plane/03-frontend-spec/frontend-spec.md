# Spec Frontend — Google Business Profile Publication
# Panel de Validación y Calendario Trimestral GBP

> Prompt listo para copiar y pegar al agente de frontend.
> Sección: `/team/local-seo-hub`
> Sistema: Next.js + Supabase Light\_House (`stjugsrkrweakvzmizpq`)

---

## PROMPT PARA EL AGENTE FRONTEND

```
CONTEXTO DEL SISTEMA
=====================
Estás trabajando en la sección /team/local-seo-hub de una aplicación Next.js con
Supabase como backend (proyecto: stjugsrkrweakvzmizpq, región us-east-2).
El sistema ya tiene diseño, branding y componentes base — no toques estilos globales.
Enfócate exclusivamente en funcionalidad y estructura de datos.

El Supabase client ya está configurado en el proyecto. Usa siempre
SUPABASE_SERVICE_ROLE_KEY para lecturas server-side y el cliente estándar para
operaciones del usuario autenticado.


OBJETIVO
=========
Construir el panel de gestión de posts GBP (Google Business Profile) dentro de
/team/local-seo-hub. Este panel tiene DOS vistas:

  1. VISTA LÍDER SEO  — para el usuario cuyo UUID coincide con proyectos_seo.lider_id
  2. VISTA CALENDARIO — para todos: muestra el calendario trimestral de publicación GBP


BASE DE DATOS — TABLAS Y COLUMNAS RELEVANTES
=============================================

── content_items (tabla principal de artículos)
   Columnas que vas a usar:
   - id                    uuid         PK
   - title                 varchar      Título del artículo
   - main_keyword          varchar      Keyword principal
   - proyecto_id           uuid         FK → proyectos_seo.id
   - client_id             uuid         FK
   - content_type          varchar      Filtra SIEMPRE por 'blog_post'
   - status                varchar      Estado del artículo (no del GBP)
   - final_published_url   text         URL del artículo publicado (puede ser null)
   - gbp_post_content      text         Texto generado del post GBP (60-70 palabras)
   - gbp_status            varchar      Estado GBP — ver ciclo de vida abajo
   - gbp_scheduled_date    timestamptz  Fecha de publicación GBP calculada automáticamente
   - gbp_notes             text         Notas del líder al aprobar/rechazar
   - updated_at            timestamptz

── proyectos_seo (proyectos/marcas)
   Columnas que vas a usar:
   - id                    uuid         PK
   - nombremarca           text         Nombre de la marca
   - lider_id              uuid         FK → users.id — el SEO líder que valida GBP
   - dominioprincipal      text         Dominio principal de la marca

── users (tabla de usuarios internos)
   Columnas que vas a usar:
   - id                    uuid         PK
   - full_name             text         Nombre completo del usuario
   - photo_url             text         Avatar del usuario
   - email                 text

── project_services (servicios habilitados por proyecto)
   Columnas que vas a usar:
   - proyecto_id           uuid         FK → proyectos_seo.id
   - services              jsonb        Array de objetos de servicio
   - is_active             boolean

   Para saber si un proyecto tiene GBP activo, filtra así:
   SELECT * FROM project_services
   WHERE proyecto_id = '<uuid>'
     AND is_active = true
     AND services @> '[{"service_type": "seo_local", "is_active": true}]'


CICLO DE VIDA DE gbp_status
==============================
Los valores posibles de gbp_status en content_items son:

  pending       → Estado inicial. La automatización aún no procesó el artículo.
  draft_ready   → La Edge Function generó el borrador. REQUIERE ACCIÓN del líder.
  seo_approved  → El líder aprobó el borrador. Listo para publicar en la fecha.
  scheduled     → Confirmado en el calendario trimestral.
  published     → Publicado en Google Business Profile.
  rejected      → El líder rechazó el borrador (ver gbp_notes para el motivo).
  over_quota    → Sin cupo en el trimestre. Se procesará más adelante.

La transición que el frontend debe poder ejecutar:
  draft_ready → seo_approved  (acción: APROBAR)
  draft_ready → rejected      (acción: RECHAZAR, requiere gbp_notes obligatorio)
  seo_approved → scheduled    (acción: CONFIRMAR EN CALENDARIO)
  El campo gbp_post_content puede editarse antes de aprobar.


QUERY PRINCIPAL — LISTADO DE BORRADORES PARA EL LÍDER
=======================================================
El líder ve todos los artículos con gbp_status = 'draft_ready' de los proyectos
donde él es lider_id.

Query sugerida (Server Component o API route):

  SELECT
    ci.id,
    ci.title,
    ci.main_keyword,
    ci.gbp_post_content,
    ci.gbp_scheduled_date,
    ci.gbp_status,
    ci.gbp_notes,
    ci.final_published_url,
    ci.updated_at,
    ps.nombremarca,
    ps.dominioprincipal,
    ps.id as proyecto_id
  FROM content_items ci
  INNER JOIN proyectos_seo ps ON ps.id = ci.proyecto_id
  WHERE ci.content_type = 'blog_post'
    AND ci.gbp_status = 'draft_ready'
    AND ps.lider_id = '<usuario_autenticado_id>'
  ORDER BY ci.gbp_scheduled_date ASC NULLS LAST;


QUERY — CALENDARIO TRIMESTRAL (vista pública del equipo)
=========================================================
Muestra todos los posts GBP agendados de los próximos 3 meses, agrupados por marca.
Statuses a incluir: seo_approved, scheduled, published.

  SELECT
    ci.id,
    ci.title,
    ci.gbp_post_content,
    ci.gbp_scheduled_date,
    ci.gbp_status,
    ci.final_published_url,
    ps.nombremarca,
    ps.dominioprincipal,
    ps.id as proyecto_id
  FROM content_items ci
  INNER JOIN proyectos_seo ps ON ps.id = ci.proyecto_id
  WHERE ci.content_type = 'blog_post'
    AND ci.gbp_status IN ('seo_approved', 'scheduled', 'published')
    AND ci.gbp_scheduled_date >= CURRENT_DATE
    AND ci.gbp_scheduled_date < CURRENT_DATE + INTERVAL '90 days'
  ORDER BY ci.gbp_scheduled_date ASC;


ACCIONES QUE EL FRONTEND DEBE IMPLEMENTAR
==========================================
Todas son operaciones PATCH sobre content_items. Usa service_role del lado del servidor.

1. APROBAR borrador
   PATCH /content_items?id=eq.<content_item_id>
   Body: {
     "gbp_status": "seo_approved",
     "gbp_post_content": "<texto_editado_o_el_mismo>",
     "gbp_notes": "<nota_opcional>",
     "updated_at": "<iso_timestamp>"
   }

2. RECHAZAR borrador
   PATCH /content_items?id=eq.<content_item_id>
   Body: {
     "gbp_status": "rejected",
     "gbp_notes": "<motivo_obligatorio_no_puede_estar_vacío>",
     "updated_at": "<iso_timestamp>"
   }
   Validación: gbp_notes es OBLIGATORIO al rechazar. Bloquea la acción si está vacío.

3. CONFIRMAR EN CALENDARIO (seo_approved → scheduled)
   PATCH /content_items?id=eq.<content_item_id>
   Body: {
     "gbp_status": "scheduled",
     "updated_at": "<iso_timestamp>"
   }

4. EDITAR contenido del post GBP (inline, sin cambiar status)
   PATCH /content_items?id=eq.<content_item_id>
   Body: {
     "gbp_post_content": "<texto_nuevo>",
     "updated_at": "<iso_timestamp>"
   }
   Regla de negocio: el texto NO puede superar 70 palabras. Muestra contador en vivo.


ESPECIFICACIÓN FUNCIONAL — VISTA LÍDER SEO
===========================================
Ruta: /team/local-seo-hub (tab o sección "GBP" o "Google Business Profile")
Solo visible si el usuario autenticado tiene proyectos donde es lider_id.

Componente principal: lista de tarjetas, una por artículo con gbp_status = 'draft_ready'.

Cada tarjeta muestra:
  - Nombre de la marca (proyectos_seo.nombremarca)
  - Título del artículo (content_items.title)
  - Keyword principal (content_items.main_keyword)
  - Fecha GBP calculada (content_items.gbp_scheduled_date) — formato: "Semana del DD MMM YYYY"
  - Texto del post GBP (content_items.gbp_post_content) — editable inline
    · Textarea con contador de palabras en tiempo real
    · Límite visual: 70 palabras (aviso si se supera, bloquear guardar si > 80)
  - URL del artículo si existe (content_items.final_published_url) — link externo
  - Botón APROBAR → ejecuta acción 1
  - Botón RECHAZAR → abre campo de texto obligatorio para gbp_notes, luego ejecuta acción 2
  - Estado visual del resultado (toast o badge inline)

Si no hay borradores pendientes: mostrar estado vacío "No hay borradores GBP pendientes
de revisión para tus proyectos."


ESPECIFICACIÓN FUNCIONAL — VISTA CALENDARIO TRIMESTRAL
=======================================================
Ruta: /team/local-seo-hub (tab "Calendario GBP")
Visible para todo el equipo.

Muestra los próximos 90 días de posts GBP agendados.
Agrupación: por mes → dentro de cada mes, ordenado por fecha.

Cada ítem muestra:
  - Fecha exacta (gbp_scheduled_date) — formato "Lunes 2 Jun 2026"
  - Nombre de la marca (nombremarca)
  - Extracto del post GBP (primeras 100 chars de gbp_post_content + "...")
  - Badge de estado:
      seo_approved → "Aprobado"   (color amarillo/naranja)
      scheduled    → "Agendado"   (color azul)
      published    → "Publicado"  (color verde)
  - Si gbp_status = 'seo_approved': botón "Confirmar en calendario" → ejecuta acción 3

Sidebar o resumen: contador por marca de cuántos posts tiene en el trimestre
(meta = 4/mes × 3 meses = 12 máximo).


REGLAS DE NEGOCIO IMPORTANTES
==============================
- Solo mostrar content_items con content_type = 'blog_post'. Nunca service_page ni otros.
- El líder solo ve/edita artículos de proyectos donde proyectos_seo.lider_id = su UUID.
- El calendario trimestral es de solo lectura excepto el botón "Confirmar en calendario".
- gbp_post_content tiene el texto listo para publicar en GBP, ya con emojis y CTA incluidos.
  El líder puede editarlo antes de aprobar pero no es obligatorio.
- La fecha gbp_scheduled_date ya está calculada por la automatización. El frontend
  NO la recalcula ni la modifica. Solo la muestra.
- Si un artículo tiene gbp_status = 'over_quota', no aparece en ninguna vista del panel
  GBP. Eso se gestiona automáticamente en el siguiente ciclo.
- Al rechazar, el campo gbp_notes queda guardado como historial del motivo.
  El artículo no desaparece de la DB, solo cambia su gbp_status a 'rejected'.


REFERENCIA DE ESTADOS — BADGES
================================
Usa estos valores exactos de gbp_status para los badges:

  'draft_ready'   → label: "Borrador listo"   — requiere acción del líder
  'seo_approved'  → label: "Aprobado"          — pendiente de confirmar fecha
  'scheduled'     → label: "Agendado"          — en el calendario trimestral
  'published'     → label: "Publicado"         — ya publicado en GBP
  'rejected'      → label: "Rechazado"         — con motivo en gbp_notes
  'over_quota'    → label: "Sin cupo"          — no visible en el panel GBP
  'pending'       → label: "Pendiente"         — en proceso, no visible en el panel GBP


NOTAS TÉCNICAS ADICIONALES
===========================
- No crear tablas nuevas. Todo vive en content_items + proyectos_seo.
- No modificar gbp_scheduled_date desde el frontend. Es de solo lectura.
- Las notificaciones al líder ya se generan automáticamente desde la Edge Function
  en notifications_outbox. No implementes lógica de notificación en el frontend.
- El campo dedupe_key en notifications_outbox es 'gbp_draft_<content_item_id>'
  para evitar duplicados.
- La Edge Function que genera los borradores se llama gbp-post-generator y ya está
  en producción. El frontend NO la llama directamente.
- Para recargar la lista después de aprobar/rechazar: invalidar la query del listado
  (revalidatePath o mutate según el patrón del proyecto).
- Manejar el caso donde gbp_post_content es null pero gbp_status es draft_ready
  (error en generación): mostrar mensaje "Error al generar borrador. Contacta soporte."
```
