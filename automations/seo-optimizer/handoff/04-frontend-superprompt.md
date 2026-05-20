# Super-prompt para el desarrollador del front-end

Copia-pega el contenido de este documento al desarrollador front-end (o a Claude/Cursor en modo desarrollo de front). Está diseñado para ser autocontenido.

---

```
ROL: Eres un desarrollador frontend senior con experiencia en React/Next.js y Supabase.
PROYECTO: Orbit (plataforma interna de la agencia SEO Lab). Stack: <CONFIRMAR — supuesto Next.js + Tailwind + Supabase JS SDK>.

OBJETIVO: Construir dos pestañas nuevas en Orbit para el módulo `seo-optimizer`:
  1. "SEO Review" — bandeja de oportunidades pendientes de aprobar/rechazar (audiencia: especialista SEO)
  2. "Redactor Inbox" — bandeja de reescrituras listas para implementar en CMS (audiencia: redactor / copywriter)

ENTORNO BACKEND (ya construido y desplegado):
- Supabase project: Light_House (id: stjugsrkrweakvzmizpq)
- Schema dedicado: seo_optimizer
- 9 tablas + 6 vistas + 4 cron jobs activos
- Backend Python en Railway expone 8 endpoints (no necesitas llamarlos directamente — el front opera sobre la DB)

═══════════════════════════════════════════════════════════════════
PESTAÑA 1: "SEO Review"
═══════════════════════════════════════════════════════════════════

VISTA PRINCIPAL: Lista de oportunidades pendientes, agrupadas por cliente.

QUERY BASE:
  SELECT * FROM seo_optimizer.v_pending_decisions ORDER BY client_id, rank_within_client;

COLUMNAS DISPONIBLES en v_pending_decisions:
  opportunity_id, run_id, client_id, client_name,
  content_item_id, article_url, article_title, article_language,
  category, score, rank_within_client, traffic_potential_estimate,
  effort_level ('low'|'medium'|'high'),
  confidence ('high'|'medium'|'low'),
  recommendation_summary (text),
  evidence (jsonb — estructura distinta por categoría),
  created_at, days_since_proposed,
  urgency ('fresh'|'aging'|'stale'|'overdue')

DISEÑO UI:

┌─────────────────────────────────────────────────────────────────┐
│  SEO Review — N oportunidades pendientes                        │
│  [Filtros: Cliente ▾] [Categoría ▾] [Urgencia ▾]               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ▼ Cliente: Acme Corp (10 oportunidades)                        │
│                                                                  │
│   #1 striking_distance  • Score 1240 • EFFORT: low  CONF: high  │
│   "Cómo elegir un CRM" (cómo-elegir-crm)                        │
│   → 6 queries en posiciones 5-15 con +540 clicks/mes potencial  │
│   [Ver detalle ▼]  [✓ Aprobar]  [✗ Rechazar]                   │
│                                                                  │
│   #2 low_ctr  • Score 890 • EFFORT: low  CONF: high             │
│   "10 errores de email marketing" (errores-email-marketing)     │
│   → CTR muy bajo en 4 queries, ~320 clicks/mes en juego         │
│   [Ver detalle ▼]  [✓ Aprobar]  [✗ Rechazar]                   │
│                                                                  │
│   ...                                                            │
│                                                                  │
│  ▶ Cliente: Beta SaaS (8 oportunidades)                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

VISTA DE DETALLE (al expandir una row):
- Mostrar `evidence` formateado según la categoría:
  * decay: lista de top queries lost con before/after clicks y position
  * striking_distance: tabla de queries con posición + impresiones + clicks proyectados
  * low_ctr: tabla con queries + CTR actual vs esperado
  * semantic_coverage: lista de keywords huérfanas con impresiones
  * cannibalization: tabla con URLs competidoras + posiciones
  * intent_mismatch: declared_intent vs dominant_query_intent + queries afectadas
- Mostrar `recommendation_details` (jsonb estructurado, con campo "action", "tactics")
- Link al artículo: target="_blank" a `article_url`

ACCIONES:

1. APROBAR — handler:
   await supabase
     .schema('seo_optimizer')
     .from('opportunities')
     .update({
       status: 'approved',
       decided_by: currentUser.id,
       decided_at: new Date().toISOString()
     })
     .eq('id', opportunity_id);

   IMPORTANTE: el DB trigger `opportunities_approved_dispatch` automáticamente
   dispara al backend writer (POST a Railway). NO llames al backend tú.
   Mostrar toast: "Aprobada. Generando reescritura..." y refrescar la lista.

2. RECHAZAR — handler:
   - Abrir modal con textarea "Motivo del rechazo (opcional)"
   - await supabase
       .schema('seo_optimizer')
       .from('opportunities')
       .update({
         status: 'rejected',
         decided_by: currentUser.id,
         decided_at: new Date().toISOString(),
         decision_reason: <textarea-value>
       })
       .eq('id', opportunity_id);

   Trigger `opportunities_rejected_log` copia automáticamente a rejection_log.
   Mostrar toast: "Rechazada. No se volverá a proponer."

3. INDICADORES VISUALES:
   - `urgency='overdue'` → badge rojo "⚠️ Vencida >30d"
   - `urgency='stale'` → badge amarillo "⏰ >14d"
   - `confidence='high'` + `effort_level='low'` → estrella verde (quick win)
   - `category='low_ctr'` → ícono distintivo (es la categoría con mayor ROI/esfuerzo)

═══════════════════════════════════════════════════════════════════
PESTAÑA 2: "Redactor Inbox"
═══════════════════════════════════════════════════════════════════

VISTA PRINCIPAL: Lista de reescrituras listas para implementar en CMS.

QUERY BASE:
  SELECT * FROM seo_optimizer.v_ready_for_writer ORDER BY client_id, urgency, generated_at;

COLUMNAS DISPONIBLES en v_ready_for_writer:
  opportunity_id, rewrite_id, client_id, client_name,
  article_url, article_title, article_language, category,
  recommendation_summary, change_summary, diff_html, proposed_title_tag,
  proposed_meta_description, proposed_h1, proposed_html,
  generated_at, days_since_approved, urgency

DISEÑO UI:

┌─────────────────────────────────────────────────────────────────┐
│  Redactor Inbox — N reescrituras pendientes                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ✍️  Acme Corp — "Cómo elegir un CRM"                         │
│   Categoría: striking_distance · Aprobada hace 2 días           │
│   ▶ Cambios: agregar H2 sobre criterios de selección, expandir  │
│     sección de comparación, reescribir intro                    │
│   [Ver diff y HTML →]  [✓ Marcar implementado]                  │
│                                                                  │
│   ✍️  Beta SaaS — "10 errores de email marketing"               │
│   Categoría: low_ctr · Aprobada hoy                             │
│   ▶ Cambios: nuevo title y meta description optimizados         │
│   [Ver diff y HTML →]  [✓ Marcar implementado]                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

VISTA DE DETALLE (panel lateral o modal full-width):

┌────────────────────────────────────────────────────────────┐
│  [URL: https://acme.com/blog/como-elegir-crm]              │
│                                                             │
│  ━━━ TITLE TAG ━━━                                          │
│  Actual:  "Cómo elegir un CRM | Acme"                       │
│  Nuevo:   "Cómo elegir un CRM en 2026: guía paso a paso"   │
│  [Copiar al portapapeles]                                   │
│                                                             │
│  ━━━ META DESCRIPTION ━━━                                   │
│  Actual:  "Te explicamos cómo elegir un CRM..."             │
│  Nuevo:   "Aprende a elegir el CRM ideal para..."           │
│  [Copiar al portapapeles]                                   │
│                                                             │
│  ━━━ CUERPO (DIFF) ━━━                                      │
│  <diff_html renderizado con <ins>/<del>>                    │
│                                                             │
│  ━━━ HTML PROPUESTO (LISTO PARA PEGAR EN CMS) ━━━           │
│  [Bloque <pre> con proposed_html]                           │
│  [Copiar HTML completo]                                     │
│                                                             │
│  ━━━ RESUMEN DEL CAMBIO ━━━                                 │
│  <change_summary>                                           │
└────────────────────────────────────────────────────────────┘

ACCIONES:

1. MARCAR IMPLEMENTADO:
   - Confirm: "¿Ya publicaste estos cambios en el CMS?"
   - await supabase
       .schema('seo_optimizer')
       .from('opportunities')
       .update({
         status: 'implemented',
         implemented_by: currentUser.id,
         // implemented_at se setea automáticamente por el trigger si no se pasa
       })
       .eq('id', opportunity_id);
   - Trigger `opportunities_implemented_reeval` setea reeval_due_at = NOW() + 45 days.
   - Mostrar: "Marcado. Re-evaluación automática en 45 días (DD/MM/YYYY)."

2. RENDERIZAR DIFF SAFELY:
   El campo `diff_html` viene con <ins> y <del> estilados inline.
   Usa dangerouslySetInnerHTML con sanitización (DOMPurify) — el HTML lo generó
   nuestro propio backend pero igual sanitiza por defensa en profundidad.

═══════════════════════════════════════════════════════════════════
COMPONENTES SECUNDARIOS (opcionales pero recomendados)
═══════════════════════════════════════════════════════════════════

A. WIDGET "Salud del pipeline" (visible para admins):
   SELECT * FROM seo_optimizer.v_pipeline_health;
   Mostrar como tarjetas con counters: runs_stuck, opportunities_pending_stale,
   reevals_overdue, alerts_sent_24h.
   Cualquier counter no-cero en runs_stuck o outbox_stale_locks → badge rojo.

B. WIDGET "Outcomes summary" (dashboard ejecutivo):
   SELECT * FROM seo_optimizer.v_outcomes_summary;
   Mostrar tabla por categoría con: total_proposed, approval_rate_pct,
   implementation_rate_pct, success_rate_pct.
   Es la prueba pública de que el sistema funciona — destacarlo.

C. WIDGET "Próximas re-evaluaciones":
   SELECT * FROM seo_optimizer.v_reeval_due_next_7d;
   Card que muestra qué artículos serán re-evaluados próximamente.

═══════════════════════════════════════════════════════════════════
AUTENTICACIÓN Y AUTORIZACIÓN
═══════════════════════════════════════════════════════════════════

Por ahora RLS está DESHABILITADO en el schema seo_optimizer. Esto significa:
- Cualquier llamada con `service_role` lee/escribe todo.
- Cualquier llamada con `anon` lee/escribe todo (peligroso).

POR LO TANTO: el frontend NO debe usar el anon key directamente para escribir.
Opciones:
  a) Usar service_role desde un backend proxy (recomendado)
  b) Habilitar RLS con políticas antes de exponer el front (mejor pero más trabajo)

Si vas por (a), construye API routes en Next.js (`/api/seo-optimizer/approve`,
`/api/seo-optimizer/reject`, `/api/seo-optimizer/implement`) que validen
permisos del usuario logueado contra Orbit y luego usen service_role.

═══════════════════════════════════════════════════════════════════
PERSONAS Y PERMISOS
═══════════════════════════════════════════════════════════════════

- Especialista SEO: puede aprobar/rechazar; ve la pestaña "SEO Review".
- Redactor: puede marcar como implementado; ve la pestaña "Redactor Inbox".
- Admin: ve ambas + widget de salud del pipeline.
- CEO/cliente: NO acceso directo en v1.

Verificar `currentUser.role` y mostrar/ocultar pestañas correspondientes.

═══════════════════════════════════════════════════════════════════
ENV VARS NECESARIAS EN EL FRONT
═══════════════════════════════════════════════════════════════════

NEXT_PUBLIC_SUPABASE_URL = https://stjugsrkrweakvzmizpq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = <anon key>
SUPABASE_SERVICE_ROLE_KEY = <service role, SOLO server-side>

═══════════════════════════════════════════════════════════════════
DELIVERABLES ESPERADOS
═══════════════════════════════════════════════════════════════════

1. Componente <SeoReviewPanel /> con la lista, expand, aprobar, rechazar.
2. Componente <RedactorInbox /> con la lista, vista detalle, copia HTML, marcar implementado.
3. API routes para las 3 mutaciones (approve, reject, implement).
4. (Opcional) Widget <PipelineHealth /> y <OutcomesSummary /> para admins.
5. Tests E2E básicos: navegar, aprobar 1, verificar que aparezca en redactor inbox cuando el writer agente termine (~30-60s).

═══════════════════════════════════════════════════════════════════
NOTAS FINALES
═══════════════════════════════════════════════════════════════════

- El campo `evidence` es JSONB con estructura distinta por categoría. Revisa
  ejemplos en `02-agents/analyst/categories/*.py` (cada categoría documenta
  su estructura de evidence).
- El backend ya hace todo el trabajo pesado: tú solo lees vistas y haces
  UPDATEs simples. Los triggers DB se encargan del resto.
- Si algo no te encaja, lee `seo-optimizer/ARCHITECTURE.md` — es el documento
  canónico de diseño.
- Cualquier duda técnica, abre issue en el repo con tag `frontend`.
```

---

## Notas para quien le entrega este prompt

- El stack del front de Orbit se asume Next.js + Supabase JS SDK. **Verificar y ajustar la 1ra línea del prompt** antes de entregar.
- Si el stack es distinto (Remix, SvelteKit, Vue, etc.), el prompt sigue siendo válido — solo cambia la sintaxis de los componentes.
- Las queries son SQL puro contra vistas — funcionan desde cualquier cliente Supabase (web, mobile, server).
