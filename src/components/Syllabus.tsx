import { useMemo, useState } from 'react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCurriculum, useGoals, useResources } from '@/api/queries';
import { addCurriculumItem, deleteCurriculumItem, updateCurriculumItem } from '@/api/mutations';
import { useRun } from '@/hooks/useRun';
import { Badge, Button, Dialog, Field, Input, Segmented, SkeletonCards, Textarea } from '@/components/ui/ui';
import { LibraryPicker } from '@/components/LibraryPicker';
import { validatePageRange } from '@/lib/validation';
import type { CurriculumItem, Resource } from '@/types/db';

/** First syllabus week that has no goal yet — what to plan next. You can always pick any other week. */
export function nextSyllabusWeek(weeks: Array<{ week_no: number }>, goals: Array<{ curriculum_week: number | null; status: string }>): number | null {
  const planned = new Set(goals.filter((g) => g.status !== 'dropped' && g.curriculum_week).map((g) => g.curriculum_week));
  return weeks.find((w) => !planned.has(w.week_no))?.week_no ?? null;
}

export function Syllabus({ onPlan, onOpenGoal }: { onPlan: (week: number) => void; onOpenGoal: (goalId: string) => void }) {
  const { data, isLoading } = useCurriculum(); const { data: resources } = useResources(); const { data: goals } = useGoals(); const run = useRun();
  const [level, setLevel] = useState<'all' | 'A1' | 'A2' | 'B1'>('all'); const [editing, setEditing] = useState<CurriculumItem | null>(null); const [picker, setPicker] = useState<number | null>(null);
  const byPath = useMemo(() => new Map((resources ?? []).map((r) => [r.library_path, r])), [resources]);
  if (isLoading || !data) return <SkeletonCards />;
  const next = nextSyllabusWeek(data.weeks, goals ?? []); const weeks = data.weeks.filter((w) => level === 'all' || w.level === level);
  const goalFor = (wk: number) => (goals ?? []).find((g) => g.curriculum_week === wk && g.status !== 'dropped');
  return (
    <div className="stack-lg">
      <div className="syl-intro">
        <p>The syllabus is a <b>suggested</b> order from A1 to the start of B1, built from file names and page counts only (the PDFs were not read). <b>Choose any week</b> and press “Plan this week” — it creates one shared goal with that week’s materials. Nothing depends on the calendar.</p>
        {next && <p className="syl-next">Next unplanned: <b>week {next}</b> — {data.weeks.find((w) => w.week_no === next)?.theme} <Button variant="primary" size="sm" onClick={() => onPlan(next)}>Plan week {next}</Button></p>}
        <Segmented<'all' | 'A1' | 'A2' | 'B1'> label="Level" value={level} onChange={setLevel} options={[{ value: 'all', label: 'All weeks' }, { value: 'A1', label: 'A1' }, { value: 'A2', label: 'A2' }, { value: 'B1', label: 'B1' }]} />
      </div>
      <ol className="plain-list syl">
        {weeks.map((w) => {
          const items = data.items.filter((i) => i.week_no === w.week_no); const g = goalFor(w.week_no);
          return (
            <li key={w.week_no} className={`syl-week ${next === w.week_no ? 'syl-next-row' : ''} ${g ? 'syl-done' : ''}`} id={`syl-${w.week_no}`}>
              <div className="syl-num" aria-hidden>{w.week_no}</div>
              <div className="syl-main">
                <div className="row between wrap"><h3>{w.theme} <Badge>{w.level}</Badge></h3>
                  {g ? <button className="linklike" onClick={() => onOpenGoal(g.id)}><Check size={14} aria-hidden /> Planned — open goal</button> : <Button size="sm" variant="primary" onClick={() => onPlan(w.week_no)}>Plan this week</Button>}</div>
                {w.goal && <p className="small muted">{w.goal}</p>}
                <ul className="plain-list syl-items">
                  {items.map((i) => { const r = byPath.get(i.resource_path); return (
                    <li key={i.id} style={{ ['--tag' as string]: r ? `var(--lvl-${r.level.toLowerCase()})` : 'var(--lvl-all)' }}>
                      <span className="grow"><b>{r?.title ?? i.resource_path}</b> <span className="small muted">{i.role}{i.start_page ? ` · pp. ${i.start_page}–${i.end_page}` : ''}{i.est_minutes ? ` · ~${i.est_minutes} min` : ''}</span>{i.needs_page_selection && <Badge tone="warn">choose pages</Badge>}{i.note && <span className="small muted block">{i.note}</span>}</span>
                      <button className="icon-btn icon-btn-sm" aria-label={`Edit ${r?.title ?? 'item'}`} onClick={() => setEditing(i)}><Pencil size={14} aria-hidden /></button>
                      <button className="icon-btn icon-btn-sm" aria-label={`Remove ${r?.title ?? 'item'} from week ${w.week_no}`} onClick={() => void run(() => deleteCurriculumItem(i.id), { ok: 'Removed from the syllabus', invalidate: ['curriculum'] })}><Trash2 size={14} aria-hidden /></button></li>); })}
                </ul>
                <button className="linklike small" onClick={() => setPicker(w.week_no)}><Plus size={13} aria-hidden /> Add a file to week {w.week_no}</button>
              </div>
            </li>);
        })}
      </ol>
      <ItemPage item={editing} resource={editing ? byPath.get(editing.resource_path ?? '') ?? null : null} onClose={() => setEditing(null)} />
      <LibraryPicker open={picker !== null} onClose={() => setPicker(null)} onPick={(r: Resource) => {
        if (picker === null || !r.library_path) return; const pos = data.items.filter((i) => i.week_no === picker).length;
        void run(() => addCurriculumItem({ week_no: picker, position: pos, resource_path: r.library_path, role: 'lesson', start_page: null, end_page: null, est_minutes: null, note: null, needs_page_selection: (r.page_count ?? 0) > 12 }), { ok: 'Added', invalidate: ['curriculum'] });
      }} />
    </div>
  );
}

function ItemPage({ item, resource, onClose }: { item: CurriculumItem | null; resource: Resource | null; onClose: () => void }) {
  return <Dialog open={!!item} onClose={onClose} title="Edit syllabus step">{item && <ItemBody item={item} resource={resource} onClose={onClose} />}</Dialog>;
}
function ItemBody({ item, resource, onClose }: { item: CurriculumItem; resource: Resource | null; onClose: () => void }) {
  const run = useRun();
  const [s, setS] = useState(item.start_page ? String(item.start_page) : ''); const [e, setE] = useState(item.end_page ? String(item.end_page) : '');
  const [m, setM] = useState(item.est_minutes ? String(item.est_minutes) : ''); const [note, setNote] = useState(item.note ?? '');
  const err = validatePageRange({ start: s, end: e, pageCount: resource?.page_count ?? null });
  return (
    <div className="stack">
      <p className="form-lead"><b>{resource?.title}</b></p>
      <div className="grid3">
        <Field label="First page" htmlFor="ci-s" error={err}><Input id="ci-s" type="number" min={1} value={s} onChange={(x) => setS(x.target.value)} /></Field>
        <Field label="Last page" htmlFor="ci-e"><Input id="ci-e" type="number" min={1} value={e} onChange={(x) => setE(x.target.value)} /></Field>
        <Field label="Minutes" htmlFor="ci-m"><Input id="ci-m" type="number" min={1} value={m} onChange={(x) => setM(x.target.value)} /></Field>
      </div>
      <Field label="Note" htmlFor="ci-n"><Textarea id="ci-n" rows={2} value={note} onChange={(x) => setNote(x.target.value)} /></Field>
      <div className="form-actions"><Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!!err} onClick={() => void run(() => updateCurriculumItem(item.id, { start_page: s ? Number(s) : null, end_page: e ? Number(e) : null, est_minutes: m ? Number(m) : null, note: note.trim() || null }), { ok: 'Saved', invalidate: ['curriculum'] }).then(onClose)}>Save</Button></div>
    </div>
  );
}
