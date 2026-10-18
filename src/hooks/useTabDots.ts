import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAnnouncements, useAnnReads, useChangeLog, useMessages, useTabSeen } from '@/api/queries';
import { markTabSeen } from '@/api/mutations';
import { unreadByTab } from '@/lib/domain/changelog';
import { useAuth } from './useAuth';
import type { TabName } from '@/types/db';

export const PATH_TAB: Record<string, TabName> = { '/plan': 'plan', '/library': 'library', '/words': 'words', '/notes': 'notes', '/notices': 'notices', '/chat': 'chat', '/log': 'log' };

/** Update bubbles: counts of the OTHER person's changes since this person last opened each tab. Opening a tab clears its bubble. */
export function useTabDots() {
  const { me } = useAuth(); const loc = useLocation(); const qc = useQueryClient();
  const { data: log } = useChangeLog(400); const { data: seen } = useTabSeen(); const { data: msgs } = useMessages();
  const { data: anns } = useAnnouncements(); const { data: reads } = useAnnReads();
  const seenMap = useMemo(() => Object.fromEntries((seen ?? []).map((s) => [s.tab, s.seen_at])) as Partial<Record<TabName, string>>, [seen]);
  const dots = useMemo(() => {
    const d = unreadByTab(log ?? [], seenMap, me?.id);
    d.chat = (msgs ?? []).filter((m) => m.sender_id !== me?.id && !m.read_at).length || undefined;
    const readIds = new Set((reads ?? []).map((r) => r.announcement_id)); const now = Date.now();
    const unreadNotices = (anns ?? []).filter((a) => a.author_id !== me?.id && !readIds.has(a.id) && (!a.expires_at || new Date(a.expires_at).getTime() > now)).length;
    d.notices = Math.max(d.notices ?? 0, unreadNotices) || undefined;
    delete d.log;
    return d;
  }, [log, seenMap, me?.id, msgs, anns, reads]);

  const tab = PATH_TAB[loc.pathname]; const lastCount = useRef(0);
  const here = tab ? (dots[tab] ?? 0) : 0;
  useEffect(() => {
    if (!me || !tab || tab === 'chat' || tab === 'log') return;
    if (here === 0 && lastCount.current === 0 && seenMap[tab]) return;
    lastCount.current = here;
    const t = window.setTimeout(() => { void markTabSeen(me.id, tab).then(() => qc.invalidateQueries({ queryKey: ['tab_seen'] }), () => undefined); }, 900);
    return () => window.clearTimeout(t);
  }, [me, tab, here, seenMap, qc]);
  return dots;
}
