// seo-optimizer-reeval
// Single-opportunity reeval. /seo-optimizer-reeval-batch loops over due ones and calls this.

import { verifySecret } from "../_shared/secret.ts";
import { getClient } from "../_shared/orbit.ts";
import { queryUrlMetrics, GscRow } from "../_shared/gsc-api.ts";
import { buildReevalOutcomeAlert } from "../_shared/slack-blockkit.ts";
import { emitEvent } from "../_shared/run-events.ts";
import { sbSchema, getSupabase } from "../_shared/supabase.ts";

const MIN_CLICKS_FOR_VERDICT = 100;
const IMPROVED_CLICKS_THRESHOLD = 20;        // %
const IMPROVED_POSITION_THRESHOLD = -2;      // points (lower is better)
const WORSENED_CLICKS_THRESHOLD = -20;
const WORSENED_POSITION_THRESHOLD = 2;

interface Payload { opportunity_id: string; }

Deno.serve(async (req: Request): Promise<Response> => {
  const authErr = verifySecret(req);
  if (authErr) return authErr;

  const payload: Payload = await req.json();
  return Response.json(await runReeval(payload.opportunity_id));
});

export async function runReeval(opportunityId: string): Promise<Record<string, unknown>> {
  const { data: opp } = await sbSchema("seo_optimizer").from("opportunities")
    .select("id, run_id, client_id, content_item_id, article_url, article_title, " +
            "implemented_at, reeval_due_at, status, evidence")
    .eq("id", opportunityId).single();
  if (!opp) return { status: "failed", reason: "opportunity_not_found" };
  if (!["implemented", "observing"].includes(opp.status as string)) {
    return { status: "skipped", reason: `status is ${opp.status}` };
  }
  if (!opp.implemented_at) return { status: "skipped", reason: "no implemented_at" };

  const client = await getClient(opp.client_id as string);
  if (!client || !client.gscPropertyUrl) {
    await sbSchema("seo_optimizer").from("opportunities").update({
      reeval_outcome: "inconclusive",
      reeval_completed_at: new Date().toISOString(),
      status: "observing",
    }).eq("id", opportunityId);
    return { status: "ok", outcome: "inconclusive", reason: "no_gsc_property" };
  }

  const implementedAt = new Date(opp.implemented_at as string);
  const today = new Date();
  const afterEnd = isoDate(addDays(today, -3));
  const afterStart = isoDate(addDays(new Date(afterEnd), -29));
  const beforeEnd = isoDate(addDays(implementedAt, -1));
  const beforeStart = isoDate(addDays(new Date(beforeEnd), -29));

  let beforeRows: GscRow[], afterRows: GscRow[];
  try {
    beforeRows = await queryUrlMetrics({
      siteUrl: client.gscPropertyUrl, urlFilter: opp.article_url as string,
      startDate: beforeStart, endDate: beforeEnd,
    });
    afterRows = await queryUrlMetrics({
      siteUrl: client.gscPropertyUrl, urlFilter: opp.article_url as string,
      startDate: afterStart, endDate: afterEnd,
    });
  } catch (err) {
    await emitEvent({ runId: opp.run_id as string, clientId: opp.client_id as string,
      eventSource: "reeval", eventType: "agent_failed", errorMessage: String(err) });
    return { status: "failed", reason: "gsc_error", error: String(err) };
  }

  const before = aggregate(beforeRows);
  const after = aggregate(afterRows);
  const totalClicks = before.clicks + after.clicks;
  let outcome: string; let confidence: string;
  if (totalClicks < MIN_CLICKS_FOR_VERDICT) {
    outcome = "inconclusive"; confidence = "low";
  } else {
    const c = classifyOutcome(before, after);
    outcome = c.outcome; confidence = c.confidence;
  }

  const clicksDeltaPct = pctChange(before.clicks, after.clicks);
  const impressionsDeltaPct = pctChange(before.impressions, after.impressions);
  const positionDelta = (before.position !== null && after.position !== null)
    ? Number((after.position - before.position).toFixed(2)) : null;

  const resultRow = {
    opportunity_id: opportunityId,
    clicks_before: before.clicks, clicks_after: after.clicks, clicks_delta_pct: clicksDeltaPct,
    position_before: before.position, position_after: after.position, position_delta: positionDelta,
    impressions_before: before.impressions, impressions_after: after.impressions,
    impressions_delta_pct: impressionsDeltaPct,
    outcome, confidence_in_outcome: confidence, notes: null,
  };
  await sbSchema("seo_optimizer").from("reeval_results").insert(resultRow);

  const newStatus = outcome === "improved" ? "closed" : "observing";
  await sbSchema("seo_optimizer").from("opportunities").update({
    reeval_outcome: outcome,
    reeval_completed_at: new Date().toISOString(),
    status: newStatus,
  }).eq("id", opportunityId);

  if (outcome === "worsened") {
    await enqueueWorsenedAlert({
      opp, metrics: resultRow,
      clientName: client.name,
    });
  }

  await emitEvent({
    runId: opp.run_id as string, clientId: opp.client_id as string,
    eventSource: "reeval", eventType: "reeval_completed",
    payload: { opportunity_id: opportunityId, outcome, confidence },
  });
  return { status: "ok", outcome, confidence, metrics: resultRow };
}

interface AggOut { clicks: number; impressions: number; ctr: number | null; position: number | null; }

function aggregate(rows: GscRow[]): AggOut {
  if (rows.length === 0) return { clicks: 0, impressions: 0, ctr: null, position: null };
  const clicks = rows.reduce((a, r) => a + r.clicks, 0);
  const impressions = rows.reduce((a, r) => a + r.impressions, 0);
  const weightedPos = impressions > 0
    ? rows.reduce((a, r) => a + r.position * r.impressions, 0) / impressions
    : rows.reduce((a, r) => a + r.position, 0) / rows.length;
  return {
    clicks, impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: Number(weightedPos.toFixed(2)),
  };
}

function pctChange(before: number, after: number): number | null {
  if (!before) return null;
  return Number((((after) - before) / before * 100).toFixed(2));
}

function classifyOutcome(before: AggOut, after: AggOut): { outcome: string; confidence: string } {
  const clicksChange = pctChange(before.clicks, after.clicks) ?? 0;
  const positionChange = (before.position !== null && after.position !== null)
    ? (after.position - before.position) : 0;
  let improved = 0, worsened = 0;
  if (clicksChange >= IMPROVED_CLICKS_THRESHOLD) improved++;
  if (clicksChange <= WORSENED_CLICKS_THRESHOLD) worsened++;
  if (positionChange <= IMPROVED_POSITION_THRESHOLD) improved++;
  if (positionChange >= WORSENED_POSITION_THRESHOLD) worsened++;

  if (improved >= 1 && worsened === 0) return { outcome: "improved", confidence: improved === 2 ? "high" : "medium" };
  if (worsened >= 1 && improved === 0) return { outcome: "worsened", confidence: worsened === 2 ? "high" : "medium" };
  if (improved === 1 && worsened === 1) return { outcome: "inconclusive", confidence: "low" };
  return { outcome: "unchanged", confidence: "medium" };
}

async function enqueueWorsenedAlert(args: { opp: Record<string, unknown>; metrics: Record<string, unknown>; clientName: string }): Promise<void> {
  const fallback = Deno.env.get("SLACK_FALLBACK_CHANNEL") ?? "";
  if (!fallback) return;
  const payload = buildReevalOutcomeAlert({
    clientName: args.clientName,
    articleTitle: (args.opp.article_title as string) ?? "(sin título)",
    articleUrl: args.opp.article_url as string,
    outcome: "worsened",
    metrics: args.metrics as never,
  });
  const dedupe = `seo_optimizer:reeval_worsened:${args.opp.id}:v1`;
  await getSupabase().from("notifications_outbox").upsert({
    source: "seo_optimizer", target_type: "slack_channel",
    channel_id: fallback, payload, dedupe_key: dedupe, status: "pending",
  }, { onConflict: "dedupe_key" });
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
