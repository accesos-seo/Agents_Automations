export type AnalysisRequestStatus =
  | 'queued' | 'ready_for_dispatch' | 'dispatched' | 'running'
  | 'complete' | 'partial' | 'error';

export interface AnalysisRequest {
  id: string;
  target_url: string;
  client_name: string | null;
  country: string;
  mode: string;
  protocol: string;
  snapshot_date: string;
  row_limit: number;
  request_status: AnalysisRequestStatus;
  orchestration_id: string | null;
  last_dispatch_error: string | null;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  dispatched_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface SiteOverview {
  id: string;
  run_id: string;
  client_id: string;
  domain: string;
  domain_rating: number | null;
  ahrefs_rank: number | null;
  organic_traffic: number | null;
  organic_keywords: number | null;
  backlinks_total: number | null;
  referring_domains: number | null;
  traffic_value: number | null;
  url_rating: number | null;
  captured_at: string;
}

export interface HistoricalComparison {
  id: string;
  client_id: string;
  domain: string;
  comparison_status: string;
  summary: Record<string, unknown> | null;
  error_message: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface DiagnosticReport {
  id: string;
  run_id: string;
  client_id: string;
  domain: string;
  diagnosis_status: string;
  overall_risk_level: string | null;
  risk_score: number | null;
  opportunity_score: number | null;
  findings_count: number | null;
}

export interface AgentFinding {
  id: string;
  run_id: string;
  client_id: string;
  agent_name: string;
  finding_type: string;
  title: string;
  description: string;
  impact_score: number | null;
  effort_score: number | null;
  priority_rank: number | null;
  finding_status: string;
}

export interface RecoveryPlan {
  id: string;
  run_id: string;
  client_id: string;
  phase: string;
  action_title: string;
  action_description: string;
  responsible: string | null;
  estimated_impact: string | null;
  priority_rank: number | null;
}

export interface Report {
  id: string;
  run_id: string;
  client_id: string;
  domain: string;
  report_type: string;
  report_status: string;
  output_format: string;
  generated_by_agent: string | null;
  generated_at: string | null;
}

export interface ReportSection {
  id: string;
  report_id: string;
  section_key: string;
  section_title: string;
  section_order: number;
  section_status: string;
  body_markdown: string | null;
}

export interface Client {
  id: string;
  domain: string;
  client_name: string | null;
  country: string;
  created_at: string;
}

export type StageState = 'pending' | 'running' | 'done' | 'error';

export interface Stage {
  key: string;
  label: string;
  state: StageState;
  detail?: string;
  errorMessage?: string;
}
