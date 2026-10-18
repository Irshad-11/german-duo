import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, FilePlus2, Library, Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, Dialog, Field, Input, Segmented, Select, Textarea, Badge } from '@/components/ui/ui';
import { FolderTag } from '@/components/resource';
import { LibraryPicker } from '@/components/LibraryPicker';
import { addGoalResource, createGoal, deleteGoalResource, reorderGoalResources, updateGoal, updateGoalResource, type GoalResourceInput } from '@/api/mutations';
import { useRun } from '@/hooks/useRun';
import { useWho } from '@/hooks/useWho';
import { usePlan } from '@/api/queries';
import { evenSplit, assignedPages } from '@/lib/domain/progress';
import { checkResourceUrl } from '@/lib/domain/links';
import { addDays, formatDayLong, parseISO, toISO, weekLabel } from '@/lib/domain/dates';
import { goalSchema, validatePageRange } from '@/lib/validation';
import { PRIORITY_LABEL } from '@/lib/domain/status';
import type { Goal, GoalResource, Level, Resource } from '@/types/db';

export interface Draft {
  key: string; id?: string; version?: number; resource_id: string | null; title: string; filename: string | null; level: Level | null; category: string | null;
  source_folder: string | null; file_type: string | null; page_count: number | null; start: string; end: string; url: string; instructions: string; est: string;
  priority: 1 | 2 | 3; notes: string; hasProgress: boolean; fromCurriculum?: boolean; needsPages?: boolean;
}
let seq = 0;
const k = () => `d${++seq}`;

export function draftFromResource(r: Resource, opts: { start?: number | null; end?: number | null; est?: number | null; instructions?: string | null; needsPages?: boolean } = {}): Draft {
  const small = r.page_count != null && r.page_count <= 12;
  const start = opts.start ?? (small ? 1 : null); const end = opts.end ?? (small ? r.page_count : null);
  return { key: k(), resource_id: r.id, title: r.title, filename: r.filename, level: r.level === 'ALL' ? null : r.level, category: r.category, source_folder: r.source_folder, file_type: r.file_type,
    page_count: r.page_count, start: start != null ? String(start) : '', end: end != null ? String(end) : '', url: r.external_url ?? '', instructions: opts.instructions ?? '', est: opts.est ? String(opts.est) : '',
    priority: 2, notes: '', hasProgress: false, needsPages: opts.needsPages };
}
export function draftFromGoalResource(r: GoalResource): Draft {
  return { key: k(), id: r.id, version: r.version, resource_id: r.resource_id, title: r.title, filename: r.filename, level: r.level, category: r.category, source_folder: r.source_folder, file_type: r.file_type,
    page_count: r.page_count, start: r.start_page != null ? String(r.start_page) : '', end: r.end_page != null ? String(r.end_page) : '', url: r.external_url ?? '', instructions: r.instructions ?? '',
    est: r.est_minutes ? String(r.est_minutes) : '', priority: r.priority, notes: r.notes ?? '', hasProgress: r.status !== 'not_started' && r.status !== 'ready' || r.total_minutes > 0 };
}
const blankDraft = (): Draft => ({ key: k(), resource_id: null, title: '', filename: null, level: null, category: null, source_folder: null, file_type: 'pdf', page_count: null, start: '', end: '', url: '', instructions: '', est: '', priority: 2, notes: '', hasProgress: false });

function toInput(d: Draft): GoalResourceInput {
  const link = checkResourceUrl(d.url);
  return {
    resource_id: d.resource_id, title: d.title.trim(), filename: d.filename, level: d.level, category: d.category, source_folder: d.source_folder, file_type: d.file_type, page_count: d.page_count,
    start_page: d.start.trim() ? Number(d.start) : null, end_page: d.end.trim() ? Number(d.end) : null, external_url: d.url.trim() ? (link.normalized ?? d.url.trim()) : null,
    instructions: d.instructions.trim() || null, est_minutes: d.est.trim() ? Number(d.est) : null, priority: d.priority, notes: d.notes.trim() || null,
  };
}

export interface GoalEditorProps {
  open: boolean; onClose: () => void; goal?: Goal | null; resources?: GoalResource[]; weekStart: string;
  prefill?: { title: string; description?: string; curriculumWeek?: number; drafts: Draft[] } | null; onSaved?: (id: string) => void;
}

export function GoalEditor(props: GoalEditorProps) {
  const { open, onClose, goal } = props;
  return <Dialog open={open} onClose={onClose} wide title={goal ? 'Edit goal' : 'New weekly goal'}>{open && <EditorBody {...props} />}</Dialog>;
}

function EditorBody({ onClose, goal, resources, weekStart, prefill, onSaved }: GoalEditorProps) {
  const run = useRun();
  const { me } = useWho();
  const { data: plan } = usePlan();
  const editing = !!goal;
  const [title, setTitle] = useState(goal?.title ?? prefill?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? prefill?.description ?? '');
  const [scope, setScope] = useState<'personal' | 'shared'>(goal?.scope ?? 'personal');
  const [week, setWeek] = useState(goal?.week_start ?? weekStart);
  const [deadline, setDeadline] = useState(goal?.deadline ?? toISO(addDays(parseISO(weekStart), 6)));
  const [priority, setPriority] = useState<1 | 2 | 3>(goal?.priority ?? 2);
  const [policy, setPolicy] = useState<'mutual' | 'owner'>(goal?.postpone_policy ?? 'mutual');
  const [est, setEst] = useState(goal?.est_minutes ? String(goal.est_minutes) : '');
  const [manual, setManual] = useState(goal?.progress_manual != null ? String(goal.progress_manual) : '');
  const [drafts, setDrafts] = useState<Draft[]>(() => goal ? (resources ?? []).map(draftFromGoalResource) : (prefill?.drafts ?? []));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removing, setRemoving] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const original = useMemo(() => new Map((resources ?? []).map((r) => [r.id, r])), [resources]);

  const sumEst = drafts.reduce((a, d) => a + (Number(d.est) || 0), 0);
  const patchDraft = (key: string, p: Partial<Draft>) => setDrafts((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const move = (i: number, dir: -1 | 1) => setDrafts((xs) => { const n = [...xs]; const j = i + dir; if (j < 0 || j >= n.length) return xs; [n[i], n[j]] = [n[j], n[i]]; return n; });

  function validate(): boolean {
    const e: Record<string, string> = {};
    const g = goalSchema.safeParse({ title, deadline, week_start: week });
    if (!g.success) for (const i of g.error.issues) e[String(i.path[0] ?? 'title')] = i.message;
    if (est && !(Number(est) > 0)) e.est = 'Enter minutes greater than 0';
    if (manual && !(Number(manual) >= 0 && Number(manual) <= 100)) e.manual = 'Enter 0–100';
    drafts.forEach((d) => {
      if (!d.title.trim()) e[`${d.key}.title`] = 'Give this resource a title';
      const pr = validatePageRange({ start: d.start, end: d.end, pageCount: d.page_count }); if (pr) e[`${d.key}.pages`] = pr;
      const l = checkResourceUrl(d.url); if (!l.ok) e[`${d.key}.url`] = l.message ?? 'Invalid link';
      if (d.est && !(Number(d.est) > 0)) e[`${d.key}.est`] = 'Minutes must be above 0';
    });
    setErrors(e); return Object.keys(e).length === 0;
  }

  async function save() {
    if (!validate() || !me) return;
    setBusy(true);
    const res = await run(async () => {
      if (!goal) {
        return createGoal({ scope, owner_id: scope === 'personal' ? me.id : null, title: title.trim(), description: description.trim() || null, week_start: week, deadline, priority,
          est_minutes: est ? Number(est) : (sumEst || null), postpone_policy: scope === 'shared' ? 'mutual' : policy, curriculum_week: prefill?.curriculumWeek ?? null, plan_id: plan?.id ?? null }, drafts.map(toInput));
      }
      await updateGoal(goal.id, goal.version, { title: title.trim(), description: description.trim() || null, priority, est_minutes: est ? Number(est) : null, progress_manual: manual ? Number(manual) : null });
      const keep = new Set(drafts.filter((d) => d.id).map((d) => d.id!));
      for (const o of resources ?? []) if (!keep.has(o.id)) await deleteGoalResource(o.id);
      const order: string[] = [];
      for (const [i, d] of drafts.entries()) {
        const inp = toInput(d);
        if (d.id) {
          const o = original.get(d.id)!;
          const patch: Partial<GoalResource> = { title: inp.title, external_url: inp.external_url ?? null, instructions: inp.instructions ?? null, est_minutes: inp.est_minutes ?? null, priority: d.priority, notes: inp.notes ?? null, start_page: inp.start_page ?? null, end_page: inp.end_page ?? null };
          const total = inp.start_page != null && inp.end_page != null ? inp.end_page - inp.start_page + 1 : null;
          if (total !== null && o.pages_done > total) patch.pages_done = total;
          if (o.current_page != null && inp.start_page != null && inp.end_page != null && (o.current_page < inp.start_page || o.current_page > inp.end_page)) patch.current_page = null;
          await updateGoalResource(d.id, o.version, patch); order.push(d.id);
        } else await addGoalResource(goal.id, inp, i);
      }
      if (order.length > 1) await reorderGoalResources(order.concat([]).map((id) => id));
      return goal.id;
    }, { ok: editing ? 'Goal saved' : 'Goal created', invalidate: ['goals', 'goal_resources'] });
    setBusy(false);
    if (res.ok) { onSaved?.(res.value as string); onClose(); }
  }

  function addFromLibrary(r: Resource) { setDrafts((xs) => [...xs, draftFromResource(r)]); }
  function requestRemove(d: Draft) { if (d.hasProgress) setRemoving(d); else setDrafts((xs) => xs.filter((x) => x.key !== d.key)); }

  return (
    <div className="stack">
      <Field label="Goal" htmlFor="g-title" error={errors.title}><Input id="g-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Finish Akkusativ and read Story 7" autoFocus={!editing} /></Field>
      <Field label="Details (optional)" htmlFor="g-desc"><Textarea id="g-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>

      {!editing && (
        <Field label="Who is this for?">
          <Segmented label="Goal scope" value={scope} onChange={setScope} options={[{ value: 'personal', label: 'Just me' }, { value: 'shared', label: 'Both of us' }]} />
        </Field>
      )}
      <div className="grid2">
        <Field label="Week starting (Monday)" htmlFor="g-week" hint={weekLabel(week)}>
          {editing ? <p className="static-field">{formatDayLong(week)}</p> : <Input id="g-week" type="date" value={week} onChange={(e) => { const d = parseISO(e.target.value); const mon = addDays(d, -((d.getDay() + 6) % 7)); setWeek(toISO(mon)); setDeadline(toISO(addDays(mon, 6))); }} />}
        </Field>
        <Field label="Deadline" htmlFor="g-dead" error={errors.deadline} hint={editing ? 'To change it, use “Postpone” on the goal — your partner may need to approve.' : undefined}>
          {editing ? <p className="static-field">{formatDayLong(goal!.deadline)}{goal!.deadline !== goal!.original_deadline && <> <Badge tone="warn">postponed</Badge></>}</p> : <Input id="g-dead" type="date" min={week} value={deadline} onChange={(e) => setDeadline(e.target.value)} />}
        </Field>
      </div>
      <div className="grid2">
        <Field label="Priority" htmlFor="g-pri"><Select id="g-pri" value={priority} onChange={(e) => setPriority(Number(e.target.value) as 1 | 2 | 3)}>{([1, 2, 3] as const).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</Select></Field>
        <Field label="Expected time (minutes)" htmlFor="g-est" error={errors.est} hint={sumEst ? `Resources add up to ${sumEst} min` : undefined}><Input id="g-est" type="number" inputMode="numeric" min={1} value={est} placeholder={sumEst ? String(sumEst) : ''} onChange={(e) => setEst(e.target.value)} /></Field>
      </div>
      {!editing && scope === 'personal' && (
        <Field label="If the deadline has to move" htmlFor="g-pol" hint="Decided now and can’t be loosened later. Every change is recorded either way.">
          <Select id="g-pol" value={policy} onChange={(e) => setPolicy(e.target.value as 'mutual' | 'owner')}>
            <option value="mutual">My partner must approve a postponement</option><option value="owner">I can reschedule it myself (my partner is told)</option>
          </Select>
        </Field>
      )}
      {editing && drafts.length === 0 && (
        <Field label="Progress (%)" htmlFor="g-man" error={errors.manual} hint="Used when the goal has no resources attached."><Input id="g-man" type="number" min={0} max={100} value={manual} onChange={(e) => setManual(e.target.value)} /></Field>
      )}

      <section className="stack-sm" aria-labelledby="g-res">
        <div className="row between wrap"><h3 id="g-res">Files &amp; pages</h3>
          <div className="row wrap"><Button size="sm" icon={<Library size={15} aria-hidden />} onClick={() => setPickerOpen(true)}>From library</Button><Button size="sm" icon={<FilePlus2 size={15} aria-hidden />} onClick={() => setDrafts((xs) => [...xs, blankDraft()])}>Custom file</Button></div></div>
        {drafts.length === 0 && <p className="muted small">No files yet. Add one from your library, or paste a Google Drive link on a custom file. A goal can also be a simple written task.</p>}
        {drafts.map((d, i) => {
          const total = assignedPages({ start_page: Number(d.start) || null, end_page: Number(d.end) || null });
          return (
            <div key={d.key} className="draft" style={{ ['--tag' as string]: d.level ? `var(--lvl-${d.level.toLowerCase()})` : 'var(--lvl-all)' }}>
              <div className="row between wrap">
                {d.source_folder !== null || d.level ? <FolderTag level={d.level} folder={d.source_folder} category={d.category} /> : <Badge>custom</Badge>}
                <div className="row">
                  <button type="button" className="icon-btn icon-btn-sm" aria-label={`Move ${d.title || 'file'} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} aria-hidden /></button>
                  <button type="button" className="icon-btn icon-btn-sm" aria-label={`Move ${d.title || 'file'} down`} disabled={i === drafts.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} aria-hidden /></button>
                  <button type="button" className="icon-btn icon-btn-sm" aria-label={`Remove ${d.title || 'file'}`} onClick={() => requestRemove(d)}><Trash2 size={16} aria-hidden /></button>
                </div>
              </div>
              <Field label="Title" htmlFor={`${d.key}-t`} error={errors[`${d.key}.title`]}><Input id={`${d.key}-t`} value={d.title} onChange={(e) => patchDraft(d.key, { title: e.target.value })} disabled={d.hasProgress && !!d.resource_id ? false : false} /></Field>
              {d.filename && <p className="small muted">File: <code>{d.filename}</code>{d.page_count ? ` · ${d.page_count} pages` : ''}</p>}
              {d.needsPages && !d.start && <p className="note-box warn small">This is a large book — choose the pages for this week from its table of contents.</p>}
              <div className="grid3">
                <Field label="First page" htmlFor={`${d.key}-s`} error={errors[`${d.key}.pages`]}><Input id={`${d.key}-s`} type="number" inputMode="numeric" min={1} value={d.start} onChange={(e) => patchDraft(d.key, { start: e.target.value })} /></Field>
                <Field label="Last page" htmlFor={`${d.key}-e`}><Input id={`${d.key}-e`} type="number" inputMode="numeric" min={1} max={d.page_count ?? undefined} value={d.end} onChange={(e) => patchDraft(d.key, { end: e.target.value })} /></Field>
                <Field label="Minutes" htmlFor={`${d.key}-m`} error={errors[`${d.key}.est`]}><Input id={`${d.key}-m`} type="number" inputMode="numeric" min={1} value={d.est} onChange={(e) => patchDraft(d.key, { est: e.target.value })} /></Field>
              </div>
              {total !== null && <p className="small muted">{total} page{total === 1 ? '' : 's'} assigned{d.page_count ? ` of ${d.page_count}` : ''}.</p>}
              {d.page_count && d.page_count > 12 && <SplitHelper pageCount={d.page_count} onPick={(s, e) => patchDraft(d.key, { start: String(s), end: String(e) })} />}
              <Field label="Drive / web link" htmlFor={`${d.key}-u`} error={errors[`${d.key}.url`]}><Input id={`${d.key}-u`} type="url" inputMode="url" placeholder="https://drive.google.com/…" value={d.url} onChange={(e) => patchDraft(d.key, { url: e.target.value })} /></Field>
              <Field label="Instructions (optional)" htmlFor={`${d.key}-i`}><Input id={`${d.key}-i`} value={d.instructions} onChange={(e) => patchDraft(d.key, { instructions: e.target.value })} placeholder="e.g. exercises 1–4, read aloud" /></Field>
            </div>
          );
        })}
      </section>

      <div className="dialog-actions"><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} onClick={() => void save()}>{editing ? 'Save goal' : 'Create goal'}</Button></div>
      <LibraryPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={addFromLibrary} />
      <ConfirmDialog open={!!removing} danger title="Remove this file?" confirmLabel="Remove" onCancel={() => setRemoving(null)}
        message={<>“{removing?.title}” already has progress or logged time. Removing it deletes its progress for this goal (study sessions stay in the activity history).</>}
        onConfirm={() => { if (removing) setDrafts((xs) => xs.filter((x) => x.key !== removing.key)); setRemoving(null); }} />
    </div>
  );
}

/** Mechanical helper: splits a large book into equal page blocks. Not chapter-aware — adjust to the table of contents. */
function SplitHelper({ pageCount, onPick }: { pageCount: number; onPick: (s: number, e: number) => void }) {
  const [parts, setParts] = useState('8'); const [idx, setIdx] = useState('1');
  const chunks = evenSplit(1, pageCount, Math.max(1, Number(parts) || 1));
  const i = Math.min(Math.max(1, Number(idx) || 1), chunks.length);
  return (
    <details className="split">
      <summary>Help me pick pages</summary>
      <div className="row wrap align-end">
        <Field label="Split into parts" htmlFor="sp-n"><Input id="sp-n" className="input-sm" type="number" min={1} max={pageCount} value={parts} onChange={(e) => setParts(e.target.value)} /></Field>
        <Field label="Use part" htmlFor="sp-i"><Input id="sp-i" className="input-sm" type="number" min={1} max={chunks.length} value={idx} onChange={(e) => setIdx(e.target.value)} /></Field>
        <Button size="sm" onClick={() => onPick(chunks[i - 1][0], chunks[i - 1][1])}>Use pp. {chunks[i - 1]?.[0]}–{chunks[i - 1]?.[1]}</Button>
      </div>
      <p className="small muted">Equal-size blocks only — they are not aligned to chapters. Check the book’s contents page and adjust.</p>
    </details>
  );
}
