import { useEffect, useMemo, useState } from 'react';
import { supabase, SCHEMA } from '@/lib/supabase';
import type {
  AnalysisRequest, SiteOverview, HistoricalComparison, DiagnosticReport,
  AgentFinding, RecoveryPlan, Report, Stage,
} from '@/types';

interface PipelineState {
  request: AnalysisRequest | null;
  siteOverview: SiteOverview | null;
  comparison: HistoricalComparison | null;
  diagnostic: DiagnosticReport | null;
  findings: AgentFinding[];
  recovery: RecoveryPlan[];
  report: Report | null;
  loading: boolean;
  error: string | null;
}

const INITIAL: PipelineState = {
  request: null, siteOverview: null, comparison: null, diagnostic: null,
  findings: [], recovery: [], report: null, loading: true, error: null,
};

export function useAnalysisPipeline(analysisRequestId: string | undefined) {
  const [state, setState] = useState<PipelineState>(INITIAL);

  useEffect(() => {
    if (!analysisRequestId) return;
    let cancelled = false;
    const unsubs: Array<() => void> = [];

    async function load() {
      setState((s) => ({ ...s, loading: true, error: null }));
      const { data: request, error: reqErr } = await supabase
        .schema(SCHEMA).from('analysis_requests').select('*').eq('id', analysisRequestId).single();
      if (cancelled) return;
      if (reqErr || !request) {
        setState((s) => ({ ...s, loading: false, error: reqErr?.message ?? 'No encontrada' }));
        return;
      }

      const clientId = extractClientId(request as AnalysisRequest);

      const [soRes, cmpRes, diagRes, findRes, recRes, repRes] = await Promise.all([
        clientId ? supabase.schema(SCHEMA).from('site_overview').select('*').eq('client_id', clientId)
          .order('captured_at', { ascending: false }).limit(1).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        clientId ? supabase.schema(SCHEMA).from('historical_comparisons').select('*').eq('client_id', clientId)
          .order('created_at', { ascending: false }).limit(1).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        clientId ? supabase.schema(SCHEMA).from('diagnostic_reports').select('*').eq('client_id', clientId)
          .order('created_at', { ascending: false }).limit(1).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        clientId ? supabase.schema(SCHEMA).from('agent_findings').select('*').eq('client_id', clientId)
          .order('priority_rank', { ascending: true })
          : Promise.resolve({ data: [] as AgentFinding[], error: null }),
        clientId ? supabase.schema(SCHEMA).from('recovery_plan').select('*').eq('client_id', clientId)
          .order('priority_rank', { ascending: true })
          : Promise.resolve({ data: [] as RecoveryPlan[], error: null }),
        clientId ? supabase.schema(SCHEMA).from('reports').select('*').eq('client_id', clientId)
          .order('generated_at', { ascending: false }).limit(1).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (cancelled) return;
      setState({
        request: request as AnalysisRequest,
        siteOverview: (soRes.data as SiteOverview | null) ?? null,
        comparison: (cmpRes.data as HistoricalComparison | null) ?? null,
        diagnostic: (diagRes.data as DiagnosticReport | null) ?? null,
        findings: (findRes.data as AgentFinding[]) ?? [],
        recovery: (recRes.data as RecoveryPlan[]) ?? [],
        report: (repRes.data as Report | null) ?? null,
        loading: false, error: null,
      });

      // Realtime
      const reqCh = supabase
        .channel(`req:${analysisRequestId}`)
        .on('postgres_changes',
          { event: '*', schema: SCHEMA, table: 'analysis_requests', filter: `id=eq.${analysisRequestId}` },
          (p) => setState((s) => ({ ...s, request: p.new as AnalysisRequest })))
        .subscribe();
      unsubs.push(() => supabase.removeChannel(reqCh));

      if (clientId) {
        const ch = supabase
          .channel(`client:${clientId}`)
          .on('postgres_changes',
            { event: 'INSERT', schema: SCHEMA, table: 'site_overview', filter: `client_id=eq.${clientId}` },
            (p) => setState((s) => ({ ...s, siteOverview: p.new as SiteOverview })))
          .on('postgres_changes',
            { event: '*', schema: SCHEMA, table: 'historical_comparisons', filter: `client_id=eq.${clientId}` },
            (p) => setState((s) => ({ ...s, comparison: p.new as HistoricalComparison })))
          .on('postgres_changes',
            { event: '*', schema: SCHEMA, table: 'diagnostic_reports', filter: `client_id=eq.${clientId}` },
            (p) => setState((s) => ({ ...s, diagnostic: p.new as DiagnosticReport })))
          .on('postgres_changes',
            { event: 'INSERT', schema: SCHEMA, table: 'agent_findings', filter: `client_id=eq.${clientId}` },
            (p) => setState((s) => ({
              ...s,
              findings: [...s.findings, p.new as AgentFinding]
                .sort((a, b) => (a.priority_rank ?? 99) - (b.priority_rank ?? 99)),
            })))
          .on('postgres_changes',
            { event: 'INSERT', schema: SCHEMA, table: 'recovery_plan', filter: `client_id=eq.${clientId}` },
            (p) => setState((s) => ({ ...s, recovery: [...s.recovery, p.new as RecoveryPlan] })))
          .on('postgres_changes',
            { event: '*', schema: SCHEMA, table: 'reports', filter: `client_id=eq.${clientId}` },
            (p) => setState((s) => ({ ...s, report: p.new as Report })))
          .subscribe();
        unsubs.push(() => supabase.removeChannel(ch));
      }
    }

    load();
    return () => { cancelled = true; unsubs.forEach((u) => u()); };
  }, [analysisRequestId]);

  const stages = useMemo<Stage[]>(() => deriveStages(state), [state]);
  const overallProgress = useMemo(() => {
    const done = stages.filter((s) => s.state === 'done').length;
    return Math.round((done / stages.length) * 100);
  }, [stages]);
  const isComplete = state.request?.request_status === 'complete' && !!state.report;
  const hasError = state.request?.request_status === 'error' || stages.some((s) => s.state === 'error');

  return { ...state, stages, overallProgress, isComplete, hasError };
}

function extractClientId(req: AnalysisRequest): string | null {
  const ingestion =
    (req.response_payload as { ingestion_results?: Array<{ client_id?: string }> } | null)
      ?.ingestion_results ?? [];
  return ingestion[0]?.client_id ?? null;
}

function deriveStages(s: PipelineState): Stage[] {
  const r = s.request;
  const status = r?.request_status;
  const orchestrationActive = ['dispatched', 'running', 'complete', 'partial'].includes(status ?? '');
  const ingestion =
    (r?.response_payload as { ingestion_results?: Array<{ dataset?: string; ok?: boolean }> } | null)
      ?.ingestion_results ?? [];
  const ingestionDone = (ds: string) => ingestion.some((x) => x.dataset === ds && x.ok);

  return [
    { key: 'submitted', label: 'URL recibida y validada', state: r ? 'done' : 'pending', detail: r?.target_url },
    {
      key: 'queued', label: 'Solicitud encolada',
      state: status ? (['ready_for_dispatch', 'queued'].includes(status) ? 'running' : 'done') : 'pending',
    },
    {
      key: 'dispatched', label: 'Despachada al orquestador',
      state: !status ? 'pending' : status === 'error' ? 'error'
        : ['ready_for_dispatch', 'queued'].includes(status) ? 'pending'
        : status === 'dispatched' ? 'running' : 'done',
      errorMessage: r?.last_dispatch_error ?? undefined,
    },
    { key: 'ingest_keywords', label: 'Ingesta de keywords orgánicas',
      state: ingestionDone('organic_keywords') ? 'done' : orchestrationActive ? 'running' : 'pending' },
    { key: 'ingest_top_pages', label: 'Ingesta de Top Pages',
      state: ingestionDone('top_pages') ? 'done' : orchestrationActive ? 'running' : 'pending' },
    { key: 'ingest_backlinks', label: 'Ingesta de Backlinks',
      state: ingestionDone('backlinks') ? 'done' : orchestrationActive ? 'running' : 'pending' },
    { key: 'ingest_referring', label: 'Ingesta de Referring Domains',
      state: ingestionDone('referring_domains') ? 'done' : orchestrationActive ? 'running' : 'pending' },
    {
      key: 'site_overview', label: 'Snapshot del dominio (DR, tráfico, valor)',
      state: s.siteOverview ? 'done' : orchestrationActive ? 'running' : 'pending',
      detail: s.siteOverview
        ? `DR ${s.siteOverview.domain_rating ?? '—'} · ${fmt(s.siteOverview.organic_traffic)} visitas/mes`
        : undefined,
    },
    {
      key: 'comparison', label: 'Comparativa histórica',
      state: s.comparison?.comparison_status === 'complete' ? 'done'
        : s.comparison?.comparison_status === 'error' ? 'error'
        : orchestrationActive ? 'running' : 'pending',
      errorMessage: s.comparison?.error_message ?? undefined,
    },
    {
      key: 'diagnostic', label: 'Diagnóstico estratégico',
      state: s.diagnostic?.diagnosis_status === 'complete' || s.findings.length > 0
        ? 'done' : orchestrationActive ? 'running' : 'pending',
      detail: s.findings.length ? `${s.findings.length} hallazgos detectados` : undefined,
    },
    {
      key: 'recovery', label: 'Plan de recuperación',
      state: s.recovery.length > 0 ? 'done' : orchestrationActive ? 'running' : 'pending',
      detail: s.recovery.length ? `${s.recovery.length} acciones propuestas` : undefined,
    },
    {
      key: 'report', label: 'Informe final generado',
      state: s.report ? 'done' : orchestrationActive ? 'running' : 'pending',
    },
  ];
}

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-ES').format(n);
}
