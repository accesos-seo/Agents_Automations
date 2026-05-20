import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabase } from "../_shared/supabase.ts";
import { verifyInternalSecret } from "../_shared/secret.ts";
import { emitEvent } from "../_shared/run-events.ts";
import { paginateAll } from "../_shared/gsc-api.ts";

interface IngestorInput {
  run_id: string;
  brand_id: string;
  date_from: string;
  date_to: string;
}

const TRAFFIC_BATCH_SIZE = 500;
const SNAPSHOT_BATCH_SIZE = 1000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface TrafficRow {
  run_id: string;
  brand_id: string;
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  integrity_status: string;
  anomaly_status: string;
}

interface SnapshotRow {
  run_id: string;
  brand_id: string;
  date: string;
  url: string;
  query: string;
  position: number;
  clicks: number;
  impressions: number;
  ctr: number;
}

async function flushTrafficBatch(rows: TrafficRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("traffic_daily")
    .upsert(rows, { onConflict: "brand_id,date" });
  if (error) throw new Error(`traffic_daily upsert failed: ${error.message}`);
}

async function flushSnapshotBatch(rows: SnapshotRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("position_snapshots")
    .upsert(rows, { onConflict: "brand_id,date,url,query" });
  if (error) throw new Error(`position_snapshots upsert failed: ${error.message}`);
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
    event_source: "gsc-ingestor",
    event_type: "agent_started",
    payload: { date_from, date_to },
  });

  try {
    const { data: brand, error: brandErr } = await supabase
      .from("brands")
      .select("id, gsc_property_url")
      .eq("id", brand_id)
      .maybeSingle();

    if (brandErr) throw new Error(`brand_lookup_failed: ${brandErr.message}`);
    if (!brand || !brand.gsc_property_url) {
      const msg = brand ? "no_gsc_property_url" : "brand_not_found";
      await emitEvent({
        run_id,
        brand_id,
        event_source: "gsc-ingestor",
        event_type: "agent_failed",
        error_message: msg,
      });
      return jsonResponse({ ok: false, error: msg }, 404);
    }

    const propertyUrl = brand.gsc_property_url as string;

    // Query 1 (agregada): dimensions=['date']
    let trafficBuffer: TrafficRow[] = [];
    let records_inserted = 0;
    for await (const row of paginateAll(propertyUrl, ["date"], date_from, date_to)) {
      const date = row.keys?.[0];
      if (!date) continue;
      trafficBuffer.push({
        run_id,
        brand_id,
        date,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
        integrity_status: "pending",
        anomaly_status: "pending",
      });
      if (trafficBuffer.length >= TRAFFIC_BATCH_SIZE) {
        await flushTrafficBatch(trafficBuffer);
        records_inserted += trafficBuffer.length;
        trafficBuffer = [];
      }
    }
    if (trafficBuffer.length > 0) {
      await flushTrafficBatch(trafficBuffer);
      records_inserted += trafficBuffer.length;
    }

    // Query 2 (granular): dimensions=['date','page','query']
    let snapshotBuffer: SnapshotRow[] = [];
    let snapshots_inserted = 0;
    for await (const row of paginateAll(propertyUrl, ["date", "page", "query"], date_from, date_to, 25000)) {
      const [date, url, query] = row.keys ?? [];
      if (!date || !url || !query) continue;
      snapshotBuffer.push({
        run_id,
        brand_id,
        date,
        url,
        query,
        position: row.position,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
      });
      if (snapshotBuffer.length >= SNAPSHOT_BATCH_SIZE) {
        await flushSnapshotBatch(snapshotBuffer);
        snapshots_inserted += snapshotBuffer.length;
        snapshotBuffer = [];
      }
    }
    if (snapshotBuffer.length > 0) {
      await flushSnapshotBatch(snapshotBuffer);
      snapshots_inserted += snapshotBuffer.length;
    }

    // Marca data como aprobada: si llegamos aca, GSC respondio a ambas queries sin error
    const { error: approveErr } = await supabase
      .from("traffic_daily")
      .update({ integrity_status: "approved" })
      .eq("run_id", run_id)
      .eq("brand_id", brand_id);
    if (approveErr) {
      console.warn(`[gsc-ingestor] integrity_status update warning: ${approveErr.message}`);
    }

    await emitEvent({
      run_id,
      brand_id,
      event_source: "gsc-ingestor",
      event_type: "agent_completed",
      payload: { records_inserted, snapshots_inserted },
    });

    return jsonResponse({ ok: true, run_id, brand_id, records_inserted, snapshots_inserted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await emitEvent({
      run_id,
      brand_id,
      event_source: "gsc-ingestor",
      event_type: "agent_failed",
      error_message: msg,
    });
    return jsonResponse({ ok: false, run_id, brand_id, error: msg }, 500);
  }
});
