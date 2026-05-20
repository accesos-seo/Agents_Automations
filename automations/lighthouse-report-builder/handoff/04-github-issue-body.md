# [GitHub Issue Template] Bug fix + Integración con pipeline backend

> **Cómo usar este archivo:** copiá el contenido entre `---` (sin estas instrucciones) y pegalo como un nuevo issue en el repo del frontend (`light-house-app-agency-main`). Editá solo el título y el @mention al final si corresponde.

---

**Título sugerido:**
```
[Lighthouse] Fix "No user ID available" + integración completa con pipeline backend
```

---

## Resumen

Al hacer click en **"Iniciar análisis"** en la pantalla "Análisis Ahrefs (Lighthouse)" → tab **"Marcas externas"**, la consola arroja:

```
index-CfamSeR2.js:8280 No user ID available
```

y el insert en `ahrefs_web_analysis.analysis_requests` nunca se ejecuta. La pantalla queda en estado "DISPATCHED" pero el pipeline real no arranca porque no se insertó nada en BD.

El bug es de **autenticación / hidratación de sesión Supabase**, no del pipeline. El backend está 100% funcional y validado.

## Contexto del sistema

Lighthouse es un módulo SEO embebido en ORBIT que dispara un pipeline de 8 agentes en Supabase y genera un informe en Google Docs con notificación por Slack. Toda la infraestructura backend ya está desplegada y corriendo.

Documentación completa del backend en este branch del repo de automations:
**Branch:** `claude/setup-vite-dev-server-PMMGE`
**Path raíz:** `automations/lighthouse-report-builder/`

## Paquete de información completo

Toda la información necesaria para resolver este bug y validar el pipeline está en estos 4 documentos:

### 📋 1. Diagnóstico del bug actual
**[`handoff/00-DIAGNOSTICO-NO-USER-ID.md`](https://github.com/accesos-seo/Agents_Automations/blob/claude/setup-vite-dev-server-PMMGE/automations/lighthouse-report-builder/handoff/00-DIAGNOSTICO-NO-USER-ID.md)**

- Hipótesis priorizadas (la más probable es race condition de hidratación)
- Snippets de diagnóstico para correr en DevTools Console
- Código de solución completo para cada hipótesis
- Hook React `useSupabaseAuth` listo para copiar

### 🔷 2. Tipos TypeScript del schema completo
**[`handoff/01-database-types.ts`](https://github.com/accesos-seo/Agents_Automations/blob/claude/setup-vite-dev-server-PMMGE/automations/lighthouse-report-builder/handoff/01-database-types.ts)**

Generado automáticamente desde Supabase. Incluye TODOS los schemas (`public`, `ahrefs_web_analysis`, etc).

Usar así:
```ts
import type { Database } from "./path/to/01-database-types";
const supabase = createClient<Database>(url, anonKey);
```

Obtenés autocompletado y type-safety total en queries.

### 🌐 3. Contratos de Edge Functions
**[`handoff/02-edge-functions-contracts.md`](https://github.com/accesos-seo/Agents_Automations/blob/claude/setup-vite-dev-server-PMMGE/automations/lighthouse-report-builder/handoff/02-edge-functions-contracts.md)**

- Payloads exactos de las 5 edge functions
- Cómo manejar el `x-internal-secret` (opción proxy en backend ORBIT)
- Ejemplos de errores comunes y cómo manejarlos
- Diagrama del flujo de invocaciones

### ✅ 4. Checklist de validación
**[`handoff/03-validation-checklist.md`](https://github.com/accesos-seo/Agents_Automations/blob/claude/setup-vite-dev-server-PMMGE/automations/lighthouse-report-builder/handoff/03-validation-checklist.md)**

11 pasos para validar end-to-end después del fix. Cada paso tiene SQL específico para verificar en la BD.

### 📚 5. Brief técnico completo (referencia)
**[`FRONTEND_INTEGRATION_BRIEF.md`](https://github.com/accesos-seo/Agents_Automations/blob/claude/setup-vite-dev-server-PMMGE/automations/lighthouse-report-builder/FRONTEND_INTEGRATION_BRIEF.md)**

Documento completo de integración con flujo, tablas, queries y componentes UI. Es el "manual de referencia".

---

## Datos del proyecto Supabase

| Item | Valor |
|---|---|
| Project URL | `https://stjugsrkrweakvzmizpq.supabase.co` |
| Project ref | `stjugsrkrweakvzmizpq` |
| Schema principal | `ahrefs_web_analysis` |
| Tabla del INSERT | `ahrefs_web_analysis.analysis_requests` |
| SQL Editor | https://supabase.com/dashboard/project/stjugsrkrweakvzmizpq/sql/new |

**ANON_KEY público:** disponible en el Dashboard → Settings → API. Es seguro exponerlo en el frontend.

**INTERNAL_SECRET para edge functions:** NO debe quedar en el frontend. Va por proxy del backend de ORBIT (ver doc `02-edge-functions-contracts.md` sección "Manejo del x-internal-secret").

---

## Definition of Done

El issue se cierra cuando se cumpla el checklist completo del archivo [`03-validation-checklist.md`](https://github.com/accesos-seo/Agents_Automations/blob/claude/setup-vite-dev-server-PMMGE/automations/lighthouse-report-builder/handoff/03-validation-checklist.md):

- ✅ Usuario logueado en ORBIT, `supabase.auth.getUser()` devuelve user real
- ✅ Click "Iniciar análisis" → INSERT en `analysis_requests` con `created_by` NO null
- ✅ Las 10 etapas del pipeline cierran una a una en el frontend
- ✅ Se genera el report con 6 secciones markdown
- ✅ Botón "Descargar Markdown" descarga archivo .md
- ✅ Botón "Crear Google Doc" abre Doc con identidad SeoLab
- ✅ Especialista recibe DM en Slack
- ✅ Canal `#informes-seo` recibe copia
- ✅ Vista `v_pipeline_health` muestra todos los counts en 0

---

## Contacto para dudas

- **Backend / BD / Edge Functions:** [Tu nombre / Slack handle]
- **Supabase Dashboard:** [Quién tiene acceso admin]
- **Slack workspace:** SeoLab Agency

Cualquier pregunta sobre el contrato de datos o comportamiento del pipeline, mencioná @[tu_usuario] en este issue.

cc @[técnico_responsable_frontend]
