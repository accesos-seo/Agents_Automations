// seo-optimizer-reeval-batch
// Triggered by pg_cron daily. Finds opportunities reeval_due_at <= today and
// dispatches them one by one to seo-optimizer-reeval.

import { verifySecret } from "../_shared/secret.ts";
import { sbSchema, getFunctionsBaseUrl, getInternalSecret } from "../_shared/supabase.ts";

interface Payload { max_per_batch?: number; }

Deno.serve(async (req: Request): Promise<Response> => {
  const authErr = verifySecret(req);
  if (authErr) return authErr;

  let payload: Payload = {};
  try { payload = await req.json(); } catch { /* empty body ok */ }
  const maxPerBatch = payload.max_per_batch ?? 50;

  const today = new Date().toISOString().slice(0, 10);
  const { data: opps, error } = await sbSchema("seo_optimizer").from("opportunities")
    .select("id")
    .eq("status", "implemented")
    .lte("reeval_due_at", today)
    .limit(maxPerBatch);

  if (error) return Response.json({ status: "failed", error: error.message }, { status: 500 });
  const ids = (opps ?? []).map((r: Record<string, unknown>) => r.id as string);
  if (ids.length === 0) return Response.json({ status: "ok", processed: 0 });

  const url = `${getFunctionsBaseUrl()}/seo-optimizer-reeval`;
  const secret = getInternalSecret();
  const outcomes: Record<string, number> = {};
  let processed = 0;

  for (const id of ids) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-secret": secret },
        body: JSON.stringify({ opportunity_id: id }),
      });
      if (resp.ok) {
        const j = await resp.json();
        if (j.status === "ok") {
          processed++;
          const oc = (j.outcome as string) ?? "?";
          outcomes[oc] = (outcomes[oc] ?? 0) + 1;
        }
      }
    } catch (err) {
      console.error(`[reeval-batch] ${id} failed:`, err);
    }
  }

  return Response.json({ status: "ok", processed, outcomes });
});
