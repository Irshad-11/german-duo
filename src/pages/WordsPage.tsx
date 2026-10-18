import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookCheck, Lock, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import { useVocab, useVocabAnn, useVocabFav, useVocabLog, useVocabState } from '@/api/queries';
import { deleteWord, reviewWord, setFavorite } from '@/api/mutations';
import { useRun } from '@/hooks/useRun';
import { useWho } from '@/hooks/useWho';
import { Badge, Button, Card, Chip, ConfirmDialog, EmptyState, ErrorState, Input, Segmented, Select, SkeletonCards, cx } from '@/components/ui/ui';
import { WordDialog, wordTypeLabel } from '@/components/dialogs';
import { INITIAL_SRS, RATING_LABEL, isDue, previewInterval } from '@/lib/domain/srs';
import { reviewsThisWeek } from '@/lib/domain/stats';
import { timeAgo } from '@/lib/domain/dates';
import { WORD_TYPES } from '@/lib/validation';
import type { Rating, VocabReviewState, VocabWord, WordType } from '@/types/db';

type Tab = 'browse' | 'review';
type Sort = 'new' | 'az' | 'due';

export default function WordsPage() {
  const { me, partner, nameOf } = useWho();
  const vocab = useVocab(); const fav = useVocabFav(); const ann = useVocabAnn(); const state = useVocabState(); const log = useVocabLog();
  const run = useRun();
  const [tab, setTab] = useState<Tab>('browse');
  const [q, setQ] = useState(''); const [type, setType] = useState<WordType | ''>(''); const [level, setLevel] = useState(''); const [tag, setTag] = useState('');
  const [onlyFav, setOnlyFav] = useState(false); const [onlyDue, setOnlyDue] = useState(false); const [sort, setSort] = useState<Sort>('new');
  const [editing, setEditing] = useState<VocabWord | 'new' | null>(null);
  const [deleting, setDeleting] = useState<VocabWord | null>(null);

  const favSet = useMemo(() => new Set((fav.data ?? []).map((f) => f.word_id)), [fav.data]);
  const annMap = useMemo(() => new Map((ann.data ?? []).map((a) => [a.word_id, a.note])), [ann.data]);
  const stateMap = useMemo(() => new Map((state.data ?? []).map((s) => [s.word_id, s])), [state.data]);
  const tags = useMemo(() => { const c = new Map<string, number>(); for (const w of vocab.data ?? []) for (const t of w.topic_tags) c.set(t, (c.get(t) ?? 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([t]) => t); }, [vocab.data]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase(); const now = new Date();
    const out = (vocab.data ?? []).filter((w) => (!type || w.word_type === type) && (!level || w.level === level) && (!tag || w.topic_tags.includes(tag)) && (!onlyFav || favSet.has(w.id)) &&
      (!onlyDue || (stateMap.get(w.id) ? isDue(stateMap.get(w.id)!.due_at, now) : true)) &&
      (!n || [w.german, w.meaning_en, w.meaning_bn, w.example_de, w.plural, ...w.topic_tags].some((x) => x?.toLowerCase().includes(n))));
    if (sort === 'az') out.sort((a, b) => a.german.localeCompare(b.german, 'de'));
    if (sort === 'due') out.sort((a, b) => (stateMap.get(a.id)?.due_at ?? '0').localeCompare(stateMap.get(b.id)?.due_at ?? '0'));
    return out;
  }, [vocab.data, q, type, level, tag, onlyFav, onlyDue, sort, favSet, stateMap]);

  const dueCount = useMemo(() => (vocab.data ?? []).filter((w) => { const s = stateMap.get(w.id); return s && isDue(s.due_at); }).length, [vocab.data, stateMap]);
  const newCount = (vocab.data ?? []).filter((w) => !stateMap.has(w.id)).length;

  if (vocab.isError) return <ErrorState message={(vocab.error as Error).message} onRetry={() => void vocab.refetch()} />;
  if (vocab.isLoading || !me) return <SkeletonCards n={4} />;

  return (
    <div className="stack-lg">
      <div className="row between wrap"><h1>Words</h1>
        <div className="row wrap"><Segmented<Tab> label="Words section" value={tab} onChange={setTab} options={[{ value: 'browse', label: 'Browse' }, { value: 'review', label: <>Review{dueCount + newCount > 0 && <span className="count">{dueCount + Math.min(newCount, 10)}</span>}</> }]} />
          <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setEditing('new')}>Add word</Button></div></div>

      {tab === 'browse' && (
        <>
          <p className="muted small">{vocab.data?.length ?? 0} shared words · {dueCount} due for you · you reviewed {reviewsThisWeek(log.data ?? [], me.id)} this week{partner ? `, ${partner.display_name} ${reviewsThisWeek(log.data ?? [], partner.id)}` : ''}</p>
          <div className="stack-sm">
            <div className="search"><Search size={16} aria-hidden /><Input aria-label="Search words" placeholder="Search German, English, বাংলা, tags…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="row wrap">
              <Select aria-label="Word type" value={type} onChange={(e) => setType(e.target.value as WordType | '')}><option value="">All types</option>{WORD_TYPES.map((t) => <option key={t} value={t}>{wordTypeLabel(t)}</option>)}</Select>
              <Select aria-label="Level" value={level} onChange={(e) => setLevel(e.target.value)}><option value="">All levels</option>{['A1', 'A2', 'B1', 'B2'].map((l) => <option key={l}>{l}</option>)}</Select>
              <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}><option value="new">Newest first</option><option value="az">A–Z</option><option value="due">Due soonest</option></Select>
            </div>
            <div className="chips" role="group" aria-label="Quick filters">
              <Chip on={onlyFav} onClick={() => setOnlyFav((v) => !v)}><Star size={13} aria-hidden /> Favorites</Chip>
              <Chip on={onlyDue} onClick={() => setOnlyDue((v) => !v)}>Due / new</Chip>
              {tags.map((t) => <Chip key={t} on={tag === t} onClick={() => setTag(tag === t ? '' : t)}>#{t}</Chip>)}
            </div>
          </div>
          {(vocab.data ?? []).length === 0 ? (
            <Card><EmptyState icon={<BookCheck size={28} />} title="Your shared word list is empty" action={<Button variant="primary" onClick={() => setEditing('new')}>Add the first word</Button>}>Words you add appear for both of you instantly. Add the article and plural for nouns — they’re the hardest part to remember.</EmptyState></Card>
          ) : filtered.length === 0 ? <Card><EmptyState title="No words match">Clear a filter or search for something else.</EmptyState></Card> : (
            <ul className="plain-list stack-sm" aria-label="Words">
              {filtered.map((w) => (
                <li key={w.id}><WordCard w={w} isFav={favSet.has(w.id)} note={annMap.get(w.id)} state={stateMap.get(w.id)} byName={nameOf(w.created_by)}
                  onFav={() => void run(() => setFavorite(me.id, w.id, !favSet.has(w.id)), { invalidate: ['vocab_fav'] })} onEdit={() => setEditing(w)} onDelete={() => setDeleting(w)} canDelete={w.created_by === me.id} /></li>
              ))}
            </ul>
          )}
        </>
      )}
      {tab === 'review' && <Review words={vocab.data ?? []} states={stateMap} />}

      <WordDialog key={editing === 'new' ? 'new' : editing?.id ?? 'none'} open={!!editing} word={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={!!deleting} danger title="Delete this word?" confirmLabel="Delete word" onCancel={() => setDeleting(null)} message={`“${deleting?.german}” is removed for both of you, along with review schedules and private notes.`}
        onConfirm={() => { if (deleting) void run(() => deleteWord(deleting.id), { ok: 'Word deleted', invalidate: ['vocab', 'vocab_state', 'vocab_ann', 'vocab_fav'] }).then(() => setDeleting(null)); }} />
    </div>
  );
}

function WordCard({ w, isFav, note, state, byName, onFav, onEdit, onDelete, canDelete }: { w: VocabWord; isFav: boolean; note?: string; state?: VocabReviewState; byName: string; onFav: () => void; onEdit: () => void; onDelete: () => void; canDelete: boolean }) {
  const due = state ? isDue(state.due_at) : null;
  return (
    <article className="word">
      <div className="word-head">
        <div className="grow">
          <p className="word-de" lang="de">{w.article && <span className={`art art-${w.article}`}>{w.article}</span>} {w.german}{w.plural && <span className="muted small"> · pl. {w.plural}</span>}</p>
          <p className="small muted">{wordTypeLabel(w.word_type)}{w.gender ? ` · ${w.gender}` : ''}{w.level ? ` · ${w.level}` : ''}</p>
        </div>
        <button className={cx('icon-btn', isFav && 'on')} aria-pressed={isFav} aria-label={isFav ? `Remove ${w.german} from favorites` : `Add ${w.german} to favorites`} onClick={onFav}><Star size={20} aria-hidden fill={isFav ? 'currentColor' : 'none'} /></button>
      </div>
      <div className="word-mean">{w.meaning_en && <p lang="en">{w.meaning_en}</p>}{w.meaning_bn && <p lang="bn" className="bn">{w.meaning_bn}</p>}</div>
      {Object.keys(w.details).length > 0 && <p className="small muted" lang="de">{Object.entries(w.details).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
      {w.pronunciation && <p className="small">🔊 {w.pronunciation} {w.pronunciation_verified ? <Badge tone="done">verified</Badge> : <Badge>unverified</Badge>}</p>}
      {w.example_de && <blockquote className="example"><span lang="de">{w.example_de}</span>{w.example_en && <><br /><span className="muted" lang="en">{w.example_en}</span></>}{w.example_bn && <><br /><span className="muted bn" lang="bn">{w.example_bn}</span></>}</blockquote>}
      {note && <p className="small private"><Lock size={12} aria-hidden /> {note}</p>}
      <div className="row wrap between">
        <div className="chips">{w.topic_tags.map((t) => <span key={t} className="tag">#{t}</span>)}{!w.translation_verified && <Badge>meaning unverified</Badge>}{due === true && <Badge tone="info">due</Badge>}{state && due === false && <Badge>next {timeAgo(state.due_at).includes('ago') ? 'soon' : 'later'}</Badge>}</div>
        <div className="row"><span className="small muted">added by {byName}</span>
          <button className="icon-btn icon-btn-sm" aria-label={`Edit ${w.german}`} onClick={onEdit}><Pencil size={15} aria-hidden /></button>
          {canDelete && <button className="icon-btn icon-btn-sm" aria-label={`Delete ${w.german}`} onClick={onDelete}><Trash2 size={15} aria-hidden /></button>}</div>
      </div>
    </article>
  );
}

/* ---------- review session ---------- */
function Review({ words, states }: { words: VocabWord[]; states: Map<string, VocabReviewState> }) {
  const { me } = useWho(); const run = useRun();
  const [started, setStarted] = useState(false);
  const [dir, setDir] = useState<'de' | 'meaning'>('de');
  const [queue, setQueue] = useState<string[]>([]);
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState({ total: 0, again: 0, ok: 0 });
  const byId = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);
  const now = new Date();
  const due = words.filter((w) => { const s = states.get(w.id); return s && isDue(s.due_at, now); }).sort((a, b) => states.get(a.id)!.due_at.localeCompare(states.get(b.id)!.due_at));
  const fresh = words.filter((w) => !states.has(w.id));

  function start() { setQueue([...due.slice(0, 20), ...fresh.slice(0, 10)].map((w) => w.id)); setDone({ total: 0, again: 0, ok: 0 }); setShown(false); setStarted(true); }

  const cur = queue.length ? byId.get(queue[0]) : undefined;
  const st = cur ? states.get(cur.id) : undefined;
  const base = st ?? INITIAL_SRS;

  const rate = useCallback(async (rating: Rating) => {
    if (!cur || !me) return;
    const id = cur.id;
    const res = await run(() => reviewWord(me.id, id, st ? { ease: st.ease, interval_days: st.interval_days, repetitions: st.repetitions, lapses: st.lapses } : null, rating), { invalidate: ['vocab_state', 'vocab_log'] });
    if (!res.ok) return;
    setQueue((q) => { const [head, ...rest] = q; return rating === 'again' && !rest.includes(head) ? [...rest, head] : rest; });   // missed words come back once in this session
    setDone((d) => ({ total: d.total + 1, again: d.again + (rating === 'again' ? 1 : 0), ok: d.ok + (rating === 'good' || rating === 'easy' ? 1 : 0) }));
    setShown(false);
  }, [cur, me, run, st]);

  useEffect(() => {
    if (!started || !cur) return;
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
      if (!shown && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); setShown(true); }
      else if (shown) { const m: Record<string, Rating> = { '1': 'again', '2': 'hard', '3': 'good', '4': 'easy' }; if (m[e.key]) void rate(m[e.key]); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [started, cur, shown, rate]);

  if (words.length === 0) return <Card><EmptyState title="Nothing to review yet">Add some words first.</EmptyState></Card>;
  if (!started) {
    return (
      <Card className="review-start">
        <h2>Review</h2>
        <p className="muted"><b>{due.length}</b> due · <b>{fresh.length}</b> new (up to 10 per session). Answers decide when each word comes back: a few minutes, then days, then weeks.</p>
        <Segmented<'de' | 'meaning'> label="Direction" value={dir} onChange={setDir} options={[{ value: 'de', label: 'German → meaning' }, { value: 'meaning', label: 'Meaning → German' }]} />
        <Button variant="primary" disabled={due.length + fresh.length === 0} onClick={start}>{due.length + fresh.length === 0 ? 'All caught up' : 'Start session'}</Button>
        {due.length + fresh.length === 0 && <p className="small muted">Nothing is due right now. Come back later or add new words.</p>}
      </Card>
    );
  }
  if (!cur) {
    return (
      <Card className="review-start"><h2>Session complete</h2>
        <p>You reviewed <b>{done.total}</b> cards — <b>{done.ok}</b> remembered, <b>{done.again}</b> to see again soon.</p>
        <div className="row"><Button variant="primary" onClick={() => setStarted(false)}>Done</Button></div></Card>
    );
  }
  const front = dir === 'de'
    ? <p className="flash-de" lang="de">{cur.article && <span className={`art art-${cur.article}`}>{shown ? cur.article : ''}</span>} {cur.german}</p>
    : <div>{cur.meaning_en && <p className="flash-mean" lang="en">{cur.meaning_en}</p>}{cur.meaning_bn && <p className="flash-mean bn" lang="bn">{cur.meaning_bn}</p>}</div>;
  const back = dir === 'de'
    ? <div>{cur.meaning_en && <p className="flash-mean" lang="en">{cur.meaning_en}</p>}{cur.meaning_bn && <p className="flash-mean bn" lang="bn">{cur.meaning_bn}</p>}</div>
    : <p className="flash-de" lang="de">{cur.article && <span className={`art art-${cur.article}`}>{cur.article}</span>} {cur.german}{cur.plural && <span className="muted small"> · pl. {cur.plural}</span>}</p>;
  return (
    <Card className="flash" aria-live="polite">
      <p className="small muted">{queue.length} left · {st ? `seen ${st.repetitions}×` : 'new word'}</p>
      <div className="flash-face">{front}{shown && <><hr />{back}{cur.example_de && <p className="example small" lang="de">{cur.example_de}</p>}</>}</div>
      {!shown ? <Button variant="primary" onClick={() => setShown(true)}>Show answer <kbd>Space</kbd></Button> : (
        <div className="rate" role="group" aria-label="How well did you remember?">
          {(['again', 'hard', 'good', 'easy'] as Rating[]).map((r, i) => (
            <button key={r} className={`rate-btn rate-${r}`} onClick={() => void rate(r)}><b>{RATING_LABEL[r]}</b><span className="small">{previewInterval(base, r)} <kbd>{i + 1}</kbd></span></button>
          ))}
        </div>
      )}
      <Button variant="ghost" size="sm" onClick={() => setStarted(false)}>End session</Button>
    </Card>
  );
}
