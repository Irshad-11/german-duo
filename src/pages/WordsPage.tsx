import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Search, Star, Trash2, Volume2 } from 'lucide-react';
import { useVocab, useVocabLog, useVocabState } from '@/api/queries';
import { addWord, deleteWord, reviewWord, updateWord } from '@/api/mutations';
import { useRun } from '@/hooks/useRun';
import { useWho } from '@/hooks/useWho';
import { Avatar, Button, Chip, EmptyState, ErrorState, Field, Input, Segmented, Select, SkeletonCards, Tabs } from '@/components/ui/ui';
import { Page } from '@/components/Page';
import { WordDialog, wordTypeLabel } from '@/components/dialogs';
import { INITIAL_SRS, RATING_LABEL, isDue, previewInterval } from '@/lib/domain/srs';
import { reviewsThisWeek } from '@/lib/domain/stats';
import { canSpeak, speak } from '@/lib/speech';
import { normalizeGerman, parseQuickWord, splitMeaning } from '@/lib/quickword';
import { WORD_TYPES } from '@/lib/validation';
import type { Rating, VocabReviewState, VocabWord, WordType } from '@/types/db';

type Tab = 'cards' | 'review';

export default function WordsPage() {
  const who = useWho(); const run = useRun(); const me = who.me;
  const vocab = useVocab(); const state = useVocabState(); const log = useVocabLog();
  const [tab, setTab] = useState<Tab>('cards'); const [q, setQ] = useState(''); const [type, setType] = useState<WordType | ''>(''); const [level, setLevel] = useState(''); const [tag, setTag] = useState(''); const [starred, setStarred] = useState(false);
  const [editing, setEditing] = useState<VocabWord | null>(null); const [more, setMore] = useState<string | null>(null);
  const stateOf = useMemo(() => { const m = new Map<string, VocabReviewState>(); for (const x of state.data ?? []) m.set(`${x.learner_id}:${x.word_id}`, x); return m; }, [state.data]);
  const tags = useMemo(() => { const c = new Map<string, number>(); for (const w of vocab.data ?? []) for (const t of w.topic_tags) c.set(t, (c.get(t) ?? 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t); }, [vocab.data]);
  const list = useMemo(() => { const n = q.trim().toLowerCase();
    return (vocab.data ?? []).filter((w) => (!type || w.word_type === type) && (!level || w.level === level) && (!tag || w.topic_tags.includes(tag)) && (!starred || w.starred) && (!n || [w.german, w.meaning_en, w.meaning_bn, w.example_de, w.plural, ...w.topic_tags].some((x) => x?.toLowerCase().includes(n)))); }, [vocab.data, q, type, level, tag, starred]);
  const dueFor = (id: string) => (vocab.data ?? []).filter((w) => { const s = stateOf.get(`${id}:${w.id}`); return s && isDue(s.due_at); }).length;
  if (vocab.isError) return <ErrorState message={(vocab.error as Error).message} onRetry={() => void vocab.refetch()} />;
  if (vocab.isLoading || !me) return <Page title="Words"><SkeletonCards n={3} /></Page>;
  const total = vocab.data?.length ?? 0;

  return (
    <Page kicker="Shared vocabulary" title="Words" lead={`${total} word${total === 1 ? '' : 's'} · ${who.learners.map((l) => `${l.display_name}: ${dueFor(l.id)} due, ${reviewsThisWeek(log.data ?? [], l.id)} reviewed this week`).join('  ·  ')}`}>
      <QuickAdd existing={vocab.data ?? []} onMore={(seed) => setMore(seed)} />
      <Tabs<Tab> label="Words" value={tab} onChange={setTab} tabs={[{ value: 'cards', label: 'Flashcards' }, { value: 'review', label: 'Practice' }]} />
      {tab === 'cards' && (<>
        <div className="filters">
          <div className="search"><Search size={15} aria-hidden /><Input aria-label="Search words" placeholder="Search German, English, বাংলা…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="row wrap">
            <Select aria-label="Type" value={type} onChange={(e) => setType(e.target.value as WordType | '')}><option value="">All types</option>{WORD_TYPES.map((t) => <option key={t} value={t}>{wordTypeLabel(t)}</option>)}</Select>
            <Select aria-label="Level" value={level} onChange={(e) => setLevel(e.target.value)}><option value="">All levels</option>{['A1', 'A2', 'B1', 'B2'].map((l) => <option key={l}>{l}</option>)}</Select>
            <Chip on={starred} onClick={() => setStarred((v) => !v)}><Star size={12} aria-hidden /> Starred</Chip>
            {tags.map((t) => <Chip key={t} on={tag === t} onClick={() => setTag(tag === t ? '' : t)}>#{t}</Chip>)}</div>
        </div>
        {total === 0 ? <EmptyState title="No words yet">Type your first word above — just the word and its meaning is enough. Everything else is optional.</EmptyState>
          : list.length === 0 ? <EmptyState title="No words match">Clear a filter.</EmptyState> : (
          <ul className="fgrid plain-list" aria-label="Flashcards">{list.map((w) => <li key={w.id}><FlashCard w={w} learners={who.learners} stateOf={stateOf}
            onStar={() => void run(() => updateWord(w.id, { starred: !w.starred }), { invalidate: ['vocab', 'change_log'] })} onEdit={() => setEditing(w)}
            onDelete={() => void run(() => deleteWord(w.id), { ok: 'Word deleted', invalidate: ['vocab', 'vocab_state', 'change_log'], undo: { table: 'vocab_words', op: 'DELETE', rowId: w.id } })} /></li>)}</ul>)}
      </>)}
      {tab === 'review' && <Review words={vocab.data ?? []} stateOf={stateOf} />}
      <WordDialog key={editing?.id ?? more ?? 'none'} open={!!editing || more !== null} word={editing} seed={more ?? undefined} onClose={() => { setEditing(null); setMore(null); }} />
      <p className="small muted"><Link to="/library">Books and files live in Library.</Link></p>
    </Page>
  );
}

/** One line, five small boxes, Enter to save and keep going: the fast way to build a shared word list. */
function QuickAdd({ existing, onMore }: { existing: VocabWord[]; onMore: (seed: string) => void }) {
  const run = useRun();
  const [de, setDe] = useState(''); const [mean, setMean] = useState(''); const [ex, setEx] = useState(''); const [exm, setExm] = useState(''); const [say, setSay] = useState('');
  const first = useRef<HTMLInputElement>(null);
  const parsed = parseQuickWord(de); const dup = parsed.german ? existing.find((w) => normalizeGerman(w.german) === normalizeGerman(parsed.german) && (w.article ?? '') === (parsed.article ?? '')) : null;
  const ready = parsed.german.length > 0 && mean.trim().length > 0 && !dup;
  async function add() {
    if (!ready) return;
    const m = splitMeaning(mean); const sm = splitMeaning(exm);
    const res = await run(() => addWord({ german: parsed.german, word_type: parsed.article ? 'noun' : 'other', article: parsed.article, plural: null, details: {}, meaning_en: m.en, meaning_bn: m.bn, pronunciation: say.trim() || null,
      pronunciation_verified: false, translation_verified: false, example_de: ex.trim() || null, example_en: sm.en, example_bn: sm.bn, topic_tags: [], level: null, source: null, starred: false, note: null }),
      { ok: `Added “${parsed.article ? parsed.article + ' ' : ''}${parsed.german}”`, invalidate: ['vocab', 'change_log'], undo: { table: 'vocab_words', op: 'INSERT', fromResult: (id: string) => id } });
    if (res.ok) { setDe(''); setMean(''); setEx(''); setExm(''); setSay(''); first.current?.focus(); }
  }
  const enter = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void add(); } };
  return (
    <section className="quickadd" aria-labelledby="qa-h">
      <h2 id="qa-h">Add a word <span className="muted small">— quick, one line</span></h2>
      <div className="qa-grid" onKeyDown={enter}>
        <Field label="German" htmlFor="qa-de" hint="with der / die / das for nouns" error={dup ? `Already in the list: ${dup.article ?? ''} ${dup.german}` : null}><Input id="qa-de" ref={first} lang="de" autoComplete="off" autoCapitalize="none" placeholder="die Reise" value={de} onChange={(e) => setDe(e.target.value)} /></Field>
        <Field label="Meaning" htmlFor="qa-m" hint="English or বাংলা"><Input id="qa-m" autoComplete="off" placeholder="journey / ভ্রমণ" value={mean} onChange={(e) => setMean(e.target.value)} /></Field>
        <Field label="Example sentence" htmlFor="qa-ex"><Input id="qa-ex" lang="de" autoComplete="off" placeholder="Gute Reise!" value={ex} onChange={(e) => setEx(e.target.value)} /></Field>
        <Field label="Sentence meaning" htmlFor="qa-exm"><Input id="qa-exm" autoComplete="off" placeholder="Have a good trip!" value={exm} onChange={(e) => setExm(e.target.value)} /></Field>
        <Field label="How it sounds" htmlFor="qa-say" hint="optional, e.g. RYE-zuh"><Input id="qa-say" autoComplete="off" placeholder="RYE-zuh" value={say} onChange={(e) => setSay(e.target.value)} /></Field>
        <div className="qa-actions"><Button variant="primary" disabled={!ready} onClick={() => void add()}>Add word</Button><button className="linklike small" onClick={() => onMore(parsed.german)}>More details…</button></div>
      </div>
      <p className="small muted">Only the German word and its meaning are needed. Press Enter in any box to add and start the next one.</p>
    </section>
  );
}

function FlashCard({ w, learners, stateOf, onStar, onEdit, onDelete }: { w: VocabWord; learners: ReturnType<typeof useWho>['learners']; stateOf: Map<string, VocabReviewState>; onStar: () => void; onEdit: () => void; onDelete: () => void }) {
  const [back, setBack] = useState(false); const sound = canSpeak();
  return (
    <article className={`fcard ${back ? 'fcard-back' : ''}`}>
      <button className="fcard-face" onClick={() => setBack((b) => !b)} aria-pressed={back} aria-label={`${w.german}. ${back ? 'Showing meaning' : 'Showing the German word'}. Tap to flip.`}>
        {!back ? (
          <span className="fcard-front" lang="de"><span className="fcard-top">{w.article ? <span className={`art art-${w.article}`}>{w.article}</span> : <span className="art art-none">{wordTypeLabel(w.word_type).toLowerCase()}</span>}{w.level && <span className="small muted">{w.level}</span>}</span>
            <span className="fcard-word">{w.german}</span>{w.plural && <span className="small muted">plural: {w.plural}</span>}{w.pronunciation && <span className="fcard-say">/{w.pronunciation}/</span>}<span className="fcard-hint">tap to see the meaning</span></span>
        ) : (
          <span className="fcard-rear"><span className="fcard-mean">{w.meaning_en && <span lang="en">{w.meaning_en}</span>}{w.meaning_bn && <span lang="bn" className="bn">{w.meaning_bn}</span>}</span>
            {w.example_de && <span className="fcard-ex"><span lang="de">{w.example_de}</span>{w.example_en && <span lang="en" className="muted">{w.example_en}</span>}{w.example_bn && <span lang="bn" className="bn muted">{w.example_bn}</span>}</span>}
            {w.note && <span className="small">✎ {w.note}</span>}{!w.translation_verified && <span className="small muted">meaning not double-checked yet</span>}</span>
        )}
      </button>
      <div className="fcard-foot">
        <span className="fcard-who">{learners.map((l) => { const s = stateOf.get(`${l.id}:${w.id}`); return <span key={l.id} title={`${l.display_name}: ${!s ? 'not practised yet' : isDue(s.due_at) ? 'due for review' : `next review in ${s.interval_days} d`}`}><Avatar code={l.code} accent={l.accent} size={12} /><span className="small muted">{!s ? 'new' : isDue(s.due_at) ? 'due' : `${s.interval_days}d`}</span></span>; })}</span>
        <span className="row">
          {sound && <button className="icon-btn icon-btn-sm" aria-label={`Hear ${w.german}`} onClick={() => speak(w.article ? `${w.article} ${w.german}` : w.german)}><Volume2 size={16} aria-hidden /></button>}
          {sound && w.example_de && <button className="icon-btn icon-btn-sm sentence-btn" aria-label={`Hear the example sentence for ${w.german}`} onClick={() => speak(w.example_de!)}><Volume2 size={13} aria-hidden /><span className="small">sentence</span></button>}
          <button className={`icon-btn icon-btn-sm ${w.starred ? 'on' : ''}`} aria-pressed={w.starred} aria-label={w.starred ? `Unstar ${w.german}` : `Star ${w.german}`} onClick={onStar}><Star size={16} aria-hidden fill={w.starred ? 'currentColor' : 'none'} /></button>
          <button className="icon-btn icon-btn-sm" aria-label={`Edit ${w.german}`} onClick={onEdit}><Pencil size={15} aria-hidden /></button>
          <button className="icon-btn icon-btn-sm" aria-label={`Delete ${w.german}`} onClick={onDelete}><Trash2 size={15} aria-hidden /></button></span>
      </div>
    </article>
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
