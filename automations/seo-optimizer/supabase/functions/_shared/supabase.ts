// _shared/supabase.ts
// Cliente singleton de Supabase usando service_role (bypasses RLS).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
  });
  return _client;
}

// Convenience: get a client scoped to a specific schema
export function sbSchema(schema: string) {
  return getSupabase().schema(schema);
}

// Self URL — used by orchestrator to call other Edge Functions
export function getFunctionsBaseUrl(): string {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) throw new Error("SUPABASE_URL not set");
  return `${url}/functions/v1`;
}

// Internal secret for calling sibling functions
export function getInternalSecret(): string {
  const s = Deno.env.get("SEO_OPTIMIZER_INTERNAL_SECRET");
  if (!s) throw new Error("SEO_OPTIMIZER_INTERNAL_SECRET not set");
  return s;
}
