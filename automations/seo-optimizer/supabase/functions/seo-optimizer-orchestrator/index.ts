// seo-optimizer-orchestrator
// Entry point of the monthly pipeline. Triggered by pg_cron 'seo-optimizer-monthly'
// or manually.
//
// IMPORTANT: Edge Functions have a 150s timeout. The orchestrator does the
// initial bookkeeping (create run, list clients) and then FIRES per-client
// ingestion in parallel (fire-and-forget HTTP). Each ingest function emits
// run_events on completion. After firing all, the orchestrator polls run_events
// for completion (with a short max wait), then calls analyst + dispatcher.
//
// For very heavy runs, the orchestrator may exit before everything completes.
// The watchdog cron catches stuck runs and marks them failed/partial.

import { verifySecret } from "../_shared/secret.ts";
import { listActiveClients } from "../_shared/orbit.ts";
import { emitEvent } from "../_shared/run-events.ts";
import { sbSchema, getFunctionsBaseUrl, getInternalSecret } from "../_shared/supabase.ts";

interface Payload {
  trigger?: "cron" | "manual" | "watchdog_retry";
  client_ids?: string[] | null;
  period_days?: number;
}

const MAX_WAIT_MS = 120_000;     // 2 min cap on polling — Edge has 150s total
const POLL_INTERVAL_MS = 5_000;

Deno.serve(async (req: Request): Promise<Response> => {
  const authErr = verifySecret(req);
  if (authErr) return authErr;

  const payload: Payload = await req.json().catch(() => ({}));
  const trigger = payload.trigger ?? "manual";
  const periodDays = payload.period_days ?? 90;

  const periodEnd = isoDate(addDays(new Date(), -3));
  const periodStart = isoDate(addDays(new Date(periodEnd), -periodDays));
  const periodPrevEnd = isoDate(addDays(new Date(periodEnd), -365));
  const periodPrevStart = isoDate(addDays(new Date(periodStart), -365));

  // 1. Create run
  const { data: runRows, error: runErr } = await sbSchema("seo_optimizer").from("runs").insert({
    trigger_source: trigger,
    period_start: periodStart, period_end: periodEnd,
    period_prev_start: periodPrevStart, period_prev_end: periodPrevEnd,
    status: "running",
  }).select().single();
  if (runErr || !runRows) {
    return Response.json({ status: "failed", reason: "create_run_failed", error: runErr?.message }, { status: 500 });
  }
  const runId = runRows.id as string;
  await emitEvent({ runId, eventSource: "orchestrator", eventType: "run_started",
    payload: { trigger, period: [periodStart, periodEnd] } });

  // 2. List clients
  const clients = await listActiveClients(payload.client_ids ?? null);
  if (clients.length === 0) {
    await sbSchema("seo_optimizer").from("runs").update({
      status: "failed", error_message: "no active clients", completed_at: new Date().toISOString(),
    }).eq("id", runId);
    await emitEvent({ runId, eventSource: "orchestrator", eventType: "run_failed",
      errorMessage: "no active clients" });
    return Response.json({ run_id: runId, status: "failed", reason: "no_active_clients" });
  }
  await sbSchema("seo_optimizer").from("runs").update({ clients_total: clients.length }).eq("id", runId);

  // 3. Fire-and-forget ingestion per client (HTTP, no await on completion)
  const base = getFunctionsBaseUrl();
  const secret = getInternalSecret();
  const fireAndForget = async (path: string, body: Record<string, unknown>) => {
    try {
      // We do await the fetch but expect it to complete in a few seconds (ingestors
      // can run up to 150s). For very long ingestions we accept that the orchestrator
      // may time out — the watchdog catches it.
      const resp = await fetch(`${base}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-secret": secret },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        console.warn(`[orchestrator] ${path} returned ${resp.status}`);
      }
    } catch (err) {
      console.warn(`[orchestrator] ${path} fetch failed:`, err);
    }
  };

  // Chain per-client: gsc → article. Run clients in parallel (semaphore via Promise.all
  // grouped — Edge Functions don't have a strict semaphore primitive, but typical run
  // has 5-10 clients which is OK).
  const ingestPromises = clients.map(async (c) => {
    await fireAndForget("seo-optimizer-gsc-ingestor", {
      run_id: runId, client_id: c.id, period_start: periodStart, period_end: periodEnd,
    });
    await fireAndForget("seo-optimizer-article-ingestor", {
      run_id: runId, client_id: c.id, max_urls: 200,
    });
  });
  await Promise.allSettled(ingestPromises);

  // 4. Wait briefly for ingestion completion via run_events polling
  const allDone = await waitForIngestionCompletion(runId, clients.length, MAX_WAIT_MS);

  // 5. Update processed/failed counts based on agent_completed/agent_failed events
  const { data: completedEvents } = await sbSchema("seo_optimizer").from("run_events")
    .select("client_id, event_type")
    .eq("run_id", runId)
    .in("event_type", ["agent_completed", "agent_failed"])
    .eq("event_source", "article_ingestor");
  const processedClients = new Set<string>();
  const failedClients = new Set<string>();
  for (const e of (completedEvents ?? [])) {
    if (e.event_type === "agent_completed") processedClients.add(e.client_id as string);
    else if (e.event_type === "agent_failed") failedClients.add(e.client_id as string);
  }
  const processed = processedClients.size;
  const failed = failedClients.size;
  await sbSchema("seo_optimizer").from("runs").update({
    clients_processed: processed, clients_failed: failed,
  }).eq("id", runId);

  // 6. Analyst (synchronous — we await its full execution)
  let analystResult: Record<string, unknown> = { status: "skipped" };
  try {
    const r = await fetch(`${base}/seo-optimizer-analyst`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify({ run_id: runId }),
    });
    if (r.ok) analystResult = await r.json();
    else analystResult = { status: "failed", http: r.status };
  } catch (err) {
    analystResult = { status: "failed", error: String(err) };
  }

  // 7. Dispatcher
  let dispatchResult: Record<string, unknown> = { status: "skipped" };
  try {
    const r = await fetch(`${base}/seo-optimizer-dispatcher`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify({ run_id: runId }),
    });
    if (r.ok) dispatchResult = await r.json();
  } catch (err) {
    dispatchResult = { status: "failed", error: String(err) };
  }

  // 8. Final status
  let finalStatus: string;
  if (failed === 0 && analystResult.status === "ok" && allDone) finalStatus = "completed";
  else if (processed > 0) finalStatus = "partial";
  else finalStatus = "failed";

  await sbSchema("seo_optimizer").from("runs").update({
    status: finalStatus, completed_at: new Date().toISOString(),
  }).eq("id", runId);

  await emitEvent({
    runId, eventSource: "orchestrator",
    eventType: finalStatus === "completed" ? "run_completed" : "run_failed",
    payload: {
      final_status: finalStatus,
      clients_total: clients.length,
      clients_processed: processed,
      clients_failed: failed,
      analyst: analystResult,
      dispatch: dispatchResult,
      ingestion_all_done: allDone,
    },
  });

  return Response.json({
    run_id: runId, status: finalStatus,
    clients_total: clients.length, clients_processed: processed, clients_failed: failed,
    analyst: analystResult, dispatch: dispatchResult,
  });
});

async function waitForIngestionCompletion(runId: string, expectedClients: number, maxWaitMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const { data } = await sbSchema("seo_optimizer").from("run_events")
      .select("client_id", { count: "exact" })
      .eq("run_id", runId)
      .eq("event_source", "article_ingestor")
      .in("event_type", ["agent_completed", "agent_failed"]);
    const done = new Set((data ?? []).map((r: Record<string, unknown>) => r.client_id as string));
    if (done.size >= expectedClients) return true;
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
