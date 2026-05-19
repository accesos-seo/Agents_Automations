import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAnalysisPipeline } from '@/hooks/useAnalysisPipeline';
import { useReportSections } from '@/hooks/useReportSections';

export function AnalysisReport() {
  const { analysisRequestId } = useParams<{ analysisRequestId: string }>();
  const { request, siteOverview } = useAnalysisPipeline(analysisRequestId);
  const clientId = siteOverview?.client_id ?? null;
  const { report, sections, loading, error } = useReportSections(clientId ?? undefined);

  if (!request) return <p className="text-sm text-slate-500">Cargando…</p>;

  return (
    <div className="max-w-5xl">
      <header className="mb-7 border-b border-slate-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Informe SEO Confidencial</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900 break-all">{request.target_url}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {request.client_name ?? '—'} · Snapshot {request.snapshot_date} · Mercado{' '}
          <strong className="uppercase">{request.country}</strong>
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <nav className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-3 text-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2 px-2">Secciones</p>
            <ul className="space-y-0.5">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#section-${s.section_key}`} className="block rounded px-2 py-1.5 text-slate-700 hover:bg-slate-200">
                    {s.section_order}. {s.section_title}
                  </a>
                </li>
              ))}
              {sections.length === 0 && !loading && (
                <li className="px-2 py-1 text-xs text-slate-500">Sin secciones aún.</li>
              )}
            </ul>
          </nav>
          <div className="mt-4 px-2 text-xs">
            <Link to={`/seo/analisis/${analysisRequestId}`} className="text-blue-700 hover:underline">
              ← Volver al progreso
            </Link>
          </div>
        </aside>

        <article className="min-w-0">
          {loading && <p className="text-sm text-slate-500">Cargando informe…</p>}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
          )}
          {!loading && !report && (
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
              Todavía no hay informe generado para este cliente.
            </div>
          )}

          <div className="space-y-10">
            {sections.map((s) => (
              <section key={s.id} id={`section-${s.section_key}`} className="scroll-mt-24">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: (p) => <h1 className="mb-4 border-b border-slate-200 pb-2 text-2xl font-bold text-slate-900" {...p} />,
                    h2: (p) => <h2 className="mt-8 mb-3 text-xl font-semibold text-blue-800" {...p} />,
                    h3: (p) => <h3 className="mt-6 mb-2 text-base font-semibold text-slate-800" {...p} />,
                    p:  (p) => <p className="my-3 leading-relaxed text-slate-700" {...p} />,
                    ul: (p) => <ul className="my-3 list-disc space-y-1 pl-6 text-slate-700" {...p} />,
                    ol: (p) => <ol className="my-3 list-decimal space-y-1 pl-6 text-slate-700" {...p} />,
                    table: (p) => (
                      <div className="my-4 overflow-x-auto">
                        <table className="min-w-full border-collapse text-sm" {...p} />
                      </div>
                    ),
                    th: (p) => <th className="border border-slate-200 bg-slate-100 px-3 py-2 text-left font-semibold text-slate-800" {...p} />,
                    td: (p) => <td className="border border-slate-200 px-3 py-2 align-top text-slate-700" {...p} />,
                    blockquote: (p) => (
                      <blockquote className="my-4 border-l-4 border-blue-500 bg-blue-50 px-4 py-2 text-sm text-blue-900" {...p} />
                    ),
                    code: (p) => <code className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em] text-slate-800" {...p} />,
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
