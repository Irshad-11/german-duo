import { useMemo } from 'react';
import { CalendarClock } from 'lucide-react';
import { Avatar, Badge, Button, Input } from '@/components/ui/ui';
import { FolderTag, MiniBar, OnlyFor, ReadyBadge, StatusMark } from '@/components/people';
import { updateGoal } from '@/api/mutations';
import { useRun } from '@/hooks/useRun';
import { appliesTo, finishedOrder, goalFinishedOrder, isReadyForQuestions, learnerGoalPct, measure, type Finish } from '@/lib/domain/progress';
import { pageRangeLabel } from '@/lib/domain/folders';
import { daysUntil, formatDay, formatMinutes } from '@/lib/domain/dates';
import type { Goal, GoalProgress, GoalResource, Learner } from '@/types/db';

const stamp = (iso: string): string => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };

/** Weeks in order: syllabus week number first, then goals without one by start date. */
export function sortWeeks(goals: Goal[]): Goal[] {
  return [...goals].sort((a, b) => (a.curriculum_week ?? 9999) - (b.curriculum_week ?? 9999) || a.start_date.localeCompare(b.start_date) || a.created_at.localeCompare(b.created_at));
}

/** “Due in 3 days” / “2 days late” / “today” for a deadline. */
export function dueNote(deadlineISO: string, now: Date = new Date()): { text: string; late: boolean } {
  const d = daysUntil(deadlineISO, now);
  if (d === 0) return { text: 'today', late: false };
  if (d > 0) return { text: `in ${d} day${d === 1 ? '' : 's'}`, late: false };
  return { text: `${-d} day${d === -1 ? '' : 's'} late`, late: true };
}

function Order({ list, learners }: { list: Finish[]; learners: Learner[] }) {
  if (list.length === 0) return <span className="muted small">Nobody yet</span>;
  const who = (id: string) => learners.find((l) => l.id === id);
  const [first, ...rest] = list;
  const f = who(first.learnerId);
  return (
    <span className="wk-order">
      <span className="row"><Avatar code={f?.code ?? '··'} accent={f?.accent ?? 'blue'} size={14} label={f?.display_name} /> <b>{list.length > 1 ? 'first' : 'finished'}</b></span>
      <span className="small muted">{stamp(first.at)}</span>
      {rest.map((x) => { const l = who(x.learnerId); return <span key={x.learnerId} className="small muted">then {l?.display_name ?? 'someone'} · {stamp(x.at)}</span>; })}
    </span>
  );
}

/** One block per week: week number, deadline and exam date on top, then a table of the files with each person's stage, who finished first and who is ready for questions. */
export function WeeklyTable({ goals, resources, progress, learners, onOpenGoal, onUpdate }: {
  goals: Goal[]; resources: GoalResource[]; progress: GoalProgress[]; learners: Learner[]; onOpenGoal: (id: string) => void; onUpdate: (resourceId: string) => void;
}) {
  const run = useRun();
  const weeks = useMemo(() => sortWeeks(goals), [goals]);
  const ids = learners.map((l) => l.id);
  if (weeks.length === 0) return <p className="muted">No weeks match. Plan a syllabus week or change the filter above.</p>;
  const setExam = (g: Goal, value: string) => void run(() => updateGoal(g.id, { exam_date: value || null }), { ok: value ? 'Exam date saved' : 'Exam date removed', invalidate: ['goals', 'change_log'], undo: { table: 'goals', op: 'UPDATE', rowId: g.id } });

  return (
    <div className="stack-lg">
      {weeks.map((g) => {
        const rs = resources.filter((r) => r.goal_id === g.id);
        const due = dueNote(g.deadline); const exam = g.exam_date ? dueNote(g.exam_date) : null;
        const doneOrder = goalFinishedOrder(rs, progress, ids);
        return (
          <section key={g.id} className={`wk ${g.status === 'dropped' ? 'dim' : ''}`} aria-labelledby={`wk-${g.id}`}>
            <header className="wk-head">
              <div className="wk-title">
                <span className="wk-num" aria-hidden>{g.curriculum_week ?? '•'}</span>
                <div className="grow"><p className="small muted">{g.curriculum_week ? `Week ${g.curriculum_week}` : 'Own goal'}{g.status === 'dropped' ? ' · dropped' : ''}</p><h2 id={`wk-${g.id}`}>{g.title}</h2></div>
                <Button size="sm" icon={<CalendarClock size={14} aria-hidden />} onClick={() => onOpenGoal(g.id)}>Options &amp; postpone</Button>
              </div>
              <dl className="wk-facts">
                <div><dt>Week</dt><dd>{g.curriculum_week ?? '—'}</dd></div>
                <div><dt>Deadline</dt><dd>{formatDay(g.deadline)} <span className={due.late ? 'txt-warn small' : 'muted small'}>{due.text}</span>{g.deadline !== g.original_deadline && <> <Badge tone="warn">moved from {formatDay(g.original_deadline)}</Badge></>}</dd></div>
                <div><dt><label htmlFor={`ex-${g.id}`}>Exam session</label></dt>
                  <dd className="row wrap"><Input id={`ex-${g.id}`} className="input-date" type="date" value={g.exam_date ?? ''} onChange={(e) => setExam(g, e.target.value)} />{exam && <span className={exam.late ? 'muted small' : 'small'}>{exam.late ? 'passed' : exam.text}</span>}</dd></div>
                <div><dt>Progress</dt><dd className="wk-bars">{learners.map((l) => { const pc = learnerGoalPct(rs, progress, l.id); return <span key={l.id} className="row"><Avatar code={l.code} accent={l.accent} size={14} label={l.display_name} /><MiniBar pct={pc} accent={l.accent} /><b className="small">{pc}%</b></span>; })}</dd></div>
                <div><dt>Whole week finished</dt><dd><Order list={doneOrder} learners={learners} /></dd></div>
              </dl>
            </header>
            {rs.length === 0 ? <p className="muted small">No books or PDFs in this week yet. Open “Options &amp; postpone” → Edit goal &amp; files.</p> : (
              <div className="sheet-wrap">
                <table className="tbl tbl-week">
                  <thead><tr><th scope="col" className="sticky-col">Book / PDF to cover</th><th scope="col">Pages</th>
                    {learners.map((l) => <th key={l.id} scope="col"><span className={`txt-${l.accent}`}>{l.display_name}</span> · stage</th>)}
                    <th scope="col">Finished first</th><th scope="col">Ready for questions</th></tr></thead>
                  <tbody>{rs.map((r) => {
                    const order = finishedOrder(r, progress, ids.filter((id) => appliesTo(r, id)));
                    const ready = learners.filter((l) => appliesTo(r, l.id) && isReadyForQuestions(progress.find((p) => p.goal_resource_id === r.id && p.learner_id === l.id)));
                    return (
                      <tr key={r.id}>
                        <th scope="row" className="sticky-col"><button className="linklike" onClick={() => onUpdate(r.id)}>{r.title}</button>{r.assignee_id && <> <OnlyFor learner={learners.find((l) => l.id === r.assignee_id)} /></>}<br /><FolderTag level={r.level} folder={r.source_folder} />{r.instructions && <span className="small muted block">{r.instructions}</span>}</th>
                        <td className="small">{pageRangeLabel(r.start_page, r.end_page, r.page_count)}{r.est_minutes ? <><br />~{formatMinutes(r.est_minutes)}</> : null}</td>
                        {learners.map((l) => {
                          if (!appliesTo(r, l.id)) return <td key={l.id}><span className="small muted">Not for {l.display_name}</span></td>;
                          const p = progress.find((x) => x.goal_resource_id === r.id && x.learner_id === l.id); const m = measure(r, p);
                          return (
                            <td key={l.id}><div className="pcell"><StatusMark status={p?.status ?? 'not_started'} /><span className="row"><MiniBar pct={m.pct} accent={l.accent} /><b className="small">{m.pct === null ? '–' : `${m.pct}%`}</b></span>
                              <span className="small muted">{m.manual ? 'set by hand' : m.total && m.unit === 'pages' ? `${m.done}/${m.total} pages` : m.total ? `${m.done}/${m.total} ${m.unit}` : ''}{p?.current_page && p.status !== 'completed' ? ` · at p.${p.current_page}` : ''}{p?.minutes_total ? ` · ${formatMinutes(p.minutes_total)}` : ''}</span></div></td>);
                        })}
                        <td><Order list={order} learners={learners} /></td>
                        <td>{ready.length === 0 ? <span className="muted small">—</span> : <span className="wk-ready">{ready.map((l) => <span key={l.id} className="row"><Avatar code={l.code} accent={l.accent} size={14} label={l.display_name} /><ReadyBadge short /></span>)}</span>}</td>
                      </tr>);
                  })}</tbody>
                </table>
              </div>
            )}
          </section>);
      })}
    </div>
  );
}
