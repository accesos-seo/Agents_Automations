import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getOewClient, getHubClient } from "../_shared/supabase.ts";
import { verifyInternalSecret } from "../_shared/secret.ts";
import { emitEvent } from "../_shared/run-events.ts";
import { median, mad, mean, stdDev, mannKendallSlope } from "../_shared/statistics.ts";
import type { SignalDefinitionRow } from "../_shared/types.ts";

interface BaselineBuilderInput {
  run_id: string;
  brand_id?: string;
  signal_ids?: string[];
}

interface BrandRow {
  id: string;
}

const BASELINE_WINDOW_WEEKS_MAX = 12;
const BASELINE_WINDOW_WEEKS_MIN = 8;
const WARM_UP_THRESHOLD = 4;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isoWeekToWeekOfYear(iso_week: string): number {
  const m = iso_week.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return 1;
  return parseInt(m[2], 10);
}

interface AggregatedPoint {
  iso_week: string;
  iso_week_of_year: number;
  metric: number;
  branded: string;
  device: string;
  country: string;
  page_type: string;
}

function inferPageType(page: string | null): string {
  if (!page) return "other";
  const url = page.toLowerCase();
  if (url.includes("/blog/")) return "blog";
  if (url.includes("/producto") || url.includes("/product")) return "product";
  if (url.includes("/categoria") || url.includes("/category")) return "category";
  if (url === "/" || url.endsWith(".com/") || url.endsWith(".com")) return "home";
  return "other";
}

interface AggregatorResult {
  points: AggregatedPoint[];
}

async function loadGscPoints(
  hub: ReturnType<typeof getHubClient>,
  brand_id: string,
  fromIsoWeek: string,
  metricField: "clicks" | "impressions" | "position" | "ctr",
): Promise<AggregatorResult> {
  const { data, error } = await hub
    .from("gsc_search_analytics_weekly")
    .select("iso_week, clicks, impressions, ctr, position, page, query, device, country")
    .eq("brand_id", brand_id)
    .gte("iso_week", fromIsoWeek)
    .limit(50000);
  if (error) throw new Error(`gsc_query_failed: ${error.message}`);
  const groups = new Map<string, { metric: number; iso_week: string; iso_week_of_year: number; branded: string; device: string; country: string; page_type: string; count: number }>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const iw = String(row.iso_week ?? "");
    if (!iw) continue;
    const dev = String(row.device ?? "unknown").toLowerCase() || "unknown";
    const co = String(row.country ?? "unknown").toLowerCase() || "unknown";
    const pt = inferPageType(typeof row.page === "string" ? row.page : null);
    const branded = "unknown";
    const key = [iw, branded, dev, co, pt].join("|");
    const val = Number(row[metricField] ?? 0);
    const prev = groups.get(key);
    if (prev) {
      if (metricField === "clicks" || metricField === "impressions") {
        prev.metric += val;
      } else {
        prev.metric = (prev.metric * prev.count + val) / (prev.count + 1);
      }
      prev.count++;
    } else {
      groups.set(key, {
        metric: val,
        iso_week: iw,
        iso_week_of_year: isoWeekToWeekOfYear(iw),
        branded,
        device: dev,
        country: co,
        page_type: pt,
        count: 1,
      });
    }
  }
  const points: AggregatedPoint[] = Array.from(groups.values()).map((g) => ({
    iso_week: g.iso_week,
    iso_week_of_year: g.iso_week_of_year,
    metric: g.metric,
    branded: g.branded,
    device: g.device,
    country: g.country,
    page_type: g.page_type,
  }));
  return { points };
}

async function loadGa4Points(
  hub: ReturnType<typeof getHubClient>,
  brand_id: string,
  fromIsoWeek: string,
  metricField: "sessions" | "conversions",
): Promise<AggregatorResult> {
  const { data, error } = await hub
    .from("ga4_organic_weekly")
    .select(`iso_week, sessions, conversions, device_category, country, landing_page`)
    .eq("brand_id", brand_id)
    .gte("iso_week", fromIsoWeek)
    .limit(50000);
  if (error) throw new Error(`ga4_query_failed: ${error.message}`);
  const groups = new Map<string, { metric: number; iso_week: string; iso_week_of_year: number; branded: string; device: string; country: string; page_type: string }>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const iw = String(row.iso_week ?? "");
    if (!iw) continue;
    const dev = String(row.device_category ?? "unknown").toLowerCase() || "unknown";
    const co = String(row.country ?? "unknown").toLowerCase() || "unknown";
    const pt = inferPageType(typeof row.landing_page === "string" ? row.landing_page : null);
    const branded = "unknown";
    const key = [iw, branded, dev, co, pt].join("|");
    const val = Number(row[metricField] ?? 0);
    const prev = groups.get(key);
    if (prev) prev.metric += val;
    else {
      groups.set(key, {
        metric: val,
        iso_week: iw,
        iso_week_of_year: isoWeekToWeekOfYear(iw),
        branded,
        device: dev,
        country: co,
        page_type: pt,
      });
    }
  }
  const points: AggregatedPoint[] = Array.from(groups.values()).map((g) => ({ ...g }));
  return { points };
}

async function loadCwvPoints(
  hub: ReturnType<typeof getHubClient>,
  brand_id: string,
  fromIsoWeek: string,
): Promise<AggregatorResult> {
  const { data, error } = await hub
    .from("cwv_weekly")
    .select("iso_week, lcp_p75_ms, device, url")
    .eq("brand_id", brand_id)
    .gte("iso_week", fromIsoWeek)
    .limit(20000);
  if (error) throw new Error(`cwv_query_failed: ${error.message}`);
  const groups = new Map<string, { metric: number; iso_week: string; iso_week_of_year: number; device: string; values: number[] }>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const iw = String(row.iso_week ?? "");
    if (!iw) continue;
    const dev = String(row.device ?? "unknown").toLowerCase() || "unknown";
    const lcp = Number(row.lcp_p75_ms ?? 0);
    if (!lcp) continue;
    const key = [iw, dev].join("|");
    const prev = groups.get(key);
    if (prev) prev.values.push(lcp);
    else groups.set(key, { metric: 0, iso_week: iw, iso_week_of_year: isoWeekToWeekOfYear(iw), device: dev, values: [lcp] });
  }
  const points: AggregatedPoint[] = [];
  for (const g of groups.values()) {
    points.push({
      iso_week: g.iso_week,
      iso_week_of_year: g.iso_week_of_year,
      metric: median(g.values),
      branded: "unknown",
      device: g.device,
      country: "global",
      page_type: "any",
    });
  }
  return { points };
}

async function loadCoveragePoints(
  hub: ReturnType<typeof getHubClient>,
  brand_id: string,
  fromIsoWeek: string,
): Promise<AggregatorResult> {
  const { data, error } = await hub
    .from("gsc_coverage_weekly")
    .select("iso_week, error_type, count")
    .eq("brand_id", brand_id)
    .gte("iso_week", fromIsoWeek)
    .limit(10000);
  if (error) throw new Error(`coverage_query_failed: ${error.message}`);
  const groups = new Map<string, AggregatedPoint>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const iw = String(row.iso_week ?? "");
    if (!iw) continue;
    const et = String(row.error_type ?? "unknown");
    const key = [iw, et].join("|");
    const val = Number(row.count ?? 0);
    const prev = groups.get(key);
    if (prev) prev.metric += val;
    else {
      groups.set(key, {
        iso_week: iw,
        iso_week_of_year: isoWeekToWeekOfYear(iw),
        metric: val,
        branded: "unknown",
        device: "any",
        country: "global",
        page_type: et,
      });
    }
  }
  return { points: Array.from(groups.values()) };
}

async function loadAhrefsBacklinksPoints(
  hub: ReturnType<typeof getHubClient>,
  brand_id: string,
): Promise<AggregatorResult> {
  const { data, error } = await hub
    .from("ahrefs_backlinks_monthly")
    .select("period_month, new_refdomains, lost_refdomains")
    .eq("brand_id", brand_id)
    .order("period_month", { ascending: false })
    .limit(12);
  if (error) throw new Error(`ahrefs_backlinks_query_failed: ${error.message}`);
  const points: AggregatedPoint[] = [];
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const pm = String(row.period_month ?? "");
    if (!pm) continue;
    const newRd = Number(row.new_refdomains ?? 0);
    const lostRd = Number(row.lost_refdomains ?? 0);
    points.push({
      iso_week: pm,
      iso_week_of_year: parseInt(pm.split("-")[1] ?? "1", 10),
      metric: newRd - lostRd,
      branded: "unknown",
      device: "any",
      country: "global",
      page_type: "domain",
    });
  }
  return { points };
}

async function loadAhrefsToxicPoints(
  hub: ReturnType<typeof getHubClient>,
  brand_id: string,
): Promise<AggregatorResult> {
  const { data, error } = await hub
    .from("ahrefs_toxic_links_monthly")
    .select("period_month")
    .eq("brand_id", brand_id)
    .limit(20000);
  if (error) throw new Error(`ahrefs_toxic_query_failed: ${error.message}`);
  const groups = new Map<string, number>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const pm = String(row.period_month ?? "");
    if (!pm) continue;
    groups.set(pm, (groups.get(pm) ?? 0) + 1);
  }
  const points: AggregatedPoint[] = [];
  for (const [pm, cnt] of groups.entries()) {
    points.push({
      iso_week: pm,
      iso_week_of_year: parseInt(pm.split("-")[1] ?? "1", 10),
      metric: cnt,
      branded: "unknown",
      device: "any",
      country: "global",
      page_type: "toxic",
    });
  }
  return { points };
}

async function pointsForSignal(
  hub: ReturnType<typeof getHubClient>,
  brand_id: string,
  signal: SignalDefinitionRow,
  fromIsoWeek: string,
): Promise<AggregatorResult> {
  switch (signal.id) {
    case "S11":
      return loadGscPoints(hub, brand_id, fromIsoWeek, "clicks");
    case "S8":
    case "S9":
      return loadGscPoints(hub, brand_id, fromIsoWeek, "ctr");
    case "S13":
      return loadGscPoints(hub, brand_id, fromIsoWeek, "clicks");
    case "S12":
      return loadGa4Points(hub, brand_id, fromIsoWeek, "conversions");
    case "S5":
      return loadCwvPoints(hub, brand_id, fromIsoWeek);
    case "S2":
      return loadCoveragePoints(hub, brand_id, fromIsoWeek);
    case "S6":
      return loadAhrefsBacklinksPoints(hub, brand_id);
    case "S7":
      return loadAhrefsToxicPoints(hub, brand_id);
    case "S1":
    case "S3":
    case "S4":
    case "S10":
      return { points: [] };
    default:
      return { points: [] };
  }
}

function computeFromIsoWeek(weeksBack: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - weeksBack * 7);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = target.getUTCDay() === 0 ? 7 : target.getUTCDay();
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

serve(async (req: Request) => {
  const denied = verifyInternalSecret(req);
  if (denied) return denied;

  let input: BaselineBuilderInput;
  try {
    input = (await req.json()) as BaselineBuilderInput;
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  if (!input.run_id) {
    return jsonResponse({ ok: false, error: "missing_run_id" }, 400);
  }

  const oew = getOewClient();
  const hub = getHubClient();

  const { data: runRow, error: runErr } = await oew
    .from("analysis_runs")
    .select("id")
    .eq("id", input.run_id)
    .maybeSingle();
  if (runErr) {
    return jsonResponse({ ok: false, error: "run_lookup_failed", detail: runErr.message }, 500);
  }
  if (!runRow) {
    return jsonResponse({ ok: false, error: "run_not_found" }, 404);
  }

  let signalQuery = oew.from("signal_definitions").select("*").eq("enabled", true);
  if (input.signal_ids && input.signal_ids.length > 0) {
    signalQuery = oew.from("signal_definitions").select("*").in("id", input.signal_ids);
  }
  const { data: sigsData, error: sigsErr } = await signalQuery;
  if (sigsErr) {
    return jsonResponse({ ok: false, error: "signal_definitions_lookup_failed", detail: sigsErr.message }, 500);
  }
  const signals = (sigsData ?? []) as SignalDefinitionRow[];

  let brandQuery = hub.from("brands_registry").select("id").eq("status", "active");
  if (input.brand_id) brandQuery = brandQuery.eq("id", input.brand_id);
  const { data: brandsData, error: brandsErr } = await brandQuery;
  if (brandsErr) {
    return jsonResponse({ ok: false, error: "brands_query_failed", detail: brandsErr.message }, 500);
  }
  const brands = (brandsData ?? []) as BrandRow[];

  const fromIsoWeekMax = computeFromIsoWeek(BASELINE_WINDOW_WEEKS_MAX);

  let baselines_updated = 0;
  let baselines_warm_up = 0;

  try {
    for (const brand of brands) {
      for (const signal of signals) {
        let aggResult: AggregatorResult;
        try {
          aggResult = await pointsForSignal(hub, brand.id, signal, fromIsoWeekMax);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await emitEvent({
            client: oew,
            run_id: input.run_id,
            brand_id: brand.id,
            event_source: "baseline-builder",
            event_type: "agent_failed",
            error_message: `signal=${signal.id} ${msg}`,
          });
          continue;
        }

        const bySegment = new Map<string, AggregatedPoint[]>();
        for (const p of aggResult.points) {
          const segKey = [p.branded, p.device, p.country, p.page_type].join("|");
          const list = bySegment.get(segKey);
          if (list) list.push(p);
          else bySegment.set(segKey, [p]);
        }

        const recentIsoWeeks = new Set<string>();
        for (const p of aggResult.points) recentIsoWeeks.add(p.iso_week);
        const sortedWeeks = Array.from(recentIsoWeeks).sort();
        const usedWeeks = sortedWeeks.slice(-BASELINE_WINDOW_WEEKS_MAX);
        const minWeek = usedWeeks[0] ?? fromIsoWeekMax;

        for (const [segKey, segPointsRaw] of bySegment.entries()) {
          const segPoints = segPointsRaw
            .filter((p) => p.iso_week >= minWeek)
            .sort((a, b) => a.iso_week.localeCompare(b.iso_week));
          if (segPoints.length === 0) continue;

          const values = segPoints.map((p) => p.metric);
          const trendValues = values.slice(-BASELINE_WINDOW_WEEKS_MIN);

          const m = median(values);
          const madVal = mad(values);
          const meanVal = mean(values);
          const stdVal = stdDev(values);
          const slope = mannKendallSlope(trendValues);
          const n = values.length;
          const isWarm = n < WARM_UP_THRESHOLD;
          const lastWeek = segPoints[segPoints.length - 1];
          const isoWeekOfYear = lastWeek.iso_week_of_year;

          const segment_hash = await sha256Hex(segKey);

          const upsertBody = {
            brand_id: brand.id,
            signal_id: signal.id,
            segment_hash,
            iso_week_of_year: isoWeekOfYear,
            median: m,
            mad: madVal,
            mean: meanVal,
            std: stdVal,
            trend_slope: slope,
            n_samples: n,
            is_warm_up: isWarm,
            last_recomputed: new Date().toISOString(),
            payload: {
              segment: segKey,
              window_weeks: n,
              latest_iso_week: lastWeek.iso_week,
            },
          };

          const { error: upErr } = await oew
            .from("baselines")
            .upsert(upsertBody, { onConflict: "brand_id,signal_id,segment_hash,iso_week_of_year" });
          if (upErr) {
            await emitEvent({
              client: oew,
              run_id: input.run_id,
              brand_id: brand.id,
              event_source: "baseline-builder",
              event_type: "agent_failed",
              error_message: `baseline_upsert_failed signal=${signal.id} segment=${segKey} ${upErr.message}`,
            });
            continue;
          }
          baselines_updated++;
          if (isWarm) baselines_warm_up++;
        }
      }

      await emitEvent({
        client: oew,
        run_id: input.run_id,
        brand_id: brand.id,
        event_source: "baseline-builder",
        event_type: "baseline_recomputed",
        payload: { signals_count: signals.length },
      });
    }

    return jsonResponse({
      ok: true,
      run_id: input.run_id,
      baselines_updated,
      baselines_warm_up,
      signals_processed: signals.length,
      brands_processed: brands.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await emitEvent({
      client: oew,
      run_id: input.run_id,
      event_source: "baseline-builder",
      event_type: "agent_failed",
      error_message: msg,
    });
    return jsonResponse({ ok: false, run_id: input.run_id, error: "baseline_builder_failed", detail: msg }, 500);
  }
});
