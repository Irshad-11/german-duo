import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { LEARNER_EMAILS } from '@/lib/learners';
import { touchSession } from '@/api/mutations';
import type { Learner } from '@/types/db';

export type SignInResult = { ok: true } | { ok: false; reason: 'invalid' | 'rate_limited' | 'network' | 'server' | 'not_learner' };
interface AuthApi {
  status: 'loading' | 'signedOut' | 'signedIn';
  session: Session | null;
  me: Learner | null;
  notice: string | null;
  signIn: (key: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  clearNotice: () => void;
  refreshMe: () => Promise<void>;
}
const Ctx = createContext<AuthApi | null>(null);

async function fetchLearner(uid: string): Promise<Learner | null> {
  const { data, error } = await supabase.from('learners').select('*').eq('id', uid).maybeSingle();
  if (error) throw error;
  return (data as Learner | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<AuthApi['status']>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Learner | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const intentionalSignOut = useRef(false);

  const hydrate = useCallback(async (s: Session | null) => {
    if (!s) { setSession(null); setMe(null); setStatus('signedOut'); return; }
    try {
      const learner = await fetchLearner(s.user.id);
      if (!learner) {
        await supabase.auth.signOut();
        setNotice('This account is not a registered learner.');
        setSession(null); setMe(null); setStatus('signedOut'); return;
      }
      setSession(s); setMe(learner); setStatus('signedIn');
      void touchSession(false).catch(() => undefined);
    } catch {
      // Could not load the profile (offline?). Keep the session; show the app shell with retry via refreshMe.
      setSession(s); setStatus('signedIn');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) void hydrate(data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!alive) return;
      if (event === 'SIGNED_OUT') {
        if (!intentionalSignOut.current) setNotice('Your session ended. Enter your access key to continue.');
        intentionalSignOut.current = false;
        qc.clear(); setSession(null); setMe(null); setStatus('signedOut');
      } else if (event === 'TOKEN_REFRESHED' && s) { setSession(s); }
      else if (event === 'SIGNED_IN' && s) { setTimeout(() => { void hydrate(s); }, 0); }  // avoid awaiting supabase calls inside the callback
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [hydrate, qc]);

  const signIn = useCallback<AuthApi['signIn']>(async (key) => {
    // The key is the password of exactly one of the two learner accounts; Supabase Auth hashes/verifies it and rate-limits attempts.
    let sawRateLimit = false; let sawNetwork = false;
    for (const email of LEARNER_EMAILS) {
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password: key.trim() });
        if (!error) { setNotice(null); void touchSession(true).catch(() => undefined); return { ok: true }; }
        if (error.status === 429 || /rate limit/i.test(error.message)) sawRateLimit = true;
        else if (/failed to fetch|network/i.test(error.message)) sawNetwork = true;
      } catch { sawNetwork = true; }
    }
    return { ok: false, reason: sawRateLimit ? 'rate_limited' : sawNetwork ? 'network' : 'invalid' };
  }, []);

  const signOut = useCallback(async () => {
    intentionalSignOut.current = true;
    await supabase.auth.signOut();
    qc.clear(); setSession(null); setMe(null); setStatus('signedOut'); setNotice(null);
  }, [qc]);

  const refreshMe = useCallback(async () => { if (session) setMe(await fetchLearner(session.user.id)); }, [session]);

  const api = useMemo<AuthApi>(() => ({ status, session, me, notice, signIn, signOut, clearNotice: () => setNotice(null), refreshMe }), [status, session, me, notice, signIn, signOut, refreshMe]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used inside <AuthProvider>');
  return c;
}
