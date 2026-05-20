import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getOewClient, getHubClient } from "../_shared/supabase.ts";
import { verifyInternalSecret } from "../_shared/secret.ts";
import { emitEvent } from "../_shared/run-events.ts";
import { robustZScore } from "../_shared/statistics.ts";
import type {
  SignalDefinitionRow,
  BaselineRow,
  Severity,
  SignalEventDraft,
  BrandRoutingRow,
} from "../_shared/types.ts";

interface SignalEvaluatorInput {
  run_id: string;
  brand_id?: string;
  signal_ids?: string[];
}

interface BrandRow {
  id: string;
  name: string;
  country_iso: string | null;
}

interface EvaluatorContext {
  oew: ReturnType<typeof getOewClient>;
  hub: ReturnType<typeof getHubClient>;
  brand: BrandRow;
  signal_def: SignalDefinitionRow;
  baselines_map: Map<string, BaselineRow>;
  iso_week: string;
  iso_week_of_year: number;
  prev_iso_week: string;
  run_id: string;
  brand_routing: BrandRoutingRow | null;
}

type EvaluatorFn = (ctx: EvaluatorContext) => Promise<SignalEventDraft[]>;

const DEFAULT_K = 3.5;
const HARD_DROP_PCT = 0.30;
const SOFT_DROP_PCT_MIN = 0.20;
const CTR_CURVE: Record<number, number> = {
  1: 0.30, 2: 0.15, 3: 0.10, 4: 0.05, 5: 0.05,
  6: 0.05, 7: 0.05, 8: 0.05, 9: 0.05, 10: 0.05,
};

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

function currentIsoWeek(): string {
  const d = new Date();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = target.getUTCDay() === 0 ? 7 : target.getUTCDay();
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function previousIsoWeek(iso_week: string): string {
  const m = iso_week.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return iso_week;
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  if (week > 1) return `${year}-W${String(week - 1).padStart(2, "0")}`;
  return `${year - 1}-W52`;
}

function isoWeekOfYearFromIsoWeek(iso_week: string): number {
  const m = iso_week.match(/^(\d{4})-W(\d{2})$/);
  return m ? parseInt(m[2], 10) : 1;
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

function severityFromDrop(dropPct: number): Severity {
  if (dropPct >= HARD_DROP_PCT) return "RED";
  if (dropPct >= SOFT_DROP_PCT_MIN) return "YELLOW";
  return "WATCH";
}

function confidenceFromSigma(sigma: number, isWarmUp: boolean): number {
  const abs = Math.abs(sigma);
  let c = Math.min(0.95, Math.max(0.1, abs / 5));
  if (isWarmUp) c = Math.min(c, 0.5);
  return Number(c.toFixed(2));
}

function effectiveK(brand_routing: BrandRoutingRow | null, holidayMultiplier: number): number {
  const base = brand_routing?.k_factor_override ?? DEFAULT_K;
  return base * holidayMultiplier;
}

function holidayMultiplier(brand_routing: BrandRoutingRow | null): number {
  const pct = brand_routing?.expected_holiday_drop_pct ?? 0;
  if (!pct || pct <= 0) return 1;
  return 1 + pct / 100;
}

async function getSegmentHash(
  branded: string,
  device: string,
  country: string,
  page_type: string,
): Promise<string> {
  return sha256Hex([branded, device, country, page_type].join("|"));
}

// ---------------------------------------------------------------------------
// S1 — URL fuera de índice
// ---------------------------------------------------------------------------
const evalS1: EvaluatorFn = async (ctx) => {
  const out: SignalEventDraft[] = [];
  const { data: curr, error: e1 } = await ctx.hub
    .from("gsc_url_inspection_weekly")
    .select("url, index_status, coverage_state")
    .eq("brand_id", ctx.brand.id)
    .eq("iso_week", ctx.iso_week)
    .limit(5000);
  if (e1) throw new Error(`s1_query_failed: ${e1.message}`);
  const { data: prev, error: e2 } = await ctx.hub
    .from("gsc_url_inspection_weekly")
    .select("url, index_status")
    .eq("brand_id", ctx.brand.id)
    .eq("iso_week", ctx.prev_iso_week)
    .limit(5000);
  if (e2) throw new Error(`s1_prev_query_failed: ${e2.message}`);
  const prevMap = new Map<string, string>();
  for (const r of (prev ?? []) as Record<string, unknown>[]) {
    prevMap.set(String(r.url), String(r.index_status ?? ""));
  }
  const droppedUrls: string[] = [];
  for (const r of (curr ?? []) as Record<string, unknown>[]) {
    const url = String(r.url);
    const status = String(r.index_status ?? "");
    const previous = prevMap.get(url);
    if (
      previous &&
      previous.toLowerCase().includes("indexed") &&
      !status.toLowerCase().includes("indexed") &&
      status.length > 0
    ) {
      droppedUrls.push(url);
    }
  }
  if (droppedUrls.length === 0) return out;
  const segment_hash = await getSegmentHash("unknown", "any", "global", "any");
  out.push({
    brand_id: ctx.brand.id,
    signal_id: "S1",
    segment_hash,
    period_start: null,
    period_end: null,
    metric_actual: droppedUrls.length,
    metric_expected: 0,
    deviation_sigma: null,
    severity_hint: droppedUrls.length >= 5 ? "YELLOW" : "WATCH",
    confidence: Math.min(0.9, 0.5 + droppedUrls.length * 0.05),
    payload: { affected_urls: droppedUrls.slice(0, 50), urls_count: droppedUrls.length, iso_week: ctx.iso_week },
  });
  return out;
};

// ---------------------------------------------------------------------------
// S2 — Errores cobertura
// ---------------------------------------------------------------------------
const evalS2: EvaluatorFn = async (ctx) => {
  const out: SignalEventDraft[] = [];
  const { data, error } = await ctx.hub
    .from("gsc_coverage_weekly")
    .select("error_type, count, sample_urls")
    .eq("brand_id", ctx.brand.id)
    .eq("iso_week", ctx.iso_week);
  if (error) throw new Error(`s2_query_failed: ${error.message}`);
  const k = effectiveK(ctx.brand_routing, holidayMultiplier(ctx.brand_routing));
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const error_type = String(r.error_type ?? "");
    const count = Number(r.count ?? 0);
    const samples = Array.isArray(r.sample_urls) ? (r.sample_urls as string[]) : [];
    const segment_hash = await getSegmentHash("unknown", "any", "global", error_type);
    const baseline = ctx.baselines_map.get(`S2|${segment_hash}`);
    const med = baseline?.median ?? 0;
    const madVal = baseline?.mad ?? 0;
    const sigma = robustZScore(count, med, madVal);
    if (Math.abs(sigma) < k) continue;
    if (count <= med) continue;
    out.push({
      brand_id: ctx.brand.id,
      signal_id: "S2",
      segment_hash,
      period_start: null,
      period_end: null,
      metric_actual: count,
      metric_expected: med,
      deviation_sigma: sigma,
      severity_hint: count > med * 2 ? "YELLOW" : "WATCH",
      confidence: confidenceFromSigma(sigma, baseline?.is_warm_up ?? true),
      payload: { error_type, sample_urls: samples.slice(0, 10), iso_week: ctx.iso_week },
    });
  }
  return out;
};

// ---------------------------------------------------------------------------
// S3 — Cambios técnicos
// TODO: requires crawl diff vs previous snapshot — implementar Fase C
// ---------------------------------------------------------------------------
const evalS3: EvaluatorFn = async (_ctx) => {
  return [];
};

// ---------------------------------------------------------------------------
// S4 — Links rotos / orphans
// TODO: requires crawl snapshot analysis — implementar Fase C
// ---------------------------------------------------------------------------
const evalS4: EvaluatorFn = async (_ctx) => {
  return [];
};

// ---------------------------------------------------------------------------
// S5 — CWV regresión
// ---------------------------------------------------------------------------
const evalS5: EvaluatorFn = async (ctx) => {
  const out: SignalEventDraft[] = [];
  const { data, error } = await ctx.hub
    .from("cwv_weekly")
    .select("url, device, lcp_p75_ms, inp_p75_ms, cls_p75")
    .eq("brand_id", ctx.brand.id)
    .eq("iso_week", ctx.iso_week)
    .limit(5000);
  if (error) throw new Error(`s5_query_failed: ${error.message}`);

  const LCP_BAD = 2500;
  const INP_BAD = 200;

  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const url = String(r.url ?? "");
    const device = String(r.device ?? "unknown").toLowerCase();
    const lcp = Number(r.lcp_p75_ms ?? 0);
    const inp = Number(r.inp_p75_ms ?? 0);
    const segment_hash = await getSegmentHash("unknown", device, "global", "any");
    const baseline = ctx.baselines_map.get(`S5|${segment_hash}`);
    const med = baseline?.median ?? 0;
    if (!lcp || !med) continue;
    const change = (lcp - med) / med;
    const crossedThreshold = med < LCP_BAD && lcp >= LCP_BAD;
    if (change < 0.2 && !crossedThreshold) continue;
    const severity: Severity = (change >= 0.5 || crossedThreshold) ? "YELLOW" : "WATCH";
    out.push({
      brand_id: ctx.brand.id,
      signal_id: "S5",
      segment_hash,
      period_start: null,
      period_end: null,
      metric_actual: lcp,
      metric_expected: med,
      deviation_sigma: null,
      severity_hint: severity,
      confidence: confidenceFromSigma((lcp - med) / Math.max(med * 0.1, 1), baseline?.is_warm_up ?? true),
      payload: {
        affected_urls: [url],
        device,
        lcp_p75_ms: lcp,
        inp_p75_ms: inp,
        change_pct: Number((change * 100).toFixed(1)),
        crossed_threshold: crossedThreshold,
        iso_week: ctx.iso_week,
      },
    });
  }
  return out;
};

// ---------------------------------------------------------------------------
// S6 — Caída ref domains (monthly)
// ---------------------------------------------------------------------------
const evalS6: EvaluatorFn = async (ctx) => {
  const out: SignalEventDraft[] = [];
  const { data, error } = await ctx.hub
    .from("ahrefs_backlinks_monthly")
    .select("period_month, new_refdomains, lost_refdomains")
    .eq("brand_id", ctx.brand.id)
    .order("period_month", { ascending: false })
    .limit(1);
  if (error) throw new Error(`s6_query_failed: ${error.message}`);
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return out;
  const r = rows[0];
  const newRd = Number(r.new_refdomains ?? 0);
  const lostRd = Number(r.lost_refdomains ?? 0);
  const actual = newRd - lostRd;
  const segment_hash = await getSegmentHash("unknown", "any", "global", "domain");
  const baseline = ctx.baselines_map.get(`S6|${segment_hash}`);
  const med = baseline?.median ?? 0;
  const madVal = baseline?.mad ?? 0;
  const threshold = med - 2 * madVal;
  if (actual >= threshold) return out;
  const sigma = robustZScore(actual, med, madVal);
  out.push({
    brand_id: ctx.brand.id,
    signal_id: "S6",
    segment_hash,
    period_start: null,
    period_end: null,
    metric_actual: actual,
    metric_expected: med,
    deviation_sigma: sigma,
    severity_hint: actual < med - 3 * madVal ? "YELLOW" : "WATCH",
    confidence: confidenceFromSigma(sigma, baseline?.is_warm_up ?? true),
    payload: {
      period_month: String(r.period_month ?? ""),
      new_refdomains: newRd,
      lost_refdomains: lostRd,
      net_change: actual,
    },
  });
  return out;
};

// ---------------------------------------------------------------------------
// S7 — Pico de enlaces tóxicos (monthly)
// ---------------------------------------------------------------------------
const evalS7: EvaluatorFn = async (ctx) => {
  const out: SignalEventDraft[] = [];
  const { data, error } = await ctx.hub
    .from("ahrefs_toxic_links_monthly")
    .select("period_month, link_url, toxic_score, source_domain")
    .eq("brand_id", ctx.brand.id)
    .order("period_month", { ascending: false })
    .limit(20000);
  if (error) throw new Error(`s7_query_failed: ${error.message}`);
  const byMonth = new Map<string, { count: number; samples: string[] }>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const pm = String(r.period_month ?? "");
    if (!pm) continue;
    const url = String(r.link_url ?? "");
    const entry = byMonth.get(pm) ?? { count: 0, samples: [] };
    entry.count++;
    if (entry.samples.length < 10 && url) entry.samples.push(url);
    byMonth.set(pm, entry);
  }
  const sorted = Array.from(byMonth.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  if (sorted.length === 0) return out;
  const [latestMonth, latestStats] = sorted[0];
  const actual = latestStats.count;
  const segment_hash = await getSegmentHash("unknown", "any", "global", "toxic");
  const baseline = ctx.baselines_map.get(`S7|${segment_hash}`);
  const med = baseline?.median ?? 0;
  if (med <= 0) return out;
  if (actual < med * 2) return out;
  const sigma = robustZScore(actual, med, baseline?.mad ?? 0);
  out.push({
    brand_id: ctx.brand.id,
    signal_id: "S7",
    segment_hash,
    period_start: null,
    period_end: null,
    metric_actual: actual,
    metric_expected: med,
    deviation_sigma: sigma,
    severity_hint: actual >= med * 3 ? "YELLOW" : "WATCH",
    confidence: confidenceFromSigma(sigma, baseline?.is_warm_up ?? true),
    payload: {
      period_month: latestMonth,
      toxic_count: actual,
      sample_links: latestStats.samples,
    },
  });
  return out;
};

// ---------------------------------------------------------------------------
// S8 — CTR vs posición
// Lee gsc_search_analytics_weekly. Para rows con position <= 10, compara CTR
// actual vs CTR esperado de la curva. Si actual < 50% del esperado y
// impressions > 100 → signal_event.
// ---------------------------------------------------------------------------
const evalS8: EvaluatorFn = async (ctx) => {
  const out: SignalEventDraft[] = [];
  const { data, error } = await ctx.hub
    .from("gsc_search_analytics_weekly")
    .select("page, query, device, country, clicks, impressions, ctr, position")
    .eq("brand_id", ctx.brand.id)
    .eq("iso_week", ctx.iso_week)
    .limit(20000);
  if (error) throw new Error(`s8_query_failed: ${error.message}`);
  const cfg = ctx.signal_def.config as Record<string, unknown>;
  const minImpr = Number(cfg.min_impressions ?? 100);
  const floorPct = Number(cfg.ctr_floor_pct_of_expected ?? 0.5);

  const grouped = new Map<string, { clicks: number; impressions: number; position_sum: number; n: number; page: string; device: string; country: string; queries: Set<string> }>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const page = String(r.page ?? "");
    const device = String(r.device ?? "unknown").toLowerCase();
    const country = String(r.country ?? "unknown").toLowerCase();
    const query = String(r.query ?? "");
    const impressions = Number(r.impressions ?? 0);
    const clicks = Number(r.clicks ?? 0);
    const position = Number(r.position ?? 0);
    if (!page || impressions <= 0) continue;
    const key = [page, device, country].join("|");
    const ex = grouped.get(key);
    if (ex) {
      ex.clicks += clicks;
      ex.impressions += impressions;
      ex.position_sum += position * impressions;
      ex.n += impressions;
      ex.queries.add(query);
    } else {
      grouped.set(key, {
        clicks,
        impressions,
        position_sum: position * impressions,
        n: impressions,
        page,
        device,
        country,
        queries: new Set<string>([query]),
      });
    }
  }

  for (const g of grouped.values()) {
    if (g.impressions < minImpr) continue;
    const avgPos = g.position_sum / Math.max(g.n, 1);
    if (avgPos > 10.5) continue;
    const bucket = Math.min(10, Math.max(1, Math.round(avgPos)));
    const expectedCtr = CTR_CURVE[bucket] ?? 0.05;
    const actualCtr = g.clicks / Math.max(g.impressions, 1);
    if (actualCtr >= expectedCtr * floorPct) continue;
    const page_type = inferPageType(g.page);
    const segment_hash = await getSegmentHash("unknown", g.device, g.country, page_type);
    out.push({
      brand_id: ctx.brand.id,
      signal_id: "S8",
      segment_hash,
      period_start: null,
      period_end: null,
      metric_actual: actualCtr,
      metric_expected: expectedCtr,
      deviation_sigma: null,
      severity_hint: "WATCH",
      confidence: Math.min(0.9, 0.4 + (expectedCtr - actualCtr) * 2),
      payload: {
        affected_urls: [g.page],
        position_avg: Number(avgPos.toFixed(2)),
        position_bucket: bucket,
        ctr_actual: Number(actualCtr.toFixed(4)),
        ctr_expected: expectedCtr,
        impressions: g.impressions,
        clicks: g.clicks,
        affected_keywords: Array.from(g.queries).slice(0, 10),
        device: g.device,
        country: g.country,
        iso_week: ctx.iso_week,
      },
    });
  }
  return out;
};

// ---------------------------------------------------------------------------
// S9 — Feature SERP perdido
// Queries con impressions estables (±20%) AND position ~1 (<=1.5) AND CTR colapsa (>40%) vs baseline.
// ---------------------------------------------------------------------------
const evalS9: EvaluatorFn = async (ctx) => {
  const out: SignalEventDraft[] = [];
  const { data: curr, error: e1 } = await ctx.hub
    .from("gsc_search_analytics_weekly")
    .select("page, query, device, country, clicks, impressions, ctr, position")
    .eq("brand_id", ctx.brand.id)
    .eq("iso_week", ctx.iso_week)
    .limit(20000);
  if (e1) throw new Error(`s9_curr_failed: ${e1.message}`);
  const { data: prev, error: e2 } = await ctx.hub
    .from("gsc_search_analytics_weekly")
    .select("query, page, device, country, clicks, impressions, position")
    .eq("brand_id", ctx.brand.id)
    .eq("iso_week", ctx.prev_iso_week)
    .limit(20000);
  if (e2) throw new Error(`s9_prev_failed: ${e2.message}`);

  type Agg = { clicks: number; impressions: number; position_w: number; n_pos: number };
  function build(rows: Record<string, unknown>[]): Map<string, Agg> {
    const m = new Map<string, Agg>();
    for (const r of rows) {
      const query = String(r.query ?? "");
      const page = String(r.page ?? "");
      const device = String(r.device ?? "unknown").toLowerCase();
      const country = String(r.country ?? "unknown").toLowerCase();
      if (!query) continue;
      const key = [query, page, device, country].join("|");
      const impr = Number(r.impressions ?? 0);
      const clicks = Number(r.clicks ?? 0);
      const position = Number(r.position ?? 0);
      const ex = m.get(key);
      if (ex) {
        ex.clicks += clicks;
        ex.impressions += impr;
        ex.position_w += position * impr;
        ex.n_pos += impr;
      } else {
        m.set(key, { clicks, impressions: impr, position_w: position * impr, n_pos: impr });
      }
    }
    return m;
  }
  const currMap = build((curr ?? []) as Record<string, unknown>[]);
  const prevMap = build((prev ?? []) as Record<string, unknown>[]);

  const cfg = ctx.signal_def.config as Record<string, unknown>;
  const minImpr = Number(cfg.min_impressions ?? 200);

  for (const [key, cAgg] of currMap.entries()) {
    if (cAgg.impressions < minImpr) continue;
    const pAgg = prevMap.get(key);
    if (!pAgg || pAgg.impressions < minImpr * 0.5) continue;
    const imprDelta = Math.abs(cAgg.impressions - pAgg.impressions) / Math.max(pAgg.impressions, 1);
    if (imprDelta > 0.20) continue;
    const cAvgPos = cAgg.position_w / Math.max(cAgg.n_pos, 1);
    if (cAvgPos > 1.5) continue;
    const cCtr = cAgg.clicks / Math.max(cAgg.impressions, 1);
    const pCtr = pAgg.clicks / Math.max(pAgg.impressions, 1);
    if (pCtr <= 0) continue;
    const drop = (pCtr - cCtr) / pCtr;
    if (drop < 0.4) continue;
    const parts = key.split("|");
    const query = parts[0] ?? "";
    const page = parts[1] ?? "";
    const device = parts[2] ?? "unknown";
    const country = parts[3] ?? "unknown";
    const page_type = inferPageType(page);
    const segment_hash = await getSegmentHash("unknown", device, country, page_type);
    out.push({
      brand_id: ctx.brand.id,
      signal_id: "S9",
      segment_hash,
      period_start: null,
      period_end: null,
      metric_actual: cCtr,
      metric_expected: pCtr,
      deviation_sigma: null,
      severity_hint: drop >= 0.6 ? "YELLOW" : "WATCH",
      confidence: Math.min(0.95, 0.5 + drop),
      payload: {
        affected_urls: page ? [page] : [],
        affected_keywords: [query],
        position_avg: Number(cAvgPos.toFixed(2)),
        ctr_drop_pct: Number((drop * 100).toFixed(1)),
        impressions: cAgg.impressions,
        prev_impressions: pAgg.impressions,
        iso_week: ctx.iso_week,
      },
    });
  }
  return out;
};

// ---------------------------------------------------------------------------
// S10 — Competidor nuevo en top
// TODO: requires SERP overview comparison logic — implementar Fase D
// ---------------------------------------------------------------------------
const evalS10: EvaluatorFn = async (_ctx) => {
  return [];
};

// ---------------------------------------------------------------------------
// S11 — Clicks out-of-band (lagging)
// ---------------------------------------------------------------------------
const evalS11: EvaluatorFn = async (ctx) => {
  const out: SignalEventDraft[] = [];
  const { data, error } = await ctx.hub
    .from("gsc_search_analytics_weekly")
    .select("page, device, country, clicks, impressions")
    .eq("brand_id", ctx.brand.id)
    .eq("iso_week", ctx.iso_week)
    .limit(20000);
  if (error) throw new Error(`s11_query_failed: ${error.message}`);
  const k = effectiveK(ctx.brand_routing, holidayMultiplier(ctx.brand_routing));

  const grouped = new Map<string, { clicks: number; impressions: number; page: string; device: string; country: string }>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const page = String(r.page ?? "");
    const device = String(r.device ?? "unknown").toLowerCase();
    const country = String(r.country ?? "unknown").toLowerCase();
    const clicks = Number(r.clicks ?? 0);
    const impressions = Number(r.impressions ?? 0);
    const key = [device, country, inferPageType(page)].join("|");
    const ex = grouped.get(key);
    if (ex) {
      ex.clicks += clicks;
      ex.impressions += impressions;
    } else {
      grouped.set(key, { clicks, impressions, page, device, country });
    }
  }

  for (const [key, g] of grouped.entries()) {
    const parts = key.split("|");
    const device = parts[0];
    const country = parts[1];
    const page_type = parts[2];
    const segment_hash = await getSegmentHash("unknown", device, country, page_type);
    const baseline = ctx.baselines_map.get(`S11|${segment_hash}`);
    if (!baseline) continue;
    const med = baseline.median ?? 0;
    const madVal = baseline.mad ?? 0;
    const sigma = robustZScore(g.clicks, med, madVal);
    if (Math.abs(sigma) < k) continue;
    if (g.clicks >= med) continue;
    const dropPct = med > 0 ? (med - g.clicks) / med : 0;
    if (dropPct < SOFT_DROP_PCT_MIN) continue;
    out.push({
      brand_id: ctx.brand.id,
      signal_id: "S11",
      segment_hash,
      period_start: null,
      period_end: null,
      metric_actual: g.clicks,
      metric_expected: med,
      deviation_sigma: sigma,
      severity_hint: severityFromDrop(dropPct),
      confidence: confidenceFromSigma(sigma, baseline.is_warm_up),
      payload: {
        device,
        country,
        page_type,
        clicks_actual: g.clicks,
        clicks_baseline_median: med,
        clicks_drop_pct: Number((dropPct * 100).toFixed(1)),
        impressions: g.impressions,
        iso_week: ctx.iso_week,
      },
    });
  }
  return out;
};

// ---------------------------------------------------------------------------
// S12 — Conversiones GA4 (lagging)
// ---------------------------------------------------------------------------
const evalS12: EvaluatorFn = async (ctx) => {
  const out: SignalEventDraft[] = [];
  const { data, error } = await ctx.hub
    .from("ga4_organic_weekly")
    .select("device_category, country, landing_page, conversions, sessions")
    .eq("brand_id", ctx.brand.id)
    .eq("iso_week", ctx.iso_week)
    .limit(20000);
  if (error) throw new Error(`s12_query_failed: ${error.message}`);
  const k = effectiveK(ctx.brand_routing, holidayMultiplier(ctx.brand_routing));

  const grouped = new Map<string, { conversions: number; sessions: number; device: string; country: string }>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const device = String(r.device_category ?? "unknown").toLowerCase();
    const country = String(r.country ?? "unknown").toLowerCase();
    const landing = String(r.landing_page ?? "");
    const conv = Number(r.conversions ?? 0);
    const sess = Number(r.sessions ?? 0);
    const key = [device, country, inferPageType(landing)].join("|");
    const ex = grouped.get(key);
    if (ex) {
      ex.conversions += conv;
      ex.sessions += sess;
    } else {
      grouped.set(key, { conversions: conv, sessions: sess, device, country });
    }
  }

  for (const [key, g] of grouped.entries()) {
    const parts = key.split("|");
    const device = parts[0];
    const country = parts[1];
    const page_type = parts[2];
    const segment_hash = await getSegmentHash("unknown", device, country, page_type);
    const baseline = ctx.baselines_map.get(`S12|${segment_hash}`);
    if (!baseline) continue;
    const med = baseline.median ?? 0;
    const madVal = baseline.mad ?? 0;
    if (med <= 0) continue;
    const sigma = robustZScore(g.conversions, med, madVal);
    if (Math.abs(sigma) < k) continue;
    if (g.conversions >= med) continue;
    const dropPct = (med - g.conversions) / med;
    if (dropPct < SOFT_DROP_PCT_MIN) continue;
    out.push({
      brand_id: ctx.brand.id,
      signal_id: "S12",
      segment_hash,
      period_start: null,
      period_end: null,
      metric_actual: g.conversions,
      metric_expected: med,
      deviation_sigma: sigma,
      severity_hint: severityFromDrop(dropPct),
      confidence: confidenceFromSigma(sigma, baseline.is_warm_up),
      payload: {
        device,
        country,
        page_type,
        conversions_actual: g.conversions,
        conversions_baseline_median: med,
        conversions_drop_pct: Number((dropPct * 100).toFixed(1)),
        sessions: g.sessions,
        iso_week: ctx.iso_week,
      },
    });
  }
  return out;
};

// ---------------------------------------------------------------------------
// S13 — Divergencia GSC↔GA4 (lagging, tracking roto)
// ---------------------------------------------------------------------------
const evalS13: EvaluatorFn = async (ctx) => {
  const out: SignalEventDraft[] = [];
  const { data: gsc, error: e1 } = await ctx.hub
    .from("gsc_search_analytics_weekly")
    .select("device, country, clicks")
    .eq("brand_id", ctx.brand.id)
    .eq("iso_week", ctx.iso_week)
    .limit(50000);
  if (e1) throw new Error(`s13_gsc_failed: ${e1.message}`);
  const { data: ga4, error: e2 } = await ctx.hub
    .from("ga4_organic_weekly")
    .select("device_category, country, sessions")
    .eq("brand_id", ctx.brand.id)
    .eq("iso_week", ctx.iso_week)
    .limit(50000);
  if (e2) throw new Error(`s13_ga4_failed: ${e2.message}`);

  const gscBy = new Map<string, number>();
  for (const r of (gsc ?? []) as Record<string, unknown>[]) {
    const device = String(r.device ?? "unknown").toLowerCase();
    const country = String(r.country ?? "unknown").toLowerCase();
    const key = [device, country].join("|");
    gscBy.set(key, (gscBy.get(key) ?? 0) + Number(r.clicks ?? 0));
  }
  const ga4By = new Map<string, number>();
  for (const r of (ga4 ?? []) as Record<string, unknown>[]) {
    const device = String(r.device_category ?? "unknown").toLowerCase();
    const country = String(r.country ?? "unknown").toLowerCase();
    const key = [device, country].join("|");
    ga4By.set(key, (ga4By.get(key) ?? 0) + Number(r.sessions ?? 0));
  }

  const keys = new Set<string>([...gscBy.keys(), ...ga4By.keys()]);
  for (const key of keys) {
    const clicks = gscBy.get(key) ?? 0;
    const sessions = ga4By.get(key) ?? 0;
    if (clicks < 50 && sessions < 50) continue;
    const ratio = sessions > 0 ? clicks / sessions : 0;
    const parts = key.split("|");
    const device = parts[0];
    const country = parts[1];
    const segment_hash = await getSegmentHash("unknown", device, country, "any");
    const baseline = ctx.baselines_map.get(`S13|${segment_hash}`);
    const medRatio = baseline?.payload && typeof (baseline.payload as Record<string, unknown>).ratio_median === "number"
      ? Number((baseline.payload as Record<string, unknown>).ratio_median)
      : 1.0;
    if (medRatio <= 0) continue;
    const ratioDelta = Math.abs(ratio - medRatio) / medRatio;
    if (ratioDelta < 0.5) continue;
    out.push({
      brand_id: ctx.brand.id,
      signal_id: "S13",
      segment_hash,
      period_start: null,
      period_end: null,
      metric_actual: ratio,
      metric_expected: medRatio,
      deviation_sigma: null,
      severity_hint: ratioDelta >= 0.75 ? "YELLOW" : "WATCH",
      confidence: Math.min(0.9, 0.4 + ratioDelta * 0.5),
      payload: {
        device,
        country,
        gsc_clicks: clicks,
        ga4_sessions: sessions,
        ratio_actual: Number(ratio.toFixed(3)),
        ratio_baseline: Number(medRatio.toFixed(3)),
        ratio_delta_pct: Number((ratioDelta * 100).toFixed(1)),
        iso_week: ctx.iso_week,
      },
    });
  }
  return out;
};

const EVALUATORS: Record<string, EvaluatorFn> = {
  S1: evalS1, S2: evalS2, S3: evalS3, S4: evalS4,
  S5: evalS5, S6: evalS6, S7: evalS7,
  S8: evalS8, S9: evalS9, S10: evalS10,
  S11: evalS11, S12: evalS12, S13: evalS13,
};

serve(async (req: Request) => {
  const denied = verifyInternalSecret(req);
  if (denied) return denied;

  let input: SignalEvaluatorInput;
  try {
    input = (await req.json()) as SignalEvaluatorInput;
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
    .select("id, iso_week")
    .eq("id", input.run_id)
    .maybeSingle();
  if (runErr) {
    return jsonResponse({ ok: false, error: "run_lookup_failed", detail: runErr.message }, 500);
  }
  if (!runRow) {
    return jsonResponse({ ok: false, error: "run_not_found" }, 404);
  }
  const iso_week: string = (runRow.iso_week as string) ?? currentIsoWeek();
  const prev_iso_week = previousIsoWeek(iso_week);
  const iso_week_of_year = isoWeekOfYearFromIsoWeek(iso_week);

  let signalQuery = oew.from("signal_definitions").select("*").eq("enabled", true);
  if (input.signal_ids && input.signal_ids.length > 0) {
    signalQuery = oew.from("signal_definitions").select("*").in("id", input.signal_ids);
  }
  const { data: sigsData, error: sigsErr } = await signalQuery;
  if (sigsErr) {
    return jsonResponse({ ok: false, error: "signal_definitions_lookup_failed", detail: sigsErr.message }, 500);
  }
  const signals = (sigsData ?? []) as SignalDefinitionRow[];

  if (input.signal_ids && input.signal_ids.length > 0) {
    for (const sid of input.signal_ids) {
      const found = signals.find((s) => s.id === sid);
      if (!found) {
        return jsonResponse({ ok: false, error: "signal_definition_disabled", detail: `signal=${sid}` }, 404);
      }
    }
  }

  let brandQuery = hub.from("brands_registry").select("id, name, country_iso").eq("status", "active");
  if (input.brand_id) brandQuery = brandQuery.eq("id", input.brand_id);
  const { data: brandsData, error: brandsErr } = await brandQuery;
  if (brandsErr) {
    return jsonResponse({ ok: false, error: "brands_query_failed", detail: brandsErr.message }, 500);
  }
  const brands = (brandsData ?? []) as BrandRow[];

  const brandIds = brands.map((b) => b.id);
  const { data: routings, error: routErr } = await oew
    .from("brand_routing")
    .select("*")
    .in("brand_id", brandIds.length > 0 ? brandIds : ["00000000-0000-0000-0000-000000000000"]);
  if (routErr) {
    return jsonResponse({ ok: false, error: "brand_routing_lookup_failed", detail: routErr.message }, 500);
  }
  const routingMap = new Map<string, BrandRoutingRow>();
  for (const r of (routings ?? []) as BrandRoutingRow[]) {
    routingMap.set(r.brand_id, r);
  }

  let signals_evaluated = 0;
  let events_created = 0;
  let events_filtered_holiday = 0;
  let events_filtered_warm_up = 0;
  let brands_processed = 0;

  try {
    for (const brand of brands) {
      brands_processed++;

      const { data: blRows, error: blErr } = await oew
        .from("baselines")
        .select("*")
        .eq("brand_id", brand.id);
      if (blErr) {
        await emitEvent({
          client: oew,
          run_id: input.run_id,
          brand_id: brand.id,
          event_source: "signal-evaluator",
          event_type: "agent_failed",
          error_message: `baseline_lookup_failed: ${blErr.message}`,
        });
        continue;
      }
      const baselines_map = new Map<string, BaselineRow>();
      for (const b of (blRows ?? []) as BaselineRow[]) {
        baselines_map.set(`${b.signal_id}|${b.segment_hash}`, b);
      }

      const brand_routing = routingMap.get(brand.id) ?? null;

      for (const signal of signals) {
        signals_evaluated++;
        const evaluator = EVALUATORS[signal.id];
        if (!evaluator) {
          await emitEvent({
            client: oew,
            run_id: input.run_id,
            brand_id: brand.id,
            event_source: "signal-evaluator",
            event_type: "warning",
            payload: { reason: "no_evaluator_for_signal", signal_id: signal.id },
          });
          continue;
        }

        let drafts: SignalEventDraft[];
        try {
          drafts = await evaluator({
            oew,
            hub,
            brand,
            signal_def: signal,
            baselines_map,
            iso_week,
            iso_week_of_year,
            prev_iso_week,
            run_id: input.run_id,
            brand_routing,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await emitEvent({
            client: oew,
            run_id: input.run_id,
            brand_id: brand.id,
            event_source: "signal-evaluator",
            event_type: "agent_failed",
            error_message: `evaluator_failed signal=${signal.id} ${msg}`,
          });
          continue;
        }

        for (const draft of drafts) {
          const baseline = baselines_map.get(`${draft.signal_id}|${draft.segment_hash}`);
          if (signal.kind === "lagging" && baseline?.is_warm_up) {
            events_filtered_warm_up++;
            continue;
          }
          if ((brand_routing?.expected_holiday_drop_pct ?? 0) > 0 && draft.severity_hint === "WATCH") {
            events_filtered_holiday++;
          }

          const insertBody = {
            run_id: input.run_id,
            brand_id: brand.id,
            signal_id: signal.id,
            segment_hash: draft.segment_hash,
            period_start: draft.period_start,
            period_end: draft.period_end,
            metric_actual: draft.metric_actual,
            metric_expected: draft.metric_expected,
            deviation_sigma: draft.deviation_sigma,
            severity_hint: draft.severity_hint,
            confidence: draft.confidence,
            payload: draft.payload,
          };
          const { error: insErr } = await oew.from("signal_events").insert(insertBody);
          if (insErr) {
            await emitEvent({
              client: oew,
              run_id: input.run_id,
              brand_id: brand.id,
              event_source: "signal-evaluator",
              event_type: "agent_failed",
              error_message: `signal_event_insert_failed signal=${signal.id} ${insErr.message}`,
            });
            continue;
          }
          events_created++;
          await emitEvent({
            client: oew,
            run_id: input.run_id,
            brand_id: brand.id,
            event_source: "signal-evaluator",
            event_type: "anomaly_detected",
            payload: {
              signal_id: signal.id,
              severity_hint: draft.severity_hint,
              segment_hash: draft.segment_hash,
            },
          });
        }
      }
    }

    return jsonResponse({
      ok: true,
      run_id: input.run_id,
      signals_evaluated,
      events_created,
      events_filtered_holiday,
      events_filtered_warm_up,
      brands_processed,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await emitEvent({
      client: oew,
      run_id: input.run_id,
      event_source: "signal-evaluator",
      event_type: "agent_failed",
      error_message: msg,
    });
    return jsonResponse({ ok: false, run_id: input.run_id, error: "signal_evaluator_failed", detail: msg }, 500);
  }
});
