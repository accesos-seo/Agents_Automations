import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { verifyInternalSecret } from "../_shared/secret.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { emitEvent } from "../_shared/run-events.ts";
import { CwvDevice, getCwvMetrics } from "../_shared/cwv-api.ts";
import { BrandRow, CwvWeeklyRequest } from "../_shared/types.ts";

const ISO_WEEK_REGEX = /^\d{4}-W\d{2}$/;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function previousCompletedIsoWeek(): string {
  const now = new Date();
  const last = new Date(now);
  last.setUTCDate(now.getUTCDate() - 7);
  const d = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad2(weekNum)}`;
}

interface TopUrlAggRow {
  page: string;
  clicks: number;
}

serve(async (req: Request) => {
  const denied = verifyInternalSecret(req);
  if (denied) return denied;
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  let body: CwvWeeklyRequest;
  try {
    body = await req.json() as CwvWeeklyRequest;
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  if (!body.trigger) return jsonResponse({ ok: false, error: "missing_trigger" }, 400);
  if (body.iso_week && !ISO_WEEK_REGEX.test(body.iso_week)) {
    return jsonResponse({ ok: false, error: "invalid_iso_week" }, 400);
  }
  const topN = body.top_n_urls ?? 50;
  if (topN < 1 || topN > 200) {
    return jsonResponse({ ok: false, error: "top_n_urls_out_of_range" }, 400);
  }

  const isoWeek = body.iso_week ?? previousCompletedIsoWeek();
  const psiKey = Deno.env.get("PSI_API_KEY");
  const cruxKey = Deno.env.get("CRUX_API_KEY") ?? psiKey ?? null;
  if (!psiKey) {
    return jsonResponse({ ok: false, error: "psi_key_missing" }, 500);
  }

  const supa = getServiceClient();

  const { data: runRow, error: runErr } = await supa
    .from("ingestion_runs")
    .insert({
      source: "cwv",
      brand_id: body.brand_id ?? null,
      iso_week: isoWeek,
      status: "running",
    })
    .select("id")
    .single();
  if (runErr || !runRow) {
    return jsonResponse({ ok: false, error: "upsert_failed", detail: runErr?.message }, 500);
  }
  const ingestionRunId = runRow.id as string;

  await emitEvent({
    client: supa,
    run_id: ingestionRunId,
    event_source: "hub-cwv-weekly",
    event_type: "run_started",
    payload: { iso_week: isoWeek, trigger: body.trigger, brand_id: body.brand_id ?? null, top_n: topN },
  });

  try {
    let brandQuery = supa.from("brands_registry")
      .select("id, name, gsc_property_url, ga4_property_id, ahrefs_domain, country_iso, status")
      .eq("status", "active");
    if (body.brand_id) brandQuery = brandQuery.eq("id", body.brand_id);

    const { data: brandsRaw, error: brandsErr } = await brandQuery;
    if (brandsErr) throw new Error(`brand_query_failed: ${brandsErr.message}`);
    const brands = (brandsRaw ?? []) as BrandRow[];
    if (body.brand_id && brands.length === 0) {
      await supa.from("ingestion_runs")
        .update({ status: "failed", completed_at: new Date().toISOString(), error_message: "brand_not_found" })
        .eq("id", ingestionRunId);
      return jsonResponse({ ok: false, error: "brand_not_found" }, 404);
    }

    let brandsProcessed = 0;
    let brandsFailed = 0;
    let urlsEvaluated = 0;
    let cruxHits = 0;
    let psiFallbacks = 0;
    let rowsInserted = 0;
    let anyHadData = false;

    for (const brand of brands) {
      try {
        await emitEvent({
          client: supa,
          run_id: ingestionRunId,
          brand_id: brand.id,
          event_source: "hub-cwv-weekly",
          event_type: "agent_started",
          payload: { brand: brand.name, iso_week: isoWeek },
        });

        const { data: pageRows, error: pageErr } = await supa
          .from("gsc_search_analytics_weekly")
          .select("page, clicks")
          .eq("brand_id", brand.id)
          .eq("iso_week", isoWeek);
        if (pageErr) throw new Error(`hub_query_failed: ${pageErr.message}`);

        const aggregated = new Map<string, number>();
        for (const r of (pageRows ?? []) as TopUrlAggRow[]) {
          if (!r.page) continue;
          aggregated.set(r.page, (aggregated.get(r.page) ?? 0) + (r.clicks ?? 0));
        }
        if (aggregated.size === 0) continue;
        anyHadData = true;

        const topUrls = [...aggregated.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, topN)
          .map((e) => e[0]);

        for (const url of topUrls) {
          for (const device of ["mobile", "desktop"] as CwvDevice[]) {
            try {
              const m = await getCwvMetrics(url, device, cruxKey, psiKey);
              urlsEvaluated++;
              if (m.source === "crux") cruxHits++;
              else psiFallbacks++;

              const { error } = await supa
                .from("cwv_weekly")
                .upsert([{
                  brand_id: brand.id,
                  iso_week: isoWeek,
                  url,
                  device,
                  lcp_p75_ms: m.lcp_p75_ms !== null ? Math.round(m.lcp_p75_ms) : null,
                  inp_p75_ms: m.inp_p75_ms !== null ? Math.round(m.inp_p75_ms) : null,
                  cls_p75: m.cls_p75,
                  fcp_p75_ms: m.fcp_p75_ms !== null ? Math.round(m.fcp_p75_ms) : null,
                  ttfb_p75_ms: m.ttfb_p75_ms !== null ? Math.round(m.ttfb_p75_ms) : null,
                  data_source: m.source,
                  sample_size: m.sample_size,
                }], { onConflict: "brand_id,iso_week,url,device" });
              if (error) throw new Error(`upsert_failed: ${error.message}`);
              rowsInserted++;
            } catch (innerErr) {
              const ms = innerErr instanceof Error ? innerErr.message : String(innerErr);
              if (ms.startsWith("psi_quota_exhausted")) throw innerErr;
              console.warn(`[hub-cwv-weekly] url ${url} (${device}) failed: ${ms}`);
            }
          }
        }

        brandsProcessed++;
        await emitEvent({
          client: supa,
          run_id: ingestionRunId,
          brand_id: brand.id,
          event_source: "hub-cwv-weekly",
          event_type: "agent_completed",
          payload: { urls: topUrls.length },
        });
      } catch (err) {
        brandsFailed++;
        const msg = err instanceof Error ? err.message : String(err);
        await emitEvent({
          client: supa,
          run_id: ingestionRunId,
          brand_id: brand.id,
          event_source: "hub-cwv-weekly",
          event_type: "agent_failed",
          error_message: msg,
        });
        if (msg.startsWith("psi_quota_exhausted")) throw err;
      }
    }

    if (!anyHadData && brands.length > 0) {
      await supa.from("ingestion_runs")
        .update({ status: "failed", completed_at: new Date().toISOString(), error_message: "no_gsc_data_for_week" })
        .eq("id", ingestionRunId);
      return jsonResponse({ ok: false, error: "no_gsc_data_for_week" }, 409);
    }

    const finalStatus = brands.length > 0 && brandsFailed === brands.length ? "failed" : "completed";

    await supa.from("ingestion_runs")
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        rows_inserted: rowsInserted,
        payload: {
          brands_processed: brandsProcessed,
          brands_failed: brandsFailed,
          urls_evaluated: urlsEvaluated,
          crux_hits: cruxHits,
          psi_fallbacks: psiFallbacks,
        },
      })
      .eq("id", ingestionRunId);

    await emitEvent({
      client: supa,
      run_id: ingestionRunId,
      event_source: "hub-cwv-weekly",
      event_type: finalStatus === "completed" ? "run_completed" : "run_failed",
      payload: { brands_processed: brandsProcessed, urls_evaluated: urlsEvaluated },
    });

    return jsonResponse({
      ok: true,
      ingestion_run_id: ingestionRunId,
      iso_week: isoWeek,
      brands_processed: brandsProcessed,
      urls_evaluated: urlsEvaluated,
      crux_hits: cruxHits,
      psi_fallbacks: psiFallbacks,
      rows_inserted: rowsInserted,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supa.from("ingestion_runs")
      .update({ status: "failed", completed_at: new Date().toISOString(), error_message: msg })
      .eq("id", ingestionRunId);
    await emitEvent({
      client: supa,
      run_id: ingestionRunId,
      event_source: "hub-cwv-weekly",
      event_type: "run_failed",
      error_message: msg,
    });
    let code = "upsert_failed";
    if (msg.startsWith("crux_api_failed")) code = "crux_api_failed";
    else if (msg.startsWith("psi_quota_exhausted")) code = "psi_quota_exhausted";
    return jsonResponse({ ok: false, error: code, detail: msg }, 500);
  }
});
