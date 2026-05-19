# SEO Analysis — Mini-app de prueba (Vite + React + Supabase)

App standalone para probar el flujo real **end-to-end** contra el proyecto Supabase **Light_House** (`stjugsrkrweakvzmizpq`).

Pegás una URL → llama al RPC real → corre el pipeline real de Ahrefs → muestra cada etapa en vivo por Postgres Realtime → renderiza el informe real cuando termina.

---

## 1. Preparar Supabase (UNA sola vez)

### 1.1. Correr el bootstrap SQL

Abrí el **SQL Editor** del proyecto Light_House en supabase.com y pegá el contenido de [`bootstrap.sql`](./bootstrap.sql). Ejecutalo.

Esto otorga:
- `USAGE` y `SELECT` sobre el esquema `ahrefs_web_analysis` para `anon` y `authenticated`
- `EXECUTE` sobre los RPCs `ahrefs_enqueue_url_analysis` y `ahrefs_dispatch_ready_analysis_requests`
- Políticas RLS de **solo lectura** sobre las 13 tablas que la app usa
- Agrega las tablas a la publicación `supabase_realtime`

> ⚠️ Las políticas RLS de este bootstrap son **permisivas para testing**. En producción reemplazalas por reglas reales por cliente / usuario.

### 1.2. Exponer el esquema en la API (paso manual)

En el Dashboard de Supabase:

```
Settings → API → Exposed schemas
```

Agregá **`ahrefs_web_analysis`** a la lista (debajo de `public`). Guardá.

Sin este paso, `supabase.schema('ahrefs_web_analysis').from(...)` devuelve 404.

### 1.3. Verificar que las credenciales están

En el mismo Dashboard:

```
Settings → API → Project URL  → debería ser https://stjugsrkrweakvzmizpq.supabase.co
Settings → API → anon public  → copialo, lo vamos a usar abajo
```

---

## 2. Levantar la app local

```bash
cd frontend/seo-analysis-app

# 1. Variables de entorno
cp .env.example .env
# Editá .env y pegá la anon key real

# 2. Dependencias
npm install

# 3. Dev server
npm run dev
```

Abre automáticamente <http://localhost:5173>.

---

## 3. Flujo de prueba end-to-end

1. La home redirige a `/seo/analisis` (tablero general) — vas a ver los análisis previos que ya tenías cargados (Volkswagen Perú, Top Doctors España).
2. Click en **"+ Nuevo análisis"**.
3. Pegá una URL nueva (ej: `https://www.lego.com/es-es`), seleccioná país, ajustá profundidad (recomendado 500).
4. Click en **Iniciar análisis**.
5. Te redirige a `/seo/analisis/<id>` — la barra de progreso y las 12 etapas se van poniendo en verde **en vivo**, por Realtime, sin recargar.
6. Cuando termina, aparece **"Ver informe completo →"**.

Durante el flujo verás cómo se popula la card del **Snapshot del dominio** (DR, tráfico, valor de tráfico, keywords) en cuanto el agente de valuación termina.

---

## 4. Rutas

| Ruta | Componente | Qué muestra |
|---|---|---|
| `/` | redirect | a `/seo/analisis` |
| `/seo/analisis` | `DashboardPage` | Tabla de todos los `analysis_requests` |
| `/seo/analisis/nuevo` | `NewAnalysisPage` | Form: URL + cliente + país + slider de profundidad |
| `/seo/analisis/:id` | `AnalysisProgress` | Checklist en vivo de 12 etapas |
| `/seo/analisis/:id/informe` | `AnalysisReport` | Las 6 secciones del informe renderizadas |

---

## 5. Solución de problemas

| Síntoma | Causa | Fix |
|---|---|---|
| `permission denied for schema ahrefs_web_analysis` | No corriste `bootstrap.sql` | Correlo desde el SQL Editor |
| `relation "...analysis_requests" does not exist` (404 API) | Esquema no expuesto | Settings → API → Exposed schemas → agregar `ahrefs_web_analysis` |
| El form devuelve `function ahrefs_enqueue_url_analysis(...) does not exist` | Falta `EXECUTE` para anon | Correlo del bootstrap o `GRANT EXECUTE ...` manual |
| Las etapas no avanzan en vivo (pero la BD sí progresa) | Realtime no incluye las tablas | Correlo del bootstrap, sección 5 |
| El form se queda en "Iniciando…" | La RPC tarda > 30s o el rol no tiene `EXECUTE` | Mirá la consola del navegador, suele ser el mensaje del PostgrestError |
| El snapshot del dominio no aparece | El runner `ahrefs-batch-valuation-runner` no fue invocado | El orquestador estándar no lo dispara — está documentado en el módulo de producción |

---

## 6. Estructura del proyecto

```
frontend/seo-analysis-app/
├── bootstrap.sql              ← prepara Supabase
├── .env.example
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── index.html
└── src/
    ├── main.tsx               ← entry + BrowserRouter
    ├── App.tsx                ← rutas
    ├── index.css              ← Tailwind directives
    ├── lib/supabase.ts        ← cliente Supabase desde .env
    ├── types.ts               ← tipos del esquema
    ├── hooks/
    │   ├── useAnalysisPipeline.ts    ← Realtime + estado derivado de 12 stages
    │   └── useReportSections.ts      ← Carga las 6 secciones del informe
    └── components/
        ├── Layout.tsx                ← Sidebar + topbar
        ├── DashboardPage.tsx         ← Tabla con todos los análisis
        ├── NewAnalysisPage.tsx       ← Form que llama al RPC real
        ├── AnalysisProgress.tsx      ← Checklist en vivo
        ├── AnalysisReport.tsx        ← Render markdown del informe
        ├── StageRow.tsx              ← Fila individual del checklist
        └── MetricsSummary.tsx        ← Cards de DR / tráfico / valor
```

---

## 7. Limitaciones conocidas

1. **No tiene auth**. Cualquiera con la anon key + URL puede ver y crear análisis. Para producción se integra con el auth de Light_House (tu sistema existente).
2. **El tablero no muestra "quién consultó qué"**. Para eso hay que agregar columna `created_by uuid` (FK a `auth.users`) en `analysis_requests` y filtrar por sesión activa.
3. **El valuation runner (DR, tráfico total) no se dispara automáticamente** desde el orquestador estándar. Si necesitás esos datos en cada nuevo análisis, hay que añadir la invocación al edge function `ahrefs-batch-valuation-runner` dentro de `ahrefs-total-orchestrator` (o llamarlo desde la app después de que termine la ingesta principal).
