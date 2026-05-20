// seo-sentinel-analyst
// Detecta anomalías de clicks (WoW) y de posiciones (url+query) para un run dado.
// Dispara seo-sentinel-detective por cada anomaly relevante.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/supabase.ts";
import { verifyInternalSecret } from "../_shared/secret.ts";
import { emitEvent } from "../_shared/run-events.ts";

const EVENT_SOURCE = "analyst";
const DEFAULT_CLICKS_THRESHOLD = 20;
const DEFAULT_POSITION_DELTA_THRESHOLD = 10;
const POSITION_BATCH_SIZE = 500;
const DETECTIVE_FANOUT_CONCURRENCY = 5;
const MIN_PREV_CLICKS_FOR_WOW = 10;

interface AnalystInput {
  run_id: string;
}

interface BrandRow {
  id: string;
  alert_threshold_clicks_pct: number | null;
  alert_threshold_position_delta: number | null;
  seasonality_type: string | null;
}

interface TrafficRow {
  id: string;
  brand_id: string;
  date: string;
  clicks: number | null;
  ga4_sessions_organic: number | null;
  position: number | null;
}

interface PrevTrafficRow {
  clicks: number | null;
  ga4_sessions_organic: number | null;
  position: number | null;
}

interface PositionSnapshot {
  url: string;
  query: string;
  position: number | null;
}

interface PositionAnomalyInsert {
  run_id: string;
  brand_id: string;
  anomaly_date: string;
  url: string;
  query: string;
  prev_position: number;
  current_position: number;
  position_delta: number;
  lost_top10: boolean;
  severity: "RED" | "YELLOW";
}

function isoDateMinusDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function dayOfWeekUTC(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

async function postDetective(payload: Record<string, unknown>): Promise<void> {
  const fnsUrl = Deno.env.get("SUPABASE_FUNCTIONS_URL");
  const secret = Deno.env.get("SEO_SENTINEL_INTERNAL_SECRET");
  if (!fnsUrl || !secret) {
    console.error("[analyst] missing SUPABASE_FUNCTIONS_URL or SEO_SENTINEL_INTERNAL_SECRET");
    return;
  }
  try {
    const resp = await fetch(`${fnsUrl}/seo-sentinel-detective`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok && resp.status !== 409) {
      console.error(`[analyst] detective POST ${resp.status}: ${await resp.text()}`);
    }
  } catch (err) {
    console.error(`[analyst] detective POST failed: ${String(err)}`);
  }
}

async function runConcurrent<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let idx = 0;
  const runners: Promise<void>[] = [];
  const next = async (): Promise<void> => {
    while (idx < items.length) {
      const current = idx++;
      try {
        await worker(items[current]);
      } catch (err) {
        console.error(`[analyst] concurrent worker error: ${String(err)}`);
      }
    }
  };
  const n = Math.min(limit, items.length);
  for (let i = 0; i < n; i++) runners.push(next());
  await Promise.all(runners);
}

interface FalsePositiveResult {
  is_false_positive: boolean;
  reason: string | null;
  tracking_issue_suspect: boolean;
}

async function applyFalsePositiveFilter(
  brand: BrandRow,
  date: string,
  wowPct: number,
  currentGa4: number | null,
  prevGa4: number | null,
): Promise<FalsePositiveResult> {
  const { data: holiday } = await supabase
    .from("holiday_calendar")
    .select("expected_traffic_reduction_pct")
    .eq("date", date)
    .maybeSingle();

  if (holiday) {
    const expected = Number(holiday.expected_traffic_reduction_pct ?? 0);
    if (expected > 0 && Math.abs(wowPct) <= expected * 1.2) {
      return { is_false_positive: true, reason: "holiday", tracking_issue_suspect: false };
    }
  }

  const dow = dayOfWeekUTC(date);
  if ((dow === 0 || dow === 6) && brand.seasonality_type === "b2b_weekday") {
    return { is_false_positive: true, reason: "weekend_b2b", tracking_issue_suspect: false };
  }

  if (currentGa4 != null && prevGa4 != null && prevGa4 > 0) {
    const ga4Pct = ((currentGa4 - prevGa4) / prevGa4) * 100;
    const clicksDrop = Math.abs(wowPct);
    const ga4Drop = Math.abs(ga4Pct);
    if (wowPct < 0 && ga4Pct >= 0) {
      return { is_false_positive: false, reason: null, tracking_issue_suspect: true };
    }
    if (wowPct < 0 && ga4Drop < clicksDrop / 2) {
      return { is_false_positive: false, reason: null, tracking_issue_suspect: true };
    }
  }

  return { is_false_positive: false, reason: null, tracking_issue_suspect: false };
}

interface ClicksAnomalyOutcome {
  inserted: boolean;
  anomaly_id?: string;
  severity?: "RED" | "YELLOW";
  status: "normal" | "insufficient_data" | "detected";
}

async function analyzeClicksWoW(
  runId: string,
  brand: BrandRow,
  traffic: TrafficRow,
): Promise<ClicksAnomalyOutcome> {
  const prevDate = isoDateMinusDays(traffic.date, 7);
  const current = traffic.clicks ?? 0;

  const { data: prev } = await supabase
    .from("traffic_daily")
    .select("clicks, ga4_sessions_organic, position")
    .eq("brand_id", brand.id)
    .eq("date", prevDate)
    .maybeSingle<PrevTrafficRow>();

  const prevClicks = prev?.clicks ?? null;
  if (prevClicks == null || prevClicks < MIN_PREV_CLICKS_FOR_WOW) {
    await emitEvent({
      run_id: runId,
      brand_id: brand.id,
      event_source: EVENT_SOURCE,
      event_type: "anomaly_detected",
      payload: { reason: "insufficient_data", date: traffic.date },
    });
    await supabase
      .from("traffic_daily")
      .update({
        anomaly_status: "insufficient_data",
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", traffic.id);
    return { inserted: false, status: "insufficient_data" };
  }

  const wowPct = ((current - prevClicks) / prevClicks) * 100;
  const threshold = Number(brand.alert_threshold_clicks_pct ?? DEFAULT_CLICKS_THRESHOLD);

  if (Math.abs(wowPct) < threshold || wowPct > 0) {
    await supabase
      .from("traffic_daily")
      .update({
        anomaly_status: "normal",
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", traffic.id);
    return { inserted: false, status: "normal" };
  }

  const fp = await applyFalsePositiveFilter(
    brand,
    traffic.date,
    wowPct,
    traffic.ga4_sessions_organic,
    prev?.ga4_sessions_organic ?? null,
  );

  if (fp.is_false_positive) {
    await supabase
      .from("traffic_daily")
      .update({
        anomaly_status: "normal",
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", traffic.id);
    return { inserted: false, status: "normal" };
  }

  // Classification
  let anomalyType: "tracking_issue" | "algorithm_update" | "seo_drop" = "seo_drop";
  if (fp.tracking_issue_suspect) {
    anomalyType = "tracking_issue";
  } else if (
    prev?.position != null &&
    traffic.position != null &&
    Number(traffic.position) - Number(prev.position) >= 5
  ) {
    anomalyType = "algorithm_update";
  }

  const severity: "RED" | "YELLOW" = Math.abs(wowPct) >= 30 ? "RED" : "YELLOW";
  const wowRounded = Math.round(wowPct * 100) / 100;

  const { data: inserted, error: insertErr } = await supabase
    .from("clicks_anomalies")
    .insert({
      run_id: runId,
      brand_id: brand.id,
      anomaly_date: traffic.date,
      current_clicks: current,
      previous_clicks: prevClicks,
      wow_drop_pct: wowRounded,
      anomaly_type: anomalyType,
      false_positive: false,
      severity,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    throw new Error(`clicks_anomalies insert failed: ${insertErr?.message ?? "no row"}`);
  }

  await supabase
    .from("traffic_daily")
    .update({
      anomaly_status: "detected",
      anomaly_type: anomalyType,
      analyzed_at: new Date().toISOString(),
    })
    .eq("id", traffic.id);

  await emitEvent({
    run_id: runId,
    brand_id: brand.id,
    event_source: EVENT_SOURCE,
    event_type: "anomaly_detected",
    payload: {
      anomaly_kind: "clicks_drop",
      anomaly_id: inserted.id,
      severity,
      anomaly_type: anomalyType,
      wow_drop_pct: wowRounded,
      date: traffic.date,
    },
  });

  await postDetective({
    run_id: runId,
    brand_id: brand.id,
    anomaly_kind: "clicks_drop",
    anomaly_id: inserted.id,
  });

  return { inserted: true, anomaly_id: inserted.id as string, severity, status: "detected" };
}

async function analyzePositionsWoW(
  runId: string,
  brand: BrandRow,
  date: string,
): Promise<number> {
  const posThreshold = Number(
    brand.alert_threshold_position_delta ?? DEFAULT_POSITION_DELTA_THRESHOLD,
  );
  const prevDate = isoDateMinusDays(date, 7);

  const { data: currSnaps, error: currErr } = await supabase
    .from("position_snapshots")
    .select("url, query, position")
    .eq("brand_id", brand.id)
    .eq("date", date);
  if (currErr) throw new Error(`position_snapshots curr: ${currErr.message}`);

  const { data: prevSnaps, error: prevErr } = await supabase
    .from("position_snapshots")
    .select("url, query, position")
    .eq("brand_id", brand.id)
    .eq("date", prevDate);
  if (prevErr) throw new Error(`position_snapshots prev: ${prevErr.message}`);

  if (!currSnaps?.length || !prevSnaps?.length) return 0;

  const prevMap = new Map<string, PositionSnapshot>();
  for (const p of prevSnaps as PositionSnapshot[]) {
    prevMap.set(`${p.url} ${p.query}`, p);
  }

  const rowsToInsert: PositionAnomalyInsert[] = [];
  for (const c of currSnaps as PositionSnapshot[]) {
    if (c.position == null) continue;
    const prev = prevMap.get(`${c.url} ${c.query}`);
    if (!prev || prev.position == null) continue;
    const prevPos = Number(prev.position);
    const currPos = Number(c.position);
    if (prevPos > 100) continue;
    const delta = currPos - prevPos;
    if (delta < posThreshold) continue;

    const lostTop10 = prevPos <= 10 && currPos > 10;
    let severity: "RED" | "YELLOW" = "YELLOW";
    if (delta >= 20 || (lostTop10 && delta >= 10)) severity = "RED";

    rowsToInsert.push({
      run_id: runId,
      brand_id: brand.id,
      anomaly_date: date,
      url: c.url,
      query: c.query,
      prev_position: prevPos,
      current_position: currPos,
      position_delta: Math.round(delta * 100) / 100,
      lost_top10: lostTop10,
      severity,
    });
  }

  if (!rowsToInsert.length) return 0;

  const insertedIds: Array<{ id: string; severity: "RED" | "YELLOW" }> = [];
  for (let i = 0; i < rowsToInsert.length; i += POSITION_BATCH_SIZE) {
    const chunk = rowsToInsert.slice(i, i + POSITION_BATCH_SIZE);
    const { data, error } = await supabase
      .from("position_anomalies")
      .insert(chunk)
      .select("id, severity");
    if (error) {
      throw new Error(`position_anomalies insert chunk failed: ${error.message}`);
    }
    if (data) {
      for (const row of data as Array<{ id: string; severity: "RED" | "YELLOW" }>) {
        insertedIds.push(row);
      }
    }
  }

  // Fan out detective calls (parallel, capped concurrency).
  await runConcurrent(insertedIds, DETECTIVE_FANOUT_CONCURRENCY, async (row) => {
    await emitEvent({
      run_id: runId,
      brand_id: brand.id,
      event_source: EVENT_SOURCE,
      event_type: "anomaly_detected",
      payload: {
        anomaly_kind: "position_drop",
        anomaly_id: row.id,
        severity: row.severity,
        date,
      },
    });
    await postDetective({
      run_id: runId,
      brand_id: brand.id,
      anomaly_kind: "position_drop",
      anomaly_id: row.id,
    });
  });

  return insertedIds.length;
}

serve(async (req: Request) => {
  const authResp = verifyInternalSecret(req);
  if (authResp) return authResp;

  let runId = "";
  try {
    const body = (await req.json()) as AnalystInput;
    runId = body?.run_id;
    if (!runId) {
      return new Response(
        JSON.stringify({ ok: false, error: "run_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    await emitEvent({
      run_id: runId,
      event_source: EVENT_SOURCE,
      event_type: "agent_started",
    });

    const { data: trafficRows, error: tdErr } = await supabase
      .from("traffic_daily")
      .select("id, brand_id, date, clicks, ga4_sessions_organic, position")
      .eq("run_id", runId)
      .eq("integrity_status", "approved");
    if (tdErr) throw new Error(`traffic_daily fetch: ${tdErr.message}`);

    const records = (trafficRows ?? []) as TrafficRow[];
    if (!records.length) {
      await emitEvent({
        run_id: runId,
        event_source: EVENT_SOURCE,
        event_type: "agent_completed",
        payload: { clicks_anomalies: 0, position_anomalies: 0, processed_pairs: 0 },
      });
      return new Response(
        JSON.stringify({ ok: true, anomalies_detected: 0, processed: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const brandIds = Array.from(new Set(records.map((r) => r.brand_id)));
    const { data: brands, error: brandsErr } = await supabase
      .from("brands")
      .select("id, alert_threshold_clicks_pct, alert_threshold_position_delta, seasonality_type")
      .in("id", brandIds);
    if (brandsErr) throw new Error(`brands fetch: ${brandsErr.message}`);

    const brandMap = new Map<string, BrandRow>();
    for (const b of (brands ?? []) as BrandRow[]) brandMap.set(b.id, b);

    let clicksAnomalies = 0;
    let positionAnomalies = 0;

    for (const row of records) {
      const brand = brandMap.get(row.brand_id);
      if (!brand) {
        console.warn(`[analyst] brand not found: ${row.brand_id}`);
        continue;
      }
      try {
        const clicksOutcome = await analyzeClicksWoW(runId, brand, row);
        if (clicksOutcome.inserted) clicksAnomalies++;
      } catch (err) {
        console.error(`[analyst] clicks analyze failed brand=${brand.id} date=${row.date}: ${String(err)}`);
      }
      try {
        const positionCount = await analyzePositionsWoW(runId, brand, row.date);
        positionAnomalies += positionCount;
      } catch (err) {
        console.error(`[analyst] position analyze failed brand=${brand.id} date=${row.date}: ${String(err)}`);
      }
    }

    await emitEvent({
      run_id: runId,
      event_source: EVENT_SOURCE,
      event_type: "agent_completed",
      payload: {
        clicks_anomalies: clicksAnomalies,
        position_anomalies: positionAnomalies,
        processed_pairs: records.length,
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        anomalies_detected: clicksAnomalies + positionAnomalies,
        clicks_anomalies: clicksAnomalies,
        position_anomalies: positionAnomalies,
        processed: records.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = String(err);
    console.error(`[analyst] fatal: ${msg}`);
    if (runId) {
      await emitEvent({
        run_id: runId,
        event_source: EVENT_SOURCE,
        event_type: "agent_failed",
        error_message: msg,
      });
    }
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
