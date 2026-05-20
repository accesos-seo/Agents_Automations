import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase: SupabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false }, db: { schema: "seo_sentinel" } }
);

// Cliente alternativo: notifications_outbox vive en public (compartido con otros sistemas)
export const supabasePublic: SupabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);
