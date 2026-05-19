import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { EnqueueUrlAnalysisRow } from '../types';

const COUNTRY_OPTIONS = [
  { value: 'es', label: 'España' },
  { value: 'mx', label: 'México' },
  { value: 'pe', label: 'Perú' },
  { value: 'co', label: 'Colombia' },
  { value: 'ar', label: 'Argentina' },
  { value: 'cl', label: 'Chile' },
  { value: 'us', label: 'Estados Unidos' },
];

/**
 * Form de entrada del módulo. Llama al RPC public.ahrefs_enqueue_url_analysis
 * y redirige a /seo/analisis/:id donde se muestra el progreso en vivo.
 */
export function NewAnalysisForm() {
  const navigate = useNavigate();
  const [targetUrl, setTargetUrl] = useState('');
  const [clientName, setClientName] = useState('');
  const [country, setCountry] = useState('es');
  const [rowLimit, setRowLimit] = useState(500);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    let normalizedUrl: string;
    try {
      const u = new URL(targetUrl.trim());
      if (!/^https?:$/.test(u.protocol)) throw new Error('La URL debe usar http o https.');
      normalizedUrl = u.toString();
    } catch {
      setError('URL inválida. Debe incluir https:// y un dominio válido.');
      return;
    }

    setSubmitting(true);

    const today = new Date().toISOString().slice(0, 10);
    const { data, error: rpcErr } = await supabase.rpc('ahrefs_enqueue_url_analysis', {
      p_target_url: normalizedUrl,
      p_client_name: clientName.trim() || null,
      p_country: country,
      p_mode: 'domain',
      p_protocol: 'both',
      p_snapshot_date: today,
      p_row_limit: rowLimit,
      p_allow_partial: true,
    });

    if (rpcErr) {
      setError(rpcErr.message);
      setSubmitting(false);
      return;
    }

    const row = Array.isArray(data) ? (data[0] as EnqueueUrlAnalysisRow) : (data as EnqueueUrlAnalysisRow);
    if (!row?.analysis_request_id) {
      setError('La RPC no devolvió un ID válido.');
      setSubmitting(false);
      return;
    }

    // Disparo opcional (sin esperar) — el cron lo agarra igual en <60s
    supabase.rpc('ahrefs_dispatch_ready_analysis_requests', { p_limit: 5 }).catch(() => undefined);

    navigate(`/seo/analisis/${row.analysis_request_id}`);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Nuevo análisis SEO</h1>
        <p className="mt-2 text-sm text-slate-600">
          Pegá la URL del sitio que querés analizar. El sistema ingiere todos los datos desde Ahrefs, los compara,
          diagnostica oportunidades y genera el informe ejecutivo automáticamente.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="target_url" className="block text-sm font-medium text-slate-800">
            URL del sitio <span className="text-red-600">*</span>
          </label>
          <input
            id="target_url"
            type="url"
            required
            inputMode="url"
            placeholder="https://www.tucliente.com/"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm
                       focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
          />
          <p className="mt-1 text-xs text-slate-500">
            Debe incluir el protocolo (<code>https://</code>). El sistema toma todo el dominio.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="client_name" className="block text-sm font-medium text-slate-800">
              Nombre del cliente
            </label>
            <input
              id="client_name"
              type="text"
              placeholder="Ej: Top Doctors España"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm
                         focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
            <p className="mt-1 text-xs text-slate-500">Opcional. Si lo omitís, se usa el dominio.</p>
          </div>

          <div>
            <label htmlFor="country" className="block text-sm font-medium text-slate-800">
              País del mercado <span className="text-red-600">*</span>
            </label>
            <select
              id="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm
                         focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
            >
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label} ({c.value})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="row_limit" className="block text-sm font-medium text-slate-800">
            Profundidad del análisis: <span className="font-semibold text-blue-700">{rowLimit}</span> keywords / backlinks
          </label>
          <input
            id="row_limit"
            type="range"
            min={100}
            max={5000}
            step={100}
            value={rowLimit}
            onChange={(e) => setRowLimit(parseInt(e.target.value, 10))}
            className="mt-2 w-full accent-blue-600"
          />
          <div className="mt-1 flex justify-between text-xs text-slate-500">
            <span>100 (rápido)</span>
            <span>500 (recomendado)</span>
            <span>5000 (exhaustivo)</span>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-5 py-2 text-sm font-semibold text-white
                       shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Spinner /> Iniciando…
              </>
            ) : (
              'Iniciar análisis'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
