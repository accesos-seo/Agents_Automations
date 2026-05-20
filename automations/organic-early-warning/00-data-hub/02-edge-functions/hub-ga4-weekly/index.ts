import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { verifyInternalSecret } from "../_shared/secret.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { emitEvent } from "../_shared/run-events.ts";
import { getGa4Client, runReport } from "../_shared/ga4-api.ts";
import { BrandRow, HubWeeklyRequest } from "../_shared/types.ts";

const ISO_WEEK_REGEX = /^\d{4}-W\d{2}$/;
const GA4_BATCH = 500;

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

function ga4DateToIso(yyyymmdd: string): string {
  if (yyyymmdd.length === 8 && !yyyymmdd.includes("-")) {
    return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
  }
  return yyyymmdd;
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
      source: "ga4",
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
    event_source: "hub-ga4-weekly",
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

    const token = await getGa4Client();

    let brandsProcessed = 0;
    let brandsSkipped = 0;
    let brandsFailed = 0;
    let rowsInserted = 0;

    for (const brand of brands) {
      if (!brand.ga4_property_id) {
        brandsSkipped++;
        continue;
      }

      try {
        await emitEvent({
          client: supa,
          run_id: ingestionRunId,
          brand_id: brand.id,
          event_source: "hub-ga4-weekly",
          event_type: "agent_started",
          payload: { brand: brand.name, iso_week: isoWeek },
        });

        const rows = await runReport(token, brand.ga4_property_id, {
          dateRanges: [{ startDate: dateFrom, endDate: dateTo }],
          dimensions: [
            { name: "date" },
            { name: "deviceCategory" },
            { name: "country" },
            { name: "landingPagePlusQueryString" },
          ],
          metrics: [
            { name: "sessions" },
            { name: "totalUsers" },
            { name: "engagedSessions" },
            { name: "conversions" },
            { name: "purchaseRevenue" },
          ],
          dimensionFilter: {
            filter: {
              fieldName: "sessionDefaultChannelGrouping",
              stringFilter: { matchType: "EXACT", value: "Organic Search" },
            },
          },
        });

        const upsertRows: Array<Record<string, unknown>> = [];
        for (const r of rows) {
          const dv = r.dimensionValues ?? [];
          const mv = r.metricValues ?? [];
          const date = ga4DateToIso(dv[0]?.value ?? "");
          const device = dv[1]?.value ?? "";
          const country = dv[2]?.value ?? "";
          const landing = dv[3]?.value ?? "";
          const dimKey = `${date}|${device}|${country}|${landing}`;
          const dh = await sha256Hex(dimKey);
          upsertRows.push({
            brand_id: brand.id,
            iso_week: isoWeek,
            dimensions_hash: dh,
            dimensions: { date, device_category: device, country, landing_page: landing },
            sessions: Number(mv[0]?.value ?? 0),
            total_users: Number(mv[1]?.value ?? 0),
            engaged_sessions: Number(mv[2]?.value ?? 0),
            conversions: Number(mv[3]?.value ?? 0),
            purchase_revenue: Number(mv[4]?.value ?? 0),
            landing_page: landing,
            device_category: device,
            country,
          });
        }

        for (let i = 0; i < upsertRows.length; i += GA4_BATCH) {
          const batch = upsertRows.slice(i, i + GA4_BATCH);
          const { error } = await supa
            .from("ga4_organic_weekly")
            .upsert(batch, { onConflict: "brand_id,iso_week,dimensions_hash,ingested_at" });
          if (error) throw new Error(`upsert_failed: ${error.message}`);
          rowsInserted += batch.length;
        }

        brandsProcessed++;
        await emitEvent({
          client: supa,
          run_id: ingestionRunId,
          brand_id: brand.id,
          event_source: "hub-ga4-weekly",
          event_type: "agent_completed",
          payload: { rows: upsertRows.length },
        });
      } catch (err) {
        brandsFailed++;
        const msg = err instanceof Error ? err.message : String(err);
        await emitEvent({
          client: supa,
          run_id: ingestionRunId,
          brand_id: brand.id,
          event_source: "hub-ga4-weekly",
          event_type: "agent_failed",
          error_message: msg,
        });
      }
    }

    const eligibleBrands = brands.length - brandsSkipped;
    const finalStatus = eligibleBrands > 0 && brandsFailed === eligibleBrands ? "failed" : "completed";

    await supa.from("ingestion_runs")
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        rows_inserted: rowsInserted,
        payload: { brands_processed: brandsProcessed, brands_failed: brandsFailed, brands_skipped: brandsSkipped },
      })
      .eq("id", ingestionRunId);

    await emitEvent({
      client: supa,
      run_id: ingestionRunId,
      event_source: "hub-ga4-weekly",
      event_type: finalStatus === "completed" ? "run_completed" : "run_failed",
      payload: { brands_processed: brandsProcessed, brands_failed: brandsFailed, rows_inserted: rowsInserted },
    });

    return jsonResponse({
      ok: true,
      ingestion_run_id: ingestionRunId,
      iso_week: isoWeek,
      brands_processed: brandsProcessed,
      brands_skipped: brandsSkipped,
      brands_failed: brandsFailed,
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
      event_source: "hub-ga4-weekly",
      event_type: "run_failed",
      error_message: msg,
    });
    let code = "upsert_failed";
    if (msg.startsWith("ga4_auth_failed")) code = "ga4_auth_failed";
    return jsonResponse({ ok: false, error: code, detail: msg }, 500);
  }
});
