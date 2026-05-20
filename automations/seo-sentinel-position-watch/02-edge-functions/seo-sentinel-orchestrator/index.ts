import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/supabase.ts";
import { verifyInternalSecret } from "../_shared/secret.ts";
import { emitEvent } from "../_shared/run-events.ts";

interface OrchestratorInput {
  trigger: "cron" | "manual" | "watchdog_retry";
  brand_id?: string;
}

interface Brand {
  id: string;
}

const SUPABASE_FUNCTIONS_URL = Deno.env.get("SUPABASE_FUNCTIONS_URL")!;
const INTERNAL_SECRET = Deno.env.get("SEO_SENTINEL_INTERNAL_SECRET")!;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function computeDateRange(): { date_from: string; date_to: string } {
  const today = new Date();
  const from = new Date(today);
  const to = new Date(today);
  from.setUTCDate(today.getUTCDate() - 3);
  to.setUTCDate(today.getUTCDate() - 1);
  return {
    date_from: from.toISOString().split("T")[0],
    date_to: to.toISOString().split("T")[0],
  };
}

async function callAgent(
  agent: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/${agent}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": INTERNAL_SECRET,
    },
    body: JSON.stringify(payload),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

serve(async (req: Request) => {
  const denied = verifyInternalSecret(req);
  if (denied) return denied;

  let input: OrchestratorInput;
  try {
    input = await req.json() as OrchestratorInput;
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  if (!input.trigger) {
    return jsonResponse({ ok: false, error: "missing_trigger" }, 400);
  }

  const startedAt = new Date().toISOString();
  const { data: runRow, error: runErr } = await supabase
    .from("analysis_runs")
    .insert({
      trigger_source: input.trigger,
      started_at: startedAt,
      status: "running",
    })
    .select("id")
    .single();

  if (runErr || !runRow) {
    console.error(`[orchestrator] failed to create run: ${runErr?.message}`);
    return jsonResponse({ ok: false, error: "run_insert_failed", detail: runErr?.message }, 500);
  }

  const run_id = runRow.id as string;
  await emitEvent({
    run_id,
    event_source: "orchestrator",
    event_type: "agent_started",
    payload: { trigger: input.trigger, brand_id: input.brand_id ?? null },
  });

  try {
    let brandQuery = supabase.from("brands").select("id").eq("status", "active");
    if (input.brand_id) brandQuery = brandQuery.eq("id", input.brand_id);
    const { data: brands, error: brandsErr } = await brandQuery;
    if (brandsErr) throw new Error(`brands_query_failed: ${brandsErr.message}`);
    const activeBrands = (brands ?? []) as Brand[];

    await supabase
      .from("analysis_runs")
      .update({ brands_total: activeBrands.length })
      .eq("id", run_id);

    if (activeBrands.length === 0) {
      await supabase
        .from("analysis_runs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          brands_processed: 0,
          brands_failed: 0,
        })
        .eq("id", run_id);
      await emitEvent({
        run_id,
        event_source: "orchestrator",
        event_type: "agent_completed",
        payload: { brands_processed: 0, brands_failed: 0, reason: "no_active_brands" },
      });
      return jsonResponse({ ok: true, run_id, brands_processed: 0, brands_failed: 0 });
    }

    const { date_from, date_to } = computeDateRange();

    // GA4 es best-effort: fire-and-forget para no bloquear el pipeline en caso de fallo
    const ingestPromises = activeBrands.map((b) => {
      const payload = { run_id, brand_id: b.id, date_from, date_to };
      callAgent("seo-sentinel-ga4-ingestor", payload).catch((err) => {
        console.warn(`[orchestrator] ga4 fire-and-forget error brand=${b.id}: ${String(err)}`);
      });
      return callAgent("seo-sentinel-gsc-ingestor", payload);
    });

    const results = await Promise.allSettled(ingestPromises);
    let brands_processed = 0;
    let brands_failed = 0;
    results.forEach((r, idx) => {
      if (r.status === "fulfilled" && r.value.ok) {
        brands_processed++;
      } else {
        brands_failed++;
        const brand = activeBrands[idx];
        const detail = r.status === "fulfilled"
          ? `status=${r.value.status} body=${JSON.stringify(r.value.body)}`
          : String(r.reason);
        console.error(`[orchestrator] gsc-ingestor failed brand=${brand.id}: ${detail}`);
      }
    });

    await supabase
      .from("analysis_runs")
      .update({ brands_processed, brands_failed })
      .eq("id", run_id);

    const analystResult = await callAgent("seo-sentinel-analyst", { run_id });
    if (!analystResult.ok) {
      throw new Error(`analyst_failed: status=${analystResult.status} body=${JSON.stringify(analystResult.body)}`);
    }

    await supabase
      .from("analysis_runs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", run_id);

    await emitEvent({
      run_id,
      event_source: "orchestrator",
      event_type: "agent_completed",
      payload: { brands_processed, brands_failed },
    });

    return jsonResponse({ ok: true, run_id, brands_processed, brands_failed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from("analysis_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: msg,
      })
      .eq("id", run_id);
    await emitEvent({
      run_id,
      event_source: "orchestrator",
      event_type: "agent_failed",
      error_message: msg,
    });
    return jsonResponse({ ok: false, run_id, error: msg }, 500);
  }
});
