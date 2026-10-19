import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAnnouncements, useAnnReads } from '@/api/queries';
import { createAnnouncement, deleteAnnouncement, setAnnouncementRead, updateAnnouncement } from '@/api/mutations';
import { useRun } from '@/hooks/useRun';
import { useWho } from '@/hooks/useWho';
import { Badge, Button, Dialog, EmptyState, ErrorState, Field, Input, Segmented, SkeletonCards, Textarea } from '@/components/ui/ui';
import { Page, TalkTabs } from '@/components/Page';
import { announcementSchema } from '@/lib/validation';
import { timeAgo } from '@/lib/domain/dates';
import type { Announcement } from '@/types/db';

type Form = z.infer<typeof announcementSchema>;
const toLocalInput = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

export default function NoticesPage() {
  const { me, nameOf } = useWho(); const run = useRun();
  const anns = useAnnouncements(); const reads = useAnnReads();
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null);
    const [showExpired, setShowExpired] = useState(false);
  const readMap = useMemo(() => new Map((reads.data ?? []).map((r) => [r.announcement_id, r])), [reads.data]);
  const now = Date.now();
  const list = (anns.data ?? []).filter((a) => showExpired || !a.expires_at || new Date(a.expires_at).getTime() > now)
    .sort((a, b) => (a.priority === b.priority ? b.created_at.localeCompare(a.created_at) : a.priority === 'important' ? -1 : 1));

  // opening the page marks other people's notices as read (not dismissed)
  const unseen = list.filter((a) => a.author_id !== me?.id && !readMap.has(a.id)).map((a) => a.id).join(',');
  useEffect(() => {
    if (!me || !unseen) return;
    const t = window.setTimeout(() => { for (const id of unseen.split(',')) void setAnnouncementRead(me.id, id, false).then(() => undefined, () => undefined); void reads.refetch(); }, 1500);
    return () => window.clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unseen, me?.id]);

  if (anns.isError) return <ErrorState message={(anns.error as Error).message} onRetry={() => void anns.refetch()} />;
  if (anns.isLoading || !me) return <SkeletonCards n={2} />;

  return (
    <Page kicker="Talk" title="Notices" lead="Short messages both of you should see on Today — a quiz, a reminder, an exam date." actions={<Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setEditing('new')}>New notice</Button>}>
      <TalkTabs />
      <div className="row between wrap"><span /><div className="row wrap">
        <Segmented<'active' | 'all'> label="Which notices" value={showExpired ? 'all' : 'active'} onChange={(v) => setShowExpired(v === 'all')} options={[{ value: 'active', label: 'Active' }, { value: 'all', label: 'Incl. expired' }]} />
        </div></div>
      {list.length === 0 ? <div><EmptyState icon={<Megaphone size={28} />} title="No notices" action={<Button variant="primary" onClick={() => setEditing('new')}>Post a notice</Button>}>Use notices for things both of you should see on the dashboard — a study session, a reminder, an exam date.</EmptyState></div> : (
        <ul className="plain-list stack">{list.map((a) => {
          const r = readMap.get(a.id); const expired = a.expires_at && new Date(a.expires_at).getTime() <= now; const unread = a.author_id !== me.id && !r;
          return (
            <li key={a.id}><article className={`panel ${a.priority === 'important' ? 'card-important' : ''} ${expired ? 'card-faded' : ''}`}>
              <div className="row between wrap"><h2>{a.title}</h2><div className="row wrap">{a.priority === 'important' && <Badge tone="warn">Important</Badge>}{unread && <Badge tone="info">New</Badge>}{expired && <Badge>Expired</Badge>}{r?.dismissed && <Badge>Hidden on dashboard</Badge>}</div></div>
              <p className="prewrap">{a.body}</p>
              <p className="small muted">{nameOf(a.author_id)} · {timeAgo(a.created_at)}{a.expires_at ? ` · ${expired ? 'expired' : 'expires'} ${new Date(a.expires_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}{a.updated_at !== a.created_at && a.updated_at.slice(0, 16) !== a.created_at.slice(0, 16) ? ' · edited' : ''}</p>
              <div className="row wrap">
                {r?.dismissed ? <Button size="sm" onClick={() => void run(() => setAnnouncementRead(me.id, a.id, false), { invalidate: ['ann_reads'] })}>Show on dashboard</Button> : <Button size="sm" variant="ghost" onClick={() => void run(() => setAnnouncementRead(me.id, a.id, true), { invalidate: ['ann_reads'] })}>Hide from my dashboard</Button>}
                {a.author_id === me.id && <><Button size="sm" icon={<Pencil size={14} aria-hidden />} onClick={() => setEditing(a)}>Edit</Button><Button size="sm" variant="ghost" icon={<Trash2 size={14} aria-hidden />} onClick={() => void run(() => deleteAnnouncement(a.id), { ok: 'Notice deleted', invalidate: ['announcements', 'change_log'], undo: { table: 'announcements', op: 'DELETE', rowId: a.id } })}>Delete</Button></>}
              </div>
            </article></li>);
        })}</ul>
      )}
      <NoticeDialog target={editing} onClose={() => setEditing(null)} />
    </Page>
  );
}

function NoticeDialog({ target, onClose }: { target: Announcement | 'new' | null; onClose: () => void }) {
  return <Dialog open={!!target} onClose={onClose} title={target === 'new' ? 'New notice' : 'Edit notice'}>{target && <NoticeForm target={target} onClose={onClose} />}</Dialog>;
}
function NoticeForm({ target, onClose }: { target: Announcement | 'new'; onClose: () => void }) {
  const run = useRun(); const a = target === 'new' ? null : target;
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(announcementSchema), defaultValues: { title: a?.title ?? '', body: a?.body ?? '', priority: a?.priority ?? 'normal', expires: toLocalInput(a?.expires_at ?? null) } });
  const priority = watch('priority');
  async function submit(v: Form) {
    const payload = { title: v.title.trim(), body: v.body.trim(), priority: v.priority, expires_at: v.expires ? new Date(v.expires).toISOString() : null };
    const res = await run(async () => { if (a) { await updateAnnouncement(a.id, payload); return a.id; } return createAnnouncement(payload); }, { ok: a ? 'Notice updated' : 'Notice posted', invalidate: ['announcements', 'change_log'], undo: { table: 'announcements', op: a ? 'UPDATE' : 'INSERT', rowId: a?.id, fromResult: (id: string) => id } });
    if (res.ok) onClose();
  }
  return (
    <form className="stack" onSubmit={handleSubmit(submit)} noValidate>
      <Field label="Title" htmlFor="an-t" error={errors.title?.message}><Input id="an-t" autoFocus {...register('title')} /></Field>
      <Field label="Message" htmlFor="an-b" error={errors.body?.message}><Textarea id="an-b" rows={4} {...register('body')} /></Field>
      <Field label="Priority"><Segmented label="Priority" value={priority} onChange={(v) => setValue('priority', v)} options={[{ value: 'normal', label: 'Normal' }, { value: 'important', label: 'Important' }]} /></Field>
      <Field label="Expires (optional)" htmlFor="an-e" hint="After this time the notice leaves the dashboard."><Input id="an-e" type="datetime-local" {...register('expires')} /></Field>
      <div className="dialog-actions"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" busy={isSubmitting}>{a ? 'Save' : 'Post notice'}</Button></div>
    </form>
  );
}
