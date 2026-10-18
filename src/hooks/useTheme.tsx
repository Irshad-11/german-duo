import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ThemePref } from '@/types/db';

const KEY = 'gd-theme';
interface ThemeApi { pref: ThemePref; resolved: 'light' | 'dark'; setPref: (p: ThemePref, persist?: boolean) => void }
const Ctx = createContext<ThemeApi | null>(null);

export function readStoredTheme(): ThemePref {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'; } catch { return 'system'; }
}
export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'system') return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return pref;
}
export function applyTheme(resolved: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', resolved);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0E1122' : '#F5F6FA');
}

/** `onPersist` lets the app also save the preference on the learner profile (so it follows them across devices). */
export function ThemeProvider({ children, onPersist }: { children: ReactNode; onPersist?: (p: ThemePref) => void }) {
  const [pref, setPrefState] = useState<ThemePref>(readStoredTheme);
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolveTheme(readStoredTheme()));

  useEffect(() => {
    const r = resolveTheme(pref); setResolved(r); applyTheme(r);
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = () => { const x = resolveTheme('system'); setResolved(x); applyTheme(x); };
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [pref]);

  const setPref = useCallback((p: ThemePref, persist = true) => {
    try { localStorage.setItem(KEY, p); } catch { /* storage may be blocked; theme still applies for this session */ }
    setPrefState(p); if (persist) onPersist?.(p);
  }, [onPersist]);

  const api = useMemo(() => ({ pref, resolved, setPref }), [pref, resolved, setPref]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTheme must be used inside <ThemeProvider>');
  return c;
}
