// seo-optimizer-analyst — corre las 6 categorías + top-N selector por cliente.

import { verifySecret } from "../_shared/secret.ts";
import { getClient, listPublishedArticlesForClient } from "../_shared/orbit.ts";
import { parseHtml } from "../_shared/html-utils.ts";
import { emitEvent } from "../_shared/run-events.ts";
import { sbSchema } from "../_shared/supabase.ts";
import type { GscRow } from "../_shared/gsc-api.ts";
import type { ArticleSnapshot, ClientAnalysisContext, OpportunityCandidate } from "./types.ts";
import { selectTopN } from "./topn-selector.ts";

import { detect as detectDecay } from "./categories/decay.ts";
import { detect as detectStriking } from "./categories/striking-distance.ts";
import { detect as detectLowCtr } from "./categories/low-ctr.ts";
import { detect as detectSemantic } from "./categories/semantic-coverage.ts";
import { detect as detectCannibal } from "./categories/cannibalization.ts";
import { detect as detectIntent } from "./categories/intent-mismatch.ts";

const CATEGORIES = [
  { name: "decay", fn: detectDecay },
  { name: "striking_distance", fn: detectStriking },
  { name: "low_ctr", fn: detectLowCtr },
  { name: "semantic_coverage", fn: detectSemantic },
  { name: "cannibalization", fn: detectCannibal },
  { name: "intent_mismatch", fn: detectIntent },
] as const;

interface Payload {
  run_id: string;
  client_ids?: string[] | null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const authErr = verifySecret(req);
  if (authErr) return authErr;

  const payload: Payload = await req.json();
  const { run_id } = payload;
  if (!run_id) return Response.json({ status: "failed", reason: "missing run_id" }, { status: 400 });

  await emitEvent({ runId: run_id, eventSource: "analyst", eventType: "agent_started" });

  let clientIds = payload.client_ids;
  if (!clientIds || clientIds.length === 0) {
    clientIds = await listClientsInRun(run_id);
  }
  if (!clientIds || clientIds.length === 0) {
    await emitEvent({ runId: run_id, eventSource: "analyst", eventType: "warning",
      errorMessage: "no client data in run" });
    return Response.json({ status: "ok", clients_analyzed: 0, opportunities_inserted: 0 });
  }

  let totalInserted = 0;
  const byCategoryTotal: Record<string, number> = {};

  for (const cid of clientIds) {
    try {
      const { inserted, byCategory } = await analyzeClient(run_id, cid);
      totalInserted += inserted;
      for (const [k, v] of Object.entries(byCategory)) {
        byCategoryTotal[k] = (byCategoryTotal[k] ?? 0) + v;
      }
    } catch (err) {
      await emitEvent({ runId: run_id, clientId: cid, eventSource: "analyst",
        eventType: "agent_failed", errorMessage: String(err) });
    }
  }

  const result = { status: "ok", clients_analyzed: clientIds.length, opportunities_inserted: totalInserted, by_category: byCategoryTotal };
  await emitEvent({ runId: run_id, eventSource: "analyst", eventType: "agent_completed", payload: result });
  return Response.json(result);
});

async function listClientsInRun(runId: string): Promise<string[]> {
  const { data, error } = await sbSchema("seo_optimizer")
    .from("gsc_url_query_metrics").select("client_id").eq("run_id", runId);
  if (error || !data) return [];
  return Array.from(new Set(data.map((r: Record<string, unknown>) => r.client_id as string)));
}

async function analyzeClient(runId: string, clientId: string): Promise<{ inserted: number; byCategory: Record<string, number> }> {
  const client = await getClient(clientId);
  if (!client) return { inserted: 0, byCategory: {} };

  const gscRows = await loadGscRows(runId, clientId);
  if (gscRows.length === 0) {
    await emitEvent({ runId, clientId, eventSource: "analyst", eventType: "warning",
      errorMessage: "no gsc_rows for client" });
    return { inserted: 0, byCategory: {} };
  }

  const snapshotsByUrl = await loadSnapshots(runId, clientId);
  const contentItems = await listPublishedArticlesForClient(clientId);
  const contentItemByUrl = new Map(
    contentItems.filter(ci => ci.finalPublishedUrl).map(ci => [ci.finalPublishedUrl!, ci]),
  );

  const ctx: ClientAnalysisContext = {
    runId, clientId, clientName: client.name,
    gscRows, snapshotsByUrl, contentItems, contentItemByUrl,
  };

  const allCandidates: OpportunityCandidate[] = [];
  const byCat: Record<string, number> = {};
  for (const cat of CATEGORIES) {
    try {
      const cands = cat.fn(ctx);
      allCandidates.push(...cands);
      byCat[cat.name] = (byCat[cat.name] ?? 0) + cands.length;
    } catch (err) {
      await emitEvent({ runId, clientId, eventSource: "analyst", eventType: "warning",
        errorMessage: `${cat.name}: ${err}` });
    }
  }

  const selected = await selectTopN(clientId, allCandidates);
  if (selected.length === 0) return { inserted: 0, byCategory: byCat };

  const rows = selected.map((c, i) => ({
    run_id: runId, client_id: clientId,
    content_item_id: c.contentItemId,
    article_url: c.articleUrl,
    article_title: c.articleTitle || null,
    article_language: c.articleLanguage,
    category: c.category,
    score: Number((c.score ?? 0).toFixed(2)),
    rank_within_client: i + 1,
    traffic_potential_estimate: Number(c.trafficPotential.toFixed(2)),
    effort_level: c.effortLevel,
    confidence: c.confidence,
    evidence: c.evidence,
    recommendation_summary: c.recommendationSummary,
    recommendation_details: c.recommendationDetails,
    status: "pending",
    dedupe_key: c.dedupeKey!,
  }));

  const { data, error } = await sbSchema("seo_optimizer").from("opportunities").upsert(rows, {
    onConflict: "dedupe_key",
  }).select();
  if (error) {
    await emitEvent({ runId, clientId, eventSource: "analyst", eventType: "agent_failed",
      errorMessage: `opportunities upsert: ${error.message}` });
    return { inserted: 0, byCategory: {} };
  }

  const selByCat: Record<string, number> = {};
  for (const c of selected) selByCat[c.category] = (selByCat[c.category] ?? 0) + 1;

  await emitEvent({ runId, clientId, eventSource: "analyst", eventType: "opportunity_detected",
    payload: { selected: selected.length, by_category: selByCat } });

  return { inserted: data?.length ?? rows.length, byCategory: selByCat };
}

async function loadGscRows(runId: string, clientId: string): Promise<GscRow[]> {
  const { data, error } = await sbSchema("seo_optimizer").from("gsc_url_query_metrics").select(
    "url, query, country, device, clicks, impressions, ctr, position, clicks_prev, impressions_prev, ctr_prev, position_prev",
  ).eq("run_id", runId).eq("client_id", clientId);
  if (error || !data) return [];
  return data.map((r: Record<string, unknown>): GscRow => ({
    url: r.url as string,
    query: r.query as string,
    country: (r.country as string) ?? null,
    device: (r.device as string) ?? null,
    clicks: (r.clicks as number) ?? 0,
    impressions: (r.impressions as number) ?? 0,
    ctr: Number(r.ctr) || 0,
    position: Number(r.position) || 0,
    clicks_prev: (r.clicks_prev as number) ?? 0,
    impressions_prev: (r.impressions_prev as number) ?? 0,
    ctr_prev: Number(r.ctr_prev) || 0,
    position_prev: Number(r.position_prev) || 0,
  }));
}

async function loadSnapshots(runId: string, clientId: string): Promise<Map<string, ArticleSnapshot>> {
  const { data, error } = await sbSchema("seo_optimizer").from("article_snapshots").select(
    "url, content_item_id, source, html",
  ).eq("run_id", runId).eq("client_id", clientId);
  const out = new Map<string, ArticleSnapshot>();
  if (error || !data) return out;
  for (const r of data) {
    const parsed = parseHtml((r.html as string) ?? "");
    out.set(r.url as string, {
      url: r.url as string,
      contentItemId: (r.content_item_id as string) ?? null,
      source: r.source as string,
      parsed,
    });
  }
  return out;
}
