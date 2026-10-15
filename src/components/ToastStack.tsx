import { CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react';
import type { ToastItem } from '../constants/taxonomy';

interface ToastStackProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  return (
    <div className="fixed bottom-16 md:bottom-5 right-3 left-3 sm:left-auto sm:w-80 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="animate-toast pointer-events-auto bg-zinc-900/95 backdrop-blur border border-zinc-700 text-zinc-100 px-3.5 py-2.5 rounded-lg shadow-2xl flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {t.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-xs font-medium text-zinc-100 truncate">{t.title}</div>
              {t.subtitle && (
                <div className="text-[11px] text-zinc-400 truncate font-mono">
                  {t.subtitle}
                </div>
              )}
            </div>
          </div>

          {t.undoAction && (
            <button
              onClick={() => {
                t.undoAction?.();
                onDismiss(t.id);
              }}
              className="inline-flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2 py-1 rounded text-[11px] font-mono shrink-0"
            >
              <RotateCcw className="w-3 h-3" /> Undo
            </button>
          )}
        </div>
      ))}
    </div>
  );
}