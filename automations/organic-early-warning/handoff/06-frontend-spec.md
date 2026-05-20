# Frontend Specification — Organic Early Warning Dashboard

> Documento de especificación técnica para construcción del frontend de OEW.
> 
> **Para la IA ejecutora:** Este documento contiene TODO el contexto necesario (DB, APIs, flujos, componentes). Copy-paste el `STARTER-PROMPT-FRONTEND.md` al final como instrucción inicial.
>
> **Para el técnico:** Este documento es copy-paste en un README/SPEC para el próximo desarrollador frontend.

---

## 1. Visión General

**Objetivo:** Dashboard web ejecutivo que muestra **alertas SEO en tiempo real** (severidad WATCH/YELLOW/RED) basadas en 13 señales leading/lagging. El usuario (especialista SEO) ve:

1. **Resumen ejecutivo (home):** brands monitoreadas, alertas críticas, salud del pipeline
2. **Alertas detalladas:** lista filtrable de incidents, señales activadas, desviación estadística
3. **Análisis de brand:** drilldown a una marca específica (signals históricas, baseline, confianza)
4. **Configuración:** gestión de brands, umbrales de severidad, notificaciones

**Stack recomendado:**
- **Frontend:** React 18+ / Next.js (app router)
- **Auth:** Supabase Auth (JWT) — el usuario ya existe en la org
- **UI:** Componentes custom con tu estilo/branding existente (CSS, Tailwind, Material, lo que uses)
- **Charts:** recharts o similar para visualizar signals/trends
- **Deployment:** Vercel, GitHub Pages, o tu servidor interno

---

## 2. Arquitectura de Datos

### 2.1 Esquemas Supabase (Light_House)

```
Proyecto: stjugsrkrweakvzmizpq
Schema público (auth + notificaciones):
  ├── auth.users (Supabase managed)
  └── public.notifications_outbox (tablas heredadas)

Schema privado (hub de datos):
  └── seo_data_hub (bronze layer — datos raw de APIs externas)
      ├── brands_registry (ID, nombre, GSC URL, GA4 ID, Ahrefs domain, país)
      ├── gsc_search_analytics_weekly (tráfico semanal por URL)
      ├── ga4_events_weekly (conversiones semanales)
      ├── cwv_web_vitals_weekly (Core Web Vitals por URL)
      ├── ahrefs_domain_metrics_monthly (autoridad, backlinks)
      ├── crawl_pages (URLs descubiertas)
      └── ingestion_runs (metadatos de cada carga)

Schema privado (análisis — silver layer):
  └── organic_early_warning (análisis + alertas)
      ├── signal_definitions (13 signals: S1..S13, config, thresholds)
      ├── signal_baselines (histórico estadístico por signal/brand)
      ├── signal_events (cada vez que una signal se activa)
      ├── incidents (cluster de signal_events relacionadas)
      ├── incident_diagnostics (análisis root cause + recomendaciones)
      ├── incident_log (auditoria de incident)
      ├── analysis_runs (metadatos de cada análisis)
      ├── run_events (detalle de eventos durante análisis)
      ├── brand_routing (mapeo brand -> team_lead Slack)
      └── v_pipeline_health (vista de salud del sistema)
```

### 2.2 Modelos de Datos Principales

#### Brand (de `seo_data_hub.brands_registry`)

```typescript
interface Brand {
  id: UUID;                    // PK
  name: string;                // "Acme Corp", "TechStore"
  gsc_property_url: string;    // "sc-domain:acme.com" o "https://acme.com/"
  ga4_property_id: string;     // Google Analytics 4 ID
  ahrefs_domain: string;       // "acme.com" (sin https)
  country_iso: string;         // "CO", "AR", "MX"
  status: "active" | "paused"; // si está siendo monitoreado
  created_at: Timestamp;
  updated_at: Timestamp;
}
```

#### Signal Definition (de `organic_early_warning.signal_definitions`)

```typescript
interface SignalDefinition {
  id: UUID;
  signal_id: string;           // "S8", "S9", etc
  name: string;                // "Traffic Drop (7d MA)"
  description: string;         // explicación humana
  category: "leading" | "lagging"; // S1-S7 leading, S8-S13 lagging
  phase: "A" | "B" | "C" | "D"; // Fase de implementación
  enabled: boolean;            // si se evalúa
  config: {                    // JSON serializado
    threshold_k: number;       // MAD multiplier (ej. 3.0)
    threshold_p: number;       // percentile (ej. 0.05)
    decay_factor: number;      // smoothing (ej. 0.9)
    min_baseline_samples: number; // warmup (ej. 4)
  };
  created_at: Timestamp;
  updated_at: Timestamp;
}
```

#### Signal Event (de `organic_early_warning.signal_events`)

```typescript
interface SignalEvent {
  id: UUID;
  brand_id: UUID;              // referencia a brands_registry
  signal_id: string;           // "S8"
  iso_week: string;            // "2026-W21"
  metric_value: number;        // valor observado (ej. tráfico = 15000)
  baseline_mean: number;       // media histórica
  baseline_std: number;        // desviación estándar
  deviation_sigma: number;     // cuántos σ de distancia
  severity_hint: "WATCH" | "YELLOW" | "RED"; // nivel de anomalía
  confidence: number;          // 0-100, qué tan seguro es el alert
  root_cause_suspected: string;// "algorithm_change" | "indexation_issue" | etc
  created_at: Timestamp;
  triggered_at: Timestamp;
}
```

#### Incident (de `organic_early_warning.incidents`)

```typescript
interface Incident {
  id: UUID;
  brand_id: UUID;
  iso_week: string;
  severity: "WATCH" | "YELLOW" | "RED";
  signal_count: number;        // cuántas signals se dispararon
  status: "open" | "investigating" | "resolved" | "false_positive";
  created_at: Timestamp;
  updated_at: Timestamp;
  resolved_at: Timestamp | null;
  notes: string;               // anotaciones del especialista
  
  // Relaciones
  signal_events: SignalEvent[]; // signals que componen este incident
  diagnostics: IncidentDiagnostic[];
  logs: IncidentLog[];
}
```

#### Incident Diagnostic (de `organic_early_warning.incident_diagnostics`)

```typescript
interface IncidentDiagnostic {
  id: UUID;
  incident_id: UUID;
  detector_type: "statistical" | "behavioral" | "external";
  findings: {                  // JSON
    trend: "down" | "up" | "volatile";
    estimated_traffic_impact: number; // ej -5000 sessions
    affected_urls: string[];   // top URLs impactadas
    keywords_affected: string[]; // top keywords
    competitor_context: string; // "competitors also down" | "only us affected"
  };
  recommendation: string;      // "Check ranking drop for target keywords"
  confidence: number;          // 0-100
  created_at: Timestamp;
  
  // AI-generated fields (de edge function oew-detective)
  ai_summary: string;          // resumen ejecutivo en lenguaje natural
  ai_suggested_actions: string[]; // pasos recomendados
}
```

#### Brand Routing (de `organic_early_warning.brand_routing`)

```typescript
interface BrandRouting {
  brand_id: UUID;
  team_lead_user_id: string;   // Slack user ID "U05..."
  team_lead_email: string;     // email del especialista
  severity_threshold: "WATCH" | "YELLOW" | "RED"; // qué level notifica
  active: boolean;
  created_at: Timestamp;
}
```

---

## 3. Vistas Principales del Dashboard

### 3.1 Home / Executive Summary

**URL:** `/dashboard` o `/`

**Props/Data:**
```typescript
interface DashboardData {
  totalBrands: number;                    // 5
  activeBrands: number;                  // 4
  
  alertsSummary: {
    red: number;                         // incidents severity RED
    yellow: number;                      // incidents severity YELLOW
    watch: number;                       // incidents severity WATCH
    totalThisWeek: number;
    trend: "up" | "down" | "stable";     // comparado vs semana pasada
  };
  
  recentIncidents: Incident[];            // últimos 5
  
  pipelineHealth: {
    lastHubRun: Timestamp;               // última ingesta del hub
    hubStatus: "healthy" | "stale" | "error";
    lastOEWRun: Timestamp;               // última evaluación
    oewStatus: "healthy" | "stale" | "error";
    signalsEnabled: number;              // 5 de 13 en Fase A
    signalsEvaluating: number;           // cuántas se evalúan actualmente
  };
  
  topAffectedBrands: {                   // brands con más incidents
    brandId: UUID;
    brandName: string;
    incidentCount: number;
    severityMax: "RED" | "YELLOW" | "WATCH";
  }[];
}
```

**Layout:**
```
┌─ Header: Logo | Org Name | User Profile | Logout
├─ Sidebar: Home | Alerts | Brands | Settings | Help
│
├─ Hero Section (Big Numbers)
│  ├─ Total Brands: 5
│  ├─ 🔴 RED: 2 | 🟡 YELLOW: 3 | 🟠 WATCH: 7
│  └─ Pipeline Health: ✅ Healthy (GSC: 2h ago, OEW: 1h ago)
│
├─ Recent Incidents (Table)
│  ├─ [Brand] [Severity] [Signals] [Status] [Created] [Actions]
│  ├─ Acme Corp | RED | 3 signals | Open | 2h ago | View
│  └─ TechStore | YELLOW | 1 signal | Investigating | 4h ago | View
│
├─ Top Affected Brands (Mini chart)
│  └─ Bar chart: brand name vs incident count (últimas 4 semanas)
│
└─ Quick Actions
   ├─ [+ Add Brand]
   ├─ [Manual Trigger: Run Analysis]
   └─ [View All Incidents]
```

### 3.2 Alerts / Incidents List

**URL:** `/alerts` o `/incidents`

**Props/Data:**
```typescript
interface AlertsPageData {
  filters: {
    severityFilter: ("RED" | "YELLOW" | "WATCH")[];
    brandFilter: UUID[];
    statusFilter: ("open" | "investigating" | "resolved")[];
    dateRange: { from: Date; to: Date };
  };
  
  incidents: (Incident & {
    brandName: string;
    signalsList: SignalEvent[];
    diagnostics: IncidentDiagnostic[];
  })[];
  
  pagination: {
    total: number;
    page: number;
    limit: number;
  };
}
```

**Layout:**
```
┌─ Filters Bar
│  ├─ Severity: [Red] [Yellow] [Watch] (toggles)
│  ├─ Brand: (select dropdown, multi)
│  ├─ Status: [Open] [Investigating] [Resolved] (toggles)
│  ├─ Date Range: [from] to [to]
│  └─ [Clear All]
│
├─ Incidents Table
│  ├─ Severity | Brand | Signals | Status | Created | Updated | Actions
│  ├─ 🔴 | Acme Corp | S8, S9, S11 | Open | 2h | 1h | [View] [Resolve] [FalsePos]
│  ├─ 🟡 | TechStore | S12 | Investigating | 4h | 2h | [View] [Resolve]
│  └─ ... (paginated)
│
└─ Right sidebar or modal
   ├─ If incident selected:
   │  ├─ Incident Detail View (see 3.3)
   └─ If empty:
      └─ "No incidents matching filters"
```

### 3.3 Incident Detail / Deep Dive

**URL:** `/incidents/:id`

**Props/Data:**
```typescript
interface IncidentDetailData {
  incident: Incident & {
    brandName: string;
    signalEvents: (SignalEvent & { signalName: string })[];
    diagnostics: IncidentDiagnostic[];
    logs: IncidentLog[];
  };
  
  historicalContext: {
    brand4WeekTrend: {
      week: string;
      metric: number;
      baseline: number;
      signals: string[]; // señales activas esa semana
    }[];
    chartData: { x: string; y: number; baseline: number }[];
  };
}
```

**Layout (Vertical Scroll):**
```
┌─ Header
│  ├─ Incident ID | Severity Badge | Status Dropdown
│  ├─ Brand: [brand name] | Week: [2026-W21]
│  └─ Created: 2h ago | Updated: 1h ago | Resolved: -
│
├─ Quick Stats
│  ├─ Signals Triggered: 3 (S8, S9, S11)
│  ├─ Avg Deviation: 4.2σ
│  ├─ Traffic Impact: -15,000 sessions (est.)
│  └─ Confidence: 94%
│
├─ Signals Breakdown (Expandable cards)
│  ├─ [S8] Traffic Drop (7d MA)
│  │  ├─ Current: 15,000 sessions
│  │  ├─ Baseline: 20,000 ± 2,000
│  │  ├─ Deviation: 2.5σ
│  │  ├─ Severity: 🟡 YELLOW
│  │  └─ Confidence: 92%
│  │
│  ├─ [S9] Ranking Drop
│  │  ├─ Keywords with -5 positions: 23
│  │  ├─ Avg drop: 7 positions
│  │  ├─ Affected domains: example.com, blog.example.com
│  │  └─ ...
│  │
│  └─ [S11] Indexation Anomaly
│     └─ ...
│
├─ Diagnostics (AI-generated)
│  ├─ Summary: "Possible algorithm update or ranking drop. Traffic down 25% MoM."
│  ├─ Root Cause Suspected: "algorithm_change" (70% confidence)
│  ├─ Affected URLs: [Top 5 URLs by traffic loss]
│  ├─ Keywords Affected: [Top 10 keywords by drop]
│  ├─ Competitor Context: "Competitors also affected (5/10 tracked)"
│  └─ Recommended Actions:
│     ├─ [ ] Check ranking positions for target keywords
│     ├─ [ ] Review recent content changes
│     └─ [ ] Monitor backlink profile
│
├─ Historical Trend (Chart)
│  ├─ 4-week line chart (Traffic / Rankings / Indexation)
│  ├─ Highlight incident week
│  └─ Overlay: signal baselines
│
├─ Actions Panel
│  ├─ Status: [Dropdown: Open | Investigating | Resolved | False Positive]
│  ├─ Add Note: [Textarea]
│  ├─ [Save Note]
│  └─ [Close Incident]
│
└─ Audit Log (Collapsible)
   ├─ 2026-05-20 13:00 UTC | oew-orchestrator | incident created
   ├─ 2026-05-20 13:05 UTC | oew-detective | diagnostics generated
   └─ 2026-05-20 14:30 UTC | team_lead@org | status changed to "investigating"
```

### 3.4 Brand Analysis

**URL:** `/brands/:id`

**Props/Data:**
```typescript
interface BrandDetailData {
  brand: Brand & {
    routing: BrandRouting;
  };
  
  signals4Weeks: {
    week: string;
    signals: (SignalEvent & { signalName: string; enabled: boolean })[];
  }[];
  
  incidents4Weeks: Incident[];
  
  trafficTrend: {
    week: string;
    traffic: number;
    baseline: number;
    change_pct: number;
  }[];
  
  signalConfidence: {
    signal_id: string;
    enabled: boolean;
    recent_activations: number; // en últimas 4 semanas
    precision: number; // % de esos alerts que fueron reales
  }[];
}
```

**Layout:**
```
┌─ Header
│  ├─ Brand Name: [name]
│  ├─ GSC Property: [gsc_property_url]
│  ├─ GA4 Property: [ga4_property_id]
│  ├─ Status: [Active/Paused] (toggle if admin)
│  └─ Team Lead: [name] <email>
│
├─ Traffic Trend (Large Chart)
│  ├─ 4-week line chart (traffic vs baseline)
│  ├─ Highlight anomalies (signal events)
│  └─ Hover: show signal details
│
├─ Recent Incidents (Table)
│  ├─ Week | Severity | Signals | Status | Actions
│  └─ ...
│
├─ Signal Performance (Expandable section)
│  ├─ [S8] Traffic Drop (Enabled)
│  │  ├─ Recent Activations (4w): 2
│  │  ├─ Precision: 85% (2/2 were real)
│  │  └─ Confidence Trend: [Mini chart]
│  │
│  ├─ [S9] Ranking Drop (Enabled)
│  │  ├─ Recent Activations: 1
│  │  ├─ Precision: 100%
│  │  └─ ...
│  │
│  └─ [S10] SERP Changes (Disabled - Phase C)
│     └─ "Not yet implemented. Phase C: pending SERP comparison module."
│
└─ Configuration (If admin)
   ├─ Team Lead: [User selector]
   ├─ Severity Threshold: [Dropdown: WATCH | YELLOW | RED]
   ├─ [Save Changes]
   └─ [Remove Brand]
```

### 3.5 Settings / Configuration

**URL:** `/settings`

**Sections:**

#### 5.5.1 Brands Management
```
Table:
├─ Brand | Status | Team Lead | Incidents (4w) | Actions
├─ Acme Corp | Active | john@org | 5 | [Edit] [View]
├─ TechStore | Paused | - | 3 | [Edit] [View]
└─ [+ Add Brand]

Modal (Add/Edit):
├─ Brand Name: [input]
├─ GSC Property URL: [input, pattern: sc-domain:... or https://...]
├─ GA4 Property ID: [input, number]
├─ Ahrefs Domain: [input, e.g. example.com]
├─ Country: [select: CO, AR, MX, ...]
├─ Team Lead: [user select, searchable]
├─ Status: [toggle: Active/Paused]
└─ [Save] [Cancel]
```

#### 5.5.2 Signal Configuration
```
Table (read-only for non-admins):
├─ Signal | Phase | Enabled | Threshold | Sensitivity | Actions
├─ S8 | A | ✓ | MAD: 3.0 | Normal | [View Config]
├─ S9 | A | ✓ | Threshold: 0.05 | Normal | [View Config]
├─ S10 | C | ✗ | - | - | [View Config]
└─ ...

Modal (View Config - admin only):
├─ Signal: [read-only]
├─ Phase: [read-only]
├─ Enabled: [toggle]
├─ Config JSON: [textarea, JSON editor]
├─ [Save Changes]
└─ [Reset to Default]
```

#### 5.5.3 Notifications
```
├─ Slack Integration: ✓ Connected (Orbit SeoLab)
├─ Alert Channel: [readonly] #alerts-operaciones
├─ Default Severity Threshold: [Dropdown: WATCH | YELLOW | RED]
├─ Notification Frequency:
│  ├─ [x] Immediate for RED
│  ├─ [x] Weekly Digest (Friday 23:00 UTC)
│  └─ [x] Pipeline Health Alerts
│
└─ [Save Preferences]
```

#### 5.5.4 API & Integration
```
├─ API Key: [hidden] [Copy] [Regenerate]
├─ Webhook URL: [input]
├─ Webhook Events: [Checkboxes]
│  ├─ [x] incident.created
│  ├─ [x] incident.resolved
│  └─ [x] signal_event.triggered
│
├─ Ahrefs Budget:
│  ├─ Monthly Limit: 500 credits
│  ├─ Current Usage: 120 (24%)
│  └─ Status: ✅ OK
│
└─ [Test Webhook] [Save]
```

---

## 4. API Integration (Edge Functions)

### 4.1 Read Endpoints (GET queries vía edge functions o REST directo)

**Opción A: Query directo a Supabase (via supabase-js client)**

```typescript
// Listar incidents
const { data } = await supabase
  .from('organic_early_warning.incidents')
  .select(`
    *,
    signal_events(*),
    incident_diagnostics(*),
    incident_log(*)
  `)
  .eq('status', 'open')
  .order('created_at', { ascending: false })
  .limit(10);

// Obtener brand con sus señales
const { data } = await supabase
  .from('seo_data_hub.brands_registry')
  .select('*')
  .eq('id', brandId)
  .single();

// Obtener signal events de una brand (últimas 4 semanas)
const { data } = await supabase
  .from('organic_early_warning.signal_events')
  .select('*')
  .eq('brand_id', brandId)
  .gte('triggered_at', new Date(Date.now() - 28*24*60*60*1000).toISOString())
  .order('triggered_at', { ascending: false });
```

**Opción B: RPC (Stored Procedures)**

```typescript
// Si quieres lógica compleja, definir RPCs:
const { data } = await supabase.rpc('get_incident_summary', {
  p_brand_id: brandId,
  p_weeks: 4
});
```

### 4.2 Write Endpoints (POST a edge functions)

**Update Incident Status**

```bash
POST /oew-dispatcher
Headers:
  x-internal-secret: <OEW_INTERNAL_SECRET>
  Content-Type: application/json

Body:
{
  "incident_id": "uuid-here",
  "action": "update_status",
  "new_status": "investigating",
  "notes": "Reviewing ranking drop..."
}

Response:
{
  "ok": true,
  "incident": { ... }
}
```

**Add Note to Incident**

```bash
POST /oew-dispatcher
Headers:
  x-internal-secret: <OEW_INTERNAL_SECRET>
  Content-Type: application/json

Body:
{
  "incident_id": "uuid-here",
  "action": "add_note",
  "note": "Found algorithm update on SEO forums"
}

Response:
{
  "ok": true,
  "incident": { ... }
}
```

**Mark Incident as False Positive**

```bash
POST /oew-dispatcher
Headers:
  x-internal-secret: <OEW_INTERNAL_SECRET>
  Content-Type: application/json

Body:
{
  "incident_id": "uuid-here",
  "action": "mark_false_positive",
  "reason": "Planned maintenance window"
}

Response:
{
  "ok": true,
  "incident": { ... }
}
```

### 4.3 Manual Trigger Endpoints

**Force Analysis Run**

```bash
POST https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-orchestrator
Headers:
  x-internal-secret: <OEW_INTERNAL_SECRET>
  Content-Type: application/json

Body:
{
  "trigger": "manual"
}

Response:
{
  "ok": true,
  "analysis_run_id": "uuid-here",
  "brands_analyzed": 4,
  "signals_evaluated": 13,
  "incidents_created": 2
}
```

---

## 5. Componentes Reutilizables

### 5.1 Severity Badge

```typescript
interface SeverityBadgeProps {
  severity: "WATCH" | "YELLOW" | "RED";
  size?: "sm" | "md" | "lg"; // default: md
}

// Usage:
<SeverityBadge severity="RED" size="lg" />
// Renders: 🔴 RED (with your existing color palette)
```

### 5.2 Signal Card

```typescript
interface SignalCardProps {
  signal: SignalEvent & { signalName: string };
  expanded?: boolean;
}

// Usage:
<SignalCard
  signal={{
    signal_id: "S8",
    signalName: "Traffic Drop (7d MA)",
    metric_value: 15000,
    baseline_mean: 20000,
    deviation_sigma: 2.5,
    severity_hint: "YELLOW",
    confidence: 92
  }}
  expanded={false}
/>
```

### 5.3 Filter Bar

```typescript
interface FilterBarProps {
  onFilterChange: (filters: {
    severity: ("RED" | "YELLOW" | "WATCH")[];
    brands: UUID[];
    status: ("open" | "investigating" | "resolved")[];
    dateRange: { from: Date; to: Date };
  }) => void;
}
```

### 5.4 Trend Chart

```typescript
interface TrendChartProps {
  data: { week: string; value: number; baseline: number }[];
  title: string;
  anomalies?: { week: string; signals: string[] }[];
}

// Renders: recharts LineChart with baseline, actual, signal overlays
```

### 5.5 Incident Table

```typescript
interface IncidentTableProps {
  incidents: (Incident & {
    brandName: string;
    signalsList: SignalEvent[];
  })[];
  onSelectIncident: (id: UUID) => void;
  isLoading?: boolean;
}
```

---

## 6. Auth & Security

### 6.1 Supabase Auth Setup

```typescript
// Client initialization
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://stjugsrkrweakvzmizpq.supabase.co',
  'YOUR_ANON_KEY' // public anon key, safe for browser
);

// Login
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@org.com',
  password: 'password'
});

// Session management
supabase.auth.onAuthStateChange((event, session) => {
  if (session) {
    // User logged in, session.access_token available
    // Use in API calls via Authorization header
  }
});
```

### 6.2 Row Level Security (RLS)

**Already configured in Supabase:**
- Users can only see brands they're assigned to (via `brand_routing.team_lead_user_id`)
- Public notificaciones_outbox acceso controlado

**Frontend doesn't need to enforce — DB enforces automatically**

### 6.3 API Secret Headers

**For internal edge function calls (server-side only):**
- Never expose `OEW_INTERNAL_SECRET` o `HUB_INTERNAL_SECRET` en JavaScript del browser
- Si necesitas trigger manual de edge functions desde UI, crear un endpoint intermediario (ej. `/api/trigger-analysis`) que valida el JWT del usuario y luego llama la edge function con el secret del lado del servidor

```typescript
// ❌ WRONG (never do this in browser):
const response = await fetch('/oew-orchestrator', {
  headers: { 'x-internal-secret': 'secret-here' } // EXPOSED!
});

// ✅ CORRECT (backend-only call):
// pages/api/trigger-analysis.ts
export default async function handler(req, res) {
  const { user } = await auth(req); // verify JWT
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const response = await fetch(
    'https://stjugsrkrweakvzmizpq.functions.supabase.co/oew-orchestrator',
    {
      headers: { 'x-internal-secret': process.env.OEW_INTERNAL_SECRET }
    }
  );
  return res.json(await response.json());
}
```

---

## 7. Environment Variables

**Frontend `.env.local`:**

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://stjugsrkrweakvzmizpq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...  # public anon key from Settings > API

# Backend
API_BASE_URL=https://stjugsrkrweakvzmizpq.functions.supabase.co
NEXT_SECRET_OEW_INTERNAL_SECRET=<loaded from Vault, server-side only>

# Analytics (optional)
NEXT_PUBLIC_ANALYTICS_ID=...
```

**Never commit secrets. Use .env.example for reference.**

---

## 8. Folder Structure (Recommended)

```
frontend/
├── app/
│  ├── layout.tsx              # Root layout
│  ├── page.tsx                # Home redirect
│  ├── dashboard/
│  │  └── page.tsx             # Executive summary
│  ├── alerts/
│  │  ├── page.tsx             # Incidents list
│  │  ├── [id]/
│  │  │  └── page.tsx          # Incident detail
│  │  └── layout.tsx
│  ├── brands/
│  │  ├── page.tsx             # Brands list
│  │  ├── [id]/
│  │  │  └── page.tsx          # Brand detail
│  │  └── layout.tsx
│  ├── settings/
│  │  └── page.tsx
│  ├── api/
│  │  └── trigger-analysis.ts  # Backend-only edge functions
│  └── auth/
│     ├── login/page.tsx
│     └── callback/page.tsx    # Supabase auth redirect
│
├── components/
│  ├── shared/
│  │  ├── Navbar.tsx
│  │  ├── Sidebar.tsx
│  │  ├── SeverityBadge.tsx
│  │  └── LoadingSpinner.tsx
│  ├── dashboard/
│  │  ├── HeroStats.tsx
│  │  ├── RecentIncidents.tsx
│  │  └── TopAffectedBrands.tsx
│  ├── alerts/
│  │  ├── FilterBar.tsx
│  │  ├── IncidentTable.tsx
│  │  ├── IncidentDetailModal.tsx
│  │  └── SignalCard.tsx
│  ├── brands/
│  │  ├── BrandCard.tsx
│  │  ├── TrendChart.tsx
│  │  └── SignalPerformance.tsx
│  └── settings/
│     ├── BrandsManagement.tsx
│     ├── SignalConfiguration.tsx
│     └── NotificationPreferences.tsx
│
├── lib/
│  ├── supabase.ts             # Client init
│  ├── api.ts                  # API wrappers
│  ├── auth.ts                 # Auth helpers
│  ├── types.ts                # TypeScript interfaces (DB schemas)
│  └── utils.ts                # Utility functions
│
├── hooks/
│  ├── useIncidents.ts         # SWR/React Query for incidents
│  ├── useBrands.ts
│  ├── useAuth.ts
│  └── useSignals.ts
│
├── styles/
│  └── globals.css             # Your existing style (Tailwind, CSS modules, etc)
│
├── .env.example
├── .env.local                 # .gitignore
├── next.config.js
├── package.json
└── tsconfig.json
```

---

## 9. State Management Recommendations

### Option A: Supabase Realtime + React Query (Recommended)

```typescript
// hooks/useIncidents.ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

export function useIncidents(filters) {
  const queryClient = useQueryClient();
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['incidents', filters],
    queryFn: async () => {
      let query = supabase
        .from('organic_early_warning.incidents')
        .select('*, signal_events(*), incident_diagnostics(*)');
      
      if (filters.severity?.length) {
        query = query.in('severity', filters.severity);
      }
      if (filters.brandId) {
        query = query.eq('brand_id', filters.brandId);
      }
      
      const { data } = await query;
      return data;
    },
    staleTime: 60 * 1000, // 1 min
  });
  
  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('incidents-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'organic_early_warning', table: 'incidents' },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['incidents'] });
        }
      )
      .subscribe();
    
    return () => supabase.removeChannel(channel);
  }, [queryClient]);
  
  return { data, isLoading, error };
}
```

### Option B: Zustand (Simpler State)

```typescript
// stores/incidentStore.ts
import { create } from 'zustand';

interface IncidentStore {
  incidents: Incident[];
  selectedIncident: Incident | null;
  filters: {
    severity: ("RED" | "YELLOW" | "WATCH")[];
    brandId?: UUID;
  };
  setIncidents: (incidents: Incident[]) => void;
  setSelectedIncident: (incident: Incident | null) => void;
  setFilters: (filters: Partial<IncidentStore['filters']>) => void;
}

export const useIncidentStore = create<IncidentStore>((set) => ({
  incidents: [],
  selectedIncident: null,
  filters: { severity: [] },
  setIncidents: (incidents) => set({ incidents }),
  setSelectedIncident: (incident) => set({ selectedIncident: incident }),
  setFilters: (filters) => set((state) => ({
    filters: { ...state.filters, ...filters }
  })),
}));
```

---

## 10. Error Handling & Loading States

### 10.1 Boundary Components

```typescript
// components/ErrorBoundary.tsx
export class ErrorBoundary extends React.Component {
  render() {
    if (this.state.hasError) {
      return (
        <div className="error-container">
          <h1>Something went wrong</h1>
          <p>{this.state.error.message}</p>
          <button onClick={() => window.location.reload()}>
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

### 10.2 Loading Skeleton

```typescript
// components/IncidentTableSkeleton.tsx
export function IncidentTableSkeleton() {
  return (
    <table>
      {[...Array(5)].map((_, i) => (
        <tr key={i}>
          <td><Skeleton width="80px" height="24px" /></td>
          <td><Skeleton width="150px" height="24px" /></td>
          {/* ... */}
        </tr>
      ))}
    </table>
  );
}

// Usage:
{isLoading ? <IncidentTableSkeleton /> : <IncidentTable data={data} />}
```

### 10.3 Empty States

```typescript
// components/EmptyIncidents.tsx
export function EmptyIncidents() {
  return (
    <div className="empty-state">
      <ImageIcon size={48} />
      <h2>No incidents found</h2>
      <p>Your monitored brands are healthy. Keep watching!</p>
      <a href="/settings#brands">Configure brands →</a>
    </div>
  );
}
```

---

## 11. Deployment

### 11.1 Build & Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Build locally
npm run build

# Deploy
vercel

# Or: git push → automatic deploy via GitHub integration
```

### 11.2 Environment Variables en Vercel

1. Vercel Dashboard → Project → Settings → Environment Variables
2. Add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_SECRET_OEW_INTERNAL_SECRET` (marked as sensitive)

---

## 12. Testing Strategy

### 12.1 Unit Tests (Jest + React Testing Library)

```typescript
// __tests__/SeverityBadge.test.tsx
import { render, screen } from '@testing-library/react';
import { SeverityBadge } from '@/components/SeverityBadge';

describe('SeverityBadge', () => {
  it('renders RED badge', () => {
    render(<SeverityBadge severity="RED" />);
    expect(screen.getByText('RED')).toBeInTheDocument();
  });
});
```

### 12.2 E2E Tests (Cypress/Playwright)

```typescript
// e2e/incidents.spec.ts
import { test, expect } from '@playwright/test';

test('user can filter incidents by severity', async ({ page }) => {
  await page.goto('/alerts');
  await page.click('[data-test="filter-red"]');
  const rows = await page.locator('[data-test="incident-row"]').count();
  expect(rows).toBeGreaterThan(0);
});
```

---

## 13. Monitoring & Analytics

### 13.1 Frontend Performance Monitoring (optional)

```typescript
// lib/analytics.ts
import { logCoreWebVitals, logEvent } from 'firebase-analytics';

// Report Web Vitals
export function reportWebVitals(metric) {
  console.log(metric);
  // Send to your analytics service
}

// Track user actions
export function trackEvent(name: string, params: Record<string, any>) {
  console.log(`Event: ${name}`, params);
  // Send to analytics
}

// Usage:
trackEvent('incident_view', { incident_id, severity });
```

### 13.2 Error Tracking (optional)

```typescript
// lib/sentry.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

---

## 14. Accessibility

All components should follow:
- **WCAG 2.1 Level AA** minimum
- Semantic HTML (`<button>`, `<nav>`, `<main>`, etc)
- ARIA labels for interactive elements
- Keyboard navigation (Tab, Enter, Escape)
- Color contrast ratio >= 4.5:1 for text

```typescript
// Example: Accessible filter button
<button
  aria-label="Filter incidents by RED severity"
  aria-pressed={isRedSelected}
  onClick={() => toggleFilter('RED')}
>
  🔴 RED
</button>
```

---

## 15. Performance Optimization

### 15.1 Code Splitting

```typescript
// Lazy load heavy components
const IncidentDetailModal = dynamic(
  () => import('@/components/IncidentDetailModal'),
  { loading: () => <div>Loading...</div> }
);
```

### 15.2 Image Optimization

```typescript
import Image from 'next/image';

<Image
  src="/logo.png"
  alt="Logo"
  width={200}
  height={60}
  priority // for above-the-fold
/>
```

### 15.3 Incremental Static Regeneration (ISR)

```typescript
// pages/brands/[id].tsx
export const revalidate = 3600; // Revalidate every hour

export async function generateStaticParams() {
  const brands = await getBrands();
  return brands.map(b => ({ id: b.id }));
}
```

---

## Appendix: Starter Prompt for AI Frontend Developer

**Copy and paste the following prompt to the AI that will build the frontend:**

---

### STARTER-PROMPT-FRONTEND.md

**You are building the Organic Early Warning (OEW) Dashboard frontend.**

**Context:**
- Backend: 13 TypeScript edge functions (Supabase), 9 SQL migrations applied to `stjugsrkrweakvzmizpq`
- Database schemas: `seo_data_hub` (brands, traffic, rankings), `organic_early_warning` (signals, incidents, diagnostics)
- User types: SEO specialist (views alerts), admin (configures brands)
- Core flow: brand monitors → signals trigger → incidents cluster → AI diagnostics → Slack/dashboard alerts

**Your task:** Build a React/Next.js dashboard with these views:

1. **Home/Dashboard** (`/dashboard`)
   - Executive summary: total brands, RED/YELLOW/WATCH counts
   - Recent incidents table
   - Pipeline health status
   - Top affected brands (mini chart)

2. **Alerts** (`/alerts`)
   - Filterable incident list (severity, brand, status, date range)
   - Click to drill into incident detail
   - Show signals that triggered, AI diagnostics, trending charts

3. **Incident Detail** (`/incidents/:id`)
   - Full signal breakdown (S8, S9, S11, etc) with metrics
   - AI-generated diagnostics (root cause, recommendations)
   - 4-week historical chart with incident highlighted
   - Actions: change status, add note, mark false positive

4. **Brands** (`/brands`)
   - List of monitored brands
   - Click for brand detail: traffic trend, recent incidents, signal performance

5. **Settings** (`/settings`)
   - Manage brands (add/edit/delete)
   - Signal configuration (if admin)
   - Notification preferences
   - API key management

**Tech stack:**
- Framework: Next.js 14+ (app router)
- Database client: `@supabase/supabase-js`
- State: React Query or Zustand
- UI: Your existing component library (we'll apply your branding later)
- Charts: recharts or similar
- Styling: Your existing CSS/Tailwind/Material setup

**Key data types (see Section 2 of spec for full details):**
```typescript
Brand { id, name, gsc_property_url, ga4_property_id, status, ... }
SignalEvent { id, brand_id, signal_id, metric_value, deviation_sigma, severity_hint, ... }
Incident { id, brand_id, severity, signal_count, status, notes, ... }
IncidentDiagnostic { id, findings, ai_summary, ai_suggested_actions, ... }
```

**API endpoints:**
- Read: Supabase RLS-protected tables (use supabase-js)
  - `organic_early_warning.incidents` (with joins: signal_events, diagnostics)
  - `seo_data_hub.brands_registry`
  - `organic_early_warning.signal_events`
- Write (POST to edge functions):
  - `/oew-dispatcher` — update incident, add note, mark false positive
  - `/oew-orchestrator` — manual trigger (via backend proxy)
  - Auth header: Supabase JWT in Authorization header (automatic with supabase-js)
  - For edge function secrets: call backend `/api/trigger-analysis` endpoint (don't expose secrets to browser)

**Auth:**
- Supabase Auth (user emails already in org)
- Row-level security: users see only brands they're assigned to
- Admin UI elements hidden for non-admins

**Files to generate:**
- App structure: `app/dashboard`, `app/alerts`, `app/brands`, `app/settings`, `app/api`
- Components: Navbar, Sidebar, SeverityBadge, SignalCard, FilterBar, IncidentTable, TrendChart, etc
- Hooks: useIncidents, useBrands, useAuth, useSignals
- Lib: supabase client, API wrappers, types.ts (DB schemas)
- Pages: home, login/callback, dashboard, alerts/[id], brands/[id], settings

**Deliverables:**
- Fully functional dashboard (not just static mockups)
- All 5 main views working with real Supabase data
- Error boundaries, loading states, empty states
- Responsive design (mobile, tablet, desktop)
- Accessibility: semantic HTML, ARIA labels, keyboard nav
- Performance: code splitting, image optimization, React Query for data fetching
- Ready to deploy to Vercel

**Reference documentation:**
- Full spec: `handoff/06-frontend-spec.md` (this document)
- DB schemas: Sections 2.1-2.2
- Views layout: Section 3
- API integration: Section 4
- Components: Section 5
- Environment setup: Sections 6-7

**Notes:**
- Don't overthink design/branding — just use semantic HTML and basic layout. Your team will apply your existing styles.
- Use TypeScript everywhere (strictNullChecks: true)
- Test auth flow: ensure user can login, JWT is stored in localStorage, and Supabase client uses it automatically
- Test data fetching: verify queries respect RLS (user sees only their brands)
- Create `.env.example` with the 3 public env vars needed

Start building!

---

**End of specification.**

