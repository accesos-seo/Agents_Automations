// seo-optimizer-article-ingestor
// Fetches live HTML for URLs with traffic; falls back to content_items.article_content.

import { verifySecret } from "../_shared/secret.ts";
import { getContentItemByUrl } from "../_shared/orbit.ts";
import { parseHtml } from "../_shared/html-utils.ts";
import { emitEvent } from "../_shared/run-events.ts";
import { sbSchema } from "../_shared/supabase.ts";

const USER_AGENT = "Mozilla/5.0 (compatible; SeoOptimizerBot/1.0; +https://orbit.example.com/bot)";
const FETCH_TIMEOUT_MS = 10_000;
const MIN_HTML_LEN = 500;
const MIN_IMPRESSIONS = 50;

interface Payload {
  run_id: string;
  client_id: string;
  max_urls?: number;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const authErr = verifySecret(req);
  if (authErr) return authErr;

  const payload: Payload = await req.json();
  const { run_id, client_id } = payload;
  const maxUrls = payload.max_urls ?? 200;

  // 1. Discover URLs
  const { data: rows, error } = await sbSchema("seo_optimizer")
    .from("gsc_url_query_metrics")
    .select("url, impressions")
    .eq("run_id", run_id)
    .eq("client_id", client_id);

  if (error) {
    return Response.json({ status: "failed", error: error.message }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    await emitEvent({ runId: run_id, clientId: client_id, eventSource: "article_ingestor",
      eventType: "warning", errorMessage: "no gsc metrics for this run+client" });
    return Response.json({ status: "ok", snapshots_inserted: 0, live: 0, fallback: 0, failed: 0 });
  }

  // Aggregate impressions per URL
  const byUrl = new Map<string, number>();
  for (const r of rows) {
    const u = r.url as string;
    byUrl.set(u, (byUrl.get(u) ?? 0) + ((r.impressions as number) ?? 0));
  }
  const candidates = Array.from(byUrl.entries())
    .filter(([, imps]) => imps >= MIN_IMPRESSIONS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxUrls);

  await emitEvent({ runId: run_id, clientId: client_id, eventSource: "article_ingestor",
    eventType: "agent_started",
    payload: { urls_to_snapshot: candidates.length, min_impressions: MIN_IMPRESSIONS } });

  let live = 0, fallback = 0, failed = 0;
  const snapshots: Array<Record<string, unknown>> = [];

  for (const [url] of candidates) {
    const result = await fetchOrFallback(client_id, url);
    if (result.source === "live") live++;
    else if (result.source === "content_items") fallback++;
    else failed++;

    const ci = await getContentItemByUrl(client_id, url);
    const parsed = parseHtml(result.html ?? "");
    snapshots.push({
      run_id, client_id,
      content_item_id: ci?.contentItemId ?? null,
      content_item_version: ci?.version ?? null,
      url, source: result.source, html: result.html ?? null,
      title_tag: parsed.titleTag,
      meta_description: parsed.metaDescription,
      h1: parsed.h1,
      headings: parsed.headings,
      word_count: parsed.wordCount,
      error_message: result.error ?? null,
    });
  }

  const { error: upErr } = await sbSchema("seo_optimizer").from("article_snapshots").upsert(snapshots, {
    onConflict: "run_id,client_id,url",
  });
  if (upErr) {
    await emitEvent({ runId: run_id, clientId: client_id, eventSource: "article_ingestor",
      eventType: "agent_failed", errorMessage: `upsert: ${upErr.message}` });
    return Response.json({ status: "failed", reason: "upsert_failed", error: upErr.message });
  }

  const result = { status: "ok", snapshots_inserted: snapshots.length, live, fallback, failed };
  await emitEvent({ runId: run_id, clientId: client_id, eventSource: "article_ingestor",
    eventType: "agent_completed", payload: result });
  return Response.json(result);
});

async function fetchOrFallback(clientId: string, url: string): Promise<{ source: string; html?: string; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const resp = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (resp.ok) {
      const html = await resp.text();
      if (html.length >= MIN_HTML_LEN) {
        return { source: "live", html };
      }
    }
  } catch (err) {
    // fall through to fallback
    const ci = await getContentItemByUrl(clientId, url);
    if (ci?.articleContent) return { source: "content_items", html: ci.articleContent, error: `live failed: ${err}` };
    return { source: "fallback_failed", error: `live failed: ${err}; no content_items body` };
  }
  // live returned non-200 or too short
  const ci = await getContentItemByUrl(clientId, url);
  if (ci?.articleContent) return { source: "content_items", html: ci.articleContent };
  return { source: "fallback_failed", error: "live small/non-200; no content_items body" };
}
