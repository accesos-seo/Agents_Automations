import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAnalysisPipeline } from '../hooks/useAnalysisPipeline';
import { useReportSections } from '../hooks/useReportSections';

/**
 * Render del informe final. Lee las 6 secciones de report_sections y las
 * pinta como markdown con tabla de contenidos lateral.
 */
export function AnalysisReport() {
  const { analysisRequestId } = useParams<{ analysisRequestId: string }>();
  const { request, siteOverview } = useAnalysisPipeline(analysisRequestId);
  const clientId = siteOverview?.client_id ?? null;
  const { report, sections, loading, error } = useReportSections(clientId ?? undefined);

  if (!request) {
    return <div className="mx-auto max-w-4xl px-6 py-10 text-sm text-slate-500">Cargando…</div>;
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Informe SEO</p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-900 break-all">{request.target_url}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {request.client_name ?? '—'} · Snapshot {request.snapshot_date} · Mercado{' '}
          <strong className="uppercase">{request.country}</strong>
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
        {/* Tabla de contenidos */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <nav className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Secciones</p>
            <ul className="space-y-1.5">
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#section-${s.section_key}`}
                    className="block rounded px-2 py-1 text-slate-700 hover:bg-slate-200"
                  >
                    {s.section_order}. {s.section_title}
                  </a>
                </li>
              ))}
              {sections.length === 0 && !loading && (
                <li className="px-2 py-1 text-xs text-slate-500">Sin secciones aún.</li>
              )}
            </ul>
          </nav>

          <div className="mt-4 flex flex-col gap-2 text-xs">
            <Link to={`/seo/analisis/${analysisRequestId}`} className="text-blue-700 hover:underline">
              ← Volver al progreso
            </Link>
            {report && (
              <span className="text-slate-500">
                Generado {report.generated_at ? new Date(report.generated_at).toLocaleString('es-ES') : '—'} por{' '}
                {report.generated_by_agent ?? '—'}
              </span>
            )}
          </div>
        </aside>

        {/* Cuerpo del informe */}
        <article className="min-w-0">
          {loading && <p className="text-sm text-slate-500">Cargando informe…</p>}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}
          {!loading && !report && (
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
              Todavía no hay informe generado para este cliente.
            </div>
          )}

          <div className="space-y-12">
            {sections.map((s) => (
              <section key={s.id} id={`section-${s.section_key}`} className="scroll-mt-8">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ node, ...p }) => (
                      <h1 className="mb-4 border-b border-slate-200 pb-2 text-2xl font-bold text-slate-900" {...p} />
                    ),
                    h2: ({ node, ...p }) => (
                      <h2 className="mt-8 mb-3 text-xl font-semibold text-blue-800" {...p} />
                    ),
                    h3: ({ node, ...p }) => (
                      <h3 className="mt-6 mb-2 text-base font-semibold text-slate-800" {...p} />
                    ),
                    p: ({ node, ...p }) => <p className="my-3 leading-relaxed text-slate-700" {...p} />,
                    ul: ({ node, ...p }) => <ul className="my-3 list-disc space-y-1 pl-6 text-slate-700" {...p} />,
                    ol: ({ node, ...p }) => <ol className="my-3 list-decimal space-y-1 pl-6 text-slate-700" {...p} />,
                    table: ({ node, ...p }) => (
                      <div className="my-4 overflow-x-auto">
                        <table className="min-w-full border-collapse text-sm" {...p} />
                      </div>
                    ),
                    th: ({ node, ...p }) => (
                      <th
                        className="border border-slate-200 bg-slate-100 px-3 py-2 text-left font-semibold text-slate-800"
                        {...p}
                      />
                    ),
                    td: ({ node, ...p }) => <td className="border border-slate-200 px-3 py-2 align-top text-slate-700" {...p} />,
                    blockquote: ({ node, ...p }) => (
                      <blockquote
                        className="my-4 border-l-4 border-blue-500 bg-blue-50 px-4 py-2 text-sm text-blue-900"
                        {...p}
                      />
                    ),
                    code: ({ node, ...p }) => (
                      <code className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em] text-slate-800" {...p} />
                    ),
                  }}
                >
                  {s.body_markdown ?? ''}
                </ReactMarkdown>
              </section>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}
