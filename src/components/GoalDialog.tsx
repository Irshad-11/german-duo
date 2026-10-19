import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarClock, Pencil, Trash2 } from 'lucide-react';
import { Badge, Button, Dialog, Field, FormPage, Input, Textarea } from '@/components/ui/ui';
import { FolderTag, PersonCell } from '@/components/people';
import { ChangeList } from '@/components/ChangeList';
import { useChangeLog, useGoalResources, useGoals, usePostponements, useProgress } from '@/api/queries';
import { cancelPostponement, deleteGoal, requestPostponement, updateGoal } from '@/api/mutations';
import { useRun } from '@/hooks/useRun';
import { useWho } from '@/hooks/useWho';
import { learnerGoalPct } from '@/lib/domain/progress';
import { addDays, formatDayLong, formatDay, parseISO, toISO } from '@/lib/domain/dates';
import { pageRangeLabel } from '@/lib/domain/folders';
import { postponeSchema } from '@/lib/validation';
import type { Goal } from '@/types/db';

export function GoalDialog({ goalId, onClose, onEdit, onOpenResource }: { goalId: string | null; onClose: () => void; onEdit: (g: Goal) => void; onOpenResource: (id: string) => void }) {
  const { data: goals } = useGoals(); const g = goals?.find((x) => x.id === goalId) ?? null;
  return <FormPage open={!!goalId} onClose={onClose} title={g?.title ?? 'Goal'} wide>{g && <Body g={g} onClose={onClose} onEdit={onEdit} onOpenResource={onOpenResource} />}</FormPage>;
}
type PF = z.infer<typeof postponeSchema>;

function Body({ g, onClose, onEdit, onOpenResource }: { g: Goal; onClose: () => void; onEdit: (g: Goal) => void; onOpenResource: (id: string) => void }) {
  const who = useWho(); const run = useRun();
  const { data: rs } = useGoalResources(); const { data: progress } = useProgress(); const { data: posts } = usePostponements(); const { data: log } = useChangeLog(400);
  const resources = useMemo(() => (rs ?? []).filter((r) => r.goal_id === g.id), [rs, g.id]);
  const ids = new Set([g.id, ...resources.map((r) => r.id)]);
  const hist = (log ?? []).filter((e) => { const row = (e.new_row ?? e.old_row) as Record<string, unknown> | null;
    return (e.table_name === 'goals' && e.row_id === g.id) || (e.table_name === 'goal_resources' && row?.goal_id === g.id) || (e.table_name === 'goal_progress' && ids.has(String(row?.goal_resource_id))) || (e.table_name === 'study_sessions' && row?.goal_id === g.id) || (e.table_name === 'postponement_requests' && row?.goal_id === g.id); }).slice(0, 30);
  const pending = (posts ?? []).find((p) => p.goal_id === g.id && p.status === 'pending');
  const [ask, setAsk] = useState(false);

  return (
    <div className="stack">
      <div className="row wrap between"><p className="mono small">{formatDayLong(g.start_date)} → <b>{formatDayLong(g.deadline)}</b>{g.deadline !== g.original_deadline && <> <Badge tone="warn">postponed from {formatDay(g.original_deadline)}</Badge></>}</p>
        {g.exam_date && <p className="small">Exam session: <b>{formatDayLong(g.exam_date)}</b></p>}
        {g.status === 'dropped' && <Badge>dropped</Badge>}</div>
      {g.description && <p>{g.description}</p>}
      <table className="tbl tbl-compare"><thead><tr><th scope="col">Overall</th>{who.learners.map((l) => <th key={l.id} scope="col"><span className={`txt-${l.accent}`}>{l.code}</span></th>)}</tr></thead>
        <tbody><tr><th scope="row">Progress</th>{who.learners.map((l) => <td key={l.id} className="mono">{learnerGoalPct(resources, progress ?? [], l.id)}%</td>)}</tr></tbody></table>
      {pending && (
        <p className="note-box warn">Postponement to <b>{formatDay(pending.proposed_deadline)}</b> asked by {who.nameOf(pending.requester_id)} — “{pending.reason}”. {pending.requester_id === who.me?.id ? <button className="linklike" onClick={() => void run(() => cancelPostponement(pending.id), { ok: 'Request cancelled', invalidate: ['postponements', 'change_log'] })}>Cancel request</button> : 'Decide in Plan → Requests.'}</p>
      )}
      <div className="row wrap">
        <Button size="sm" icon={<Pencil size={14} aria-hidden />} onClick={() => onEdit(g)}>Edit goal &amp; files</Button>
        {g.status === 'active' && !pending && <Button size="sm" icon={<CalendarClock size={14} aria-hidden />} onClick={() => setAsk(true)}>Ask to postpone</Button>}
        {g.status === 'active' ? <Button size="sm" variant="ghost" onClick={() => void run(() => updateGoal(g.id, { status: 'dropped' }), { ok: 'Goal dropped', invalidate: ['goals', 'change_log'], undo: { table: 'goals', op: 'UPDATE', rowId: g.id } })}>Drop</Button>
          : <Button size="sm" onClick={() => void run(() => updateGoal(g.id, { status: 'active' }), { ok: 'Goal reopened', invalidate: ['goals', 'change_log'], undo: { table: 'goals', op: 'UPDATE', rowId: g.id } })}>Reopen</Button>}
        <Button size="sm" variant="ghost" icon={<Trash2 size={14} aria-hidden />} onClick={() => void run(() => deleteGoal(g.id), { ok: 'Goal deleted', invalidate: ['goals', 'goal_resources', 'goal_progress', 'change_log'], undo: { table: 'goals', op: 'DELETE', rowId: g.id } }).then((r) => { if (r.ok) onClose(); })}>Delete</Button>
      </div>

      <h3>Files</h3>
      {resources.length === 0 ? <p className="muted small">No files in this goal.</p> : (
        <div className="sheet-wrap"><table className="tbl"><thead><tr><th scope="col">File</th>{who.learners.map((l) => <th key={l.id} scope="col"><span className={`txt-${l.accent}`}>{l.code}</span></th>)}</tr></thead>
          <tbody>{resources.map((r) => (
            <tr key={r.id}><th scope="row"><button className="linklike" onClick={() => onOpenResource(r.id)}>{r.title}</button><br /><FolderTag level={r.level} folder={r.source_folder} /><br /><span className="small muted">{pageRangeLabel(r.start_page, r.end_page, r.page_count)}{r.est_minutes ? ` · ~${r.est_minutes} min` : ''}</span></th>
              {who.learners.map((l) => <td key={l.id}><PersonCell learner={l} r={r} p={progress?.find((p) => p.goal_resource_id === r.id && p.learner_id === l.id)} /></td>)}</tr>))}</tbody></table></div>
      )}
      <h3>History</h3><ChangeList entries={hist} compact />
      <div className="row end"><Button onClick={onClose}>Close</Button></div>
      <Dialog open={ask} onClose={() => setAsk(false)} title="Ask to postpone">{ask && <PostponeForm g={g} onDone={() => setAsk(false)} />}</Dialog>
    </div>
  );
}
function PostponeForm({ g, onDone }: { g: Goal; onDone: () => void }) {
  const run = useRun(); const who = useWho(); const min = toISO(addDays(parseISO(g.deadline), 1));
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<PF>({ resolver: zodResolver(postponeSchema), defaultValues: { deadline: toISO(addDays(parseISO(g.deadline), 7)), reason: '' } });
  async function submit(v: PF) { if (v.deadline < min) return; const r = await run(() => requestPostponement(g.id, v.deadline, v.reason.trim()), { ok: `Asked ${who.other?.display_name ?? 'the other learner'}`, invalidate: ['postponements', 'change_log'] }); if (r.ok) onDone(); }
  return (
    <form className="stack" onSubmit={handleSubmit(submit)} noValidate>
      <p className="muted">“{g.title}” is due {formatDayLong(g.deadline)}. {who.other?.display_name ?? 'The other learner'} has to approve a new date; until then nothing moves.</p>
      <Field label="New deadline" htmlFor="pp-d" error={errors.deadline?.message}><Input id="pp-d" type="date" min={min} {...register('deadline')} /></Field>
      <Field label="Reason" htmlFor="pp-r" error={errors.reason?.message}><Textarea id="pp-r" rows={3} {...register('reason')} /></Field>
      <div className="dialog-actions"><Button onClick={onDone}>Cancel</Button><Button type="submit" variant="primary" busy={isSubmitting}>Send request</Button></div>
    </form>
  );
}
