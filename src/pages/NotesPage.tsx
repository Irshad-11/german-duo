import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Trash2 } from 'lucide-react';
import { useGoalResources, useNotes, useReplies, useVocab } from '@/api/queries';
import { addReply, createNote, deleteNote, deleteReply, setQuestionState, updateNote } from '@/api/mutations';
import { useRun } from '@/hooks/useRun';
import { useWho } from '@/hooks/useWho';
import { useQuick } from '@/hooks/useQuick';
import { Avatar, Badge, Button, Chip, Dialog, EmptyState, ErrorState, Field, Input, Segmented, Select, SkeletonCards, Textarea } from '@/components/ui/ui';
import { Page, TalkTabs } from '@/components/Page';
import { NOTE_KINDS } from '@/components/dialogs';
import { timeAgo } from '@/lib/domain/dates';
import { noteSchema } from '@/lib/validation';
import type { Note, NoteKind } from '@/types/db';

const KIND_LABEL = Object.fromEntries(NOTE_KINDS.map((k) => [k.value, k.label])) as Record<NoteKind, string>;
const STATE_LABEL = { open: 'Unresolved', answered: 'Answered', discuss: 'Needs discussion' } as const;

export default function NotesPage() {
  const who = useWho(); const run = useRun(); const quick = useQuick();
  const notes = useNotes(); const [sp, setSp] = useSearchParams();
  const [person, setPerson] = useState('all'); const [kind, setKind] = useState<NoteKind | ''>(''); const [q, setQ] = useState(''); const [tag, setTag] = useState(''); const [onlyQ, setOnlyQ] = useState(false);
  const [openId, setOpenId] = useState<string | null>(sp.get('note'));
  const [text, setText] = useState(''); const [qk, setQk] = useState<NoteKind>('note'); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { const n = sp.get('note'); if (n) setOpenId(n); }, [sp]);
  const tags = useMemo(() => { const c = new Map<string, number>(); for (const n of notes.data ?? []) for (const t of n.tags) c.set(t, (c.get(t) ?? 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t); }, [notes.data]);
  const list = useMemo(() => { const s = q.trim().toLowerCase(); return (notes.data ?? []).filter((n) => (person === 'all' || n.author_id === person) && (!kind || n.kind === kind) && (!tag || n.tags.includes(tag)) && (!onlyQ || n.kind === 'question') && (!s || [n.title, n.body, n.category, ...n.tags].some((x) => x?.toLowerCase().includes(s)))); }, [notes.data, person, kind, tag, onlyQ, q]);
  const current = (notes.data ?? []).find((n) => n.id === openId) ?? null;
  async function save() {
    const p = noteSchema.safeParse({ body: text, title: '' }); if (!p.success) { setErr(p.error.issues[0].message); return; }
    const r = await run(() => createNote({ kind: qk, body: p.data.body, question_state: qk === 'question' ? 'open' : null }), { ok: 'Saved', invalidate: ['notes', 'change_log'], undo: { table: 'notes', op: 'INSERT', fromResult: (id: string) => id } });
    if (r.ok) { setText(''); setErr(null); }
  }
  if (notes.isError) return <ErrorState message={(notes.error as Error).message} onRetry={() => void notes.refetch()} />;
  if (notes.isLoading) return <SkeletonCards />;
  return (
    <Page kicker="Talk" title="Notes & questions" lead="Write things down once — a word, a rule, a confusing sentence. Questions notify the other person.">
      <TalkTabs />
      <div className="capture stack-sm">
        <Field label="Quick capture" htmlFor="qc" error={err} hint="A word, a rule, a confusing sentence, a question. Both of us see it."><Textarea id="qc" rows={2} value={text} onChange={(e) => { setText(e.target.value); setErr(null); }} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void save(); }} /></Field>
        <div className="row between wrap"><div className="chips" role="group" aria-label="Kind">{NOTE_KINDS.map((k) => <Chip key={k.value} on={qk === k.value} onClick={() => setQk(k.value)}>{k.label}</Chip>)}</div>
          <div className="row">{qk === 'word' && text.trim() && <Button size="sm" onClick={() => quick.openWord(text.trim())}>Add as word</Button>}<Button variant="primary" icon={<Plus size={15} aria-hidden />} onClick={() => void save()}>Save</Button></div></div>
      </div>
      <div className="stack-sm">
        <div className="search"><Search size={15} aria-hidden /><Input aria-label="Search notes" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="row wrap"><Segmented<string> label="By" value={person} onChange={setPerson} options={[{ value: 'all', label: 'Both' }, ...who.learners.map((l) => ({ value: l.id, label: l.code }))]} />
          <Chip on={onlyQ} onClick={() => setOnlyQ((v) => !v)}>Questions only</Chip></div>
        <div className="chips" role="group" aria-label="Kind and tags">{NOTE_KINDS.map((k) => <Chip key={k.value} on={kind === k.value} onClick={() => setKind(kind === k.value ? '' : k.value)}>{k.label}</Chip>)}{tags.map((t) => <Chip key={t} on={tag === t} onClick={() => setTag(tag === t ? '' : t)}>#{t}</Chip>)}</div>
      </div>
      {list.length === 0 ? <EmptyState title={(notes.data ?? []).length ? 'No notes match' : 'No notes yet'}>{(notes.data ?? []).length ? 'Clear a filter.' : 'Use quick capture above.'}</EmptyState> : (
        <div className="sheet-wrap"><table className="tbl tbl-notes"><thead><tr><th scope="col">Note</th><th scope="col">Kind</th><th scope="col">By</th><th scope="col">Updated</th></tr></thead>
          <tbody>{list.map((n) => (
            <tr key={n.id}><th scope="row"><button className="linklike" onClick={() => { setOpenId(n.id); setSp((p) => { const x = new URLSearchParams(p); x.set('note', n.id); return x; }, { replace: true }); }}>{n.title ?? n.body.slice(0, 90)}</button>
              {n.title && <span className="small muted clamp2">{n.body}</span>}{n.tags.length > 0 && <span className="small muted">{n.tags.map((t) => '#' + t).join(' ')}</span>}</th>
              <td>{KIND_LABEL[n.kind]} {n.question_state && <Badge tone={n.question_state === 'answered' ? 'done' : n.question_state === 'discuss' ? 'warn' : 'help'}>{STATE_LABEL[n.question_state]}</Badge>}</td>
              <td><Avatar code={who.codeOf(n.author_id)} accent={who.accentOf(n.author_id)} /></td><td className="small muted">{timeAgo(n.updated_at)}</td></tr>))}</tbody></table></div>
      )}
      <Dialog open={!!current} onClose={() => { setOpenId(null); setSp((p) => { const x = new URLSearchParams(p); x.delete('note'); return x; }, { replace: true }); }} title={current ? KIND_LABEL[current.kind] : ''} wide>{current && <NoteBody key={current.id} note={current} onClose={() => setOpenId(null)} />}</Dialog>
    </Page>
  );
}

function NoteBody({ note, onClose }: { note: Note; onClose: () => void }) {
  const { me, nameOf, codeOf, accentOf } = useWho(); const run = useRun(); const quick = useQuick();
  const mine = note.author_id === me?.id;
  const { data: replies } = useReplies(note.id); const { data: grs } = useGoalResources(); const { data: vocab } = useVocab();
  const [title, setTitle] = useState(note.title ?? ''); const [body, setBody] = useState(note.body); const [tags, setTags] = useState(note.tags.join(', ')); const [category, setCategory] = useState(note.category ?? ''); const [kind, setKind] = useState<NoteKind>(note.kind);
  const [lgr, setLgr] = useState(note.link_goal_resource_id ?? ''); const [lw, setLw] = useState(note.link_word_id ?? ''); const [page, setPage] = useState(note.link_page ? String(note.link_page) : ''); const [topic, setTopic] = useState(note.link_topic ?? '');
  const [reply, setReply] = useState(''); const [err, setErr] = useState<string | null>(null);
  const linked = (grs ?? []).find((r) => r.id === note.link_goal_resource_id); const lword = (vocab ?? []).find((w) => w.id === note.link_word_id);
  async function save() {
    const p = noteSchema.safeParse({ body, title }); if (!p.success) { setErr(p.error.issues[0].message); return; }
    if (page && !(Number.isInteger(Number(page)) && Number(page) > 0)) { setErr('Page must be a whole number'); return; }
    const r = await run(() => updateNote(note.id, { title: p.data.title || null, body: p.data.body, kind, category: category.trim() || null, tags: [...new Set(tags.split(/[,#]/).map((t) => t.trim().toLowerCase()).filter(Boolean))],
      link_goal_resource_id: lgr || null, link_word_id: lw || null, link_page: page ? Number(page) : null, link_topic: topic.trim() || null, question_state: kind === 'question' ? note.question_state ?? 'open' : null }),
      { ok: 'Saved', invalidate: ['notes', 'change_log'], undo: { table: 'notes', op: 'UPDATE', rowId: note.id } });
    if (r.ok) onClose();
  }
  const setState = (s: 'open' | 'answered' | 'discuss') => void run(() => setQuestionState(note.id, s), { ok: 'Updated', invalidate: ['notes', 'change_log'], undo: { table: 'notes', op: 'UPDATE', rowId: note.id } });
  return (
    <div className="stack">
      <p className="small muted"><Avatar code={codeOf(note.author_id)} accent={accentOf(note.author_id)} /> {nameOf(note.author_id)} · {timeAgo(note.updated_at)}</p>
      {(linked || lword || note.link_topic) && <p className="note-box small">Linked to: {linked && <b>{linked.title}{note.link_page ? `, p. ${note.link_page}` : ''}</b>} {lword && <>word <b lang="de">{lword.german}</b></>} {note.link_topic && <>topic <b>{note.link_topic}</b></>}</p>}
      {note.kind === 'question' && <div className="chips" role="group" aria-label="Question status">{(['open', 'discuss', 'answered'] as const).map((s) => <Chip key={s} on={note.question_state === s} onClick={() => setState(s)}>{STATE_LABEL[s]}</Chip>)}</div>}
      {mine ? (<>
        <Field label="Title (optional)" htmlFor="nb-t"><Input id="nb-t" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Note" htmlFor="nb-b" error={err}><Textarea id="nb-b" rows={6} value={body} onChange={(e) => { setBody(e.target.value); setErr(null); }} /></Field>
        <div className="grid2"><Field label="Kind" htmlFor="nb-k"><Select id="nb-k" value={kind} onChange={(e) => setKind(e.target.value as NoteKind)}>{NOTE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select></Field>
          <Field label="Category" htmlFor="nb-c"><Input id="nb-c" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Dativ" /></Field></div>
        <Field label="Tags" htmlFor="nb-tg" hint="Comma-separated"><Input id="nb-tg" value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
        <details className="split"><summary>Link to a file, word or topic</summary><div className="stack-sm">
          <Field label="Assigned file" htmlFor="nb-lr"><Select id="nb-lr" value={lgr} onChange={(e) => setLgr(e.target.value)}><option value="">None</option>{(grs ?? []).map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</Select></Field>
          <Field label="Page" htmlFor="nb-pg"><Input id="nb-pg" className="input-sm" type="number" min={1} value={page} onChange={(e) => setPage(e.target.value)} /></Field>
          <Field label="Word" htmlFor="nb-lw"><Select id="nb-lw" value={lw} onChange={(e) => setLw(e.target.value)}><option value="">None</option>{(vocab ?? []).map((w) => <option key={w.id} value={w.id}>{w.article ? w.article + ' ' : ''}{w.german}</option>)}</Select></Field>
          <Field label="Grammar topic" htmlFor="nb-tp"><Input id="nb-tp" value={topic} onChange={(e) => setTopic(e.target.value)} /></Field></div></details>
        {note.kind === 'word' && <Button size="sm" onClick={() => quick.openWord(note.body.split('\n')[0].slice(0, 100))}>Add as word</Button>}
      </>) : (<><h3>{note.title}</h3><p className="prewrap">{note.body}</p>{note.tags.length > 0 && <p className="small muted">{note.tags.map((t) => '#' + t).join(' ')}</p>}</>)}
      <section className="stack-sm" aria-labelledby="nb-rp"><h3 id="nb-rp">Replies</h3>{(replies ?? []).length === 0 && <p className="small muted">No replies yet.</p>}
        <ul className="plain-list stack-sm">{(replies ?? []).map((r) => <li key={r.id} className="reply"><p><b>{nameOf(r.author_id)}</b> <span className="muted small">{timeAgo(r.created_at)}</span></p><p className="prewrap">{r.body}</p>{r.author_id === me?.id && <button className="linklike small" onClick={() => void run(() => deleteReply(r.id), { invalidate: ['replies'] })}>Delete</button>}</li>)}</ul>
        <div className="row align-end"><Textarea aria-label="Write a reply" rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" />
          <Button variant="primary" disabled={!reply.trim()} onClick={() => void run(() => addReply(note.id, reply.trim()), { ok: 'Reply sent', invalidate: ['replies'] }).then((r) => { if (r.ok) { setReply(''); if (note.kind === 'question' && !mine) setState('answered'); } })}>Send</Button></div></section>
      <div className="dialog-actions">{mine && <Button variant="danger" icon={<Trash2 size={14} aria-hidden />} onClick={() => void run(() => deleteNote(note.id), { ok: 'Note deleted', invalidate: ['notes', 'change_log'], undo: { table: 'notes', op: 'DELETE', rowId: note.id } }).then(onClose)}>Delete</Button>}<Button onClick={onClose}>{mine ? 'Cancel' : 'Close'}</Button>{mine && <Button variant="primary" onClick={() => void save()}>Save changes</Button>}</div>
    </div>
  );
}
