import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import { useVocab, useVocabLog, useVocabState } from '@/api/queries';
import { deleteWord, reviewWord, updateWord } from '@/api/mutations';
import { useRun } from '@/hooks/useRun';
import { useWho } from '@/hooks/useWho';
import { Avatar, Badge, Button, Chip, EmptyState, ErrorState, Input, Segmented, Select, SkeletonCards, Tabs } from '@/components/ui/ui';
import { WordDialog, wordTypeLabel } from '@/components/dialogs';
import { INITIAL_SRS, RATING_LABEL, isDue, previewInterval } from '@/lib/domain/srs';
import { reviewsThisWeek } from '@/lib/domain/stats';
import { WORD_TYPES } from '@/lib/validation';
import type { Rating, VocabReviewState, VocabWord, WordType } from '@/types/db';

type Tab = 'list' | 'review';
type Sort = 'new' | 'az';

export default function WordsPage() {
  const who = useWho(); const run = useRun(); const me = who.me;
  const vocab = useVocab(); const state = useVocabState(); const log = useVocabLog();
  const [tab, setTab] = useState<Tab>('list'); const [q, setQ] = useState(''); const [type, setType] = useState<WordType | ''>(''); const [level, setLevel] = useState(''); const [tag, setTag] = useState('');
  const [starred, setStarred] = useState(false); const [sort, setSort] = useState<Sort>('new'); const [editing, setEditing] = useState<VocabWord | 'new' | null>(null);
  const stateOf = useMemo(() => { const m = new Map<string, VocabReviewState>(); for (const s of state.data ?? []) m.set(`${s.learner_id}:${s.word_id}`, s); return m; }, [state.data]);
  const tags = useMemo(() => { const c = new Map<string, number>(); for (const w of vocab.data ?? []) for (const t of w.topic_tags) c.set(t, (c.get(t) ?? 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([t]) => t); }, [vocab.data]);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    const out = (vocab.data ?? []).filter((w) => (!type || w.word_type === type) && (!level || w.level === level) && (!tag || w.topic_tags.includes(tag)) && (!starred || w.starred) && (!n || [w.german, w.meaning_en, w.meaning_bn, w.example_de, w.plural, ...w.topic_tags].some((x) => x?.toLowerCase().includes(n))));
    if (sort === 'az') out.sort((a, b) => a.german.localeCompare(b.german, 'de')); return out;
  }, [vocab.data, q, type, level, tag, starred, sort]);
  const dueFor = (id: string) => (vocab.data ?? []).filter((w) => { const s = stateOf.get(`${id}:${w.id}`); return s && isDue(s.due_at); }).length;

  if (vocab.isError) return <ErrorState message={(vocab.error as Error).message} onRetry={() => void vocab.refetch()} />;
  if (vocab.isLoading || !me) return <SkeletonCards n={3} />;
  const cell = (id: string, w: VocabWord) => { const s = stateOf.get(`${id}:${w.id}`); return !s ? <span className="muted">new</span> : isDue(s.due_at) ? <Badge tone="info">due</Badge> : <span className="mono small">{s.interval_days}d</span>; };

  return (
    <div className="stack-lg">
      <div className="row between wrap"><h1>Words</h1><Button variant="primary" icon={<Plus size={15} aria-hidden />} onClick={() => setEditing('new')}>Add word</Button></div>
      <p className="muted small mono">{vocab.data?.length ?? 0} words · {who.learners.map((l) => `${l.code}: ${dueFor(l.id)} due, ${reviewsThisWeek(log.data ?? [], l.id)} reviewed this week`).join('  |  ')}</p>
      <Tabs<Tab> label="Words" value={tab} onChange={setTab} tabs={[{ value: 'list', label: 'List' }, { value: 'review', label: 'Review' }]} />

      {tab === 'list' && (<>
        <div className="stack-sm">
          <div className="search"><Search size={15} aria-hidden /><Input aria-label="Search words" placeholder="Search German, English, বাংলা, tags" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="row wrap">
            <Select aria-label="Type" value={type} onChange={(e) => setType(e.target.value as WordType | '')}><option value="">All types</option>{WORD_TYPES.map((t) => <option key={t} value={t}>{wordTypeLabel(t)}</option>)}</Select>
            <Select aria-label="Level" value={level} onChange={(e) => setLevel(e.target.value)}><option value="">All levels</option>{['A1', 'A2', 'B1', 'B2'].map((l) => <option key={l}>{l}</option>)}</Select>
            <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}><option value="new">Newest</option><option value="az">A–Z</option></Select>
            <Chip on={starred} onClick={() => setStarred((v) => !v)}><Star size={12} aria-hidden /> Starred</Chip></div>
          {tags.length > 0 && <div className="chips" role="group" aria-label="Topics">{tags.map((t) => <Chip key={t} on={tag === t} onClick={() => setTag(tag === t ? '' : t)}>#{t}</Chip>)}</div>}
        </div>
        {(vocab.data ?? []).length === 0 ? <EmptyState title="No words yet" action={<Button variant="primary" onClick={() => setEditing('new')}>Add the first word</Button>}>Words added here are visible to both of you at once. For nouns add the article and plural.</EmptyState>
          : list.length === 0 ? <EmptyState title="No words match">Clear a filter.</EmptyState> : (
          <div className="sheet-wrap"><table className="tbl tbl-words"><thead><tr><th scope="col" className="sticky-col">German</th><th scope="col">English</th><th scope="col">বাংলা</th><th scope="col">Type</th>{who.learners.map((l) => <th key={l.id} scope="col"><span className={`txt-${l.accent}`}>{l.code}</span></th>)}<th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{list.map((w) => (
              <tr key={w.id}>
                <th scope="row" className="sticky-col" lang="de"><span className={w.article ? `art art-${w.article}` : ''}>{w.article}</span> <b>{w.german}</b>{w.plural && <span className="muted small"> · {w.plural}</span>}
                  {w.example_de && <span className="small muted block">{w.example_de}</span>}{w.note && <span className="small block">✎ {w.note}</span>}</th>
                <td lang="en">{w.meaning_en}{!w.translation_verified && <span className="small muted block">unverified</span>}</td><td lang="bn" className="bn">{w.meaning_bn}</td>
                <td className="small">{wordTypeLabel(w.word_type)}{w.level ? ` · ${w.level}` : ''}{w.pronunciation && <span className="block muted">/{w.pronunciation}/ {w.pronunciation_verified ? '✓' : '(unverified)'}</span>}</td>
                {who.learners.map((l) => <td key={l.id}>{cell(l.id, w)}</td>)}
                <td><div className="row">
                  <button className={`icon-btn icon-btn-sm ${w.starred ? 'on' : ''}`} aria-pressed={w.starred} aria-label={w.starred ? `Unstar ${w.german}` : `Star ${w.german}`} onClick={() => void run(() => updateWord(w.id, { starred: !w.starred }), { invalidate: ['vocab', 'change_log'] })}><Star size={16} aria-hidden fill={w.starred ? 'currentColor' : 'none'} /></button>
                  <button className="icon-btn icon-btn-sm" aria-label={`Edit ${w.german}`} onClick={() => setEditing(w)}><Pencil size={15} aria-hidden /></button>
                  <button className="icon-btn icon-btn-sm" aria-label={`Delete ${w.german}`} onClick={() => void run(() => deleteWord(w.id), { ok: 'Word deleted', invalidate: ['vocab', 'vocab_state', 'change_log'], undo: { table: 'vocab_words', op: 'DELETE', rowId: w.id } })}><Trash2 size={15} aria-hidden /></button></div></td>
              </tr>))}</tbody></table></div>
        )}
      </>)}
      {tab === 'review' && <Review words={vocab.data ?? []} stateOf={stateOf} />}
      <WordDialog key={editing === 'new' ? 'new' : editing?.id ?? 'none'} open={!!editing} word={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function Review({ words, stateOf }: { words: VocabWord[]; stateOf: Map<string, VocabReviewState> }) {
  const { me } = useWho(); const run = useRun();
  const [started, setStarted] = useState(false); const [dir, setDir] = useState<'de' | 'meaning'>('de'); const [queue, setQueue] = useState<string[]>([]); const [shown, setShown] = useState(false); const [done, setDone] = useState({ total: 0, again: 0, ok: 0 });
  const byId = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);
  const key = (id: string) => `${me?.id}:${id}`;
  const due = words.filter((w) => { const s = stateOf.get(key(w.id)); return s && isDue(s.due_at); }).sort((a, b) => stateOf.get(key(a.id))!.due_at.localeCompare(stateOf.get(key(b.id))!.due_at));
  const fresh = words.filter((w) => !stateOf.has(key(w.id)));
  const cur = queue.length ? byId.get(queue[0]) : undefined; const st = cur ? stateOf.get(key(cur.id)) : undefined; const base = st ?? INITIAL_SRS;
  const rate = useCallback(async (rating: Rating) => {
    if (!cur || !me) return;
    const res = await run(() => reviewWord(me.id, cur.id, st ? { ease: st.ease, interval_days: st.interval_days, repetitions: st.repetitions, lapses: st.lapses } : null, rating), { invalidate: ['vocab_state', 'vocab_log'] });
    if (!res.ok) return;
    setQueue((q) => { const [h, ...rest] = q; return rating === 'again' && !rest.includes(h) ? [...rest, h] : rest; });
    setDone((d) => ({ total: d.total + 1, again: d.again + (rating === 'again' ? 1 : 0), ok: d.ok + (rating === 'good' || rating === 'easy' ? 1 : 0) })); setShown(false);
  }, [cur, me, run, st]);
  useEffect(() => {
    if (!started || !cur) return;
    const h = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.closest('input,textarea,select')) return; if (!shown && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); setShown(true); } else if (shown) { const m: Record<string, Rating> = { '1': 'again', '2': 'hard', '3': 'good', '4': 'easy' }; if (m[e.key]) void rate(m[e.key]); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [started, cur, shown, rate]);
  if (words.length === 0) return <EmptyState title="Nothing to review yet">Add some words first.</EmptyState>;
  if (!started) return (
    <div className="stack"><p><b className="mono">{due.length}</b> due · <b className="mono">{fresh.length}</b> new (10 per session). Each answer decides when the word returns: minutes, then days, then weeks.</p>
      <Segmented<'de' | 'meaning'> label="Direction" value={dir} onChange={setDir} options={[{ value: 'de', label: 'German → meaning' }, { value: 'meaning', label: 'Meaning → German' }]} />
      <div><Button variant="primary" disabled={due.length + fresh.length === 0} onClick={() => { setQueue([...due.slice(0, 20), ...fresh.slice(0, 10)].map((w) => w.id)); setDone({ total: 0, again: 0, ok: 0 }); setShown(false); setStarted(true); }}>{due.length + fresh.length === 0 ? 'All caught up' : 'Start session'}</Button></div></div>
  );
  if (!cur) return <div className="stack"><h2>Session complete</h2><p>{done.total} cards — {done.ok} remembered, {done.again} to see again soon.</p><div><Button variant="primary" onClick={() => setStarted(false)}>Done</Button></div></div>;
  const meaning = <div>{cur.meaning_en && <p className="flash-mean" lang="en">{cur.meaning_en}</p>}{cur.meaning_bn && <p className="flash-mean bn" lang="bn">{cur.meaning_bn}</p>}</div>;
  const german = <p className="flash-de" lang="de">{cur.article && <span className={`art art-${cur.article}`}>{cur.article}</span>} {cur.german}{cur.plural && shown && <span className="muted small"> · {cur.plural}</span>}</p>;
  return (
    <div className="flash" aria-live="polite"><p className="small muted mono">{queue.length} left · {st ? `seen ${st.repetitions}×` : 'new'} <Avatar code={me?.code ?? ''} accent={me?.accent ?? 'blue'} /></p>
      <div className="flash-face">{dir === 'de' ? german : meaning}{shown && <><hr />{dir === 'de' ? meaning : german}{cur.example_de && <p className="example small" lang="de">{cur.example_de}</p>}</>}</div>
      {!shown ? <Button variant="primary" onClick={() => setShown(true)}>Show answer <kbd>Space</kbd></Button> : (
        <div className="rate" role="group" aria-label="How well did you remember?">{(['again', 'hard', 'good', 'easy'] as Rating[]).map((r, i) => <button key={r} className={`rate-btn rate-${r}`} onClick={() => void rate(r)}><b>{RATING_LABEL[r]}</b><span className="small">{previewInterval(base, r)} <kbd>{i + 1}</kbd></span></button>)}</div>)}
      <Button variant="ghost" size="sm" onClick={() => setStarted(false)}>End session</Button></div>
  );
}
