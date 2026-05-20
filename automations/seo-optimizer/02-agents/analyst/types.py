"""Shared dataclasses for the analyst.

Each category function consumes a ClientAnalysisContext and produces a list of
OpportunityCandidate. The handler then runs topn_selector to pick the final Top N.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from _shared.gsc_api import GscRow
from _shared.html_utils import ParsedArticle
from _shared.orbit import ContentItemForAnalysis


Category = Literal[
    "decay",
    "striking_distance",
    "low_ctr",
    "semantic_coverage",
    "cannibalization",
    "intent_mismatch",
]

Confidence = Literal["high", "medium", "low"]
Effort = Literal["low", "medium", "high"]


@dataclass
class ArticleSnapshot:
    """One row from seo_optimizer.article_snapshots."""
    url: str
    content_item_id: str | None
    source: str   # 'live' | 'content_items' | 'fallback_failed'
    parsed: ParsedArticle


@dataclass
class ClientAnalysisContext:
    """Everything one category needs to analyze a client."""
    run_id: str
    client_id: str
    client_name: str

    # All GSC rows for this client (already filtered by run_id, client_id)
    gsc_rows: list[GscRow]

    # URL -> snapshot for articles that have an HTML snapshot in this run
    snapshots_by_url: dict[str, ArticleSnapshot]

    # All published content items for this client (with analysis_index data joined)
    content_items: list[ContentItemForAnalysis]

    # URL -> content_item (lookup for convenience)
    content_item_by_url: dict[str, ContentItemForAnalysis] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.content_item_by_url:
            self.content_item_by_url = {
                ci.final_published_url: ci
                for ci in self.content_items
                if ci.final_published_url
            }


@dataclass
class OpportunityCandidate:
    """One opportunity proposal from a category. Will go through topn_selector
    before becoming a row in seo_optimizer.opportunities.
    """
    category: Category
    article_url: str
    article_title: str
    article_language: str | None
    content_item_id: str | None
    # Evidence and recommendation
    evidence: dict
    recommendation_summary: str
    recommendation_details: dict
    # Scoring inputs
    traffic_potential: float
    confidence: Confidence
    effort_level: Effort
    # Dedupe key signature (will be hashed by topn_selector)
    dedupe_signature: str
    # Filled in by topn_selector:
    score: float = 0.0
    dedupe_key: str = ""
