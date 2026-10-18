import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, Users } from 'lucide-react';
import { Badge, Button, Chip, Dialog, Field, Input, Segmented, Select, Textarea } from '@/components/ui/ui';
import { addWord, createNote, logSession, saveAnnotation, updateWord, type WordInput } from '@/api/mutations';
import { useGoalResources, useGoals, useVocab, useVocabAnn } from '@/api/queries';
import { useRun } from '@/hooks/useRun';
import { useWho } from '@/hooks/useWho';
import { WORD_TYPES, noteSchema, sessionSchema, wordSchema } from '@/lib/validation';
import type { NoteKind, VocabWord, WordType } from '@/types/db';
import { z } from 'zod';

/* ======================= WORD ======================= */
type WordForm = z.infer<typeof wordSchema>;
const TYPE_LABEL: Record<WordType, string> = { noun: 'Noun', verb: 'Verb', adjective: 'Adjective', adverb: 'Adverb', preposition: 'Preposition', conjunction: 'Conjunction', pronoun: 'Pronoun', numeral: 'Numeral', phrase: 'Phrase', other: 'Other' };
export const wordTypeLabel = (t: WordType): string => TYPE_LABEL[t];
export const normalizeGerman = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

const DETAIL_FIELDS: Partial<Record<WordType, Array<{ key: string; label: string; placeholder: string }>>> = {
  verb: [
    { key: 'praeteritum', label: 'Präteritum', placeholder: 'ging' }, { key: 'partizip2', label: 'Partizip II', placeholder: 'gegangen' },
    { key: 'aux', label: 'haben / sein', placeholder: 'sein' }, { key: 'kasus', label: 'Case / preposition', placeholder: 'mit + Dativ' },
  ],
  adjective: [{ key: 'komparativ', label: 'Komparativ', placeholder: 'schöner' }, { key: 'superlativ', label: 'Superlativ', placeholder: 'am schönsten' }],
};

function defaults(w: VocabWord | null, seed?: string, private_note = ''): WordForm {
  return {
    german: w?.german ?? seed ?? '', word_type: w?.word_type ?? 'noun', article: w?.article ?? '', plural: w?.plural ?? '', meaning_en: w?.meaning_en ?? '', meaning_bn: w?.meaning_bn ?? '',
    pronunciation: w?.pronunciation ?? '', pronunciation_verified: w?.pronunciation_verified ?? false, translation_verified: w?.translation_verified ?? false,
    example_de: w?.example_de ?? '', example_en: w?.example_en ?? '', example_bn: w?.example_bn ?? '', tags: (w?.topic_tags ?? []).join(', '), level: w?.level ?? '', source: w?.source ?? '',
    details: w?.details ?? {}, private_note,
  };
}
const parseTags = (s: string): string[] => [...new Set(s.split(/[,#\n]/).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);

export function WordDialog({ open, word, seed, onClose }: { open: boolean; word: VocabWord | null; seed?: string; onClose: () => void }) {
  return <Dialog open={open} onClose={onClose} title={word ? 'Edit word' : 'Add a word'} wide>{open && <WordFormBody word={word} seed={seed} onClose={onClose} />}</Dialog>;
}

function WordFormBody({ word, seed, onClose }: { word: VocabWord | null; seed?: string; onClose: () => void }) {
  const run = useRun();
  const who = useWho();
  const { data: all } = useVocab();
  const { data: anns } = useVocabAnn();
  const existingNote = anns?.find((a) => a.word_id === word?.id)?.note ?? '';
  const form = useForm<WordForm>({ resolver: zodResolver(wordSchema), defaultValues: defaults(word, seed, existingNote), mode: 'onTouched' });
  const { register, handleSubmit, watch, control, setValue, formState: { errors, isSubmitting } } = form;
  const type = watch('word_type'); const german = watch('german'); const article = watch('article');
  useEffect(() => { if (type !== 'noun') { setValue('article', ''); setValue('plural', ''); } }, [type, setValue]);

  const dup = useMemo(() => {
    const n = normalizeGerman(german);
    if (!n) return null;
    return (all ?? []).find((w) => w.id !== word?.id && normalizeGerman(w.german) === n && w.word_type === type && (w.article ?? '') === article) ?? null;
  }, [all, german, type, article, word?.id]);
  const similar = useMemo(() => {
    const n = normalizeGerman(german); if (!n || dup) return [];
    return (all ?? []).filter((w) => w.id !== word?.id && normalizeGerman(w.german) === n).slice(0, 3);
  }, [all, german, dup, word?.id]);

  async function onSubmit(v: WordForm) {
    if (dup) return;
    const details = Object.fromEntries(Object.entries(v.details).filter(([, x]) => x.trim()));
    const input: WordInput = {
      german: v.german.trim(), word_type: v.word_type, article: v.article === '' ? null : v.article, plural: v.plural || null, details,
      meaning_en: v.meaning_en || null, meaning_bn: v.meaning_bn || null, pronunciation: v.pronunciation || null,
      pronunciation_verified: v.pronunciation ? v.pronunciation_verified : false, translation_verified: v.translation_verified,
      example_de: v.example_de || null, example_en: v.example_en || null, example_bn: v.example_bn || null, topic_tags: parseTags(v.tags),
      level: v.level === '' ? null : v.level, source: v.source || null, source_resource_id: word?.source_resource_id ?? null,
    };
    const res = await run(async () => {
      const id = word ? (await updateWord(word.id, input), word.id) : await addWord(input);
      if (who.me && (v.private_note.trim() || existingNote)) await saveAnnotation(who.me.id, id, v.private_note);
    }, { ok: word ? 'Word updated' : 'Word added for both of you', invalidate: ['vocab', 'vocab_ann'] });
    if (res.ok) onClose();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="stack" noValidate>
      <div className="grid2">
        <Field label="German word or phrase" htmlFor="w-de" error={errors.german?.message}>
          <Input id="w-de" lang="de" autoComplete="off" autoCapitalize="none" autoFocus {...register('german')} />
        </Field>
        <Field label="Type" htmlFor="w-type">
          <Select id="w-type" {...register('word_type')}>{WORD_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</Select>
        </Field>
      </div>
      {dup && <p className="note-box warn" role="alert">“{dup.article ? dup.article + ' ' : ''}{dup.german}” is already in the collection{word ? '' : ' — open it from the word list to edit it instead.'}</p>}
      {!dup && similar.length > 0 && <p className="note-box" role="status">Similar entry exists: {similar.map((s) => `${s.article ? s.article + ' ' : ''}${s.german} (${s.word_type})`).join(', ')}. Add yours only if the meaning differs.</p>}

      {type === 'noun' && (
        <div className="grid2">
          <Field label="Article" error={errors.article?.message}>
            <Controller control={control} name="article" render={({ field }) => (
              <Segmented label="Article" value={field.value} onChange={field.onChange} options={[{ value: '', label: '—' }, { value: 'der', label: 'der' }, { value: 'die', label: 'die' }, { value: 'das', label: 'das' }]} />
            )} />
          </Field>
          <Field label="Plural" htmlFor="w-pl"><Input id="w-pl" lang="de" autoComplete="off" placeholder="die Tische" {...register('plural')} /></Field>
        </div>
      )}
      {DETAIL_FIELDS[type] && (
        <div className="grid2">
          {DETAIL_FIELDS[type]!.map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`w-d-${f.key}`}>
              <Input id={`w-d-${f.key}`} lang="de" autoComplete="off" placeholder={f.placeholder} {...register(`details.${f.key}` as const)} />
            </Field>
          ))}
        </div>
      )}

      <div className="grid2">
        <Field label="English meaning" htmlFor="w-en" error={errors.meaning_en?.message}><Input id="w-en" lang="en" autoComplete="off" {...register('meaning_en')} /></Field>
        <Field label="Bangla meaning (বাংলা)" htmlFor="w-bn"><Input id="w-bn" lang="bn" className="bn" autoComplete="off" {...register('meaning_bn')} /></Field>
      </div>
      <label className="check"><input type="checkbox" {...register('translation_verified')} /> I checked these meanings in a dictionary or with a teacher</label>

      <Field label="Pronunciation guide (optional)" htmlFor="w-pr" hint="Your own guide, e.g. “TISH”. It is shown as unverified unless you tick the box.">
        <Input id="w-pr" autoComplete="off" {...register('pronunciation')} />
      </Field>
      <label className="check"><input type="checkbox" {...register('pronunciation_verified')} /> I verified this pronunciation</label>

      <Field label="Example sentence (German)" htmlFor="w-ex"><Textarea id="w-ex" lang="de" rows={2} {...register('example_de')} /></Field>
      <div className="grid2">
        <Field label="…in English" htmlFor="w-exen"><Textarea id="w-exen" lang="en" rows={2} {...register('example_en')} /></Field>
        <Field label="…in Bangla" htmlFor="w-exbn"><Textarea id="w-exbn" lang="bn" className="bn" rows={2} {...register('example_bn')} /></Field>
      </div>

      <div className="grid2">
        <Field label="Topic tags" htmlFor="w-tags" hint="Comma-separated, e.g. food, travel"><Input id="w-tags" autoComplete="off" {...register('tags')} /></Field>
        <Field label="Level" htmlFor="w-lvl"><Select id="w-lvl" {...register('level')}><option value="">Not set</option>{['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => <option key={l}>{l}</option>)}</Select></Field>
      </div>
      <Field label="Source (optional)" htmlFor="w-src" hint="Book, page, lesson…"><Input id="w-src" autoComplete="off" {...register('source')} /></Field>
      <Field label="Your private note" htmlFor="w-pn" hint={<><Lock size={12} aria-hidden /> Only you can see this.</>}><Textarea id="w-pn" rows={2} {...register('private_note')} /></Field>

      <div className="dialog-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" busy={isSubmitting} disabled={!!dup}>{word ? 'Save changes' : 'Add word'}</Button>
      </div>
    </form>
  );
}

/* ======================= QUICK NOTE ======================= */
export const NOTE_KINDS: Array<{ value: NoteKind; label: string; hint: string }> = [
  { value: 'note', label: 'Note', hint: 'Anything worth keeping' }, { value: 'word', label: 'Word', hint: 'A word to look up or add' },
  { value: 'grammar', label: 'Grammar rule', hint: 'A rule or pattern' }, { value: 'question', label: 'Question', hint: 'Ask your partner' },
  { value: 'confusing', label: 'Confusing', hint: 'A sentence you do not get' }, { value: 'reminder', label: 'Revise later', hint: 'A reminder to review' },
];

export function QuickNoteDialog({ open, onClose, kind = 'note' }: { open: boolean; onClose: () => void; kind?: NoteKind }) {
  return <Dialog open={open} onClose={onClose} title="Capture a note">{open && <QuickNoteBody onClose={onClose} initialKind={kind} />}</Dialog>;
}
function QuickNoteBody({ onClose, initialKind }: { onClose: () => void; initialKind: NoteKind }) {
  const run = useRun();
  const [kind, setKind] = useState<NoteKind>(initialKind);
  const [shared, setShared] = useState(initialKind === 'question');
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (kind === 'question') setShared(true); }, [kind]);
  async function save() {
    const parsed = noteSchema.safeParse({ body, title: '' });
    if (!parsed.success) { setErr(parsed.error.issues[0].message); return; }
    const res = await run(() => createNote({ visibility: shared ? 'shared' : 'private', kind, body: parsed.data.body, question_state: kind === 'question' ? 'open' : null }), { ok: shared ? 'Saved and shared' : 'Saved privately', invalidate: ['notes'] });
    if (res.ok) onClose();
  }
  return (
    <div className="stack">
      <div className="chips" role="group" aria-label="Kind of note">{NOTE_KINDS.map((k) => <Chip key={k.value} on={kind === k.value} onClick={() => setKind(k.value)}>{k.label}</Chip>)}</div>
      <Field label={NOTE_KINDS.find((k) => k.value === kind)?.hint ?? 'Note'} htmlFor="qn-body" error={err}>
        <Textarea id="qn-body" rows={4} autoFocus value={body} onChange={(e) => { setBody(e.target.value); setErr(null); }} />
      </Field>
      <Segmented label="Who can see it" value={shared ? 'shared' : 'private'} onChange={(v) => setShared(v === 'shared')}
        options={[{ value: 'private', label: <><Lock size={14} aria-hidden /> Just me</> }, { value: 'shared', label: <><Users size={14} aria-hidden /> Both of us</> }]} />
      <div className="dialog-actions"><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void save()}>Save note</Button></div>
    </div>
  );
}

/* ======================= LOG SESSION ======================= */
export function LogSessionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Dialog open={open} onClose={onClose} title="Log study time">{open && <LogSessionBody onClose={onClose} />}</Dialog>;
}
function LogSessionBody({ onClose }: { onClose: () => void }) {
  const run = useRun();
  const { me } = useWho();
  const { data: goals } = useGoals();
  const { data: rs } = useGoalResources();
  const mine = useMemo(() => {
    const ok = new Set((goals ?? []).filter((g) => (g.scope === 'shared' || g.owner_id === me?.id) && g.status !== 'completed' && g.status !== 'dropped').map((g) => g.id));
    return (rs ?? []).filter((r) => ok.has(r.goal_id) && r.status !== 'completed');
  }, [goals, rs, me?.id]);
  const [target, setTarget] = useState<string>('');
  const [minutes, setMinutes] = useState('20');
  const [note, setNote] = useState('');
  const [interrupted, setInterrupted] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    const parsed = sessionSchema.safeParse({ minutes: Number(minutes) });
    if (!parsed.success) { setErr(parsed.error.issues[0].message); return; }
    const r = mine.find((x) => x.id === target);
    const res = await run(() => logSession({ minutes: parsed.data.minutes, source: 'manual', goal_id: r?.goal_id ?? null, goal_resource_id: r?.id ?? null, label: r?.title ?? 'General practice', note: note.trim() || null, interrupted }),
      { ok: `Logged ${parsed.data.minutes} min`, invalidate: ['sessions', 'goal_resources'] });
    if (res.ok) onClose();
  }
  return (
    <div className="stack">
      <Field label="What did you study?" htmlFor="ls-target">
        <Select id="ls-target" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">General practice (not linked to a file)</option>
          {mine.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
        </Select>
      </Field>
      <Field label="Minutes" htmlFor="ls-min" error={err} hint="Self-reported. Use the timer on a file to measure elapsed time.">
        <div className="row wrap">
          <Input id="ls-min" className="input-sm" type="number" inputMode="numeric" min={1} max={720} value={minutes} onChange={(e) => { setMinutes(e.target.value); setErr(null); }} />
          {[10, 20, 30, 45, 60].map((m) => <Chip key={m} on={minutes === String(m)} onClick={() => setMinutes(String(m))}>{m}</Chip>)}
        </div>
      </Field>
      <Field label="Note (optional)" htmlFor="ls-note"><Input id="ls-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <label className="check"><input type="checkbox" checked={interrupted} onChange={(e) => setInterrupted(e.target.checked)} /> I was interrupted</label>
      <div className="dialog-actions"><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void save()}>Log time</Button></div>
    </div>
  );
}
export { Badge };
