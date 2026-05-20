export type IsoWeek = string;
export type PeriodMonth = string;
export type Severity = "WATCH" | "YELLOW" | "RED";
export type SignalKind = "leading" | "lagging" | "mixed";
export type Cadence = "weekly" | "monthly";

export interface ErrorBody {
  ok: false;
  error: string;
}

export interface SignalDefinitionRow {
  id: string;
  code: string;
  kind: SignalKind;
  name: string;
  description: string | null;
  source_hub_table: string | null;
  cadence: Cadence;
  weight: number;
  enabled: boolean;
  warmup_min_samples: number;
  config: Record<string, unknown>;
}

export interface BaselineRow {
  id: string;
  brand_id: string;
  signal_id: string;
  segment_hash: string;
  iso_week_of_year: number;
  median: number | null;
  mad: number | null;
  mean: number | null;
  std: number | null;
  trend_slope: number | null;
  n_samples: number;
  is_warm_up: boolean;
  last_recomputed: string;
  payload: Record<string, unknown>;
}

export interface SignalEventRow {
  id: string;
  run_id: string;
  brand_id: string;
  signal_id: string;
  segment_hash: string;
  period_start: string | null;
  period_end: string | null;
  metric_actual: number | null;
  metric_expected: number | null;
  deviation_sigma: number | null;
  severity_hint: Severity | null;
  confidence: number | null;
  incident_id: string | null;
  false_positive: boolean;
  false_positive_reason: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface IncidentRow {
  id: string;
  run_id: string;
  brand_id: string;
  severity: Severity;
  signal_count: number;
  signal_event_ids: string[];
  window_start: string | null;
  window_end: string | null;
  url_overlap_pct: number | null;
  status: "open" | "resolved";
  dispatch_status: string;
  false_positive: boolean;
  first_seen_at: string;
  last_updated_at: string;
  resolved_at: string | null;
  payload: Record<string, unknown>;
}

export interface BrandRoutingRow {
  id: string;
  brand_id: string;
  slack_channel_id: string | null;
  team_lead_user_id: string | null;
  severity_threshold: Severity;
  seasonality_type: "b2b_weekday" | "strong_yoy" | null;
  k_factor_override: number | null;
  expected_holiday_drop_pct: number;
  country_iso: string | null;
  cwv_force_psi: boolean;
  active: boolean;
}

export interface BrandHubRow {
  id: string;
  name: string;
  gsc_property_url: string | null;
  ga4_property_id: string | null;
  ahrefs_domain: string | null;
  country_iso: string | null;
  status: "active" | "paused" | "archived";
}

export type SegmentDims = {
  branded: "branded" | "non_branded" | "unknown";
  device: "mobile" | "desktop" | "tablet" | "unknown";
  country: string;
  page_type: string;
};

export interface SignalEventDraft {
  brand_id: string;
  signal_id: string;
  segment_hash: string;
  period_start: string | null;
  period_end: string | null;
  metric_actual: number | null;
  metric_expected: number | null;
  deviation_sigma: number | null;
  severity_hint: Severity;
  confidence: number;
  payload: Record<string, unknown>;
}
