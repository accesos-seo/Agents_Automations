import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getOewClient, getHubClient } from "../_shared/supabase.ts";
import { verifyInternalSecret } from "../_shared/secret.ts";
import { emitEvent } from "../_shared/run-events.ts";
import type { Severity } from "../_shared/types.ts";

interface OrchestratorInput {
  trigger: "cron" | "manual";
  brand_id?: string;
  force?: boolean;
}

interface BrandRow {
  id: string;
}

interface IncidentLite {
  id: string;
  severity: Severity;
}

const SUPABASE_FUNCTIONS_URL = Deno.env.get("SUPABASE_FUNCTIONS_URL") ?? "";
const OEW_INTERNAL_SECRET = Deno.env.get("OEW_INTERNAL_SECRET") ?? "";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function currentIsoWeek(): string {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = target.getUTCDay() === 0 ? 7 : target.getUTCDay();
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

interface InvokeResult {
  ok: boolean;
  status: number;
  body: unknown;
}

async function invokeFn(name: string, body: Record<string, unknown>): Promise<InvokeResult> {
  try {
    const resp = await fetch(`${SUPABASE_FUNCTIONS_URL}/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": OEW_INTERNAL_SECRET,
      },
      body: JSON.stringify(body),
    });
    let parsed: unknown = null;
    try {
      parsed = await resp.json();
    } catch {
      parsed = null;
    }
    return { ok: resp.ok, status: resp.status, body: parsed };
  } catch (err) {
    return { ok: false, status: 0, body: { error: String(err) } };
  }
}

serve(async (req: Request) => {
  const denied = verifyInternalSecret(req);
  if (denied) return denied;

  let input: OrchestratorInput;
  try {
    input = (await req.json()) as OrchestratorInput;
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  if (!input.trigger) {
    return jsonResponse({ ok: false, error: "missing_trigger" }, 400);
  }

  const oew = getOewClient();
  const hub = getHubClient();
  const iso_week = currentIsoWeek();

  if (input.brand_id) {
    const { data: b, error: be } = await hub
      .from("brands_registry")
      .select("id")
      .eq("id", input.brand_id)
      .maybeSingle();
    if (be) {
      return jsonResponse({ ok: false, error: "brand_lookup_failed", detail: be.message }, 500);
    }
    if (!b) {
      return jsonResponse({ ok: false, error: "brand_not_found" }, 404);
    }
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: hubRuns, error: hubErr } = await hub
    .from("ingestion_runs")
    .select("source, completed_at, status")
    .eq("status", "completed")
    .in("source", ["gsc", "ga4", "cwv"])
    .gte("completed_at", sevenDaysAgo);
  if (hubErr) {
    return jsonResponse({ ok: false, error: "hub_lookup_failed", detail: hubErr.message }, 500);
  }
  const freshSources = new Set<string>((hubRuns ?? []).map((r) => r.source as string));
  if (!freshSources.has("gsc")) {
    const { data: tempRun } = await oew
      .from("analysis_runs")
      .insert({
        trigger_source: input.trigger,
        iso_week,
        status: "completed",
        completed_at: new Date().toISOString(),
        brands_total: 0,
        brands_processed: 0,
        metrics: { warning: "hub_data_stale" },
      })
      .select("id")
      .single();
    const stale_run_id = (tempRun?.id as string) ?? "00000000-0000-0000-0000-000000000000";
    if (tempRun?.id) {
      await emitEvent({
        client: oew,
        run_id: stale_run_id,
        event_source: "orchestrator",
        event_type: "warning",
        payload: { reason: "hub_data_stale", iso_week, components_fresh: Array.from(freshSources) },
      });
    }
    return jsonResponse({
      ok: true,
      run_id: stale_run_id,
      warning: "hub_data_stale",
      details: {
        expected_iso_week: iso_week,
        components_fresh: Array.from(freshSources),
        components_stale: ["gsc", "ga4", "cwv"].filter((c) => !freshSources.has(c)),
      },
      brands_processed: 0,
    });
  }

  const force = input.force === true;
  if (!force) {
    const { data: existing } = await oew
      .from("analysis_runs")
      .select("id, status")
      .eq("iso_week", iso_week)
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(1);
    if (existing && existing.length > 0) {
      return jsonResponse({
        ok: true,
        run_id: existing[0].id as string,
        status: "already_processed",
        iso_week,
        brands_processed: 0,
        incidents_opened: 0,
        incidents_dispatched: 0,
        incidents_watch_tier: 0,
      });
    }
  }

  let brandQuery = hub.from("brands_registry").select("id").eq("status", "active");
  if (input.brand_id) brandQuery = brandQuery.eq("id", input.brand_id);
  const { data: brandsData, error: brandsErr } = await brandQuery;
  if (brandsErr) {
    return jsonResponse({ ok: false, error: "brands_query_failed", detail: brandsErr.message }, 500);
  }
  const brands = (brandsData ?? []) as BrandRow[];

  const { data: runRow, error: runErr } = await oew
    .from("analysis_runs")
    .insert({
      trigger_source: input.trigger,
      iso_week,
      status: "running",
      brands_total: brands.length,
    })
    .select("id")
    .single();
  if (runErr || !runRow) {
    return jsonResponse({ ok: false, error: "run_insert_failed", detail: runErr?.message }, 500);
  }
  const run_id = runRow.id as string;

  await emitEvent({
    client: oew,
    run_id,
    event_source: "orchestrator",
    event_type: "run_started",
    payload: { trigger: input.trigger, iso_week, brand_filter: input.brand_id ?? null, brands_total: brands.length },
  });

  const subBody: Record<string, unknown> = { run_id };
  if (input.brand_id) subBody.brand_id = input.brand_id;

  let metrics: Record<string, unknown> = {};

  try {
    const baselineRes = await invokeFn("oew-baseline-builder", subBody);
    if (!baselineRes.ok) {
      throw new Error(`baseline_builder_failed: status=${baselineRes.status} body=${JSON.stringify(baselineRes.body)}`);
    }
    await emitEvent({
      client: oew,
      run_id,
      event_source: "orchestrator",
      event_type: "agent_completed",
      payload: { step: "baseline_builder", result: baselineRes.body },
    });

    const evalRes = await invokeFn("oew-signal-evaluator", subBody);
    if (!evalRes.ok) {
      throw new Error(`signal_evaluator_failed: status=${evalRes.status} body=${JSON.stringify(evalRes.body)}`);
    }
    await emitEvent({
      client: oew,
      run_id,
      event_source: "orchestrator",
      event_type: "agent_completed",
      payload: { step: "signal_evaluator", result: evalRes.body },
    });

    const clusterRes = await invokeFn("oew-incident-clusterer", { run_id });
    if (!clusterRes.ok) {
      throw new Error(`incident_clusterer_failed: status=${clusterRes.status} body=${JSON.stringify(clusterRes.body)}`);
    }
    await emitEvent({
      client: oew,
      run_id,
      event_source: "orchestrator",
      event_type: "agent_completed",
      payload: { step: "incident_clusterer", result: clusterRes.body },
    });

    const { data: incs, error: incErr } = await oew
      .from("incidents")
      .select("id, severity")
      .eq("run_id", run_id);
    if (incErr) {
      throw new Error(`incidents_query_failed: ${incErr.message}`);
    }
    const incidents = (incs ?? []) as IncidentLite[];
    const watchCount = incidents.filter((i) => i.severity === "WATCH").length;
    const escalatable = incidents.filter((i) => i.severity === "YELLOW" || i.severity === "RED");

    const detectiveResults = await Promise.allSettled(
      escalatable.map((i) => invokeFn("oew-detective", { incident_id: i.id })),
    );
    let detectiveOk = 0;
    let detectiveFail = 0;
    detectiveResults.forEach((r) => {
      if (r.status === "fulfilled" && r.value.ok) detectiveOk++;
      else detectiveFail++;
    });

    const { data: diagnosed, error: diagErr } = await oew
      .from("incident_diagnostics")
      .select("incident_id")
      .eq("run_id", run_id);
    if (diagErr) {
      throw new Error(`incident_diagnostics_query_failed: ${diagErr.message}`);
    }
    const diagnosedIds = new Set<string>((diagnosed ?? []).map((d) => d.incident_id as string));
    const toDispatch = escalatable.filter((i) => diagnosedIds.has(i.id));
    const dispatchResults = await Promise.allSettled(
      toDispatch.map((i) => invokeFn("oew-dispatcher", { incident_id: i.id })),
    );
    let dispatchedOk = 0;
    let dispatchedFail = 0;
    dispatchResults.forEach((r) => {
      if (r.status === "fulfilled" && r.value.ok) dispatchedOk++;
      else dispatchedFail++;
    });

    metrics = {
      brands_processed: brands.length,
      incidents_opened: incidents.length,
      incidents_watch_tier: watchCount,
      incidents_dispatched: dispatchedOk,
      detective_ok: detectiveOk,
      detective_fail: detectiveFail,
      dispatch_fail: dispatchedFail,
    };

    await oew
      .from("analysis_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        brands_processed: brands.length,
        brands_failed: 0,
        metrics,
      })
      .eq("id", run_id);

    await emitEvent({
      client: oew,
      run_id,
      event_source: "orchestrator",
      event_type: "run_completed",
      payload: metrics,
    });

    return jsonResponse({
      ok: true,
      run_id,
      brands_processed: brands.length,
      incidents_opened: incidents.length,
      incidents_dispatched: dispatchedOk,
      incidents_watch_tier: watchCount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await oew
      .from("analysis_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: msg,
        metrics,
      })
      .eq("id", run_id);
    await emitEvent({
      client: oew,
      run_id,
      event_source: "orchestrator",
      event_type: "run_failed",
      error_message: msg,
    });
    let errCode = "orchestrator_failed";
    if (msg.startsWith("baseline_builder_failed")) errCode = "baseline_builder_failed";
    else if (msg.startsWith("signal_evaluator_failed")) errCode = "signal_evaluator_failed";
    else if (msg.startsWith("incident_clusterer_failed")) errCode = "incident_clusterer_failed";
    return jsonResponse({ ok: false, run_id, error: errCode, detail: msg }, 500);
  }
});
