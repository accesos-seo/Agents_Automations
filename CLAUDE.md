# CLAUDE.md — Guía de contexto para Claude

Este archivo es el punto de partida para cualquier sesión. Léelo completo antes de empezar a trabajar.

---

## Quién es el usuario

Agencia de SEO y automatizaciones (SEO Lab Agency). Trabaja con múltiples proyectos y clientes desde Ciudad de México. Usa Claude Code principalmente desde la app de escritorio.

- **Cuenta GitHub principal:** `accesos-seo`
- **Carpeta local en Windows:** `C:\Users\ceoel\OneDrive\Documentos\Agents-automations\`

---

## Herramientas globales disponibles

| Variable | Plataforma | Para qué sirve |
|---|---|---|
| `N8N_TOKEN` | N8N | Gestionar flujos de automatización |
| `VERCEL_TOKEN` | Vercel | Deploy de proyectos frontend |
| `OPENROUTER_API_KEY` | OpenRouter | Acceso a modelos de IA en automatizaciones |
| `<PROYECTO>_SUPABASE_URL` + `<PROYECTO>_SERVICE_KEY` | Supabase | Acceso directo a la BD de cada proyecto |
| `AHREFS_API_TOKEN` | Ahrefs | Investigación SEO (usado en seo-content-swarm-engine) |

### Dónde viven las credenciales según el entorno

- **App de escritorio (local Windows):** archivo `.env.shared` en la carpeta local. Cargar con `source .env.shared` antes de operar.
- **Claude Code on web (contenedor remoto):** **NO existe `.env.shared`** porque el contenedor solo tiene lo que está en git. Las credenciales se inyectan vía:
  1. **Environment variables del Environment** (recomendado, persistente entre sesiones)
  2. **MCP de Supabase** con PAT de la org correcta
  3. **`.env.local` en el contenedor** (efímero, solo esa sesión, gitignored)

> Si una credencial no aparece como env var en una sesión web, **pedirla al usuario** y guardarla en `.env.local` (gitignored). Avisar al usuario que la solución permanente es agregarla al Environment vía panel de Claude Code on web.

### Restricciones de red en Claude Code on web

El network policy de cada Environment es restrictivo por default. Para este proyecto requerimos en la allowlist:

| Host | Para qué |
|---|---|
| `*.supabase.co` | REST + Postgres + Storage de los 6 proyectos Supabase |
| `api.ahrefs.com` | Investigación SEO (Fase 1 de seo-content-swarm-engine) |
| `api.openrouter.ai` | Modelos IA para agentes |
| `*.n8n.cloud` o `estancias-atlas-n8n.heh8a3.easypanel.host` | n8n workflows |

Si una llamada externa devuelve `403 Host not in allowlist`, pedir al usuario que agregue el host al Network Policy del Environment.

> Documentación: https://code.claude.com/docs/en/claude-code-on-the-web

---

## Proyectos activos (6)

### 1. Lighthouse
- **Supabase URL:** `https://stjugsrkrweakvzmizpq.supabase.co`
- **Carpeta local:** `lighthouse/`
- **Repositorio GitHub:** (pendiente confirmar)
- **Deploy en Vercel:** (pendiente confirmar)
- **Descripción:** (pendiente completar)

### 2. Swarm Agentes MD
- **Supabase URL:** `https://lwurzjrghzwzxbhrulyn.supabase.co`
- **Carpeta local:** `swarm/`
- **Repositorio GitHub:** `accesos-seo/agents_automations`
- **Deploy en Vercel:** (pendiente confirmar)
- **Descripción:** Sistema multiagente

### 3. Manager Ascent APP
- **Supabase URL:** `https://ygedrzprxcnupayqityz.supabase.co`
- **Carpeta local:** `manager-ascent/`
- **Repositorio GitHub:** (pendiente confirmar)
- **Deploy en Vercel:** (pendiente confirmar)
- **Descripción:** (pendiente completar)

### 4. Innovar CRM
- **Supabase URL:** `https://xdzbjptozeqcbnaqhtye.supabase.co`
- **Carpeta local:** `innovar-crm/`
- **Repositorio GitHub:** `Rvirona/CRM-INNOVAR-APP`
- **Deploy en Vercel:** (pendiente confirmar)
- **Descripción:** CRM frontend conectado a Supabase. Generado en Google AI Studio.

### 5. Media Kit
- **Supabase URL:** `https://oyocaymmdeqmajnxtilq.supabase.co`
- **Carpeta local:** `media-kit/`
- **Repositorio GitHub:** (pendiente confirmar)
- **Deploy en Vercel:** (pendiente confirmar)
- **Descripción:** (pendiente completar)

### 6. Indurisa Cotización
- **Supabase URL:** `https://lqqjijwwvvdtyksafhmt.supabase.co`
- **Carpeta local:** `indurisa/`
- **Repositorio GitHub:** (pendiente confirmar)
- **Deploy en Vercel:** (pendiente confirmar)
- **Descripción:** Sistema de cotizaciones para cliente Indurisa

---

## Estructura del repositorio

```
Agents_Automations/
├── CLAUDE.md              ← este archivo
├── .gitignore             ← protege todos los .env
├── agents/                ← definiciones de agentes
├── automations/           ← flujos de automatización por proyecto
├── briefs/                ← briefs de contenido
├── handovers/             ← traspasos entre sesiones
├── proyectos/             ← .env.example por proyecto (sin credenciales)
│   ├── lighthouse/
│   ├── swarm-agentes/
│   ├── manager-ascent/
│   ├── innovar-crm/
│   ├── media-kit/
│   └── indurisa/
├── referencias/           ← documentos de referencia
├── scripts/               ← scripts reutilizables
└── skills/                ← skills de Claude
```

---

## Reglas de trabajo

1. **Nunca subir credenciales a GitHub.** Los archivos `.env` y `.env.shared` son solo locales.
2. **Confirmar antes de hacer push.** Mostrar qué cambió y esperar aprobación.
3. **Un proyecto por sesión.** Si el usuario cambia de proyecto, confirmar a cuál nos movemos.
4. **Actualizar este archivo** cuando se agreguen proyectos o cambien datos.

---

## Cómo orientarse al inicio de cada sesión

1. Leer este archivo completo
2. Preguntar en qué proyecto se va a trabajar
3. Verificar que las variables de entorno del proyecto estén disponibles
4. Si faltan credenciales, pedirlas antes de empezar
