# Propuestas para `accesos-seo/ops-control-plane`

> Esta carpeta contiene **toda la implementación técnica** de la automatización `cuentas-de-cobro-freelancers`. Su lugar definitivo es el repo `accesos-seo/ops-control-plane` bajo el path sugerido `automation_projects/03-freelancer-invoices/`. Mientras se hace esa migración, vive aquí como propuesta lista para aplicar.

---

## Contenido

```
propuestas-ops-control-plane/
├── README.md                          ← este archivo
├── CHANGELOG.md                       ← histórico de versiones
├── SECRETS.md                         ← mapa de secretos (LÉELO PRIMERO)
├── .env.example                       ← plantilla local con placeholders
├── architecture.md                    ← arquitectura técnica completa
├── data-model.md                      ← tablas, columnas, índices
├── runbook.md                         ← operación y troubleshoot
├── 01-database-migrations/
│   ├── README.md                     ← orden de aplicación + rollback
│   ├── 001_schema.sql                ← enum + 3 tablas + RLS + triggers
│   ├── 002_functions.sql             ← 10 funciones SQL de negocio
│   ├── 003_cron_jobs.sql             ← 4 cron jobs (URL+secret desde Vault)
│   ├── 004_policy_and_seed.sql       ← política + seed inicial
│   └── 005_secrets_setup.sql         ← Vault helpers (REEMPLAZAR placeholders)
├── 02-edge-functions/
│   ├── freelancer-invoice-document-builder/
│   │   └── index.ts                  ← Deno: arma Google Doc + dispatch
│   └── freelancer-invoice-outbox-worker/
│       └── index.ts                  ← Deno: envía emails vía Mailjet
└── 03-frontend-spec/
    └── frontend-spec.md              ← spec detallada para construir el frontend
```

---

## Cómo migrar al repo definitivo

Cuando el desarrollador tenga acceso al repo `accesos-seo/ops-control-plane`:

```bash
cd ops-control-plane
mkdir -p automation_projects/03-freelancer-invoices
cp -R <ruta>/propuestas-ops-control-plane/* automation_projects/03-freelancer-invoices/

git add automation_projects/03-freelancer-invoices
git commit -m "feat: importar cuentas-de-cobro-freelancers v1.0 desde Agents_Automations"
git push
```

Después de la migración, esta carpeta puede:

a) **Eliminarse** y reemplazarse por un README breve apuntando al repo definitivo, o
b) **Mantenerse vacía** con un README apuntando al path en `ops-control-plane` (como hace `seo-content-swarm-engine`).

---

## Estado actual de despliegue

| Componente | Estado | Notas |
|---|---|---|
| Migraciones SQL | ✅ Aplicadas en Light_House | Historial en Supabase: `freelancer_invoices_v1_*`, `_v2_*`, `_v3_*` |
| Edge Functions | ✅ Desplegadas (v4 + v2) | `verify_jwt: false`, validan header secret |
| pg_cron jobs | ✅ 4 activos | Generator 09:00, doc-builder cada 10min, outbox-worker cada 5min, escalator 10:00 |
| Vault secrets | ✅ Configurados | `FREELANCER_INVOICE_INTERNAL_SECRET`, `FREELANCER_INVOICE_PROJECT_URL` |
| Functions secrets | ✅ Configurados | Mailjet + Google + INTERNAL_SECRET |
| Verificación E2E | ✅ 2026-05-15 | Email real recibido en `robert@seolabagency.com` |
| Frontend | ❌ Pendiente | Especificación lista en `03-frontend-spec/` |

---

## Orden recomendado para aplicar en un proyecto nuevo

1. **Aplicar migraciones base** (en orden):
   - `01-database-migrations/001_schema.sql`
   - `01-database-migrations/002_functions.sql`
   - `01-database-migrations/004_policy_and_seed.sql`

2. **Configurar secretos** (lee `SECRETS.md` primero):
   - Editar `005_secrets_setup.sql` con los valores reales **en el SQL Editor de Supabase** (no commitear con valores reales).
   - Ejecutar `005_secrets_setup.sql`.
   - Configurar Functions Secrets:
     ```bash
     supabase secrets set MAILJET_API_KEY=... MAILJET_SECRET_KEY=... \
                          GOOGLE_CALENDAR_CLIENT_ID=... \
                          GOOGLE_CALENDAR_CLIENT_SECRET=... \
                          GOOGLE_DOCS_REFRESH_TOKEN=... \
                          FREELANCER_INVOICE_INTERNAL_SECRET=<MISMO_VALOR_QUE_EN_VAULT>
     ```

3. **Programar cron jobs:**
   - `01-database-migrations/003_cron_jobs.sql`

4. **Desplegar Edge Functions:**
   ```bash
   supabase functions deploy freelancer-invoice-document-builder --no-verify-jwt
   supabase functions deploy freelancer-invoice-outbox-worker     --no-verify-jwt
   ```

5. **Cargar montos de freelancers** en `freelancer_invoice_settings` (ver `runbook.md`).

---

## Referencias cruzadas

- Plano de control y bitácora: [`../README.md`](../README.md)
- Onboarding rápido del proyecto: [`../AGENT_ONBOARDING.md`](../AGENT_ONBOARDING.md)
- Áreas de trabajo: [`../AREAS.md`](../AREAS.md)
- Política operativa (YAML): [`../politicas/cuentas-de-cobro.yaml`](../politicas/cuentas-de-cobro.yaml)
