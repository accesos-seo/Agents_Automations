import type { SiteOverview } from '@/types';

export function MetricsSummary({ overview }: { overview: SiteOverview | null }) {
  if (!overview) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-7 text-center text-sm text-slate-500">
        Las métricas del dominio aparecerán cuando el agente de valuación termine.
      </div>
    );
  }

  const cards = [
    { value: fmt(overview.organic_traffic), label: 'Tráfico orgánico mensual', tone: 'blue' },
    { value: fmt(overview.organic_keywords), label: 'Keywords orgánicas', tone: 'blue' },
    { value: `$${compact(overview.traffic_value)}`, label: 'Valor de tráfico USD/mes', tone: 'emerald' },
    { value: overview.domain_rating != null ? `${overview.domain_rating}/100` : '—', label: 'Domain Rating', tone: 'slate' },
  ] as const;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className={
          'rounded-lg border px-4 py-3 ' +
          (c.tone === 'blue' ? 'border-blue-100 bg-blue-50' :
           c.tone === 'emerald' ? 'border-emerald-100 bg-emerald-50' :
           'border-slate-200 bg-slate-50')
        }>
          <p className={
            'text-xl font-bold ' +
            (c.tone === 'blue' ? 'text-blue-800' :
             c.tone === 'emerald' ? 'text-emerald-700' : 'text-slate-800')
          }>{c.value}</p>
          <p className="mt-1 text-[11px] font-medium text-slate-600">{c.label}</p>
        </div>
      ))}
    </div>
  );
}

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-ES').format(n);
}
function compact(n: number | null | undefined) {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}
