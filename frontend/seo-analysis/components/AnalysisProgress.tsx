import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAnalysisPipeline } from '../hooks/useAnalysisPipeline';
import { StageRow } from './StageRow';
import { MetricsSummary } from './MetricsSummary';

/**
 * Pantalla principal del flujo. Suscribe Realtime a TODAS las tablas del
 * pipeline y muestra el checklist con check verde a medida que cada etapa
 * se completa. Cuando el informe está generado, aparece el CTA hacia el
 * detalle.
 */
export function AnalysisProgress() {
  const { analysisRequestId } = useParams<{ analysisRequestId: string }>();
  const navigate = useNavigate();
  const {
    request,
    stages,
    overallProgress,
    isComplete,
    hasError,
    siteOverview,
    diagnostic,
    findings,
    recovery,
    loading,
    error,
  } = useAnalysisPipeline(analysisRequestId);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 text-sm text-slate-500">Cargando análisis…</div>
    );
  }

  if (error || !request) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          No se pudo cargar la solicitud: {error ?? 'no encontrada'}.
        </div>
        <button
          onClick={() => navigate('/seo/analisis/nuevo')}
          className="mt-4 text-sm font-medium text-blue-700 hover:underline"
        >
          ← Volver a iniciar un análisis
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Análisis SEO en curso</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900 break-all">{request.target_url}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {request.client_name ?? '—'} · Mercado: <strong className="uppercase">{request.country}</strong> ·
          Snapshot: {request.snapshot_date} · Limit: {request.row_limit}
        </p>
      </header>

      {/* Barra de progreso */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>Progreso general</span>
          <span className="font-semibold">{overallProgress}%</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className={
              'h-full transition-all duration-500 ' +
              (hasError ? 'bg-red-500' : isComplete ? 'bg-emerald-500' : 'bg-blue-600')
            }
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* Métricas en vivo */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Snapshot del dominio
        </h2>
        <MetricsSummary overview={siteOverview} />
      </section>

      {/* Checklist */}
      <section className="rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        <ol className="divide-y divide-slate-100 px-4">
          {stages.map((s) => (
            <StageRow key={s.key} stage={s} />
          ))}
        </ol>
      </section>

      {/* Resumen del diagnóstico mientras corre */}
      {(diagnostic || findings.length > 0 || recovery.length > 0) && (
        <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card label="Hallazgos detectados" value={findings.length} tone="amber" />
          <Card
            label="Nivel de riesgo"
            value={diagnostic?.overall_risk_level?.toUpperCase() ?? '—'}
            tone={diagnostic?.overall_risk_level === 'critical' ? 'red' : 'blue'}
          />
          <Card label="Acciones de recuperación" value={recovery.length} tone="emerald" />
        </section>
      )}

      {/* CTA final */}
      <div className="mt-10 flex items-center justify-between border-t border-slate-200 pt-6">
        <Link to="/seo/analisis/nuevo" className="text-sm font-medium text-slate-600 hover:underline">
          ← Nuevo análisis
        </Link>
        {isComplete ? (
          <Link
            to={`/seo/analisis/${analysisRequestId}/informe`}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            Ver informe completo →
          </Link>
        ) : (
          <span className="text-xs text-slate-500">
            El informe estará disponible cuando todas las etapas estén en verde.
          </span>
        )}
      </div>
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: number | string; tone: 'amber' | 'red' | 'blue' | 'emerald' }) {
  const toneClasses =
    tone === 'amber'
      ? 'border-amber-100 bg-amber-50 text-amber-800'
      : tone === 'red'
        ? 'border-red-100 bg-red-50 text-red-800'
        : tone === 'emerald'
          ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
          : 'border-blue-100 bg-blue-50 text-blue-800';
  return (
    <div className={`rounded-lg border px-4 py-4 ${toneClasses}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs font-medium opacity-80">{label}</p>
    </div>
  );
}
