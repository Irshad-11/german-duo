import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HelpCircle, Lightbulb, Lock, Plus, Search, Trash2, Users } from 'lucide-react';
import { useGoalResources, useNotes, useReplies, useResources, useVocab } from '@/api/queries';
import { addReply, createNote, deleteNote, deleteReply, setQuestionState, updateNote } from '@/api/mutations';
import { useRun } from '@/hooks/useRun';
import { useWho } from '@/hooks/useWho';
import { useQuick } from '@/hooks/useQuick';
import { Badge, Button, Card, Chip, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, Segmented, Select, SkeletonCards, Textarea } from '@/components/ui/ui';
import { NOTE_KINDS } from '@/components/dialogs';
import { timeAgo } from '@/lib/domain/dates';
import { noteSchema } from '@/lib/validation';
import type { Note, NoteKind } from '@/types/db';

type Scope = 'all' | 'mine' | 'shared' | 'questions';
const KIND_LABEL = Object.fromEntries(NOTE_KINDS.map((k) => [k.value, k.label])) as Record<NoteKind, string>;
const STATE_LABEL = { open: 'Unresolved', answered: 'Answered', discuss: 'Needs discussion' } as const;

export default function NotesPage() {
  const { me, nameOf } = useWho(); const run = useRun(); const quick = useQuick();
  const notes = useNotes();
  const [sp, setSp] = useSearchParams();
  const [scope, setScope] = useState<Scope>('all'); const [kind, setKind] = useState<NoteKind | ''>(''); const [q, setQ] = useState(''); const [tag, setTag] = useState('');
  const [openId, setOpenId] = useState<string | null>(sp.get('note'));
  const [quickText, setQuickText] = useState(''); const [quickKind, setQuickKind] = useState<NoteKind>('note'); const [quickShared, setQuickShared] = useState(false); const [quickErr, setQuickErr] = useState<string | null>(null);

  useEffect(() => { const n = sp.get('note'); if (n) setOpenId(n); }, [sp]);
  const tags = useMemo(() => { const c = new Map<string, number>(); for (const n of notes.data ?? []) for (const t of n.tags) c.set(t, (c.get(t) ?? 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t); }, [notes.data]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (notes.data ?? []).filter((n) => (scope === 'all' || (scope === 'mine' ? n.owner_id === me?.id : scope === 'shared' ? n.visibility === 'shared' : n.kind === 'question')) && (!kind || n.kind === kind) && (!tag || n.tags.includes(tag)) &&
      (!s || [n.title, n.body, n.category, ...n.tags].some((x) => x?.toLowerCase().includes(s))));
  }, [notes.data, scope, kind, q, tag, me?.id]);
  const current = (notes.data ?? []).find((n) => n.id === openId) ?? null;

  async function quickSave() {
    const p = noteSchema.safeParse({ body: quickText, title: '' });
    if (!p.success) { setQuickErr(p.error.issues[0].message); return; }
    const shared = quickShared || quickKind === 'question';
    const res = await run(() => createNote({ visibility: shared ? 'shared' : 'private', kind: quickKind, body: p.data.body, question_state: quickKind === 'question' ? 'open' : null }), { ok: shared ? 'Saved for both of you' : 'Saved privately', invalidate: ['notes'] });
    if (res.ok) { setQuickText(''); setQuickErr(null); }
  }
  if (notes.isError) return <ErrorState message={(notes.error as Error).message} onRetry={() => void notes.refetch()} />;
  if (notes.isLoading || !me) return <SkeletonCards />;

  return (
    <div className="stack-lg">
      <h1>Notes &amp; questions</h1>
      <Card className="capture">
        <Field label="Quick capture" htmlFor="qc" error={quickErr} hint="A word, a rule, a confusing sentence, a question — write it down now, sort it later.">
          <Textarea id="qc" rows={2} value={quickText} placeholder="e.g. “wegen” + Genitiv, but people say Dativ?" onChange={(e) => { setQuickText(e.target.value); setQuickErr(null); }}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void quickSave(); }} />
        </Field>
        <div className="chips" role="group" aria-label="Kind">{NOTE_KINDS.map((k) => <Chip key={k.value} on={quickKind === k.value} onClick={() => setQuickKind(k.value)}>{k.label}</Chip>)}</div>
        <div className="row between wrap">
          <Segmented label="Who can see it" value={quickShared || quickKind === 'question' ? 'shared' : 'private'} onChange={(v) => setQuickShared(v === 'shared')}
            options={[{ value: 'private', label: <><Lock size={14} aria-hidden /> Just me</> }, { value: 'shared', label: <><Users size={14} aria-hidden /> Both</> }]} />
          <div className="row wrap">{quickKind === 'word' && quickText.trim() && <Button size="sm" onClick={() => quick.openWord(quickText.trim())}>Add to vocabulary</Button>}<Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => void quickSave()}>Save</Button></div>
        </div>
      </Card>

      <div className="stack-sm">
        <div className="search"><Search size={16} aria-hidden /><Input aria-label="Search notes" placeholder="Search notes, tags, categories" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Segmented<Scope> label="Show" value={scope} onChange={setScope} options={[{ value: 'all', label: 'All' }, { value: 'mine', label: 'Mine' }, { value: 'shared', label: 'Shared' }, { value: 'questions', label: 'Questions' }]} />
        <div className="chips" role="group" aria-label="Filter by kind and tag">
          {NOTE_KINDS.map((k) => <Chip key={k.value} on={kind === k.value} onClick={() => setKind(kind === k.value ? '' : k.value)}>{k.label}</Chip>)}
          {tags.map((t) => <Chip key={t} on={tag === t} onClick={() => setTag(tag === t ? '' : t)}>#{t}</Chip>)}
        </div>
      </div>

      {list.length === 0 ? <Card><EmptyState icon={<Lightbulb size={28} />} title={(notes.data ?? []).length ? 'No notes match' : 'No notes yet'}>{(notes.data ?? []).length ? 'Clear a filter or search for something else.' : 'Use quick capture above. Private notes stay private; shared notes and questions appear for both of you.'}</EmptyState></Card> : (
        <ul className="plain-list stack-sm" aria-label="Notes">
          {list.map((n) => (
            <li key={n.id}>
              <button className="note-card" onClick={() => { setOpenId(n.id); setSp((p) => { const x = new URLSearchParams(p); x.set('note', n.id); return x; }, { replace: true }); }}>
                <span className="row wrap"><Badge tone={n.kind === 'question' ? 'info' : 'neutral'} icon={n.kind === 'question' ? <HelpCircle size={12} aria-hidden /> : undefined}>{KIND_LABEL[n.kind]}</Badge>
                  {n.visibility === 'private' ? <Badge icon={<Lock size={11} aria-hidden />}>private</Badge> : <Badge tone="cobalt" icon={<Users size={11} aria-hidden />}>shared</Badge>}
                  {n.question_state && <Badge tone={n.question_state === 'answered' ? 'done' : n.question_state === 'discuss' ? 'warn' : 'help'}>{STATE_LABEL[n.question_state]}</Badge>}</span>
                <span className="note-title">{n.title ?? n.body.slice(0, 80)}</span>
                {n.title && <span className="muted clamp2">{n.body}</span>}
                <span className="small muted">{n.owner_id === me.id ? 'You' : nameOf(n.owner_id)} · {timeAgo(n.updated_at)}{n.tags.length ? ` · ${n.tags.map((t) => '#' + t).join(' ')}` : ''}{n.link_page ? ` · p. ${n.link_page}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <NoteDialog note={current} onClose={() => { setOpenId(null); setSp((p) => { const x = new URLSearchParams(p); x.delete('note'); return x; }, { replace: true }); }} />
    </div>
  );
}

function NoteDialog({ note, onClose }: { note: Note | null; onClose: () => void }) {
  return <Dialog open={!!note} onClose={onClose} title={note ? KIND_LABEL[note.kind] : ''} wide>{note && <NoteBody key={note.id} note={note} onClose={onClose} />}</Dialog>;
}
function NoteBody({ note, onClose }: { note: Note; onClose: () => void }) {
  const { me, nameOf } = useWho(); const run = useRun(); const quick = useQuick();
  const mine = note.owner_id === me?.id;
  const { data: replies } = useReplies(note.visibility === 'shared' ? note.id : null);
  const { data: grs } = useGoalResources(); const { data: resources } = useResources(); const { data: vocab } = useVocab();
  const [title, setTitle] = useState(note.title ?? ''); const [body, setBody] = useState(note.body); const [tags, setTags] = useState(note.tags.join(', ')); const [category, setCategory] = useState(note.category ?? '');
  const [shared, setShared] = useState(note.visibility === 'shared'); const [kind, setKind] = useState<NoteKind>(note.kind);
  const [lgr, setLgr] = useState(note.link_goal_resource_id ?? ''); const [lw, setLw] = useState(note.link_word_id ?? ''); const [page, setPage] = useState(note.link_page ? String(note.link_page) : ''); const [topic, setTopic] = useState(note.link_topic ?? '');
  const [reply, setReply] = useState(''); const [del, setDel] = useState(false); const [err, setErr] = useState<string | null>(null);
  const linkedRes = (grs ?? []).find((r) => r.id === note.link_goal_resource_id); const linkedRaw = (resources ?? []).find((r) => r.id === note.link_resource_id); const linkedWord = (vocab ?? []).find((w) => w.id === note.link_word_id);

  async function save() {
    const p = noteSchema.safeParse({ body, title }); if (!p.success) { setErr(p.error.issues[0].message); return; }
    if (page && !(Number.isInteger(Number(page)) && Number(page) > 0)) { setErr('Page must be a whole number'); return; }
    const res = await run(() => updateNote(note.id, { title: p.data.title || null, body: p.data.body, kind, category: category.trim() || null, visibility: shared ? 'shared' : 'private',
      tags: [...new Set(tags.split(/[,#]/).map((t) => t.trim().toLowerCase()).filter(Boolean))], link_goal_resource_id: lgr || null, link_word_id: lw || null, link_page: page ? Number(page) : null, link_topic: topic.trim() || null,
      question_state: kind === 'question' ? (note.question_state ?? 'open') : null }), { ok: 'Saved', invalidate: ['notes'] });
    if (res.ok) onClose();
  }
  const setState = (s: 'open' | 'answered' | 'discuss') => void run(() => setQuestionState(note.id, s), { ok: s === 'answered' ? 'Marked answered' : 'Updated', invalidate: ['notes'] });

  return (
    <div className="stack">
      <p className="small muted">{mine ? 'Yours' : `From ${nameOf(note.owner_id)}`} · {note.visibility === 'private' ? <><Lock size={12} aria-hidden /> private</> : 'shared with both'} · updated {timeAgo(note.updated_at)}</p>
      {(linkedRes || linkedRaw || linkedWord || note.link_topic) && (
        <p className="note-box small">Linked to: {linkedRes && <b>{linkedRes.title}{note.link_page ? `, p. ${note.link_page}` : ''}</b>}{!linkedRes && linkedRaw && <b>{linkedRaw.title}{note.link_page ? `, p. ${note.link_page}` : ''}</b>}{linkedWord && <> word <b lang="de">{linkedWord.german}</b></>}{note.link_topic && <> topic <b>{note.link_topic}</b></>}</p>
      )}
      {note.kind === 'question' && (
        <div className="row wrap" role="group" aria-label="Question status">
          {(['open', 'discuss', 'answered'] as const).map((s) => <Chip key={s} on={note.question_state === s} onClick={() => setState(s)}>{STATE_LABEL[s]}</Chip>)}
        </div>
      )}
      {mine ? (
        <>
          <Field label="Title (optional)" htmlFor="nb-t"><Input id="nb-t" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Note" htmlFor="nb-b" error={err}><Textarea id="nb-b" rows={6} value={body} onChange={(e) => { setBody(e.target.value); setErr(null); }} /></Field>
          <div className="grid2">
            <Field label="Kind" htmlFor="nb-k"><Select id="nb-k" value={kind} onChange={(e) => setKind(e.target.value as NoteKind)}>{NOTE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select></Field>
            <Field label="Category" htmlFor="nb-c"><Input id="nb-c" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Dativ" /></Field>
          </div>
          <Field label="Tags" htmlFor="nb-tg" hint="Comma-separated"><Input id="nb-tg" value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
          <details className="split"><summary>Link to a file, word or topic</summary>
            <div className="stack-sm">
              <Field label="Assigned file" htmlFor="nb-lr"><Select id="nb-lr" value={lgr} onChange={(e) => setLgr(e.target.value)}><option value="">None</option>{(grs ?? []).map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</Select></Field>
              <Field label="Page" htmlFor="nb-pg"><Input id="nb-pg" className="input-sm" type="number" min={1} value={page} onChange={(e) => setPage(e.target.value)} /></Field>
              <Field label="Vocabulary word" htmlFor="nb-lw"><Select id="nb-lw" value={lw} onChange={(e) => setLw(e.target.value)}><option value="">None</option>{(vocab ?? []).map((w) => <option key={w.id} value={w.id}>{w.article ? w.article + ' ' : ''}{w.german}</option>)}</Select></Field>
              <Field label="Grammar topic" htmlFor="nb-tp"><Input id="nb-tp" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Konjunktiv II" /></Field>
            </div>
          </details>
          <Segmented label="Visibility" value={shared ? 'shared' : 'private'} onChange={(v) => setShared(v === 'shared')} options={[{ value: 'private', label: <><Lock size={14} aria-hidden /> Just me</> }, { value: 'shared', label: <><Users size={14} aria-hidden /> Both</> }]} />
          {note.kind === 'word' && <Button size="sm" onClick={() => quick.openWord(note.body.split('\n')[0].slice(0, 100))}>Add to vocabulary</Button>}
        </>
      ) : (<><h3>{note.title}</h3><p className="prewrap">{note.body}</p>{note.tags.length > 0 && <p className="small muted">{note.tags.map((t) => '#' + t).join(' ')}</p>}</>)}

      {note.visibility === 'shared' && (
        <section className="stack-sm" aria-labelledby="nb-replies"><h3 id="nb-replies">Replies</h3>
          {(replies ?? []).length === 0 && <p className="small muted">No replies yet.</p>}
          <ul className="plain-list stack-sm">{(replies ?? []).map((r) => <li key={r.id} className="reply"><p><b>{r.author_id === me?.id ? 'You' : nameOf(r.author_id)}</b> <span className="muted small">{timeAgo(r.created_at)}</span></p><p className="prewrap">{r.body}</p>
            {r.author_id === me?.id && <button className="linklike small" onClick={() => void run(() => deleteReply(r.id), { invalidate: ['replies'] })}>Delete</button>}</li>)}</ul>
          <div className="row align-end"><Textarea aria-label="Write a reply" rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" />
            <Button variant="primary" disabled={!reply.trim()} onClick={() => void run(() => addReply(note.id, reply.trim()), { ok: 'Reply sent', invalidate: ['replies'] }).then((r) => { if (r.ok) { setReply(''); if (note.kind === 'question' && !mine) setState('answered'); } })}>Send</Button></div>
        </section>
      )}
      <div className="dialog-actions">{mine && <Button variant="danger" icon={<Trash2 size={15} aria-hidden />} onClick={() => setDel(true)}>Delete</Button>}<Button onClick={onClose}>{mine ? 'Cancel' : 'Close'}</Button>{mine && <Button variant="primary" onClick={() => void save()}>Save changes</Button>}</div>
      <ConfirmDialog open={del} danger title="Delete this note?" confirmLabel="Delete" onCancel={() => setDel(false)} message="This can’t be undone." onConfirm={() => void run(() => deleteNote(note.id), { ok: 'Note deleted', invalidate: ['notes'] }).then(() => { setDel(false); onClose(); })} />
    </div>
  );
}
