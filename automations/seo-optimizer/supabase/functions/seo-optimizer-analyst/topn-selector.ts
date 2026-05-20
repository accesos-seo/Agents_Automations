// topn-selector.ts — score + dedup + rejection filter + top-N selection.

import { finalScore, makeDedupeKey } from "../_shared/scoring.ts";
import { sbSchema } from "../_shared/supabase.ts";
import type { OpportunityCandidate } from "./types.ts";

const TOP_N_PER_CLIENT = 10;
const MAX_OPPS_PER_ARTICLE = 2;
const OBSERVATION_WINDOW_DAYS = 45;

export async function selectTopN(
  clientId: string,
  candidates: OpportunityCandidate[],
  topN: number = TOP_N_PER_CLIENT,
): Promise<OpportunityCandidate[]> {
  // 1. score + dedupe_key
  for (const c of candidates) {
    c.dedupeKey = await makeDedupeKey({
      clientId,
      contentItemId: c.contentItemId,
      category: c.category,
      evidenceSignature: c.dedupeSignature,
    });
    c.score = finalScore({
      trafficPotential: c.trafficPotential,
      confidence: c.confidence,
      effort: c.effortLevel,
    });
  }

  // 2. Filter active rejections
  const rejectedKeys = await fetchActiveRejectionKeys(clientId);
  let filtered = candidates.filter(c => !rejectedKeys.has(c.dedupeKey!));

  // 3. Filter recently implemented
  const recentlyImplemented = await fetchRecentlyImplementedContentItems(clientId, OBSERVATION_WINDOW_DAYS);
  filtered = filtered.filter(c => !c.contentItemId || !recentlyImplemented.has(c.contentItemId));

  // 4. Sort + select with max-2-per-article rule
  filtered.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const selected: OpportunityCandidate[] = [];
  const perArticle = new Map<string, number>();
  for (const c of filtered) {
    if (selected.length >= topN) break;
    const key = c.contentItemId ?? "";
    if (key && (perArticle.get(key) ?? 0) >= MAX_OPPS_PER_ARTICLE) continue;
    selected.push(c);
    if (key) perArticle.set(key, (perArticle.get(key) ?? 0) + 1);
  }
  return selected;
}

async function fetchActiveRejectionKeys(clientId: string): Promise<Set<string>> {
  const { data, error } = await sbSchema("seo_optimizer")
    .from("rejection_log")
    .select("dedupe_key")
    .eq("client_id", clientId)
    .eq("reopened", false);
  if (error) return new Set();
  return new Set((data ?? []).map((r: Record<string, unknown>) => r.dedupe_key as string));
}

async function fetchRecentlyImplementedContentItems(clientId: string, days: number): Promise<Set<string>> {
  const { data, error } = await sbSchema("seo_optimizer")
    .from("opportunities")
    .select("content_item_id, implemented_at, status")
    .eq("client_id", clientId)
    .in("status", ["implemented", "observing"]);
  if (error || !data) return new Set();
  const cutoff = Date.now() - days * 86_400_000;
  const out = new Set<string>();
  for (const r of data) {
    if (!r.content_item_id || !r.implemented_at) continue;
    const impl = new Date(r.implemented_at as string).getTime();
    if (impl >= cutoff) out.add(r.content_item_id as string);
  }
  return out;
}
