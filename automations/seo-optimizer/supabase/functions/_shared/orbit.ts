// _shared/orbit.ts
// Wrappers tipados sobre las tablas de Orbit (public.clientes, content_items,
// article_analysis_index) y nuestra seo_optimizer.client_config / v_active_clients.

import { getSupabase, sbSchema } from "./supabase.ts";

export interface OrbitClient {
  id: string;
  name: string;
  gscPropertyUrl: string;
  language: string | null;
  slackChannelId: string | null;
  seoSpecialistUserId: string | null;
  redactorUserId: string | null;
  orbitMainDomain: string | null;
}

export interface ContentItemForAnalysis {
  contentItemId: string;
  clientId: string;
  title: string;
  slug: string | null;
  finalPublishedUrl: string | null;
  language: string | null;
  country: string | null;
  mainKeyword: string;
  secondaryKeywords: string[];
  articleContent: string | null;
  metaDescription: string | null;
  version: number | null;
  isLatestVersion: boolean | null;
  searchIntent: string | null;
  customerJourneyStage: string | null;
  clusterKey: string | null;
  contentRole: string | null;
  mainEntities: unknown;
  semanticFingerprint: string | null;
  primaryKeyword: string | null;
}

export async function listActiveClients(clientIds?: string[] | null): Promise<OrbitClient[]> {
  let q = sbSchema("seo_optimizer").from("v_active_clients").select("*");
  if (clientIds && clientIds.length > 0) q = q.in("client_id", clientIds);
  const { data, error } = await q;
  if (error) {
    console.error("[orbit] listActiveClients failed:", error.message);
    return [];
  }
  return (data ?? []).map(rowToClient);
}

export async function getClient(clientId: string): Promise<OrbitClient | null> {
  const { data, error } = await sbSchema("seo_optimizer")
    .from("v_active_clients").select("*").eq("client_id", clientId).limit(1);
  if (error) {
    console.error("[orbit] getClient failed:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;
  return rowToClient(data[0]);
}

function rowToClient(r: Record<string, unknown>): OrbitClient {
  return {
    id: r.client_id as string,
    name: (r.client_name as string) ?? "(sin nombre)",
    gscPropertyUrl: (r.gsc_property_url as string) ?? "",
    language: (r.language as string) ?? null,
    slackChannelId: (r.slack_channel_id as string) ?? null,
    seoSpecialistUserId: (r.seo_specialist_user_id as string) ?? null,
    redactorUserId: (r.redactor_user_id as string) ?? null,
    orbitMainDomain: (r.orbit_main_domain as string) ?? null,
  };
}

export async function listPublishedArticlesForClient(clientId: string): Promise<ContentItemForAnalysis[]> {
  const sb = getSupabase();
  const { data: items, error: ciErr } = await sb.from("content_items").select(
    "id, client_id, title, slug, final_published_url, language, country, " +
    "main_keyword, secondary_keywords, article_content, meta_description, " +
    "version, is_latest_version",
  )
    .eq("client_id", clientId)
    .eq("is_latest_version", true)
    .not("final_published_url", "is", null);

  if (ciErr || !items || items.length === 0) {
    if (ciErr) console.warn("[orbit] content_items query failed:", ciErr.message);
    return [];
  }

  const ids = items.map((it: Record<string, unknown>) => it.id as string);
  const { data: idx } = await sb.from("article_analysis_index").select(
    "content_item_id, search_intent, customer_journey_stage, cluster_key, " +
    "content_role, main_entities, semantic_fingerprint, primary_keyword",
  ).in("content_item_id", ids);

  const idxMap = new Map<string, Record<string, unknown>>();
  for (const r of (idx ?? [])) idxMap.set(r.content_item_id as string, r);

  return items.map((it: Record<string, unknown>) => {
    const i = idxMap.get(it.id as string) ?? {};
    return {
      contentItemId: it.id as string,
      clientId: it.client_id as string,
      title: (it.title as string) ?? "",
      slug: (it.slug as string) ?? null,
      finalPublishedUrl: (it.final_published_url as string) ?? null,
      language: (it.language as string) ?? null,
      country: (it.country as string) ?? null,
      mainKeyword: (it.main_keyword as string) ?? "",
      secondaryKeywords: (it.secondary_keywords as string[]) ?? [],
      articleContent: (it.article_content as string) ?? null,
      metaDescription: (it.meta_description as string) ?? null,
      version: (it.version as number) ?? null,
      isLatestVersion: (it.is_latest_version as boolean) ?? null,
      searchIntent: (i.search_intent as string) ?? null,
      customerJourneyStage: (i.customer_journey_stage as string) ?? null,
      clusterKey: (i.cluster_key as string) ?? null,
      contentRole: (i.content_role as string) ?? null,
      mainEntities: i.main_entities ?? null,
      semanticFingerprint: (i.semantic_fingerprint as string) ?? null,
      primaryKeyword: (i.primary_keyword as string) ?? null,
    };
  });
}

export async function getContentItemByUrl(clientId: string, url: string): Promise<ContentItemForAnalysis | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from("content_items").select(
    "id, client_id, title, slug, final_published_url, language, country, " +
    "main_keyword, secondary_keywords, article_content, meta_description, " +
    "version, is_latest_version",
  )
    .eq("client_id", clientId)
    .eq("final_published_url", url)
    .eq("is_latest_version", true)
    .limit(1);

  if (error || !data || data.length === 0) return null;
  const it = data[0];
  return {
    contentItemId: it.id as string,
    clientId: it.client_id as string,
    title: (it.title as string) ?? "",
    slug: (it.slug as string) ?? null,
    finalPublishedUrl: (it.final_published_url as string) ?? null,
    language: (it.language as string) ?? null,
    country: (it.country as string) ?? null,
    mainKeyword: (it.main_keyword as string) ?? "",
    secondaryKeywords: (it.secondary_keywords as string[]) ?? [],
    articleContent: (it.article_content as string) ?? null,
    metaDescription: (it.meta_description as string) ?? null,
    version: (it.version as number) ?? null,
    isLatestVersion: (it.is_latest_version as boolean) ?? null,
    searchIntent: null, customerJourneyStage: null, clusterKey: null,
    contentRole: null, mainEntities: null, semanticFingerprint: null, primaryKeyword: null,
  };
}
