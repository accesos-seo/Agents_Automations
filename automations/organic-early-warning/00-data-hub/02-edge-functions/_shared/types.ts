export type IsoWeek = `${number}-W${number}`;
export type PeriodMonth = `${number}-${number}`;
export type IngestionStatus = "running" | "completed" | "failed";
export type IngestionSource = "gsc" | "ga4" | "cwv" | "ahrefs" | "crawl";

export interface BrandRow {
  id: string;
  name: string;
  gsc_property_url: string | null;
  ga4_property_id: string | null;
  ahrefs_domain: string | null;
  country_iso: string | null;
  status: "active" | "paused" | "archived";
}

export interface IngestionRunRow {
  id: string;
  source: IngestionSource;
  brand_id: string | null;
  iso_week: string | null;
  period_month: string | null;
  period_start: string | null;
  period_end: string | null;
  status: IngestionStatus;
  rows_inserted: number;
  rows_updated: number;
  credits_used: number;
  error_message: string | null;
  payload: Record<string, unknown> | null;
}

export interface ErrorBody {
  ok: false;
  error: string;
}

export interface HubWeeklyRequest {
  trigger: "cron" | "manual";
  brand_id?: string;
  iso_week?: IsoWeek;
}

export interface HubMonthlyRequest {
  trigger: "cron" | "manual";
  brand_id?: string;
  period_month?: PeriodMonth;
}

export interface CrawlLoaderRequest {
  brand_id: string;
  crawl_date: string;
  format: "csv" | "xml";
  export_url_or_base64: string;
}

export interface CwvWeeklyRequest extends HubWeeklyRequest {
  top_n_urls?: number;
}

export interface ServiceAccountJson {
  client_email: string;
  private_key: string;
}

export interface CwvMetrics {
  source: "crux" | "psi_lab";
  lcp_p75_ms: number | null;
  inp_p75_ms: number | null;
  cls_p75: number | null;
  fcp_p75_ms: number | null;
  ttfb_p75_ms: number | null;
  sample_size: number | null;
}
