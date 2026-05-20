"""Pure scoring functions for opportunity prioritization.

No DB, no LLM, no I/O — all inputs explicit. This makes the entire scoring
layer trivially testable. Tests live in 03-tests/test_scoring.py.

Categories share these primitives:
  - ctr_benchmark_for_position: expected CTR by SERP position
  - traffic_potential_clicks: projected monthly clicks if we improve
  - final_score: combines traffic_potential × confidence × effort discount
"""
from __future__ import annotations

from typing import Literal


# ---------------------------------------------------------------------------
# CTR benchmarks
# ---------------------------------------------------------------------------
# Source: industry-standard curve (Sistrix-like, blended desktop+mobile).
# Adjust if the brand's segment has clearly different behavior.
# These are FRACTIONS, not percentages.

_CTR_CURVE: dict[int, float] = {
    1: 0.40,
    2: 0.20,
    3: 0.13,
    4: 0.09,
    5: 0.07,
    6: 0.05,
    7: 0.04,
    8: 0.03,
    9: 0.025,
    10: 0.02,
}


def ctr_benchmark_for_position(position: float) -> float:
    """Expected CTR for a given average SERP position.

    Interpolates linearly between integer positions. Above 10, decays slowly.
    Returns a fraction in [0.0, 1.0].
    """
    if position <= 1:
        return _CTR_CURVE[1]
    if position >= 11:
        # Beyond top-10: roughly 1% then decays to 0.1% at position 30+
        if position >= 30:
            return 0.001
        # linear from (11, 0.01) to (30, 0.001)
        return 0.01 - ((position - 11) / 19) * (0.01 - 0.001)

    low = int(position)
    high = low + 1
    if high > 10:
        return _CTR_CURVE[10]
    frac = position - low
    return _CTR_CURVE[low] * (1 - frac) + _CTR_CURVE[high] * frac


# ---------------------------------------------------------------------------
# Traffic potential estimation
# ---------------------------------------------------------------------------

def traffic_potential_clicks(
    *,
    impressions_monthly: float,
    current_position: float,
    target_position: float,
) -> float:
    """Projected additional monthly clicks if we move from current to target position.

    Returns max(0, projected_clicks_at_target - projected_clicks_at_current).
    """
    current_ctr = ctr_benchmark_for_position(current_position)
    target_ctr = ctr_benchmark_for_position(target_position)
    delta_ctr = max(0.0, target_ctr - current_ctr)
    return impressions_monthly * delta_ctr


def traffic_potential_from_low_ctr(
    *,
    impressions_monthly: float,
    actual_ctr: float,
    position: float,
) -> float:
    """For low_ctr category: how many clicks we'd capture by matching benchmark CTR
    at the same position. Independent of position change.
    """
    expected_ctr = ctr_benchmark_for_position(position)
    delta_ctr = max(0.0, expected_ctr - actual_ctr)
    return impressions_monthly * delta_ctr


# ---------------------------------------------------------------------------
# Score combination
# ---------------------------------------------------------------------------

ConfidenceLevel = Literal["high", "medium", "low"]
EffortLevel = Literal["low", "medium", "high"]

_CONFIDENCE_WEIGHT: dict[ConfidenceLevel, float] = {
    "high": 1.0,
    "medium": 0.7,
    "low": 0.4,
}

_EFFORT_DISCOUNT: dict[EffortLevel, float] = {
    "low": 1.0,
    "medium": 0.7,
    "high": 0.4,
}


def final_score(
    *,
    traffic_potential: float,
    confidence: ConfidenceLevel,
    effort: EffortLevel,
) -> float:
    """Compose the final priority score for an opportunity.

    Higher = more important. Used by topn_selector to rank.

    Examples:
      - High traffic × high confidence × low effort → score is high
      - High traffic × low confidence × high effort → score is heavily penalized
    """
    return (
        traffic_potential
        * _CONFIDENCE_WEIGHT[confidence]
        * _EFFORT_DISCOUNT[effort]
    )


# ---------------------------------------------------------------------------
# Dedupe key
# ---------------------------------------------------------------------------

import hashlib

def make_dedupe_key(
    *,
    client_id: str,
    content_item_id: str | None,
    category: str,
    evidence_signature: str,
) -> str:
    """Build the stable dedupe_key for cross-run rejection memory.

    Format: {client_id}:{content_item_id or 'null'}:{category}:{hash of evidence_signature}

    evidence_signature is a category-specific string. Examples:
      - decay: the URL  (one decay opp per URL per cycle)
      - striking_distance: URL + ":" + primary query
      - low_ctr: URL + ":" + primary query
      - semantic_coverage: URL + ":" + ",".join(sorted(missing_queries))
      - cannibalization: ":".join(sorted(competing_urls))
      - intent_mismatch: URL
    """
    h = hashlib.sha256(evidence_signature.encode("utf-8")).hexdigest()[:16]
    ci = content_item_id or "null"
    return f"{client_id}:{ci}:{category}:{h}"
