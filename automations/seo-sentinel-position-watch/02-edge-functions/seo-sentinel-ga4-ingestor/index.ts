import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/supabase.ts";
import { verifyInternalSecret } from "../_shared/secret.ts";
import { emitEvent } from "../_shared/run-events.ts";
import { runReport } from "../_shared/ga4-api.ts";

interface IngestorInput {
  run_id: string;
  brand_id: string;
  date_from: string;
  date_to: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  const denied = verifyInternalSecret(req);
  if (denied) return denied;

  let input: IngestorInput;
  try {
    input = await req.json() as IngestorInput;
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  if (!input.run_id || !input.brand_id || !input.date_from || !input.date_to) {
    return jsonResponse({ ok: false, error: "missing_fields" }, 400);
  }

  const { run_id, brand_id, date_from, date_to } = input;

  await emitEvent({
    run_id,
    brand_id,
    event_source: "ga4-ingestor",
    event_type: "agent_started",
    payload: { date_from, date_to },
  });

  try {
    const { data: brand, error: brandErr } = await supabase
      .from("brands")
      .select("id, ga4_property_id")
      .eq("id", brand_id)
      .maybeSingle();

    if (brandErr) {
      // Lookup error: tratamos como best-effort completed con skip
      await emitEvent({
        run_id,
        brand_id,
        event_source: "ga4-ingestor",
        event_type: "agent_completed",
        payload: { skipped: true, reason: "brand_lookup_failed", detail: brandErr.message },
      });
      return jsonResponse({ ok: true, skipped: true, reason: "brand_lookup_failed" });
    }

    const propertyId = brand?.ga4_property_id;
    if (!propertyId || String(propertyId).trim() === "") {
      await emitEvent({
        run_id,
        brand_id,
        event_source: "ga4-ingestor",
        event_type: "agent_completed",
        payload: { skipped: true, reason: "no_ga4_property" },
      });
      return jsonResponse({ ok: true, skipped: true, reason: "no_ga4_property" });
    }

    try {
      const { records } = await runReport(String(propertyId), date_from, date_to);
      let rows_updated = 0;
      for (const rec of records) {
        const { error: updErr, count } = await supabase
          .from("traffic_daily")
          .update({
            ga4_sessions_organic: rec.sessions,
            ga4_users_organic: rec.users,
            ga4_conversions_organic: rec.conversions,
            run_id,
          }, { count: "exact" })
          .eq("brand_id", brand_id)
          .eq("date", rec.date);
        if (updErr) {
          console.warn(`[ga4-ingestor] update warning brand=${brand_id} date=${rec.date}: ${updErr.message}`);
        } else if (count) {
          rows_updated += count;
        }
      }
      await emitEvent({
        run_id,
        brand_id,
        event_source: "ga4-ingestor",
        event_type: "agent_completed",
        payload: { records_received: records.length, rows_updated },
      });
      return jsonResponse({ ok: true, run_id, brand_id, records_received: records.length, rows_updated });
    } catch (ga4Err) {
      // Best-effort: si GA4 falla NO abortamos el pipeline, retornamos 200 con error logueado
      const msg = ga4Err instanceof Error ? ga4Err.message : String(ga4Err);
      await emitEvent({
        run_id,
        brand_id,
        event_source: "ga4-ingestor",
        event_type: "agent_failed",
        error_message: msg,
      });
      return jsonResponse({ ok: true, best_effort_failed: true, error: msg });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await emitEvent({
      run_id,
      brand_id,
      event_source: "ga4-ingestor",
      event_type: "agent_failed",
      error_message: msg,
    });
    // Best-effort: aun en error inesperado retornamos 200 para no marcar el pipeline como caido
    return jsonResponse({ ok: true, best_effort_failed: true, error: msg });
  }
});
