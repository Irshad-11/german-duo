import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, CheckCheck, Send } from 'lucide-react';
import { useMessages } from '@/api/queries';
import { markMessagesRead, sendMessage } from '@/api/mutations';
import { useWho } from '@/hooks/useWho';
import { useLiveStatus } from '@/hooks/useRealtime';
import { useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState, SkeletonCards, Textarea } from '@/components/ui/ui';
import { friendlyError } from '@/lib/errors';
import { formatDayLong, formatTime, toISO } from '@/lib/domain/dates';
import type { Message } from '@/types/db';

interface Pending { id: string; body: string; created_at: string; status: 'sending' | 'failed'; error?: string }
const DRAFT_KEY = 'gd-draft-chat';

export default function ChatPage() {
  const { me, other } = useWho();
  const qc = useQueryClient();
  const live = useLiveStatus();
  const msgs = useMessages();
  const [pending, setPending] = useState<Pending[]>([]);
  const [text, setText] = useState(() => { try { return localStorage.getItem(DRAFT_KEY) ?? ''; } catch { return ''; } });
  const endRef = useRef<HTMLDivElement>(null); const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { try { if (text) localStorage.setItem(DRAFT_KEY, text); else localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } }, [text]);   // unsent draft only

  const serverIds = useMemo(() => new Set((msgs.data ?? []).map((m) => m.id)), [msgs.data]);
  useEffect(() => { setPending((p) => p.filter((x) => !(x.status === 'sending' && serverIds.has(x.id)))); }, [serverIds]);

  const items: Array<Message | (Pending & { sender_id: string; read_at: null })> = useMemo(() => [
    ...(msgs.data ?? []),
    ...pending.filter((p) => !serverIds.has(p.id)).map((p) => ({ ...p, sender_id: me?.id ?? '', read_at: null })),
  ], [msgs.data, pending, serverIds, me?.id]);

  const unreadFromPartner = (msgs.data ?? []).some((m) => m.sender_id !== me?.id && !m.read_at);
  useEffect(() => {
    if (!unreadFromPartner || document.visibilityState !== 'visible') return;
    const t = window.setTimeout(() => { void markMessagesRead().then(() => qc.invalidateQueries({ queryKey: ['messages'] })).catch(() => undefined); }, 400);
    return () => window.clearTimeout(t);
  }, [unreadFromPartner, items.length, qc]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [items.length]);

  const deliver = useCallback(async (p: Pending) => {
    try { await sendMessage({ id: p.id, body: p.body }); void qc.invalidateQueries({ queryKey: ['messages'] }); }
    catch (e) { setPending((xs) => xs.map((x) => (x.id === p.id ? { ...x, status: 'failed', error: friendlyError(e) } : x))); }
  }, [qc]);

  function send() {
    const body = text.trim(); if (!body) return;
    const p: Pending = { id: crypto.randomUUID(), body, created_at: new Date().toISOString(), status: 'sending' };
    setPending((xs) => [...xs, p]); setText(''); void deliver(p);
  }
  const retry = (p: Pending) => { setPending((xs) => xs.map((x) => (x.id === p.id ? { ...x, status: 'sending', error: undefined } : x))); void deliver({ ...p, status: 'sending' }); };

  if (msgs.isError) return <ErrorState message={(msgs.error as Error).message} onRetry={() => void msgs.refetch()} />;
  if (msgs.isLoading) return <SkeletonCards n={2} />;

  let lastDay = '';
  return (
    <div className="chat">
      <div className="chat-list" ref={listRef} role="log" aria-live="polite" aria-label={`Conversation with ${other?.display_name ?? 'the other learner'}`}>
        {items.length === 0 && <EmptyState title="Say hallo!">Messages stay in the app and sync instantly between your devices.</EmptyState>}
        {items.map((m) => {
          const mineMsg = m.sender_id === me?.id; const day = toISO(new Date(m.created_at)); const sep = day !== lastDay; lastDay = day;
          const p = 'status' in m ? (m as Pending) : null;
          return (
            <div key={m.id}>
              {sep && <p className="day-sep">{formatDayLong(day)}</p>}
              <div className={`bubble ${mineMsg ? 'bubble-me' : 'bubble-them'} ${p?.status === 'failed' ? 'bubble-failed' : ''}`}>
                <p className="prewrap">{m.body}</p>
                <p className="bubble-meta">{formatTime(m.created_at)}{mineMsg && (p ? (p.status === 'sending' ? <> · sending…</> : <> · <AlertCircle size={12} aria-hidden /> not sent</>) : m.read_at ? <> <CheckCheck size={13} aria-label="Seen" /></> : <> <Check size={13} aria-label="Sent" /></>)}</p>
                {p?.status === 'failed' && <p className="small"><span role="alert">{p.error}</span> <button className="linklike" onClick={() => retry(p)}>Retry</button> · <button className="linklike" onClick={() => setPending((xs) => xs.filter((x) => x.id !== p.id))}>Discard</button></p>}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <Textarea aria-label="Message" rows={1} value={text} placeholder={live === 'offline' ? 'Offline — messages will fail until you reconnect' : 'Write a message…'} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} maxLength={4000} />
        <Button type="submit" variant="primary" disabled={!text.trim()} aria-label="Send message" icon={<Send size={18} aria-hidden />} />
      </form>
    </div>
  );
}
