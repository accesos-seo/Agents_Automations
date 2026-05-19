# Cómo conectar a Supabase Light_House desde esta sesión

> **Contexto:** Claude Code en la web corre en un contenedor remoto efímero. **No tiene acceso a tu máquina local** ni a tus archivos `.env` / `.env.shared`. Para que el agente opere directo contra Supabase, necesita una credencial inyectada en el contenedor de alguna de las 4 formas siguientes.

---

## Las 4 opciones

### Opción 1 — Conectar el proyecto al MCP de Supabase (recomendada)

**Qué es:** el MCP server de Supabase ya está adjunto a esta sesión (`mcp__2b07c2b1-...`), pero hoy solo ve la organización `Managers Ascent`. Si agregamos los proyectos `Light_House` (`stjugsrkrweakvzmizpq`) y `Swarm Agentes MD` (`lwurzjrghzwzxbhrulyn`) a esa misma org —o reconectamos el MCP con un token de la org correcta— el agente puede usar herramientas como `list_tables`, `execute_sql`, `apply_migration`, `get_logs`, `deploy_edge_function` sin pegar credenciales.

**Pasos para habilitarla:**
1. En el panel de Claude Code para esta sesión, ve a *MCP Servers → Supabase → Configurar*.
2. Genera un Personal Access Token en `supabase.com/dashboard/account/tokens` con scope sobre la organización que contiene Light_House.
3. Pega ese token en la config del MCP. El servidor se reconecta y verás los proyectos correctos en `list_projects`.

**Pros:** sin secretos en chat, tools nativos, auditable.
**Contras:** requiere ajuste manual una vez.

---

### Opción 2 — Pegar el `SERVICE_ROLE_KEY` en el chat (rápida)

**Qué es:** me pasas la `SUPABASE_SERVICE_ROLE_KEY` (JWT largo) de Light_House. Yo la uso para llamar la REST API de Supabase directamente con `curl` desde Bash.

**Cómo:**
```
SUPABASE_URL=https://stjugsrkrweakvzmizpq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5...
```

Yo luego ejecuto:
```bash
curl -s "${SUPABASE_URL}/rest/v1/content_items?select=brief_data&limit=3" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
```

**Pros:** funciona en 30 segundos.
**Contras:** la clave queda en el historial del chat. **Riesgo de fuga si compartes la conversación.** Mitigación: rotar la clave al terminar la sesión (`Supabase Dashboard → Project Settings → API → Reset Service Role JWT`).

---

### Opción 3 — Pegar la `DATABASE_URL` (Postgres directa)

**Qué es:** la URL completa de conexión Postgres de Light_House, incluyendo password.

```
DATABASE_URL=postgresql://postgres.stjugsrkrweakvzmizpq:<PASSWORD>@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

Disponible en `Supabase Dashboard → Project Settings → Database → Connection String → URI`.

Yo la uso con `psql` o `pg` desde el contenedor para ejecutar las queries de Fase 0 directamente.

**Pros:** acceso completo a Postgres (no limitado a REST).
**Contras:** mismas que Opción 2 — la password queda en chat. Rotar después.

---

### Opción 4 — Variables de entorno del contenedor (Claude Code on web)

**Qué es:** Claude Code on web permite definir variables de entorno **a nivel de "Environment"** (no a nivel de sesión) que se inyectan automáticamente al iniciar el contenedor. Las defines una vez y todas las sesiones futuras las tienen, sin compartir por chat.

**Cómo:**
1. Ve a la configuración del Environment de Claude Code on web (el que está corriendo esta sesión).
2. Agrega como variables de entorno:
   ```
   LIGHTHOUSE_SUPABASE_URL=https://stjugsrkrweakvzmizpq.supabase.co
   LIGHTHOUSE_SERVICE_ROLE_KEY=<el JWT>
   SWARM_SUPABASE_URL=https://lwurzjrghzwzxbhrulyn.supabase.co
   SWARM_SERVICE_ROLE_KEY=<el JWT>
   AHREFS_API_TOKEN=<token de Ahrefs>
   ```
3. Reinicia esta sesión o abre una nueva — las variables están disponibles para mí vía `$LIGHTHOUSE_SUPABASE_URL`, etc.

**Pros:** sin credenciales en chat, persistente entre sesiones, auditable.
**Contras:** un set-up inicial; requiere acceso al panel de configuración del environment.

> Documentación oficial: https://code.claude.com/docs/en/claude-code-on-the-web (sección "Environment configuration").

---

## Tabla comparativa

| Opción | Tiempo set-up | Riesgo de fuga | Persistencia | Recomendada |
|---|---|---|---|---|
| 1. MCP Supabase | 2-3 min (token) | Bajo | Permanente | ✅ Si vas a operar seguido |
| 2. SERVICE_ROLE en chat | 30 segundos | Alto (rotar después) | Solo esta sesión | 🟡 Para arrancar hoy |
| 3. DATABASE_URL en chat | 30 segundos | Alto (rotar después) | Solo esta sesión | 🟡 Si necesitas SQL puro |
| 4. Env vars del Environment | 5 min (panel) | Bajo | Permanente | ✅ Para uso largo plazo |

---

## Mi recomendación operativa

**Para arrancar hoy con Fase 0:** Opción 2 (pegar SERVICE_ROLE_KEY de Light_House) → yo ejecuto las 10 queries de auditoría en minutos y dejo los resultados en `02-resultados-auditoria.md` → **tú rotas la clave** al terminar.

**Para producción continua:** Opción 1 (MCP) u Opción 4 (env vars) — son las únicas seguras a largo plazo.

---

## ⚠️ Restricción de red descubierta (2026-05-19)

Aunque tengas la credencial inyectada, el **network policy del Environment de Claude Code on web bloquea por default los hosts externos**. Confirmado en esta sesión:

```bash
curl https://stjugsrkrweakvzmizpq.supabase.co/rest/v1/
→ HTTP 403 "Host not in allowlist"
```

### Hosts que hay que agregar a la allowlist del Environment

| Host | Para qué |
|---|---|
| `*.supabase.co` | Todos los proyectos Supabase (Light_House, Swarm Agentes MD, etc.) |
| `api.ahrefs.com` | Llamadas Ahrefs en Fase 1 |
| `api.openrouter.ai` | Si Claude llama modelos IA directo (no aplica al pipeline en producción, pero útil para pruebas) |
| `estancias-atlas-n8n.heh8a3.easypanel.host` | Webhook n8n A |

**Cómo agregarlos:** panel del Environment de Claude Code on web → Network Policy → agregar hosts. Doc: https://code.claude.com/docs/en/claude-code-on-the-web

Hasta que esto se haga, **ninguna de las 4 opciones de conexión funciona** desde el contenedor remoto — todas chocan con el proxy de red. Las opciones siguen siendo válidas para describir cómo conectar; lo único que falta es desbloquear el host.

---

## Estado actual de configuración (2026-05-19)

| Item | Estado |
|---|---|
| Credenciales Light_House en `.env.local` del contenedor | ✅ Inyectadas esta sesión (efímeras) |
| Network policy permite `*.supabase.co` | ❌ Bloqueado — acción pendiente del usuario |
| Env vars persistentes en el Environment | ❌ No configuradas — acción pendiente del usuario |
| MCP de Supabase con scope sobre la org correcta | ❌ Hoy solo ve "Managers Ascent" |

**Próxima sesión podrá operar directo si:** se configura Opción 4 (env vars del Environment) + se agrega `*.supabase.co` y `api.ahrefs.com` al network policy.

---

## Lo que necesito de ti (sea cual sea la opción)

Para Fase 0:
- Light_House `SUPABASE_URL` (ya conocida: `https://stjugsrkrweakvzmizpq.supabase.co`)
- Light_House `SERVICE_ROLE_KEY` o `DATABASE_URL`

Para Fase 1 (cuando llegue):
- Ahrefs API token (puede vivir solo en Vault de Supabase, no necesito verlo si la query Q6 lo confirma)
- Acceso a n8n (`N8N_TOKEN` + base URL) para hacer el export del workflow `8iZcC4mGSFWUlOAc`
