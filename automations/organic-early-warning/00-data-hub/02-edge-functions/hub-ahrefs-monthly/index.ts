import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { verifyInternalSecret } from "../_shared/secret.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { emitEvent } from "../_shared/run-events.ts";
import {
  CreditTracker,
  getBacklinksBroken,
  getDomainOverview,
  getRefdomainsNewLost,
  getToxicLinks,
} from "../_shared/ahrefs-api.ts";
import { BrandRow, HubMonthlyRequest } from "../_shared/types.ts";

const PERIOD_REGEX = /^\d{4}-\d{2}$/;
const ESTIMATED_BRAND_COST = 50;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function previousMonth(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

function monthDateRange(period: string): { from: string; to: string } {
  const [y, m] = period.split("-").map((v) => parseInt(v, 10));
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0));
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  return { from: fmt(from), to: fmt(to) };
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req: Request) => {
  const denied = verifyInternalSecret(req);
  if (denied) return denied;
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  let body: HubMonthlyRequest;
  try {
    body = await req.json() as HubMonthlyRequest;
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  if (!body.trigger) return jsonResponse({ ok: false, error: "missing_trigger" }, 400);
  if (body.period_month && !PERIOD_REGEX.test(body.period_month)) {
    return jsonResponse({ ok: false, error: "invalid_period_month" }, 400);
  }

  const periodMonth = body.period_month ?? previousMonth();
  const { from: dateFrom, to: dateTo } = monthDateRange(periodMonth);

  const ahrefsToken = Deno.env.get("AHREFS_API_TOKEN");
  if (!ahrefsToken) return jsonResponse({ ok: false, error: "ahrefs_auth_failed" }, 500);
  const budget = parseInt(Deno.env.get("AHREFS_CREDIT_BUDGET_MONTH") ?? "0", 10);
  if (!budget || Number.isNaN(budget)) {
    return jsonResponse({ ok: false, error: "ahrefs_budget_not_configured" }, 500);
  }

  const supa = getServiceClient();

  const { data: runRow, error: runErr } = await supa
    .from("ingestion_runs")
    .insert({
      source: "ahrefs",
      brand_id: body.brand_id ?? null,
      period_month: periodMonth,
      period_start: dateFrom,
      period_end: dateTo,
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
    event_source: "hub-ahrefs-monthly",
    event_type: "run_started",
    payload: { period_month: periodMonth, trigger: body.trigger, brand_id: body.brand_id ?? null },
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

    const { data: priorRuns, error: priorErr } = await supa
      .from("ingestion_runs")
      .select("credits_used")
      .eq("source", "ahrefs")
      .eq("period_month", periodMonth)
      .eq("status", "completed");
    if (priorErr) throw new Error(`prior_runs_query_failed: ${priorErr.message}`);
    const priorCredits = (priorRuns ?? []).reduce(
      (acc: number, r: { credits_used?: number }) => acc + (r.credits_used ?? 0),
      0,
    );

    let brandsProcessed = 0;
    let brandsFailed = 0;
    let brandsSkippedBudget = 0;
    let backlinksRows = 0;
    let serpRows = 0;
    let toxicRows = 0;

    const tracker = new CreditTracker();

    for (const brand of brands) {
      const projectedAfter = priorCredits + tracker.used + ESTIMATED_BRAND_COST;
      if (projectedAfter > budget) {
        brandsSkippedBudget++;
        await emitEvent({
          client: supa,
          run_id: ingestionRunId,
          brand_id: brand.id,
          event_source: "hub-ahrefs-monthly",
          event_type: "warning",
          payload: {
            reason: "credit_budget_would_exceed",
            credits_used_so_far: priorCredits + tracker.used,
            estimated_cost: ESTIMATED_BRAND_COST,
            budget,
          },
        });
        continue;
      }

      if (!brand.ahrefs_domain) {
        await emitEvent({
          client: supa,
          run_id: ingestionRunId,
          brand_id: brand.id,
          event_source: "hub-ahrefs-monthly",
          event_type: "warning",
          payload: { reason: "no_ahrefs_domain" },
        });
        continue;
      }

      try {
        await emitEvent({
          client: supa,
          run_id: ingestionRunId,
          brand_id: brand.id,
          event_source: "hub-ahrefs-monthly",
          event_type: "agent_started",
          payload: { brand: brand.name, period_month: periodMonth },
        });

        const overview = await getDomainOverview(ahrefsToken, brand.ahrefs_domain);
        tracker.consume(overview);
        const newLost = await getRefdomainsNewLost(ahrefsToken, brand.ahrefs_domain, dateFrom, dateTo);
        tracker.consume(newLost);
        const broken = await getBacklinksBroken(ahrefsToken, brand.ahrefs_domain);
        tracker.consume(broken);

        const { error: blErr } = await supa
          .from("ahrefs_backlinks_monthly")
          .upsert([{
            brand_id: brand.id,
            period_month: periodMonth,
            domain_rating: overview.data.domain?.domain_rating ?? null,
            total_backlinks: overview.data.domain?.backlinks ?? null,
            total_refdomains: overview.data.domain?.refdomains ?? null,
            new_refdomains: newLost.data.refdomains?.new_refdomains ?? null,
            lost_refdomains: newLost.data.refdomains?.lost_refdomains ?? null,
            broken_backlinks: broken.data.broken_backlinks ?? null,
            payload: { overview: overview.data, new_lost: newLost.data, broken: broken.data },
          }], { onConflict: "brand_id,period_month" });
        if (blErr) throw new Error(`upsert_failed: ${blErr.message}`);
        backlinksRows++;

        const toxic = await getToxicLinks(ahrefsToken, brand.ahrefs_domain);
        tracker.consume(toxic);
        const toxicList = toxic.data.toxic_links ?? [];
        const toxicUpserts: Array<Record<string, unknown>> = [];
        for (const t of toxicList) {
          const url = t.url_from ?? "";
          if (!url) continue;
          toxicUpserts.push({
            brand_id: brand.id,
            period_month: periodMonth,
            link_url_hash: await sha256Hex(url),
            link_url: url,
            source_domain: t.domain_from ?? null,
            toxic_score: t.toxic_score ?? null,
            anchor_text: t.anchor ?? null,
            payload: t,
          });
        }
        if (toxicUpserts.length > 0) {
          const { error: txErr } = await supa
            .from("ahrefs_toxic_links_monthly")
            .upsert(toxicUpserts, { onConflict: "brand_id,period_month,link_url_hash" });
          if (txErr) throw new Error(`upsert_failed: ${txErr.message}`);
          toxicRows += toxicUpserts.length;
        }

        brandsProcessed++;
        await emitEvent({
          client: supa,
          run_id: ingestionRunId,
          brand_id: brand.id,
          event_source: "hub-ahrefs-monthly",
          event_type: "agent_completed",
          payload: {
            credits_used: overview.creditsUsed + newLost.creditsUsed + broken.creditsUsed + toxic.creditsUsed,
            toxic_count: toxicUpserts.length,
          },
        });
      } catch (err) {
        brandsFailed++;
        const msg = err instanceof Error ? err.message : String(err);
        await emitEvent({
          client: supa,
          run_id: ingestionRunId,
          brand_id: brand.id,
          event_source: "hub-ahrefs-monthly",
          event_type: "agent_failed",
          error_message: msg,
        });
        if (msg.startsWith("ahrefs_auth_failed")) throw err;
        if (msg.startsWith("ahrefs_rate_limit")) throw err;
      }
    }

    const allSkippedByBudget =
      brands.length > 0 && brandsSkippedBudget === brands.length && brandsProcessed === 0;
    const allFailed = brands.length > 0 && brandsFailed === brands.length && brandsProcessed === 0;
    const finalStatus = (allSkippedByBudget || allFailed) ? "failed" : "completed";
    const errorMessage = allSkippedByBudget
      ? "credit_budget_exhausted"
      : allFailed
      ? "all_brands_failed"
      : null;

    await supa.from("ingestion_runs")
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        credits_used: tracker.used,
        error_message: errorMessage,
        payload: {
          brands_processed: brandsProcessed,
          brands_failed: brandsFailed,
          brands_skipped_budget: brandsSkippedBudget,
          credits_used_this_run: tracker.used,
          credits_used_month_total: priorCredits + tracker.used,
          credits_budget: budget,
        },
      })
      .eq("id", ingestionRunId);

    await emitEvent({
      client: supa,
      run_id: ingestionRunId,
      event_source: "hub-ahrefs-monthly",
      event_type: finalStatus === "completed" ? "run_completed" : "run_failed",
      payload: {
        brands_processed: brandsProcessed,
        brands_skipped_budget: brandsSkippedBudget,
        credits_used_this_run: tracker.used,
      },
    });

    if (finalStatus === "failed" && allSkippedByBudget) {
      return jsonResponse({ ok: false, error: "credit_budget_exhausted" }, 402);
    }

    return jsonResponse({
      ok: true,
      ingestion_run_id: ingestionRunId,
      period_month: periodMonth,
      brands_processed: brandsProcessed,
      brands_skipped_budget: brandsSkippedBudget,
      backlinks_rows: backlinksRows,
      serp_rows: serpRows,
      toxic_rows: toxicRows,
      credits_used_this_run: tracker.used,
      credits_used_month_total: priorCredits + tracker.used,
      credits_budget: budget,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supa.from("ingestion_runs")
      .update({ status: "failed", completed_at: new Date().toISOString(), error_message: msg })
      .eq("id", ingestionRunId);
    await emitEvent({
      client: supa,
      run_id: ingestionRunId,
      event_source: "hub-ahrefs-monthly",
      event_type: "run_failed",
      error_message: msg,
    });
    let code = "upsert_failed";
    let status = 500;
    if (msg.startsWith("ahrefs_auth_failed")) code = "ahrefs_auth_failed";
    else if (msg.startsWith("ahrefs_rate_limit")) code = "ahrefs_rate_limit";
    else if (msg.startsWith("credit_budget_exhausted")) {
      code = "credit_budget_exhausted";
      status = 402;
    }
    return jsonResponse({ ok: false, error: code, detail: msg }, status);
  }
});
