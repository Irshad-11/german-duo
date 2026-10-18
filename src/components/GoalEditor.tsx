import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, FilePlus2, Library, Trash2 } from 'lucide-react';
import { Badge, Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui/ui';
import { FolderTag } from '@/components/people';
import { LibraryPicker } from '@/components/LibraryPicker';
import { addGoalResource, createGoal, deleteGoalResource, reorderGoalResources, updateGoal, updateGoalResource, type GoalResourceInput } from '@/api/mutations';
import { useRun } from '@/hooks/useRun';
import { usePlan } from '@/api/queries';
import { assignedPages, evenSplit } from '@/lib/domain/progress';
import { checkResourceUrl } from '@/lib/domain/links';
import { addDays, parseISO, toISO } from '@/lib/domain/dates';
import { goalSchema, validatePageRange } from '@/lib/validation';
import { PRIORITY_LABEL } from '@/lib/domain/status';
import type { Goal, GoalResource, Level, Resource } from '@/types/db';

export interface Draft {
  key: string; id?: string; resource_id: string | null; title: string; filename: string | null; level: Level | null; category: string | null; source_folder: string | null; file_type: string | null;
  page_count: number | null; start: string; end: string; url: string; instructions: string; est: string; unit: string; target: string; needsPages?: boolean;
}
let seq = 0; const k = () => `d${++seq}`;
export function draftFromResource(r: Resource, o: { start?: number | null; end?: number | null; est?: number | null; instructions?: string | null; needsPages?: boolean } = {}): Draft {
  const small = r.page_count != null && r.page_count <= 12; const start = o.start ?? (small ? 1 : null); const end = o.end ?? (small ? r.page_count : null);
  return { key: k(), resource_id: r.id, title: r.title, filename: r.filename, level: r.level === 'ALL' ? null : r.level, category: r.category, source_folder: r.source_folder, file_type: r.file_type, page_count: r.page_count,
    start: start != null ? String(start) : '', end: end != null ? String(end) : '', url: r.external_url ?? '', instructions: o.instructions ?? '', est: o.est ? String(o.est) : '', unit: '', target: '', needsPages: o.needsPages };
}
const fromGR = (r: GoalResource): Draft => ({ key: k(), id: r.id, resource_id: r.resource_id, title: r.title, filename: r.filename, level: r.level, category: r.category, source_folder: r.source_folder, file_type: r.file_type, page_count: r.page_count,
  start: r.start_page != null ? String(r.start_page) : '', end: r.end_page != null ? String(r.end_page) : '', url: r.external_url ?? '', instructions: r.instructions ?? '', est: r.est_minutes ? String(r.est_minutes) : '', unit: r.measure_unit ?? '', target: r.measure_target ? String(r.measure_target) : '' });
const blank = (): Draft => ({ key: k(), resource_id: null, title: '', filename: null, level: null, category: null, source_folder: null, file_type: 'pdf', page_count: null, start: '', end: '', url: '', instructions: '', est: '', unit: '', target: '' });
function toInput(d: Draft): GoalResourceInput {
  const l = checkResourceUrl(d.url);
  return { resource_id: d.resource_id, title: d.title.trim(), filename: d.filename, level: d.level, category: d.category, source_folder: d.source_folder, file_type: d.file_type, page_count: d.page_count,
    start_page: d.start.trim() ? Number(d.start) : null, end_page: d.end.trim() ? Number(d.end) : null, external_url: d.url.trim() ? (l.normalized ?? d.url.trim()) : null, instructions: d.instructions.trim() || null,
    est_minutes: d.est.trim() ? Number(d.est) : null, measure_unit: d.unit.trim() || null, measure_target: d.target.trim() ? Number(d.target) : null };
}

export interface GoalEditorProps { open: boolean; onClose: () => void; goal?: Goal | null; resources?: GoalResource[]; defaultStart: string; prefill?: { title: string; description?: string; curriculumWeek?: number; drafts: Draft[] } | null; onSaved?: (id: string) => void }
export function GoalEditor(p: GoalEditorProps) { return <Dialog open={p.open} onClose={p.onClose} wide title={p.goal ? 'Edit goal' : 'New goal for both'}>{p.open && <Body {...p} />}</Dialog>; }

function Body({ onClose, goal, resources, defaultStart, prefill, onSaved }: GoalEditorProps) {
  const run = useRun(); const { data: plan } = usePlan(); const editing = !!goal;
  const [title, setTitle] = useState(goal?.title ?? prefill?.title ?? ''); const [description, setDescription] = useState(goal?.description ?? prefill?.description ?? '');
  const [start, setStart] = useState(goal?.start_date ?? defaultStart); const [deadline, setDeadline] = useState(goal?.deadline ?? toISO(addDays(parseISO(defaultStart), 6)));
  const [priority, setPriority] = useState<1 | 2 | 3>(goal?.priority ?? 2); const [est, setEst] = useState(goal?.est_minutes ? String(goal.est_minutes) : '');
  const [drafts, setDrafts] = useState<Draft[]>(() => (goal ? (resources ?? []).map(fromGR) : prefill?.drafts ?? []));
  const [picker, setPicker] = useState(false); const [errors, setErrors] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const orig = useMemo(() => new Map((resources ?? []).map((r) => [r.id, r])), [resources]);
  const sumEst = drafts.reduce((a, d) => a + (Number(d.est) || 0), 0);
  const patch = (key: string, p: Partial<Draft>) => setDrafts((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) => setDrafts((xs) => { const n = [...xs]; const j = i + d; if (j < 0 || j >= n.length) return xs; [n[i], n[j]] = [n[j], n[i]]; return n; });

  function validate(): boolean {
    const e: Record<string, string> = {};
    const g = goalSchema.safeParse({ title, deadline, week_start: start }); if (!g.success) for (const i of g.error.issues) e[String(i.path[0] ?? 'title')] = i.message;
    if (est && !(Number(est) > 0)) e.est = 'Minutes must be above 0';
    drafts.forEach((d) => {
      if (!d.title.trim()) e[`${d.key}.t`] = 'Give it a title';
      const pr = validatePageRange({ start: d.start, end: d.end, pageCount: d.page_count }); if (pr) e[`${d.key}.p`] = pr;
      const l = checkResourceUrl(d.url); if (!l.ok) e[`${d.key}.u`] = l.message ?? 'Invalid link';
      if (d.target && !(Number(d.target) > 0)) e[`${d.key}.m`] = 'Target must be above 0';
      if (d.target && !d.unit.trim()) e[`${d.key}.m`] = 'Name the unit (e.g. exercises)';
    });
    setErrors(e); return Object.keys(e).length === 0;
  }
  async function save() {
    if (!validate()) return; setBusy(true);
    const res = await run(async () => {
      if (!goal) return createGoal({ title: title.trim(), description: description.trim() || null, start_date: start, deadline, priority, est_minutes: est ? Number(est) : sumEst || null, curriculum_week: prefill?.curriculumWeek ?? null, plan_id: plan?.id ?? null }, drafts.map(toInput));
      await updateGoal(goal.id, { title: title.trim(), description: description.trim() || null, priority, est_minutes: est ? Number(est) : null, start_date: start });
      const keep = new Set(drafts.filter((d) => d.id).map((d) => d.id!));
      for (const o of resources ?? []) if (!keep.has(o.id)) await deleteGoalResource(o.id);
      const order: string[] = [];
      for (const [i, d] of drafts.entries()) {
        const inp = toInput(d);
        if (d.id) { const o = orig.get(d.id)!; const changed = (Object.keys(inp) as Array<keyof GoalResourceInput>).some((f) => (inp[f] ?? null) !== (o[f as keyof GoalResource] ?? null)); if (changed) await updateGoalResource(d.id, inp as Partial<GoalResource>); order.push(d.id); }
        else await addGoalResource(goal.id, inp, i);
      }
      if (order.length > 1) await reorderGoalResources(order);
      return goal.id;
    }, { ok: editing ? 'Goal saved' : 'Goal created', invalidate: ['goals', 'goal_resources', 'change_log'], undo: editing ? undefined : { table: 'goals', op: 'INSERT', fromResult: (id: string) => id } });
    setBusy(false); if (res.ok) { onSaved?.(res.value); onClose(); }
  }

  return (
    <div className="stack">
      <p className="note-box small">This goal is shared: both learners follow it and each records progress against the same files.</p>
      <Field label="Goal" htmlFor="g-title" error={errors.title}><Input id="g-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Akkusativ + Story 7" autoFocus={!editing} /></Field>
      <Field label="Details (optional)" htmlFor="g-desc"><Textarea id="g-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="grid3">
        <Field label="Start" htmlFor="g-start"><Input id="g-start" type="date" value={start} max={editing ? goal?.deadline : deadline} onChange={(e) => { setStart(e.target.value); if (!editing && e.target.value > deadline) setDeadline(e.target.value); }} /></Field>
        <Field label="Deadline" htmlFor="g-dead" error={errors.deadline} hint={editing ? 'Move it with “Ask to postpone”.' : undefined}>
          {editing ? <p className="static-field mono">{goal!.deadline}</p> : <Input id="g-dead" type="date" min={start} value={deadline} onChange={(e) => setDeadline(e.target.value)} />}</Field>
        <Field label="Priority" htmlFor="g-pri"><Select id="g-pri" value={priority} onChange={(e) => setPriority(Number(e.target.value) as 1 | 2 | 3)}>{([1, 2, 3] as const).map((x) => <option key={x} value={x}>{PRIORITY_LABEL[x]}</option>)}</Select></Field>
      </div>
      <Field label="Expected time per person (minutes)" htmlFor="g-est" error={errors.est} hint={sumEst ? `Files add up to ${sumEst} min` : undefined}><Input id="g-est" className="input-sm" type="number" min={1} value={est} placeholder={sumEst ? String(sumEst) : ''} onChange={(e) => setEst(e.target.value)} /></Field>

      <section className="stack-sm"><div className="row between wrap"><h3>Files &amp; pages</h3><div className="row wrap"><Button size="sm" icon={<Library size={14} aria-hidden />} onClick={() => setPicker(true)}>From library</Button><Button size="sm" icon={<FilePlus2 size={14} aria-hidden />} onClick={() => setDrafts((x) => [...x, blank()])}>Custom task</Button></div></div>
        {drafts.length === 0 && <p className="muted small">No files yet. Add one from the library, or a custom task (a link, or something measurable like “20 exercises”).</p>}
        {drafts.map((d, i) => {
          const total = assignedPages({ start_page: Number(d.start) || null, end_page: Number(d.end) || null });
          return (
            <div key={d.key} className="draft" style={{ ['--tag' as string]: d.level ? `var(--lvl-${d.level.toLowerCase()})` : 'var(--lvl-all)' }}>
              <div className="row between wrap">{d.source_folder !== null || d.level ? <FolderTag level={d.level} folder={d.source_folder} category={d.category} /> : <Badge>custom</Badge>}
                <div className="row"><button type="button" className="icon-btn icon-btn-sm" aria-label={`Move ${d.title || 'file'} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={15} aria-hidden /></button>
                  <button type="button" className="icon-btn icon-btn-sm" aria-label={`Move ${d.title || 'file'} down`} disabled={i === drafts.length - 1} onClick={() => move(i, 1)}><ArrowDown size={15} aria-hidden /></button>
                  <button type="button" className="icon-btn icon-btn-sm" aria-label={`Remove ${d.title || 'file'}`} onClick={() => setDrafts((x) => x.filter((y) => y.key !== d.key))}><Trash2 size={15} aria-hidden /></button></div></div>
              <Field label="Title" htmlFor={`${d.key}-t`} error={errors[`${d.key}.t`]}><Input id={`${d.key}-t`} value={d.title} onChange={(e) => patch(d.key, { title: e.target.value })} /></Field>
              {d.filename && <p className="small muted"><code>{d.filename}</code>{d.page_count ? ` · ${d.page_count} pages` : ''}</p>}
              {d.needsPages && !d.start && <p className="note-box warn small">Large book — choose this goal’s pages from its contents page.</p>}
              <div className="grid3">
                <Field label="First page" htmlFor={`${d.key}-s`} error={errors[`${d.key}.p`]}><Input id={`${d.key}-s`} type="number" inputMode="numeric" min={1} value={d.start} onChange={(e) => patch(d.key, { start: e.target.value })} /></Field>
                <Field label="Last page" htmlFor={`${d.key}-e`}><Input id={`${d.key}-e`} type="number" inputMode="numeric" min={1} max={d.page_count ?? undefined} value={d.end} onChange={(e) => patch(d.key, { end: e.target.value })} /></Field>
                <Field label="Minutes" htmlFor={`${d.key}-m`}><Input id={`${d.key}-m`} type="number" inputMode="numeric" min={1} value={d.est} onChange={(e) => patch(d.key, { est: e.target.value })} /></Field>
              </div>
              {total !== null && <p className="small muted">{total} page{total === 1 ? '' : 's'}{d.page_count ? ` of ${d.page_count}` : ''}</p>}
              {d.page_count && d.page_count > 12 && <Split pageCount={d.page_count} onPick={(s, e) => patch(d.key, { start: String(s), end: String(e) })} />}
              {total === null && <div className="grid2"><Field label="Measurable target (optional)" htmlFor={`${d.key}-tg`} error={errors[`${d.key}.m`]} hint="when there are no pages, e.g. 20 exercises"><Input id={`${d.key}-tg`} type="number" inputMode="decimal" min={0} value={d.target} onChange={(e) => patch(d.key, { target: e.target.value })} /></Field>
                <Field label="Unit" htmlFor={`${d.key}-un`}><Input id={`${d.key}-un`} value={d.unit} placeholder="exercises, words, lessons…" onChange={(e) => patch(d.key, { unit: e.target.value })} /></Field></div>}
              <Field label="Drive / web link" htmlFor={`${d.key}-u`} error={errors[`${d.key}.u`]}><Input id={`${d.key}-u`} type="url" inputMode="url" placeholder="https://drive.google.com/…" value={d.url} onChange={(e) => patch(d.key, { url: e.target.value })} /></Field>
              <Field label="Instructions (optional)" htmlFor={`${d.key}-i`}><Input id={`${d.key}-i`} value={d.instructions} onChange={(e) => patch(d.key, { instructions: e.target.value })} placeholder="e.g. exercises 1–4, read aloud" /></Field>
            </div>
          );
        })}
      </section>
      <div className="dialog-actions"><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} onClick={() => void save()}>{editing ? 'Save goal' : 'Create goal'}</Button></div>
      <LibraryPicker open={picker} onClose={() => setPicker(false)} onPick={(r) => setDrafts((x) => [...x, draftFromResource(r)])} />
    </div>
  );
}
function Split({ pageCount, onPick }: { pageCount: number; onPick: (s: number, e: number) => void }) {
  const [parts, setParts] = useState('8'); const [idx, setIdx] = useState('1');
  const chunks = evenSplit(1, pageCount, Math.max(1, Number(parts) || 1)); const i = Math.min(Math.max(1, Number(idx) || 1), chunks.length);
  return (
    <details className="split"><summary>Help me pick pages</summary>
      <div className="row wrap align-end"><Field label="Split into" htmlFor="sp-n"><Input id="sp-n" className="input-sm" type="number" min={1} value={parts} onChange={(e) => setParts(e.target.value)} /></Field>
        <Field label="Use part" htmlFor="sp-i"><Input id="sp-i" className="input-sm" type="number" min={1} max={chunks.length} value={idx} onChange={(e) => setIdx(e.target.value)} /></Field>
        <Button size="sm" onClick={() => onPick(chunks[i - 1][0], chunks[i - 1][1])}>Use pp. {chunks[i - 1]?.[0]}–{chunks[i - 1]?.[1]}</Button></div>
      <p className="small muted">Equal blocks only — not chapter-aware. Check the contents page.</p></details>
  );
}
