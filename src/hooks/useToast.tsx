import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';

type Kind = 'success' | 'error' | 'info';
interface ToastItem { id: number; kind: Kind; text: string; action?: { label: string; run: () => void } }
interface ToastApi { success: (t: string) => void; error: (t: string) => void; info: (t: string) => void; undoable: (t: string, undo: () => void) => void }
const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback((kind: Kind, text: string, action?: ToastItem['action']) => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-3), { id, kind, text, action }]);
    window.setTimeout(() => dismiss(id), kind === 'error' ? 8000 : action ? 9000 : 3500);
  }, [dismiss]);
  const api = useMemo<ToastApi>(() => ({ success: (t) => push('success', t), error: (t) => push('error', t), info: (t) => push('info', t), undoable: (t, undo) => push('success', t, { label: 'Undo', run: undo }) }), [push]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            {t.kind === 'success' ? <CheckCircle2 size={18} aria-hidden /> : t.kind === 'error' ? <TriangleAlert size={18} aria-hidden /> : <Info size={18} aria-hidden />}
            <span>{t.text}</span>
            {t.action && <button className="toast-action" onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>}
            <button className="icon-btn icon-btn-sm" onClick={() => dismiss(t.id)} aria-label="Dismiss message"><X size={16} aria-hidden /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast must be used inside <ToastProvider>');
  return c;
}
