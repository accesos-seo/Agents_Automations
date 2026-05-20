import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { verifyInternalSecret } from "../_shared/secret.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { emitEvent } from "../_shared/run-events.ts";
import {
  aggregateCoverageFromInspections,
  getGscClient,
  searchAnalyticsQuery,
  urlInspect,
} from "../_shared/gsc-api.ts";
import { BrandRow, HubWeeklyRequest } from "../_shared/types.ts";

const ISO_WEEK_REGEX = /^\d{4}-W\d{2}$/;
const TOP_N_INSPECTIONS = 100;
const SA_BATCH_INSERT = 500;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function isoWeekDateRange(isoWeek: string): { from: string; to: string } {
  const [yearStr, weekStr] = isoWeek.split("-W");
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const target = new Date(week1Monday);
  target.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const end = new Date(target);
  end.setUTCDate(target.getUTCDate() + 6);
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  return { from: fmt(target), to: fmt(end) };
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

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface SaRow {
  brand_id: string;
  iso_week: string;
  dimensions_hash: string;
  dimensions: Record<string, string>;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  date: string;
  page: string;
  query: string;
  device: string;
  country: string;
  search_appearance: string;
}

serve(async (req: Request) => {
  const denied = verifyInternalSecret(req);
  if (denied) return denied;
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  let body: HubWeeklyRequest;
  try {
    body = await req.json() as HubWeeklyRequest;
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  if (!body.trigger) return jsonResponse({ ok: false, error: "missing_trigger" }, 400);
  if (body.iso_week && !ISO_WEEK_REGEX.test(body.iso_week)) {
    return jsonResponse({ ok: false, error: "invalid_iso_week" }, 400);
  }

  const isoWeek = body.iso_week ?? previousCompletedIsoWeek();
  const { from: dateFrom, to: dateTo } = isoWeekDateRange(isoWeek);

  const supa = getServiceClient();

  const { data: runRow, error: runErr } = await supa
    .from("ingestion_runs")
    .insert({
      source: "gsc",
      brand_id: body.brand_id ?? null,
      iso_week: isoWeek,
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
    event_source: "hub-gsc-weekly",
    event_type: "run_started",
    payload: { iso_week: isoWeek, trigger: body.trigger, brand_id: body.brand_id ?? null },
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

    const token = await getGscClient();

    let brandsProcessed = 0;
    let brandsFailed = 0;
    let rowsInserted = 0;
    let rowsUpdated = 0;

    for (const brand of brands) {
      if (!brand.gsc_property_url) {
        await emitEvent({
          client: supa,
          run_id: ingestionRunId,
          brand_id: brand.id,
          event_source: "hub-gsc-weekly",
          event_type: "warning",
          payload: { reason: "no_gsc_property_url" },
        });
        continue;
      }

      try {
        await emitEvent({
          client: supa,
          run_id: ingestionRunId,
          brand_id: brand.id,
          event_source: "hub-gsc-weekly",
          event_type: "agent_started",
          payload: { brand: brand.name, iso_week: isoWeek },
        });

        const saRows = await searchAnalyticsQuery(token, brand.gsc_property_url, {
          startDate: dateFrom,
          endDate: dateTo,
          dimensions: ["date", "page", "query", "device", "country", "searchAppearance"],
          rowLimit: 25000,
        });

        const upsertRows: SaRow[] = [];
        for (const row of saRows) {
          const [date, page, query, device, country, searchAppearance] = row.keys ?? [];
          if (!date) continue;
          const dimKey = [date, page, query, device, country, searchAppearance].join("|");
          const dh = await sha256Hex(dimKey);
          upsertRows.push({
            brand_id: brand.id,
            iso_week: isoWeek,
            dimensions_hash: dh,
            dimensions: { date, page, query, device, country, searchAppearance },
            clicks: row.clicks ?? 0,
            impressions: row.impressions ?? 0,
            ctr: row.ctr ?? 0,
            position: row.position ?? 0,
            date,
            page: page ?? "",
            query: query ?? "",
            device: device ?? "",
            country: country ?? "",
            search_appearance: searchAppearance ?? "",
          });
        }

        for (let i = 0; i < upsertRows.length; i += SA_BATCH_INSERT) {
          const batch = upsertRows.slice(i, i + SA_BATCH_INSERT);
          const { error } = await supa
            .from("gsc_search_analytics_weekly")
            .upsert(batch, { onConflict: "brand_id,iso_week,dimensions_hash,ingested_at" });
          if (error) throw new Error(`upsert_failed: ${error.message}`);
          rowsInserted += batch.length;
        }

        const clicksByUrl = new Map<string, number>();
        for (const r of upsertRows) {
          clicksByUrl.set(r.page, (clicksByUrl.get(r.page) ?? 0) + r.clicks);
        }
        const topUrls = [...clicksByUrl.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, TOP_N_INSPECTIONS)
          .map((e) => e[0])
          .filter((u) => !!u);

        const inspections: Array<{ url: string; result: Awaited<ReturnType<typeof urlInspect>> }> = [];
        const inspectRows: Array<Record<string, unknown>> = [];
        for (const url of topUrls) {
          try {
            const result = await urlInspect(token, brand.gsc_property_url, url);
            inspections.push({ url, result });
            const idx = result.inspectionResult?.indexStatusResult;
            inspectRows.push({
              brand_id: brand.id,
              iso_week: isoWeek,
              url,
              index_status: idx?.verdict ?? null,
              coverage_state: idx?.coverageState ?? null,
              last_crawl_time: idx?.lastCrawlTime ?? null,
              robots_txt_state: idx?.robotsTxtState ?? null,
              indexing_state: idx?.indexingState ?? null,
              mobile_usability_result: result.inspectionResult?.mobileUsabilityResult?.verdict ?? null,
            });
          } catch (err) {
            console.warn(`[hub-gsc-weekly] urlInspect failed for ${url}: ${String(err)}`);
          }
        }

        if (inspectRows.length > 0) {
          const { error } = await supa
            .from("gsc_url_inspection_weekly")
            .upsert(inspectRows, { onConflict: "brand_id,iso_week,url" });
          if (error) throw new Error(`upsert_failed: ${error.message}`);
          rowsInserted += inspectRows.length;
        }

        const coverageAgg = aggregateCoverageFromInspections(inspections);
        const coverageRows = coverageAgg.map((c) => ({
          brand_id: brand.id,
          iso_week: isoWeek,
          error_type: c.error_type,
          count: c.count,
          sample_urls: c.sample_urls,
        }));
        if (coverageRows.length > 0) {
          const { error } = await supa
            .from("gsc_coverage_weekly")
            .upsert(coverageRows, { onConflict: "brand_id,iso_week,error_type" });
          if (error) throw new Error(`upsert_failed: ${error.message}`);
          rowsUpdated += coverageRows.length;
        }

        brandsProcessed++;
        await emitEvent({
          client: supa,
          run_id: ingestionRunId,
          brand_id: brand.id,
          event_source: "hub-gsc-weekly",
          event_type: "agent_completed",
          payload: { sa_rows: upsertRows.length, inspected: inspectRows.length },
        });
      } catch (err) {
        brandsFailed++;
        const msg = err instanceof Error ? err.message : String(err);
        await emitEvent({
          client: supa,
          run_id: ingestionRunId,
          brand_id: brand.id,
          event_source: "hub-gsc-weekly",
          event_type: "agent_failed",
          error_message: msg,
        });
      }
    }

    const finalStatus = brands.length > 0 && brandsFailed === brands.length ? "failed" : "completed";

    await supa.from("ingestion_runs")
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        rows_inserted: rowsInserted,
        rows_updated: rowsUpdated,
        payload: { brands_processed: brandsProcessed, brands_failed: brandsFailed },
      })
      .eq("id", ingestionRunId);

    await emitEvent({
      client: supa,
      run_id: ingestionRunId,
      event_source: "hub-gsc-weekly",
      event_type: finalStatus === "completed" ? "run_completed" : "run_failed",
      payload: { brands_processed: brandsProcessed, brands_failed: brandsFailed, rows_inserted: rowsInserted },
    });

    return jsonResponse({
      ok: true,
      ingestion_run_id: ingestionRunId,
      iso_week: isoWeek,
      brands_processed: brandsProcessed,
      brands_failed: brandsFailed,
      rows_inserted: rowsInserted,
      rows_updated: rowsUpdated,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supa.from("ingestion_runs")
      .update({ status: "failed", completed_at: new Date().toISOString(), error_message: msg })
      .eq("id", ingestionRunId);
    await emitEvent({
      client: supa,
      run_id: ingestionRunId,
      event_source: "hub-gsc-weekly",
      event_type: "run_failed",
      error_message: msg,
    });
    let code = "upsert_failed";
    if (msg.startsWith("gsc_auth_failed")) code = "gsc_auth_failed";
    else if (msg.startsWith("gsc_rate_limit_exhausted")) code = "gsc_rate_limit_exhausted";
    return jsonResponse({ ok: false, error: code, detail: msg }, 500);
  }
});
