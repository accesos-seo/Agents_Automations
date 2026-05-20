# Diagnóstico — "No user ID available" al disparar Nuevo análisis

## Síntoma

Pantalla **"Análisis Ahrefs (Lighthouse)"** → tab **"Marcas externas"** → formulario "Nuevo análisis".

Al hacer click en **"Iniciar análisis"**, la consola del navegador muestra:

```
index-CfamSeR2.js:8280 No user ID available
```

El insert en `ahrefs_web_analysis.analysis_requests` nunca se ejecuta. El botón queda visualmente disponible pero no dispara el pipeline.

## Causa raíz

El frontend está leyendo `supabase.auth.getUser()` (o `supabase.auth.getSession()`) en el handler del botón y le viene `null` aunque el usuario esté logueado en ORBIT. Esto se confirmó: en la base de datos, el usuario ya logueó en algún momento (`auth.users` tiene 11 usuarios con `last_sign_in_at` poblado), pero en ese momento exacto la sesión no estaba disponible para el cliente JS.

## Hipótesis priorizadas

| # | Hipótesis | Probabilidad | Cómo detectar |
|---|---|---|---|
| 1 | **Race condition de hidratación** — el componente del botón se monta y se ejecuta antes de que el SDK de Supabase termine de cargar la sesión desde localStorage/cookies. | 🔴 Alta | En DevTools Console, justo después de cargar la pantalla: `await supabase.auth.getSession()` devuelve `{ data: { session: null } }` los primeros 200-500ms, después devuelve la sesión real. |
| 2 | **Sesión expirada silenciosamente** — el `access_token` venció hace minutos/horas y `autoRefreshToken` falló (o está desactivado). | 🟡 Media | El localStorage tiene `sb-...-auth-token` con `expires_at` en el pasado. |
| 3 | **Cliente Supabase mal instanciado** — hay 2 instancias del SDK en la app, una con `persistSession: false`, y el botón usa la incorrecta. | 🟡 Media | Buscar en el bundle múltiples llamadas a `createClient(...)`. La pista: el usuario ve sus datos al cargar la pantalla pero el botón no lo "ve". |
| 4 | **ORBIT no propaga sesión a Supabase** — el login en ORBIT usa un sistema externo y nunca llama a `supabase.auth.signInWithPassword` ni `setSession`. | 🟢 Baja | En localStorage no hay ninguna key `sb-stjugsrkrweakvzmizpq-auth-token`. |

## Pasos de diagnóstico (correr en DevTools Console)

Abrí la pantalla del bug y pegá esto en la consola **antes** y **después** de hacer click en "Iniciar análisis":

```js
// 1. ¿Hay sesión activa?
const session = await window.supabase?.auth?.getSession?.() ?? "supabase no expuesto en window";
console.log("[diag-1] session:", session);

// 2. ¿Hay user?
const user = await window.supabase?.auth?.getUser?.() ?? "supabase no expuesto en window";
console.log("[diag-2] user:", user);

// 3. ¿Qué keys de Supabase hay en storage?
const keys = Object.keys(localStorage).filter(k => k.includes("supabase") || k.startsWith("sb-"));
console.log("[diag-3] storage keys:", keys);
keys.forEach(k => {
  const v = localStorage.getItem(k);
  try {
    const parsed = JSON.parse(v);
    console.log("[diag-3]", k, "expires_at:", parsed.expires_at, "user_id:", parsed.user?.id ?? parsed.currentSession?.user?.id);
  } catch {
    console.log("[diag-3]", k, "→ no JSON");
  }
});

// 4. Listener de cambios de auth (para ver si después de un rato cambia)
window.supabase?.auth?.onAuthStateChange?.((event, sess) => {
  console.log("[diag-4] authStateChange:", event, "session:", !!sess, "user_id:", sess?.user?.id);
});
```

**Lectura del resultado:**

- Si `diag-1` devuelve `session: null` pero `diag-3` muestra una key con datos → es **Hipótesis 1 (race condition)** o **Hipótesis 3 (cliente mal instanciado)**.
- Si `diag-1` y `diag-3` están vacíos → es **Hipótesis 4 (ORBIT no propaga)**.
- Si `diag-3` muestra `expires_at` en el pasado → es **Hipótesis 2 (sesión expirada)**.

## Soluciones por hipótesis

### Solución para Hipótesis 1 — Race condition (la más probable)

Hacer que el botón espere a que auth termine de hidratar. Implementar un hook que mantenga el estado de auth:

```tsx
// hooks/useSupabaseAuth.ts
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { User } from "@supabase/supabase-js";

export function useSupabaseAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { user, ready };
}
```

Y en el componente de "Nuevo análisis":

```tsx
const { user, ready } = useSupabaseAuth();

async function handleStartAnalysis() {
  if (!ready) {
    console.warn("Auth todavía no está lista, esperá un momento");
    return;
  }
  if (!user?.id) {
    // Mostrar al usuario un mensaje de "Tu sesión expiró, recargá la página"
    return;
  }

  const { data, error } = await supabase
    .schema("ahrefs_web_analysis")
    .from("analysis_requests")
    .insert({
      target_url: form.url,
      client_name: form.clientName,
      country: form.country.toLowerCase(),
      mode: "domain",
      protocol: "both",
      row_limit: form.depth,
      request_status: "queued",
      enqueued_at: new Date().toISOString(),
      snapshot_date: new Date().toISOString().slice(0, 10),
      request_payload: { domain: extractDomain(form.url) },
      created_by: user.id,  // <-- CLAVE: no debe ser null
    })
    .select()
    .single();

  if (error) throw error;
  // dispatch al orchestrator...
}

// En el JSX:
<button
  onClick={handleStartAnalysis}
  disabled={!ready || !user || submitting}
>
  {!ready ? "Cargando..." : "Iniciar análisis"}
</button>
```

### Solución para Hipótesis 2 — Sesión expirada

Asegurarse de que el cliente Supabase tenga `autoRefreshToken: true` (es default, pero verificar):

```ts
// lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../handoff/01-database-types";

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
```

Si el token ya está expirado al cargar, forzar refresh:

```ts
const { data, error } = await supabase.auth.refreshSession();
```

### Solución para Hipótesis 3 — Cliente mal instanciado

Asegurarse de que el cliente sea un **singleton**. Búscar en el codebase todas las llamadas a `createClient(` y centralizarlas en un solo archivo (`lib/supabaseClient.ts`). Importar siempre desde ahí.

### Solución para Hipótesis 4 — Bridge con ORBIT

Si ORBIT tiene su propio auth y no llama a Supabase Auth, hay dos caminos:

**Camino A (recomendado):** Hacer que ORBIT, después de su login, llame a `supabase.auth.signInWithIdToken` o emita un JWT firmado con el `JWT_SECRET` del proyecto Supabase y el frontend llame:

```ts
await supabase.auth.setSession({
  access_token: jwtFromOrbit,
  refresh_token: refreshTokenFromOrbit,
});
```

**Camino B (provisional):** Pantalla de login Supabase explícita al entrar a Lighthouse, separada del login de ORBIT. El usuario logueará 2 veces hasta que se implemente Camino A.

## Verificación post-fix

1. Recargar la pantalla → en consola, `diag-1` debe devolver una sesión válida con `user.id` ya en el primer try.
2. Hacer click en "Iniciar análisis" → sin error en consola.
3. En la BD:
   ```sql
   SELECT id, target_url, created_by, request_status, created_at
   FROM ahrefs_web_analysis.analysis_requests
   ORDER BY created_at DESC LIMIT 1;
   ```
   El `created_by` debe ser el UUID del usuario logueado, NO null.
4. Las 10 etapas del pipeline empiezan a cerrarse una a una.

## Datos útiles del proyecto

| Item | Valor |
|---|---|
| Project URL | `https://stjugsrkrweakvzmizpq.supabase.co` |
| Project ref | `stjugsrkrweakvzmizpq` |
| Schema principal | `ahrefs_web_analysis` |
| Tabla del INSERT | `ahrefs_web_analysis.analysis_requests` |
| Cantidad de `auth.users` actuales | 11 (todos lograron loguear alguna vez) |
| Cantidad de `public.users` mirror | 68 (más usuarios "soft" sin auth real) |

## Próximo paso

Implementar la solución para Hipótesis 1 (es la más probable y la menos invasiva). Si después de implementarla el bug persiste, correr los snippets de diagnóstico y subir el output al issue.
