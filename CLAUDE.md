# CLAUDE.md — Guía de contexto para Claude

Este archivo es el punto de partida para cualquier sesión. Léelo completo antes de empezar a trabajar.

---

## Quién es el usuario

Agencia de SEO y automatizaciones. Trabaja con múltiples proyectos y clientes. Usa Claude Code principalmente desde la app de escritorio. Cuenta de GitHub principal: `accesos-seo`.

---

## Herramientas globales disponibles

Estas credenciales deben estar configuradas como variables de entorno en Windows. Si no están disponibles, pedirlas al usuario antes de operar.

| Variable de entorno | Plataforma | Para qué sirve |
|---|---|---|
| `N8N_API_KEY` | N8N | Gestionar flujos de automatización |
| `VERCEL_TOKEN` | Vercel | Deploy de proyectos frontend |
| `OPENROUTER_API_KEY` | OpenRouter | Acceso a modelos de IA en automatizaciones |

---

## Proyectos activos

### 1. Lighthouse
- **Descripción:** (completar con el usuario)
- **Supabase URL:** `https://stjugsrkrweakvzmizpq.supabase.co`
- **Variables de entorno:** ver `proyectos/lighthouse/.env.example`
- **Repositorio GitHub:** (pendiente confirmar)
- **Deploy en Vercel:** (pendiente confirmar)

### 2. Swarm Agentes MD
- **Descripción:** Sistema multiagente
- **Supabase URL:** `https://lwurzjrghzwzxbhrulyn.supabase.co`
- **Variables de entorno:** ver `proyectos/swarm-agentes/.env.example`
- **Repositorio GitHub:** `accesos-seo/agents_automations` (este mismo)
- **Deploy en Vercel:** (pendiente confirmar)

### 3. Manager Ascent APP
- **Descripción:** (completar con el usuario)
- **Supabase URL:** `https://ygedrzprxcnupayqityz.supabase.co`
- **Variables de entorno:** ver `proyectos/manager-ascent/.env.example`
- **Repositorio GitHub:** (pendiente confirmar)
- **Deploy en Vercel:** (pendiente confirmar)

### 4. Innovar CRM
- **Descripción:** CRM frontend conectado a Supabase. Generado en Google AI Studio.
- **Supabase URL:** `https://xdzbjptozeqcbnaqhtye.supabase.co`
- **Variables de entorno:** ver `proyectos/innovar-crm/.env.example`
- **Repositorio GitHub:** `Rvirona/CRM-INNOVAR-APP`
- **Deploy en Vercel:** (pendiente confirmar)

### 5. Media Kit
- **Descripción:** (completar con el usuario)
- **Supabase URL:** `https://oyocaymmdeqmajnxtilq.supabase.co`
- **Variables de entorno:** ver `proyectos/media-kit/.env.example`
- **Repositorio GitHub:** (pendiente confirmar)
- **Deploy en Vercel:** (pendiente confirmar)

---

## Estructura del repositorio

```
Agents_Automations/
├── CLAUDE.md              ← este archivo
├── agents/                ← definiciones de agentes
├── automations/           ← flujos de automatización por proyecto
├── briefs/                ← briefs de contenido
├── handovers/             ← traspasos entre sesiones
├── proyectos/             ← configuración por proyecto
│   ├── lighthouse/
│   ├── swarm-agentes/
│   ├── manager-ascent/
│   ├── innovar-crm/
│   └── media-kit/
├── referencias/           ← documentos de referencia
├── scripts/               ← scripts reutilizables
└── skills/                ← skills de Claude
```

---

## Reglas de trabajo

1. **Nunca subir credenciales a GitHub.** Los archivos `.env` son solo locales.
2. **Confirmar antes de hacer push.** Mostrar qué cambió y esperar aprobación del usuario.
3. **Un proyecto por sesión.** Si el usuario cambia de proyecto, confirmar a cuál nos movemos.
4. **Actualizar este archivo** cuando se agreguen proyectos o cambien datos.

---

## Cómo orientarse al inicio de cada sesión

1. Leer este archivo
2. Identificar en qué proyecto se va a trabajar
3. Verificar que las variables de entorno necesarias estén disponibles
4. Si faltan credenciales, pedirlas antes de empezar
