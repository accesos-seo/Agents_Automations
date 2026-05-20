import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

let _service: SupabaseClient | null = null;
let _public: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (_service) return _service;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
  _service = createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: "seo_data_hub" },
  });
  return _service;
}

export function getPublicClient(): SupabaseClient {
  if (_public) return _public;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
  _public = createClient(url, key, {
    auth: { persistSession: false },
  });
  return _public;
}

interface VaultRow {
  decrypted_secret: string;
}

export async function getVaultSecret(name: string): Promise<string | null> {
  const env = Deno.env.get(name);
  if (env) return env;

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;

  const vaultClient = createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: "vault" },
  });
  const { data, error } = await vaultClient
    .from("decrypted_secrets")
    .select("decrypted_secret")
    .eq("name", name)
    .maybeSingle();
  if (error || !data) return null;
  return (data as VaultRow).decrypted_secret ?? null;
}
