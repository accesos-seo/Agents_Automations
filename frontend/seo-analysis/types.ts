// Tipos TypeScript para el esquema ahrefs_web_analysis
// Generado a mano para no acoplar al generador de tipos del cliente.
// Si usás supabase gen types, podés sustituir estos por los autogenerados.

export type AnalysisRequestStatus =
  | 'queued'
  | 'ready_for_dispatch'
  | 'dispatched'
  | 'running'
  | 'complete'
  | 'partial'
  | 'error';

export type OrchestrationStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'partial'
  | 'error';

export type ComparisonStatus = 'pending' | 'running' | 'complete' | 'error';
export type DiagnosisStatus = 'pending' | 'running' | 'final' | 'complete' | 'error';
export type ReportStatus = 'pending' | 'generating' | 'generated' | 'error';

export interface AnalysisRequest {
  id: string;
  target_url: string;
  client_name: string | null;
  country: string;
  mode: 'exact' | 'prefix' | 'domain' | 'subdomains';
  protocol: 'http' | 'https' | 'both';
  snapshot_date: string;
  row_limit: number;
  allow_partial: boolean;
  request_status: AnalysisRequestStatus;
  orchestration_id: string | null;
  dispatch_attempts: number;
  last_dispatch_error: string | null;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
  enqueued_at: string | null;
  dispatched_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineOrchestration {
  id: string;
  domain: string;
  target_url: string;
  client_name: string | null;
  country: string;
  orchestration_status: OrchestrationStatus;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  ingestion_results: unknown[] | null;
  comparison_result: Record<string, unknown> | null;
  diagnostic_result: Record<string, unknown> | null;
  recovery_plan_result: Record<string, unknown> | null;
}

export interface AnalysisRun {
  id: string;
  client_id: string;
  domain: string;
  status: string;
  agent_0_completed_at: string | null;
  agent_1_completed_at: string | null;
  agent_2_completed_at: string | null;
  agent_3a_completed_at: string | null;
  agent_3b_completed_at: string | null;
  agent_3c_completed_at: string | null;
  agent_4_completed_at: string | null;
  agent_5_completed_at: string | null;
  agent_6_completed_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
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
  baseline_run_id: string;
  current_run_id: string;
  comparison_status: ComparisonStatus;
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
  diagnosis_status: DiagnosisStatus;
  overall_risk_level: 'low' | 'medium' | 'high' | 'critical' | null;
  risk_score: number | null;
  opportunity_score: number | null;
  findings_count: number | null;
  summary: Record<string, unknown> | null;
  completed_at: string | null;
}

export interface AgentFinding {
  id: string;
  run_id: string;
  client_id: string;
  agent_name: string;
  finding_type: 'insight' | 'warning' | 'critical' | 'recommendation';
  title: string;
  description: string;
  impact_score: number | null;
  effort_score: number | null;
  priority_rank: number | null;
  finding_status: string;
  source_dataset: string | null;
  captured_at: string;
}

export interface DiagnosisResult {
  id: string;
  run_id: string;
  client_id: string;
  domain: string;
  primary_cause: string;
  primary_cause_probability: number;
  secondary_causes: Array<{ cause: string; probability: number; evidence: string }>;
  traffic_loss_estimated: number | null;
  traffic_loss_percentage: number | null;
  diagnosis_summary: string;
  diagnosis_status: 'draft' | 'final' | 'complete';
  confidence_band: 'low' | 'medium' | 'high';
}

export interface RecoveryPlan {
  id: string;
  run_id: string;
  client_id: string;
  domain: string;
  phase: 'quick_win' | 'month_1_3' | 'month_3_6';
  action_title: string;
  action_description: string;
  responsible: string | null;
  estimated_impact: 'bajo' | 'medio' | 'alto' | null;
  effort_level: 'low' | 'medium' | 'high' | null;
  expected_traffic_recovery: number | null;
  priority_rank: number | null;
  plan_status: string;
  action_category: string | null;
  success_metric: string | null;
}

export interface Report {
  id: string;
  run_id: string;
  client_id: string;
  domain: string;
  report_type: string;
  report_status: ReportStatus;
  output_format: 'markdown' | 'docx' | 'pdf';
  generated_by_agent: string | null;
  generated_at: string | null;
}

export interface ReportSection {
  id: string;
  report_id: string;
  section_key:
    | 'executive_summary'
    | 'site_snapshot'
    | 'traffic_loss_summary'
    | 'diagnosis'
    | 'recovery_plan'
    | 'appendix';
  section_title: string;
  section_order: number;
  section_status: string;
  body_markdown: string | null;
  body_html: string | null;
  generated_by_agent: string | null;
}

// ---- Args / Returns de los RPCs públicos ----

export interface EnqueueUrlAnalysisArgs {
  p_target_url: string;
  p_client_name?: string | null;
  p_country?: string;
  p_mode?: 'exact' | 'prefix' | 'domain' | 'subdomains';
  p_protocol?: 'http' | 'https' | 'both';
  p_snapshot_date?: string;
  p_row_limit?: number;
  p_allow_partial?: boolean;
}

export interface EnqueueUrlAnalysisRow {
  analysis_request_id: string;
  request_status: AnalysisRequestStatus;
}

export interface DispatchRow {
  analysis_request_id: string;
  previous_status: AnalysisRequestStatus;
  new_status: AnalysisRequestStatus;
  net_request_id: number | null;
  error_message: string | null;
}

// ---- Estado derivado del pipeline para el checklist UI ----

export type StageKey =
  | 'submitted'
  | 'queued'
  | 'dispatched'
  | 'ingest_keywords'
  | 'ingest_top_pages'
  | 'ingest_backlinks'
  | 'ingest_referring_domains'
  | 'site_overview'
  | 'comparison'
  | 'diagnostic'
  | 'recovery_plan'
  | 'report';

export type StageState = 'pending' | 'running' | 'done' | 'error';

export interface Stage {
  key: StageKey;
  label: string;
  state: StageState;
  detail?: string;
  errorMessage?: string;
}
