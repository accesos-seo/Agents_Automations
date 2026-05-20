// seo-optimizer-gsc-ingestor
// Pulls GSC data (current period + YoY) for one client and one run.
// Called by orchestrator via HTTP POST (fire-and-forget).

import { verifySecret } from "../_shared/secret.ts";
import { getClient } from "../_shared/orbit.ts";
import { querySearchAnalytics, GscRow } from "../_shared/gsc-api.ts";
import { emitEvent } from "../_shared/run-events.ts";
import { sbSchema } from "../_shared/supabase.ts";

interface Payload {
  run_id: string;
  client_id: string;
  period_start?: string;
  period_end?: string;
  period_days?: number;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const authErr = verifySecret(req);
  if (authErr) return authErr;

  const payload: Payload = await req.json();
  const { run_id, client_id } = payload;
  if (!run_id || !client_id) {
    return Response.json({ status: "failed", reason: "missing run_id or client_id" }, { status: 400 });
  }

  const periodDays = payload.period_days ?? 90;
  const periodEnd = payload.period_end ?? isoDate(daysAgo(3));
  const periodStart = payload.period_start ?? isoDate(daysAgo(3 + periodDays));
  const prevEnd = isoDate(addDays(new Date(periodEnd), -365));
  const prevStart = isoDate(addDays(new Date(periodStart), -365));

  const client = await getClient(client_id);
  if (!client) {
    await emitEvent({ runId: run_id, clientId: client_id, eventSource: "gsc_ingestor",
      eventType: "agent_failed", errorMessage: "client not found in v_active_clients" });
    return Response.json({ status: "failed", reason: "client_not_found" });
  }
  if (!client.gscPropertyUrl) {
    await emitEvent({ runId: run_id, clientId: client_id, eventSource: "gsc_ingestor",
      eventType: "agent_failed", errorMessage: "no gsc_property_url configured" });
    return Response.json({ status: "skipped", reason: "no_gsc_property" });
  }

  await emitEvent({
    runId: run_id, clientId: client_id, eventSource: "gsc_ingestor",
    eventType: "agent_started",
    payload: { site: client.gscPropertyUrl, period: [periodStart, periodEnd] },
  });

  // 1. Current period
  let curRows: GscRow[];
  try {
    curRows = await querySearchAnalytics({
      siteUrl: client.gscPropertyUrl,
      startDate: periodStart, endDate: periodEnd,
      dimensions: ["page", "query"],
    });
  } catch (err) {
    await emitEvent({ runId: run_id, clientId: client_id, eventSource: "gsc_ingestor",
      eventType: "agent_failed", errorMessage: `current period: ${err}` });
    return Response.json({ status: "failed", reason: "gsc_current_failed", error: String(err) });
  }

  // 2. YoY (best-effort)
  const prevIndex = new Map<string, GscRow>();
  try {
    const prevRows = await querySearchAnalytics({
      siteUrl: client.gscPropertyUrl,
      startDate: prevStart, endDate: prevEnd,
      dimensions: ["page", "query"],
    });
    for (const r of prevRows) {
      prevIndex.set(`${r.url}|${r.query}|${r.country ?? ""}|${r.device ?? ""}`, r);
    }
  } catch (err) {
    await emitEvent({ runId: run_id, clientId: client_id, eventSource: "gsc_ingestor",
      eventType: "warning", errorMessage: `YoY pull failed: ${err}` });
  }

  // 3. UPSERT in batches
  const rows = curRows.map(r => {
    const prev = prevIndex.get(`${r.url}|${r.query}|${r.country ?? ""}|${r.device ?? ""}`);
    return {
      run_id, client_id,
      period_start: periodStart, period_end: periodEnd,
      url: r.url, query: r.query,
      country: r.country, device: r.device,
      clicks: r.clicks, impressions: r.impressions,
      ctr: Number(r.ctr.toFixed(4)), position: Number(r.position.toFixed(2)),
      clicks_prev: prev?.clicks ?? null,
      impressions_prev: prev?.impressions ?? null,
      ctr_prev: prev ? Number(prev.ctr.toFixed(4)) : null,
      position_prev: prev ? Number(prev.position.toFixed(2)) : null,
    };
  });

  const BATCH = 1000;
  let totalInserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await sbSchema("seo_optimizer").from("gsc_url_query_metrics").upsert(chunk, {
      onConflict: "run_id,client_id,url,query,country,device",
    });
    if (error) {
      await emitEvent({ runId: run_id, clientId: client_id, eventSource: "gsc_ingestor",
        eventType: "warning", errorMessage: `batch upsert failed (chunk ${i}): ${error.message}` });
    } else {
      totalInserted += chunk.length;
    }
  }

  const result = { status: "ok", rows_inserted: totalInserted, rows_current: curRows.length, rows_prev: prevIndex.size };
  await emitEvent({ runId: run_id, clientId: client_id, eventSource: "gsc_ingestor",
    eventType: "agent_completed", payload: result });
  return Response.json(result);
});

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
