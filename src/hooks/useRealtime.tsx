import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

export type LiveStatus = 'connecting' | 'live' | 'offline';
const Ctx = createContext<LiveStatus>('connecting');

/** table -> query keys that must be refetched when a row changes (RLS already filters what each learner receives). */
export const TABLE_KEYS: Record<string, string[]> = {
  plans: ['plan'], resources: ['resources'], curriculum_items: ['curriculum'], goals: ['goals'], goal_resources: ['goal_resources'],
  study_sessions: ['sessions'], activity_log: ['activity'], postponement_requests: ['postponements', 'goals'], goal_deadline_history: ['deadline_history'],
  resource_status_history: ['status_history'], vocab_words: ['vocab'], vocab_review_log: ['vocab_log'], vocab_favorites: ['vocab_fav'],
  vocab_annotations: ['vocab_ann'], vocab_review_state: ['vocab_state'], notes: ['notes'], note_replies: ['replies'], messages: ['messages'],
  announcements: ['announcements'], announcement_reads: ['ann_reads'], notifications: ['notifications'],
};

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, session } = useAuth();
  const qc = useQueryClient();
  const [live, setLive] = useState<LiveStatus>('connecting');
  const wasOffline = useRef(false);
  const uid = session?.user.id;

  useEffect(() => {
    if (authStatus !== 'signedIn' || !uid) return;
    const pending = new Set<string>();
    let timer: number | undefined;
    const flush = () => { timer = undefined; for (const k of pending) void qc.invalidateQueries({ queryKey: [k] }); pending.clear(); };
    const queue = (keys: string[]) => { keys.forEach((k) => pending.add(k)); if (timer === undefined) timer = window.setTimeout(flush, 150); };  // coalesce bursts

    let channel = supabase.channel(`gd-${uid}`);
    for (const [table, keys] of Object.entries(TABLE_KEYS)) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => queue(keys));
    }
    channel.subscribe((s) => {
      if (s === 'SUBSCRIBED') {
        setLive('live');
        if (wasOffline.current) { wasOffline.current = false; void qc.invalidateQueries(); }     // recover: refetch everything missed while disconnected
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') { wasOffline.current = true; setLive('offline'); }
    });
    const onOnline = () => { void qc.invalidateQueries(); };
    const onOffline = () => { wasOffline.current = true; setLive('offline'); };
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline);
      void supabase.removeChannel(channel);
    };
  }, [authStatus, uid, qc]);

  const value = useMemo(() => live, [live]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useLiveStatus = (): LiveStatus => useContext(Ctx);
