import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[oew/_shared/supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
}

function clientFor(schema: string): SupabaseClient {
  return createClient(SUPABASE_URL ?? "", SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false },
    db: { schema },
  });
}

let _oewClient: SupabaseClient | null = null;
let _hubClient: SupabaseClient | null = null;
let _publicClient: SupabaseClient | null = null;

export function getOewClient(): SupabaseClient {
  if (!_oewClient) _oewClient = clientFor("organic_early_warning");
  return _oewClient;
}

export function getHubClient(): SupabaseClient {
  if (!_hubClient) _hubClient = clientFor("seo_data_hub");
  return _hubClient;
}

export function getPublicClient(): SupabaseClient {
  if (!_publicClient) _publicClient = clientFor("public");
  return _publicClient;
}

export async function getVaultSecret(name: string): Promise<string | null> {
  const adminClient = createClient(SUPABASE_URL ?? "", SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false },
    db: { schema: "vault" },
  });
  const { data, error } = await adminClient
    .from("decrypted_secrets")
    .select("decrypted_secret")
    .eq("name", name)
    .maybeSingle();
  if (error) {
    console.error(`[oew/_shared/supabase] vault lookup failed for ${name}: ${error.message}`);
    return null;
  }
  if (!data) return null;
  const record = data as { decrypted_secret: string | null };
  return record.decrypted_secret ?? null;
}
