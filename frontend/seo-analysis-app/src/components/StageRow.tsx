import type { Stage } from '@/types';

export function StageRow({ stage }: { stage: Stage }) {
  const { state, label, detail, errorMessage } = stage;
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="mt-0.5 shrink-0">
        {state === 'done'    && <Check />}
        {state === 'running' && <Spin />}
        {state === 'pending' && <Circle />}
        {state === 'error'   && <Cross />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={
          state === 'done' ? 'text-sm font-medium text-emerald-700'
          : state === 'running' ? 'text-sm font-medium text-blue-700'
          : state === 'error' ? 'text-sm font-medium text-red-700'
          : 'text-sm font-medium text-slate-500'
        }>{label}</p>
        {(detail || errorMessage) && (
          <p className={errorMessage ? 'mt-0.5 text-xs text-red-700 break-all' : 'mt-0.5 text-xs text-slate-500 break-all'}>
            {errorMessage ?? detail}
          </p>
        )}
      </div>
      <span className="ml-2 text-[11px] font-medium uppercase tracking-wide whitespace-nowrap">
        {state === 'done'    && <span className="text-emerald-700">Listo</span>}
        {state === 'running' && <span className="text-blue-700">En curso…</span>}
        {state === 'pending' && <span className="text-slate-400">Pendiente</span>}
        {state === 'error'   && <span className="text-red-700">Error</span>}
      </span>
    </li>
  );
}

function Check() { return (
  <svg viewBox="0 0 24 24" className="w-6 h-6 text-emerald-600" fill="none">
    <circle cx="12" cy="12" r="11" fill="#ECFDF5" stroke="#a7f3d0" strokeWidth="1.5" />
    <path d="M7 12.5l3.5 3.5L17 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
); }
function Spin() { return (
  <svg viewBox="0 0 24 24" className="w-6 h-6 animate-spin text-blue-600" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
    <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
); }
function Circle() { return (
  <svg viewBox="0 0 24 24" className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10" />
  </svg>
); }
function Cross() { return (
  <svg viewBox="0 0 24 24" className="w-6 h-6 text-red-600" fill="none">
    <circle cx="12" cy="12" r="11" fill="#FEF2F2" stroke="#fecaca" strokeWidth="1.5" />
    <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
); }
