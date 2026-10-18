import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Loader2, X } from 'lucide-react';

export function cx(...parts: Array<string | false | null | undefined>): string { return parts.filter(Boolean).join(' '); }

/* ---------- buttons ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'md' | 'sm'; busy?: boolean; icon?: ReactNode };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = 'secondary', size = 'md', busy, icon, children, className, disabled, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? <Loader2 size={16} className="spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});
export function IconButton({ label, children, size = 'md', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'md' | 'sm' }) {
  return <button type="button" className={cx('icon-btn', size === 'sm' && 'icon-btn-sm', className)} aria-label={label} title={label} {...rest}>{children}</button>;
}

/* ---------- dialog (native <dialog>: focus trap, Esc, inert background) ---------- */
export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={cx('dialog', wide && 'dialog-wide')} aria-labelledby={titleId} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      {open && (
        <div className="dialog-panel">
          <header className="dialog-head">
            <h2 id={titleId}>{title}</h2>
            <IconButton label="Close dialog" onClick={onClose}><X size={20} aria-hidden /></IconButton>
          </header>
          <div className="dialog-body">{children}</div>
          {footer && <footer className="dialog-foot">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, busy, onConfirm, onCancel }: { open: boolean; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog open={open} onClose={onCancel} title={title} footer={<><Button onClick={onCancel}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} busy={busy} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <p className="muted">{message}</p>
    </Dialog>
  );
}

/* ---------- form fields ---------- */
export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className={cx('field', error && 'field-error')}>
      <label htmlFor={htmlFor} className="field-label">{label}</label>
      {children}
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && <p className="field-err" role="alert">{error}</p>}
    </div>
  );
}
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) { return <input ref={ref} className={cx('input', className)} {...rest} />; });
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) { return <textarea ref={ref} className={cx('input textarea', className)} {...rest} />; });
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) { return <select ref={ref} className={cx('input select', className)} {...rest}>{children}</select>; });

/* ---------- display ---------- */
export function Badge({ tone = 'neutral', children, icon }: { tone?: 'neutral' | 'info' | 'active' | 'warn' | 'done' | 'help' | 'blue' | 'orange'; children: ReactNode; icon?: ReactNode }) {
  return <span className={cx('badge', `badge-${tone}`)}>{icon}{children}</span>;
}
export function ProgressBar({ value, label, tone = 'accent', indeterminate }: { value: number | null; label: string; tone?: 'accent' | 'blue' | 'orange' | 'done'; indeterminate?: boolean }) {
  const v = value === null ? 0 : Math.min(100, Math.max(0, value));
  return (
    <div className={cx('bar', `bar-${tone}`, indeterminate && 'bar-unknown')} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value === null ? undefined : v} aria-valuetext={value === null ? 'unknown' : `${v}%`}>
      <span style={{ width: `${v}%` }} />
    </div>
  );
}
/** A person is always shown as a marker + code: ● (IR, blue) and ■ (LA, orange). The shape differs so colour is never the only cue. */
export function Avatar({ code, accent, size = 18, label }: { code: string; accent: 'blue' | 'orange'; size?: number; label?: string }) {
  return <span className={cx('person', `person-${accent}`)} style={{ fontSize: size * 0.7 }} role="img" aria-label={label ?? code}><i className="mk" aria-hidden />{code}</span>;
}
export function Skeleton({ h = 16, w = '100%', r = 8 }: { h?: number; w?: number | string; r?: number }) { return <span className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden />; }
export function SkeletonCards({ n = 3 }: { n?: number }) {
  return <div className="stack" aria-busy="true" aria-label="Loading">{Array.from({ length: n }, (_, i) => <div key={i} className="card"><Skeleton h={18} w="55%" /><div style={{ height: 10 }} /><Skeleton h={12} /><div style={{ height: 6 }} /><Skeleton h={12} w="80%" /></div>)}</div>;
}
export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty">{icon && <div className="empty-icon" aria-hidden>{icon}</div>}<h3>{title}</h3>{children && <p className="muted">{children}</p>}{action}</div>;
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="empty empty-error" role="alert"><h3>Could not load this</h3><p className="muted">{message}</p>{onRetry && <Button onClick={onRetry}>Try again</Button>}</div>;
}
export function Card({ children, className, as: Tag = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'article' | 'div' } & React.HTMLAttributes<HTMLElement>) {
  return <Tag className={cx('card', className)} {...rest}>{children}</Tag>;
}
export function SectionHeader({ title, action, sub }: { title: string; action?: ReactNode; sub?: ReactNode }) {
  return <div className="section-head"><div><h2>{title}</h2>{sub && <p className="muted small">{sub}</p>}</div>{action}</div>;
}
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode; aria?: string }>; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} aria-label={o.aria} className={cx('seg-item', value === o.value && 'seg-on')} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}
export function Chip({ children, on, onClick, onRemove }: { children: ReactNode; on?: boolean; onClick?: () => void; onRemove?: () => void }) {
  if (onRemove) return <span className="chip chip-on">{children}<button type="button" className="chip-x" aria-label="Remove" onClick={onRemove}><X size={12} aria-hidden /></button></span>;
  return <button type="button" className={cx('chip', on && 'chip-on')} aria-pressed={on} onClick={onClick}>{children}</button>;
}
export function VisuallyHidden({ children }: { children: ReactNode }) { return <span className="sr-only">{children}</span>; }

export function Dot({ n }: { n?: number }) { return n ? <span className="dotc" aria-label={`${n} new`}>{n > 99 ? '99+' : n}</span> : null; }
export function Tabs<T extends string>({ value, onChange, tabs, label }: { value: T; onChange: (v: T) => void; tabs: Array<{ value: T; label: ReactNode; dot?: number }>; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => <button key={t.value} role="tab" aria-selected={value === t.value} className={cx('tabs-item', value === t.value && 'on')} onClick={() => onChange(t.value)}>{t.label}<Dot n={t.dot} /></button>)}
    </div>
  );
}
