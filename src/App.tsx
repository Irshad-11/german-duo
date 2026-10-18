import { Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { ThemeProvider, useTheme } from '@/hooks/useTheme';
import { ToastProvider } from '@/hooks/useToast';
import { RealtimeProvider } from '@/hooks/useRealtime';
import { QuickProvider } from '@/hooks/useQuick';
import { Shell } from '@/components/Shell';
import { Splash } from '@/components/Splash';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoginPage, NotConfigured } from '@/pages/LoginPage';
import { SkeletonCards } from '@/components/ui/ui';
import { isConfigured } from '@/lib/env';
import { updateProfile } from '@/api/mutations';
import type { ThemePref } from '@/types/db';

const Dashboard = lazy(() => import('@/pages/DashboardPage'));
const Plan = lazy(() => import('@/pages/PlanPage'));
const LibraryPage = lazy(() => import('@/pages/LibraryPage'));
const Log = lazy(() => import('@/pages/LogPage'));
const Words = lazy(() => import('@/pages/WordsPage'));
const Notes = lazy(() => import('@/pages/NotesPage'));
const Chat = lazy(() => import('@/pages/ChatPage'));
const Notices = lazy(() => import('@/pages/NoticesPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: (n, err) => n < 2 && !/jwt|permission|row-level/i.test((err as Error)?.message ?? ''), refetchOnWindowFocus: true, staleTime: 15_000 },
    },
  });
}

/** Wires the theme to the signed-in learner's profile so the preference follows them across devices. */
function ThemeBridge({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const persist = useMemo(() => (p: ThemePref) => { if (me) void updateProfile(me.id, { theme_pref: p }).catch(() => undefined); }, [me]);
  return <ThemeProvider onPersist={persist}><AdoptProfileTheme />{children}</ThemeProvider>;
}
function AdoptProfileTheme() {
  const { me } = useAuth();
  const { setPref } = useTheme();
  const id = me?.id; const pref = me?.theme_pref;
  useEffect(() => { if (id && pref) setPref(pref, false); }, [id, pref, setPref]);   // profile preference wins on sign-in
  return null;
}

function Gate() {
  const { status } = useAuth();
  const [min, setMin] = useState(false); const [gone, setGone] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(() => setMin(true), reduce ? 500 : 1700); return () => window.clearTimeout(t);
  }, []);
  useEffect(() => { if (!min || status === 'loading') return; const t = window.setTimeout(() => setGone(true), 400); return () => window.clearTimeout(t); }, [min, status]);
  if (!gone) return <Splash leaving={min && status !== 'loading'} />;
  if (status === 'signedOut') return <LoginPage />;
  return (
    <RealtimeProvider>
      <QuickProvider>
        <Suspense fallback={<div className="page"><SkeletonCards /></div>}>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Dashboard />} />
              <Route path="plan" element={<Plan />} />
              <Route path="library" element={<LibraryPage />} />
              <Route path="words" element={<Words />} />
              <Route path="notes" element={<Notes />} />
              <Route path="chat" element={<Chat />} />
              <Route path="notices" element={<Notices />} />
              <Route path="log" element={<Log />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </QuickProvider>
    </RealtimeProvider>
  );
}

export function App() {
  const client = useMemo(makeClient, []);
  if (!isConfigured) return <ThemeProvider><NotConfigured /></ThemeProvider>;
  return (
    <ErrorBoundary>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <ThemeBridge>
            <ToastProvider>
              <BrowserRouter><Gate /></BrowserRouter>
            </ToastProvider>
          </ThemeBridge>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
