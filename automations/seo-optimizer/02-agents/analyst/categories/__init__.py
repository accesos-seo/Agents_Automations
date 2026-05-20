"""Six opportunity categories. Each is a pure function:
    detect(ctx: ClientAnalysisContext) -> list[OpportunityCandidate]
"""
from . import (
    cannibalization,
    decay,
    intent_mismatch,
    low_ctr,
    semantic_coverage,
    striking_distance,
)

ALL_CATEGORIES = [
    decay,
    striking_distance,
    low_ctr,
    semantic_coverage,
    cannibalization,
    intent_mismatch,
]
