import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAnalysisPipeline } from '@/hooks/useAnalysisPipeline';
import { StageRow } from './StageRow';
import { MetricsSummary } from './MetricsSummary';

export function AnalysisProgress() {
  const { analysisRequestId } = useParams<{ analysisRequestId: string }>();
  const navigate = useNavigate();
  const {
    request, stages, overallProgress, isComplete, hasError,
    siteOverview, diagnostic, findings, recovery, loading, error,
  } = useAnalysisPipeline(analysisRequestId);

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando análisis…</p>;
  }

  if (error || !request) {
    return (
      <div>
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          No se pudo cargar la solicitud: {error ?? 'no encontrada'}.
        </div>
        <button onClick={() => navigate('/seo/analisis/nuevo')} className="mt-4 text-sm font-medium text-blue-700 hover:underline">
          ← Volver a iniciar un análisis
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Análisis SEO en curso</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 break-all">{request.target_url}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {request.client_name ?? '—'} · Mercado:{' '}
          <strong className="uppercase">{request.country}</strong> · Snapshot: {request.snapshot_date} · Limit: {request.row_limit}
        </p>
      </header>

      <div className="mb-7">
        <div className="flex justify-between text-xs text-slate-600 mb-1">
          <span>Progreso general</span>
          <span className="font-semibold">{overallProgress}%</span>
        </div>
        <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
          <div
            className={'h-full transition-all duration-500 ' +
              (hasError ? 'bg-red-500' : isComplete ? 'bg-emerald-500' : 'bg-blue-600')}
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      <section className="mb-7">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Snapshot del dominio</h2>
        <MetricsSummary overview={siteOverview} />
      </section>

      <section className="bg-white border border-slate-200 rounded-lg">
        <ol className="divide-y divide-slate-100 px-5">
          {stages.map((s) => <StageRow key={s.key} stage={s} />)}
        </ol>
      </section>

      {(diagnostic || findings.length > 0 || recovery.length > 0) && (
        <section className="mt-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card label="Hallazgos detectados" value={findings.length} tone="amber" />
          <Card
            label="Nivel de riesgo"
            value={diagnostic?.overall_risk_level?.toUpperCase() ?? '—'}
            tone={diagnostic?.overall_risk_level === 'critical' ? 'red' : 'blue'}
          />
          <Card label="Acciones de recuperación" value={recovery.length} tone="emerald" />
        </section>
      )}

      <div className="mt-9 flex items-center justify-between border-t border-slate-200 pt-5">
        <Link to="/seo/analisis/nuevo" className="text-sm font-medium text-slate-600 hover:underline">
          ← Nuevo análisis
        </Link>
        {isComplete ? (
          <Link
            to={`/seo/analisis/${analysisRequestId}/informe`}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-5 py-2.5 rounded-md"
          >
            Ver informe completo →
          </Link>
        ) : (
          <span className="text-xs text-slate-500">El informe estará disponible cuando las 12 etapas estén en verde.</span>
        )}
      </div>
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: number | string; tone: 'amber' | 'red' | 'blue' | 'emerald' }) {
  const cls = tone === 'amber' ? 'border-amber-100 bg-amber-50 text-amber-800'
    : tone === 'red' ? 'border-red-100 bg-red-50 text-red-800'
    : tone === 'emerald' ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
    : 'border-blue-100 bg-blue-50 text-blue-800';
  return (
    <div className={`rounded-lg border px-4 py-4 ${cls}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs font-medium opacity-80">{label}</p>
    </div>
  );
}
