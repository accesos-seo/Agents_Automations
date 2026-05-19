import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

const COUNTRY_OPTIONS = [
  { value: 'es', label: 'España' },
  { value: 'mx', label: 'México' },
  { value: 'pe', label: 'Perú' },
  { value: 'co', label: 'Colombia' },
  { value: 'ar', label: 'Argentina' },
  { value: 'cl', label: 'Chile' },
  { value: 'us', label: 'Estados Unidos' },
];

export function NewAnalysisPage() {
  const navigate = useNavigate();
  const [targetUrl, setTargetUrl] = useState('https://www.topdoctors.es/');
  const [clientName, setClientName] = useState('');
  const [country, setCountry] = useState('es');
  const [rowLimit, setRowLimit] = useState(500);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    let normalized: string;
    try {
      const u = new URL(targetUrl.trim());
      if (!/^https?:$/.test(u.protocol)) throw new Error('protocolo inválido');
      normalized = u.toString();
    } catch {
      setError('URL inválida. Debe incluir https:// y un dominio válido.');
      return;
    }

    setSubmitting(true);
    const today = new Date().toISOString().slice(0, 10);

    const { data, error: rpcErr } = await supabase.rpc('ahrefs_enqueue_url_analysis', {
      p_target_url: normalized,
      p_client_name: clientName.trim() || null,
      p_country: country,
      p_mode: 'domain',
      p_protocol: 'both',
      p_snapshot_date: today,
      p_row_limit: rowLimit,
      p_allow_partial: true,
    });

    if (rpcErr) {
      setError(`RPC ahrefs_enqueue_url_analysis: ${rpcErr.message}`);
      setSubmitting(false);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.analysis_request_id) {
      setError('La RPC no devolvió un ID válido.');
      setSubmitting(false);
      return;
    }

    // Disparo opcional (fire-and-forget)
    supabase.rpc('ahrefs_dispatch_ready_analysis_requests', { p_limit: 5 }).then(() => undefined);

    navigate(`/seo/analisis/${row.analysis_request_id}`);
  }

  return (
    <div className="max-w-2xl">
      <header className="mb-7">
        <h1 className="text-2xl font-bold text-slate-900">Nuevo análisis SEO</h1>
        <p className="text-sm text-slate-600 mt-1">
          Pegá la URL del cliente. El sistema dispara el pipeline real contra Ahrefs y muestra el progreso en vivo.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
        <div>
          <label htmlFor="url" className="block text-sm font-medium text-slate-800">
            URL del sitio <span className="text-red-600">*</span>
          </label>
          <input
            id="url" type="url" required
            value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://www.tucliente.com/"
            className="mt-1 w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
          />
          <p className="mt-1 text-xs text-slate-500">
            Debe incluir <code className="bg-slate-100 px-1 rounded">https://</code>. Se analiza todo el dominio.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-800">Nombre del cliente</label>
            <input
              value={clientName} onChange={(e) => setClientName(e.target.value)}
              placeholder="Ej: Top Doctors España"
              className="mt-1 w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-800">
              Mercado <span className="text-red-600">*</span>
            </label>
            <select
              value={country} onChange={(e) => setCountry(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
            >
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label} ({c.value})</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-800">
            Profundidad: <span className="font-semibold text-blue-700">{rowLimit}</span> keywords / backlinks
          </label>
          <input
            type="range" min={100} max={5000} step={100}
            value={rowLimit} onChange={(e) => setRowLimit(parseInt(e.target.value, 10))}
            className="w-full mt-2 accent-blue-600"
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>100 (rápido)</span>
            <span>500 (recomendado)</span>
            <span>5000 (exhaustivo)</span>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <button type="button" onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md">
            Cancelar
          </button>
          <button type="submit" disabled={submitting}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md disabled:opacity-60">
            {submitting ? 'Iniciando…' : 'Iniciar análisis'}
          </button>
        </div>
      </form>
    </div>
  );
}
