// Shared types for the analyst — categories, candidates, contexts.

import type { GscRow } from "../_shared/gsc-api.ts";
import type { ParsedArticle } from "../_shared/html-utils.ts";
import type { ContentItemForAnalysis } from "../_shared/orbit.ts";

export type Category =
  | "decay" | "striking_distance" | "low_ctr"
  | "semantic_coverage" | "cannibalization" | "intent_mismatch";

export type Confidence = "high" | "medium" | "low";
export type Effort = "low" | "medium" | "high";

export interface ArticleSnapshot {
  url: string;
  contentItemId: string | null;
  source: string;        // 'live' | 'content_items' | 'fallback_failed'
  parsed: ParsedArticle;
}

export interface ClientAnalysisContext {
  runId: string;
  clientId: string;
  clientName: string;
  gscRows: GscRow[];
  snapshotsByUrl: Map<string, ArticleSnapshot>;
  contentItems: ContentItemForAnalysis[];
  contentItemByUrl: Map<string, ContentItemForAnalysis>;
}

export interface OpportunityCandidate {
  category: Category;
  articleUrl: string;
  articleTitle: string;
  articleLanguage: string | null;
  contentItemId: string | null;
  evidence: Record<string, unknown>;
  recommendationSummary: string;
  recommendationDetails: Record<string, unknown>;
  trafficPotential: number;
  confidence: Confidence;
  effortLevel: Effort;
  dedupeSignature: string;
  score?: number;
  dedupeKey?: string;
}
