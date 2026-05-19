# Fase 0 — Auditoría n8n A + `brief_data`

> **Objetivo:** obtener los datos que necesito para diseñar la integración Ahrefs sin romper lo que n8n A ya hace.

---

## Tienes 2 caminos. Elige uno.

### Camino A — Automatizado con Node.js (recomendado, 3 minutos)

Si tienes Node 18+ instalado (`node --version` debe decir v18 o mayor):

```bash
# Desde la raíz del repo (donde está .env.shared o .env.local con SUPABASE_URL + SUPABASE_SERVICE_KEY)
cd automations/seo-content-swarm-engine/ahrefs-integration/fase-0-auditoria
node run-audit.mjs
```

El script:
- Carga las credenciales de `.env.local` o `.env.shared` automáticamente
- Ejecuta las 10 queries (las que puede vía REST, las demás vía RPC si está habilitada)
- Genera:
  - **`resultados-auditoria.json`** — dump crudo de todos los resultados
  - **`resultados-auditoria.md`** — versión legible
  - **`queries-pendientes-manual.sql`** — solo si la RPC `exec_sql` no existe (paso opcional, ver abajo)

Después: `git add . && git commit -m "data(audit): fase 0 ahrefs" && git push`. Yo retomo desde GitHub.

#### Si necesitas la RPC `exec_sql` para que todas las queries corran

Por default Supabase no expone una RPC genérica de SQL (correctamente — sería un agujero de seguridad). Las queries que dependen de `pg_proc` / `pg_trigger` / `vault.secrets` necesitan ser ejecutadas con permisos elevados. Hay 2 opciones:

1. **Crear una RPC restringida temporalmente** (solo para esta auditoría, eliminar después):
   ```sql
   -- Ejecutar en Supabase SQL Editor (Light_House)
   CREATE OR REPLACE FUNCTION public.exec_sql(query text)
   RETURNS jsonb
   LANGUAGE plpgsql
   SECURITY DEFINER
   AS $$
   DECLARE
     result jsonb;
   BEGIN
     EXECUTE 'SELECT to_jsonb(array_agg(row_to_json(t))) FROM (' || query || ') t'
       INTO result;
     RETURN COALESCE(result, '[]'::jsonb);
   END;
   $$;

   -- Restringir a service_role
   REVOKE ALL ON FUNCTION public.exec_sql FROM public, anon, authenticated;
   GRANT EXECUTE ON FUNCTION public.exec_sql TO service_role;
   ```
   Después de terminar Fase 0, **eliminarla**:
   ```sql
   DROP FUNCTION public.exec_sql(text);
   ```

2. **Camino B abajo** — ejecutar las queries manualmente en el SQL Editor.

---

### Camino B — Manual (SQL Editor de Supabase, sin Node, ~10 minutos)

1. Abrir Supabase Dashboard → proyecto **Light_House** (`stjugsrkrweakvzmizpq`) → **SQL Editor**.
2. Abrir `01-queries-supabase.sql` de esta misma carpeta.
3. Copiar cada query (Q1 a Q10), pegarla en el SQL Editor, ejecutar.
4. Copiar los resultados y pegarlos en las secciones correspondientes de `02-resultados-auditoria.md`.
5. Commit + push.

---

## Lo otro que necesito de ti (paralelo al SQL)

**Exportar el workflow n8n `8iZcC4mGSFWUlOAc`:**

1. En n8n, abrir el workflow.
2. Menú `⋯` (esquina superior derecha) → **Download**.
3. Guardar como `n8n-workflow-actual.json` en esta misma carpeta.
4. Commit + push.

Con ese export puedo:
- Mapear los nodos existentes
- Identificar dónde insertar el bloque Ahrefs sin romper conexiones
- Ajustar nombres de campos del payload al formato real del workflow

---

## Archivos en esta carpeta

| Archivo | Función |
|---|---|
| `README.md` | Este documento — cómo correr la auditoría |
| `00-conexion-supabase.md` | Las 4 formas de conectar Supabase desde Claude Code on web |
| `01-queries-supabase.sql` | Las 10 queries SQL (Camino B) |
| `02-resultados-auditoria.md` | Template para llenar a mano (Camino B) |
| `run-audit.mjs` | Script Node que automatiza todo (Camino A) |
| `resultados-auditoria.json` | _(generado)_ Dump crudo |
| `resultados-auditoria.md` | _(generado)_ Reporte legible |
| `queries-pendientes-manual.sql` | _(generado)_ Queries que necesitan SQL Editor |
| `n8n-workflow-actual.json` | _(tú lo subes)_ Export del workflow n8n A |
