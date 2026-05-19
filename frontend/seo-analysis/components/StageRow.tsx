import type { Stage } from '../types';

interface Props {
  stage: Stage;
}

export function StageRow({ stage }: Props) {
  const { state, label, detail, errorMessage } = stage;
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full" aria-hidden>
        {state === 'done' && <CheckIcon />}
        {state === 'running' && <RunningIcon />}
        {state === 'pending' && <PendingIcon />}
        {state === 'error' && <ErrorIcon />}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={
            state === 'done'
              ? 'text-sm font-medium text-emerald-700'
              : state === 'running'
                ? 'text-sm font-medium text-blue-700'
                : state === 'error'
                  ? 'text-sm font-medium text-red-700'
                  : 'text-sm font-medium text-slate-500'
          }
        >
          {label}
        </p>
        {(detail || errorMessage) && (
          <p
            className={
              errorMessage
                ? 'mt-0.5 break-all text-xs text-red-700'
                : 'mt-0.5 break-all text-xs text-slate-500'
            }
          >
            {errorMessage ?? detail}
          </p>
        )}
      </div>
      <span className="ml-2 text-xs font-medium uppercase tracking-wide">
        {state === 'done' && <span className="text-emerald-700">Listo</span>}
        {state === 'running' && <span className="text-blue-700">En curso…</span>}
        {state === 'pending' && <span className="text-slate-400">Pendiente</span>}
        {state === 'error' && <span className="text-red-700">Error</span>}
      </span>
    </li>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={3}>
      <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth={1.5} className="text-emerald-200" fill="#ECFDF5" />
      <path d="M7 12.5l3.5 3.5L17 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RunningIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 animate-spin text-blue-600" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function PendingIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth={1.5} className="text-red-200" fill="#FEF2F2" />
      <path d="M9 9l6 6M15 9l-6 6" strokeLinecap="round" />
    </svg>
  );
}
