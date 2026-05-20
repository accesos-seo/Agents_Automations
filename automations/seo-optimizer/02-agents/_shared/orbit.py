"""Orbit data access — wrappers around public.clientes, public.content_items,
public.article_analysis_index, and seo_optimizer.client_config.

Why this module: Orbit's schema doesn't have everything we need natively:
  - public.clientes columns: id, name, created_at, language, onboarding_manual_tasks
    (NO gsc_property_url, NO status / active flag)
  - We added seo_optimizer.client_config for per-client config + opt-in
  - We read seo_optimizer.v_active_clients which JOINs clientes + client_config
    + proyectos_seo.dominioprincipal (for diagnostics)

If Orbit ever adds these columns natively, simplify by updating this file.
"""
from __future__ import annotations

from dataclasses import dataclass

import structlog

from _shared.supabase_client import sb


log = structlog.get_logger()


@dataclass
class OrbitClient:
    """Active client with all info needed by agents."""
    id: str
    name: str
    gsc_property_url: str
    language: str | None
    slack_channel_id: str | None
    seo_specialist_user_id: str | None
    redactor_user_id: str | None
    orbit_main_domain: str | None


@dataclass
class ContentItemForAnalysis:
    """A content item joined with its analysis index row."""
    content_item_id: str
    client_id: str
    title: str
    slug: str | None
    final_published_url: str | None
    language: str | None
    country: str | None
    main_keyword: str
    secondary_keywords: list[str]
    article_content: str | None
    meta_description: str | None
    version: int | None
    is_latest_version: bool | None
    # From article_analysis_index (LLM-enriched)
    search_intent: str | None
    customer_journey_stage: str | None
    cluster_key: str | None
    content_role: str | None
    main_entities: list | dict | None
    semantic_fingerprint: str | None
    primary_keyword: str | None


# ---------------------------------------------------------------------------
# CLIENTS — via seo_optimizer.v_active_clients
# ---------------------------------------------------------------------------

def list_active_clients(client_ids: list[str] | None = None) -> list[OrbitClient]:
    """Return all clients with seo_optimizer.client_config.is_active = TRUE.

    If client_ids is provided, returns only those (filtered to active ones).
    Reads from view v_active_clients which joins client_config + clientes + proyectos_seo.
    """
    q = sb.schema("seo_optimizer").table("v_active_clients").select("*")
    if client_ids:
        q = q.in_("client_id", client_ids)

    try:
        resp = q.execute()
    except Exception as exc:  # noqa: BLE001
        log.error("v_active_clients_failed", error=str(exc))
        return []

    out: list[OrbitClient] = []
    for r in (resp.data or []):
        out.append(OrbitClient(
            id=r["client_id"],
            name=r.get("client_name") or "(sin nombre)",
            gsc_property_url=r.get("gsc_property_url") or "",
            language=r.get("language"),
            slack_channel_id=r.get("slack_channel_id"),
            seo_specialist_user_id=r.get("seo_specialist_user_id"),
            redactor_user_id=r.get("redactor_user_id"),
            orbit_main_domain=r.get("orbit_main_domain"),
        ))
    return out


def get_client(client_id: str) -> OrbitClient | None:
    """Get one active client by id."""
    try:
        resp = (
            sb.schema("seo_optimizer")
            .table("v_active_clients")
            .select("*")
            .eq("client_id", client_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:  # noqa: BLE001
        log.error("v_active_clients_get_failed", client_id=client_id, error=str(exc))
        return None

    rows = resp.data or []
    if not rows:
        return None
    r = rows[0]
    return OrbitClient(
        id=r["client_id"],
        name=r.get("client_name") or "(sin nombre)",
        gsc_property_url=r.get("gsc_property_url") or "",
        language=r.get("language"),
        slack_channel_id=r.get("slack_channel_id"),
        seo_specialist_user_id=r.get("seo_specialist_user_id"),
        redactor_user_id=r.get("redactor_user_id"),
        orbit_main_domain=r.get("orbit_main_domain"),
    )


# ---------------------------------------------------------------------------
# CONTENT ITEMS + ANALYSIS INDEX
# ---------------------------------------------------------------------------

def list_published_articles_for_client(client_id: str) -> list[ContentItemForAnalysis]:
    """Return all published, latest-version articles for a client, joined with
    their analysis_index row (when present).
    """
    ci_resp = (
        sb.table("content_items")
        .select(
            "id, client_id, title, slug, final_published_url, language, country, "
            "main_keyword, secondary_keywords, article_content, meta_description, "
            "version, is_latest_version"
        )
        .eq("client_id", client_id)
        .eq("is_latest_version", True)
        .not_.is_("final_published_url", "null")
        .execute()
    )
    items = ci_resp.data or []
    if not items:
        return []

    item_ids = [it["id"] for it in items]
    idx_resp = (
        sb.table("article_analysis_index")
        .select(
            "content_item_id, search_intent, customer_journey_stage, cluster_key, "
            "content_role, main_entities, semantic_fingerprint, primary_keyword"
        )
        .in_("content_item_id", item_ids)
        .execute()
    )
    idx_by_id = {r["content_item_id"]: r for r in (idx_resp.data or [])}

    out: list[ContentItemForAnalysis] = []
    for it in items:
        idx = idx_by_id.get(it["id"], {})
        out.append(ContentItemForAnalysis(
            content_item_id=it["id"],
            client_id=it["client_id"],
            title=it.get("title", "") or "",
            slug=it.get("slug"),
            final_published_url=it.get("final_published_url"),
            language=it.get("language"),
            country=it.get("country"),
            main_keyword=it.get("main_keyword", "") or "",
            secondary_keywords=it.get("secondary_keywords") or [],
            article_content=it.get("article_content"),
            meta_description=it.get("meta_description"),
            version=it.get("version"),
            is_latest_version=it.get("is_latest_version"),
            search_intent=idx.get("search_intent"),
            customer_journey_stage=idx.get("customer_journey_stage"),
            cluster_key=idx.get("cluster_key"),
            content_role=idx.get("content_role"),
            main_entities=idx.get("main_entities"),
            semantic_fingerprint=idx.get("semantic_fingerprint"),
            primary_keyword=idx.get("primary_keyword"),
        ))
    return out


def get_content_item_by_url(client_id: str, url: str) -> ContentItemForAnalysis | None:
    """Find a published content_item for a client matching the given URL."""
    resp = (
        sb.table("content_items")
        .select(
            "id, client_id, title, slug, final_published_url, language, country, "
            "main_keyword, secondary_keywords, article_content, meta_description, "
            "version, is_latest_version"
        )
        .eq("client_id", client_id)
        .eq("final_published_url", url)
        .eq("is_latest_version", True)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return None
    it = rows[0]
    return ContentItemForAnalysis(
        content_item_id=it["id"],
        client_id=it["client_id"],
        title=it.get("title", "") or "",
        slug=it.get("slug"),
        final_published_url=it.get("final_published_url"),
        language=it.get("language"),
        country=it.get("country"),
        main_keyword=it.get("main_keyword", "") or "",
        secondary_keywords=it.get("secondary_keywords") or [],
        article_content=it.get("article_content"),
        meta_description=it.get("meta_description"),
        version=it.get("version"),
        is_latest_version=it.get("is_latest_version"),
        search_intent=None,
        customer_journey_stage=None,
        cluster_key=None,
        content_role=None,
        main_entities=None,
        semantic_fingerprint=None,
        primary_keyword=None,
    )
