import { NavLink, Outlet, useLocation } from 'react-router-dom';

const NAV = [
  { to: '/seo/analisis',        label: 'Tablero general', icon: '◧' },
  { to: '/seo/analisis/nuevo',  label: 'Nuevo análisis',  icon: '+' },
];

export function Layout() {
  const loc = useLocation();
  return (
    <div className="flex min-h-screen">
      <aside className="fixed top-0 left-0 w-64 h-screen border-r border-slate-200 bg-white px-4 py-5 flex flex-col">
        <div className="flex items-center gap-2 px-2 mb-7">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-700 to-blue-500 flex items-center justify-center text-white font-bold">S</div>
          <div>
            <p className="text-sm font-bold text-slate-900 leading-tight">SEO Lab Agency</p>
            <p className="text-[10px] text-slate-500 leading-tight">Plataforma de análisis</p>
          </div>
        </div>

        <p className="px-4 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Análisis</p>
        <div className="space-y-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/seo/analisis'}
              className={({ isActive }) =>
                `w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg transition ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <span className="w-5 text-center font-bold">{n.icon}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </div>

        <div className="flex-1" />

        <div className="border-t border-slate-200 pt-4 px-2 text-[11px] text-slate-500">
          <p>Light_House · Supabase</p>
          <p className="font-mono truncate">{import.meta.env.VITE_SUPABASE_URL?.replace('https://', '')}</p>
        </div>
      </aside>

      <main className="flex-1 ml-64">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur px-8 py-3">
          <p className="text-xs text-slate-500">
            <span className="text-slate-400">SEO Lab Agency</span> <span className="text-slate-300">/</span>{' '}
            <span className="text-slate-700 font-medium">{routeTitle(loc.pathname)}</span>
          </p>
        </div>
        <div className="px-8 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function routeTitle(p: string) {
  if (p === '/seo/analisis') return 'Tablero general';
  if (p === '/seo/analisis/nuevo') return 'Nuevo análisis';
  if (p.endsWith('/informe')) return 'Informe del cliente';
  if (p.startsWith('/seo/analisis/')) return 'Análisis en curso';
  return '';
}
