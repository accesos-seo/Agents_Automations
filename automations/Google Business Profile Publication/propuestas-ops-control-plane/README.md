# Propuestas OPS Control Plane — Google Business Profile Publication

Este directorio contiene todos los artefactos técnicos listos para implementar o ya implementados en producción: migraciones SQL, código de Edge Functions, specs de frontend y documentación técnica de soporte.

---

## Índice de artefactos

| Artefacto | Ruta | Estado |
|---|---|---|
| Migración SQL — trigger GBP | `01-database-migrations/001_gbp_trigger.sql` | ✅ Aplicado en producción |
| Edge Function fuente | `02-edge-functions/gbp-post-generator/index.ts` | ✅ Desplegado v2 ACTIVE |
| Spec frontend (prompt para IA) | `03-frontend-spec/frontend-spec.md` | 🔴 Pendiente implementación |
| Arquitectura detallada | `architecture.md` | ✅ Documentado |
| Modelo de datos | `data-model.md` | ✅ Documentado |
| Runbook operacional | `runbook.md` | ✅ Documentado |
| Mapa de secrets | `SECRETS.md` | ✅ Documentado |
| Historial de cambios | `CHANGELOG.md` | ✅ Documentado |

---

## Cómo usar este directorio

- **Para aplicar la migración SQL:** usa `supabase db push` o el MCP `apply_migration` contra el proyecto `stjugsrkrweakvzmizpq`. La migración ya está aplicada — no la re-ejecutes.
- **Para desplegar la Edge Function:** usa `supabase functions deploy gbp-post-generator` o el MCP `deploy_edge_function`. La versión 2 ya está activa.
- **Para el frontend:** entrega `03-frontend-spec/frontend-spec.md` al agente de frontend. Contiene el prompt completo con queries, tipos, acciones y reglas de negocio.
