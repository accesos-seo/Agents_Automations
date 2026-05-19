import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, SCHEMA } from '@/lib/supabase';
import type { AnalysisRequest } from '@/types';

type Row = AnalysisRequest;

export function DashboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .schema(SCHEMA).from('analysis_requests').select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows((data as Row[]) ?? []);
      setLoading(false);
    }
    load();

    const ch = supabase
      .channel('analysis_requests:dashboard')
      .on('postgres_changes', { event: '*', schema: SCHEMA, table: 'analysis_requests' }, () => {
        load();
      })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tablero general</h1>
          <p className="text-sm text-slate-600 mt-1">Todos los análisis ejecutados contra Light_House.</p>
        </div>
        <Link to="/seo/analisis/nuevo" className="bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-md">
          + Nuevo análisis
        </Link>
      </div>

      {loading && <p className="text-sm text-slate-500">Cargando…</p>}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-4">
          {error}
          <p className="mt-1 text-xs">Verificá que ejecutaste <code>bootstrap.sql</code> y que el esquema <code>ahrefs_web_analysis</code> está expuesto en API.</p>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Cliente / URL</th>
              <th className="px-4 py-3 font-semibold">País</th>
              <th className="px-4 py-3 font-semibold">Snapshot</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 font-semibold text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{r.client_name ?? r.target_url}</p>
                  <p className="text-xs text-slate-500 break-all">{r.target_url}</p>
                </td>
                <td className="px-4 py-3 text-slate-600 uppercase text-xs">{r.country}</td>
                <td className="px-4 py-3 text-slate-600">{r.snapshot_date}</td>
                <td className="px-4 py-3"><StatusBadge status={r.request_status} /></td>
                <td className="px-4 py-3 text-right">
                  {r.request_status === 'complete' ? (
                    <Link to={`/seo/analisis/${r.id}/informe`} className="text-blue-700 hover:underline text-xs font-medium">Ver informe →</Link>
                  ) : (
                    <Link to={`/seo/analisis/${r.id}`} className="text-blue-700 hover:underline text-xs font-medium">Ver progreso →</Link>
                  )}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                  Sin análisis todavía. Iniciá uno desde "Nuevo análisis".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    complete:           'bg-emerald-100 text-emerald-800',
    running:            'bg-blue-100 text-blue-800',
    dispatched:         'bg-blue-100 text-blue-800',
    ready_for_dispatch: 'bg-amber-100 text-amber-800',
    queued:             'bg-amber-100 text-amber-800',
    partial:            'bg-amber-100 text-amber-800',
    error:              'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-slate-100 text-slate-700'}`}>
      {status}
    </span>
  );
}
