import type { SiteOverview } from '../types';

interface Props {
  overview: SiteOverview | null;
}

/**
 * Cards en vivo del snapshot del dominio. Aparecen cuando el agente
 * de valuación termina de poblar site_overview (DR, tráfico, valor).
 */
export function MetricsSummary({ overview }: Props) {
  if (!overview) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500">
        Las métricas del dominio aparecerán aquí en cuanto el agente de valuación termine.
      </div>
    );
  }

  const cards: Array<{ value: string; label: string; tone: 'blue' | 'green' | 'slate' }> = [
    {
      value: fmt(overview.organic_traffic),
      label: 'Tráfico orgánico mensual',
      tone: 'blue',
    },
    {
      value: fmt(overview.organic_keywords),
      label: 'Keywords orgánicas',
      tone: 'blue',
    },
    {
      value: `$${compact(overview.traffic_value)}`,
      label: 'Valor de tráfico USD/mes',
      tone: 'green',
    },
    {
      value: overview.domain_rating != null ? `${overview.domain_rating}/100` : '—',
      label: 'Domain Rating',
      tone: 'slate',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className={
            'rounded-lg border px-4 py-4 ' +
            (c.tone === 'blue'
              ? 'border-blue-100 bg-blue-50'
              : c.tone === 'green'
                ? 'border-emerald-100 bg-emerald-50'
                : 'border-slate-200 bg-slate-50')
          }
        >
          <p
            className={
              'text-2xl font-bold ' +
              (c.tone === 'blue'
                ? 'text-blue-800'
                : c.tone === 'green'
                  ? 'text-emerald-700'
                  : 'text-slate-800')
            }
          >
            {c.value}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-600">{c.label}</p>
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
  return n.toString();
}
