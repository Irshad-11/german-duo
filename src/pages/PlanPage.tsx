import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useCurriculum, useGoalResources, useGoals, usePlan, usePostponements, useProgress, useResources } from '@/api/queries';
import { cancelPostponement, decidePostponement } from '@/api/mutations';
import { useRun } from '@/hooks/useRun';
import { useWho } from '@/hooks/useWho';
import { Avatar, Badge, Button, Dialog, EmptyState, ErrorState, Field, Input, Segmented, SkeletonCards, Tabs, Textarea } from '@/components/ui/ui';
import { FolderTag, MiniBar, PersonCell } from '@/components/people';
import { MaterialCard } from '@/components/material';
import { Page } from '@/components/Page';
import { Gantt } from '@/components/Gantt';
import { Syllabus, nextSyllabusWeek } from '@/components/Syllabus';
import { WeeklyTable } from '@/components/WeeklyTable';
import { GoalEditor, draftFromResource, type Draft } from '@/components/GoalEditor';
import { GoalDialog } from '@/components/GoalDialog';
import { addDays, formatDay, startOfWeek, timeAgo, toISO } from '@/lib/domain/dates';
import { goalState, learnerGoalPct } from '@/lib/domain/progress';
import { pageRangeLabel } from '@/lib/domain/folders';
import type { GanttScale } from '@/lib/domain/gantt';
import type { Goal, GoalProgress, GoalResource, Learner } from '@/types/db';

type View = 'week' | 'weekly' | 'timeline' | 'sheet' | 'syllabus' | 'requests';
type Filter = 'week' | 'open' | 'all' | 'done';

export default function PlanPage() {
  const who = useWho();
  const [sp, setSp] = useSearchParams();
  const goals = useGoals(); const rs = useGoalResources(); const progress = useProgress(); const plan = usePlan(); const posts = usePostponements(); const cur = useCurriculum(); const resources = useResources();
  const view = (sp.get('v') as View) || 'week'; const [goalId, setGoalId] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0); const [scale, setScale] = useState<GanttScale>('weeks'); const [filter, setFilter] = useState<Filter>('open'); const [q, setQ] = useState('');
  const [editor, setEditor] = useState<{ goal: Goal | null; prefill: { title: string; description?: string; curriculumWeek?: number; drafts: Draft[] } | null } | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const setParam = (k: string, v: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (v === null) n.delete(k); else n.set(k, v); return n; }, { replace: true });
  const openUpdate = (id: string) => setParam('update', id);
  useEffect(() => { const g = sp.get('goal'); if (!g) return; setGoalId(g); setSp((p) => { const n = new URLSearchParams(p); n.delete('goal'); return n; }, { replace: true }); }, [sp, setSp]);
  useEffect(() => { if (!sp.get('new')) return; setEditor({ goal: null, prefill: null }); setSp((p) => { const n = new URLSearchParams(p); n.delete('new'); return n; }, { replace: true }); }, [sp, setSp]);

  const today = toISO(new Date()); const wkS = toISO(startOfWeek(new Date())); const wkE = toISO(addDays(startOfWeek(new Date()), 6)); const ids = who.learners.map((l) => l.id);
  const list = useMemo(() => (goals.data ?? []).filter((g) => {
    const state = goalState(g, (rs.data ?? []).filter((r) => r.goal_id === g.id), progress.data ?? [], ids, today);
    const f = filter === 'all' || (filter === 'week' && g.status === 'active' && g.start_date <= wkE && g.deadline >= wkS) || (filter === 'open' && (state === 'active' || state === 'overdue' || state === 'upcoming')) || (filter === 'done' && (state === 'done' || state === 'dropped'));
    return f && (!q.trim() || g.title.toLowerCase().includes(q.trim().toLowerCase()));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [goals.data, rs.data, progress.data, filter, q, today]);
  const pendingForMe = (posts.data ?? []).filter((p) => p.status === 'pending' && p.requester_id !== who.me?.id).length;
  const nextWeek = cur.data ? nextSyllabusWeek(cur.data.weeks, goals.data ?? []) : null;

  function planWeek(weekNo: number) {
    const week = cur.data?.weeks.find((w) => w.week_no === weekNo); const drafts: Draft[] = [];
    for (const it of (cur.data?.items ?? []).filter((i) => i.week_no === weekNo)) { const r = (resources.data ?? []).find((x) => x.library_path === it.resource_path); if (r) drafts.push(draftFromResource(r, { start: it.start_page, end: it.end_page, est: it.est_minutes, instructions: it.note, needsPages: it.needs_page_selection })); }
    setEditor({ goal: null, prefill: { title: week ? `Week ${weekNo}: ${week.theme}` : `Week ${weekNo}`, description: week?.goal ?? undefined, curriculumWeek: weekNo, drafts } });
  }
  if (goals.isError) return <ErrorState message={(goals.error as Error).message} onRetry={() => void goals.refetch()} />;
  if (goals.isLoading || rs.isLoading || progress.isLoading || !who.me) return <Page title="Plan"><SkeletonCards n={3} /></Page>;

  return (
    <Page kicker={nextWeek ? `Syllabus · next unplanned: week ${nextWeek}` : 'Syllabus · every week is planned'} title="Plan" lead="One shared goal at a time. Both of you follow it and each record your own progress."
      actions={<><Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setEditor({ goal: null, prefill: null })}>New goal</Button>{nextWeek && <Button className="btn-light" onClick={() => planWeek(nextWeek)}>Plan syllabus week {nextWeek}</Button>}</>}>
      <Tabs<View> label="Plan views" value={view} onChange={(v) => setParam('v', v === 'week' ? null : v)} tabs={[{ value: 'week', label: 'This week' }, { value: 'weekly', label: 'Weekly table' }, { value: 'syllabus', label: 'Syllabus' }, { value: 'timeline', label: 'Timeline' }, { value: 'sheet', label: 'Table' }, { value: 'requests', label: 'Requests', dot: pendingForMe }]} />

      {(view === 'timeline' || view === 'sheet' || view === 'weekly') && (
        <div className="row between wrap">
          <Segmented<Filter> label="Which goals" value={filter} onChange={setFilter} options={[{ value: 'week', label: 'This week' }, { value: 'open', label: 'Open' }, { value: 'all', label: 'All' }, { value: 'done', label: 'Done' }]} />
          <div className="row wrap"><Input aria-label="Search goals" className="input-search" placeholder="Search goals" value={q} onChange={(e) => setQ(e.target.value)} />{view === 'timeline' && <Segmented<GanttScale> label="Timeline scale" value={scale} onChange={setScale} options={[{ value: 'weeks', label: 'Weeks' }, { value: 'days', label: 'Days' }]} />}</div>
        </div>
      )}

      {view === 'week' && <WeekView offset={weekOffset} setOffset={setWeekOffset} goals={goals.data ?? []} rs={rs.data ?? []} progress={progress.data ?? []} learners={who.learners} onOpenGoal={(id) => setGoalId(id)} onUpdate={openUpdate} nextWeek={nextWeek} onPlanWeek={planWeek} onSyllabus={() => setParam('v', 'syllabus')} />}
      {view === 'weekly' && <WeeklyTable goals={list} resources={rs.data ?? []} progress={progress.data ?? []} learners={who.learners} onOpenGoal={(id) => setGoalId(id)} onUpdate={openUpdate} />}
      {view === 'syllabus' && <Syllabus onPlan={planWeek} onOpenGoal={(id) => setGoalId(id)} />}
      {view === 'timeline' && (list.length === 0 && (goals.data ?? []).length === 0 ? <EmptyState title="No goals yet" action={<Button variant="primary" onClick={() => setEditor({ goal: null, prefill: null })}>Create the first goal</Button>}>A goal is shared: both of you follow it and record progress on the same files.</EmptyState>
        : <Gantt goals={list} resources={rs.data ?? []} progress={progress.data ?? []} learners={who.learners} plan={plan.data ?? null} scale={scale} today={today} onOpen={(id) => setGoalId(id)} />)}
      {view === 'sheet' && (
        <div className="sheet-wrap"><table className="tbl tbl-sheet">
          <thead><tr><th scope="col" className="sticky-col">Goal / file</th><th scope="col">Where</th><th scope="col">Pages</th><th scope="col">Due</th>{who.learners.map((l) => <th key={l.id} scope="col"><span className={`txt-${l.accent}`}>{l.display_name}</span></th>)}</tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={4 + who.learners.length} className="muted">No goals match.</td></tr>}
            {list.map((g) => { const gr = (rs.data ?? []).filter((r) => r.goal_id === g.id); const isOpen = open[g.id] ?? filter !== 'all'; return [
              <tr key={g.id} className={`goal-row ${g.status === 'dropped' ? 'dim' : ''}`}>
                <th scope="row" className="sticky-col"><button className="exp" aria-expanded={isOpen} aria-label={isOpen ? 'Collapse files' : 'Expand files'} onClick={() => setOpen((o) => ({ ...o, [g.id]: !isOpen }))}>{isOpen ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}</button><button className="linklike" onClick={() => setGoalId(g.id)}>{g.title}</button></th>
                <td /><td /><td>{formatDay(g.deadline)}{g.deadline !== g.original_deadline && <Badge tone="warn">moved</Badge>}</td>
                {who.learners.map((l) => { const pc = learnerGoalPct(gr, progress.data ?? [], l.id); return <td key={l.id}><b>{pc}%</b> <MiniBar pct={pc} accent={l.accent} /></td>; })}</tr>,
              ...(isOpen ? gr.map((r) => (
                <tr key={r.id} className="res-row"><th scope="row" className="sticky-col"><button className="linklike indent" onClick={() => openUpdate(r.id)}>{r.title}</button></th>
                  <td><FolderTag level={r.level} folder={r.source_folder} /></td><td className="small">{pageRangeLabel(r.start_page, r.end_page, r.page_count)}</td><td />
                  {who.learners.map((l) => <td key={l.id}><PersonCell learner={l} r={r} p={(progress.data ?? []).find((p) => p.goal_resource_id === r.id && p.learner_id === l.id)} /></td>)}</tr>)) : []),
            ]; })}
          </tbody></table></div>
      )}
      {view === 'requests' && <Requests />}

      <GoalDialog goalId={goalId} onClose={() => setGoalId(null)} onEdit={(g) => { setGoalId(null); setEditor({ goal: g, prefill: null }); }} onOpenResource={openUpdate} />
      <GoalEditor key={editor ? (editor.goal?.id ?? `n-${editor.prefill?.title ?? ''}`) : 'x'} open={!!editor} onClose={() => setEditor(null)} goal={editor?.goal} prefill={editor?.prefill}
        resources={editor?.goal ? (rs.data ?? []).filter((r) => r.goal_id === editor.goal!.id) : undefined} defaultStart={wkS} />
    </Page>
  );
}

function Requests() {
  const who = useWho(); const run = useRun();
  const { data: posts } = usePostponements(); const { data: goals } = useGoals();
  const [deciding, setDeciding] = useState<{ id: string; approve: boolean } | null>(null); const [note, setNote] = useState('');
  const pending = (posts ?? []).filter((p) => p.status === 'pending'); const decided = (posts ?? []).filter((p) => p.status !== 'pending');
  const gt = (id: string) => (goals ?? []).find((g) => g.id === id)?.title ?? 'Goal';
  return (
    <div className="stack-lg">
      <section><h2>Waiting for a decision</h2>
        {pending.length === 0 ? <p className="muted">No open requests.</p> : (
          <ul className="plain-list stack">{pending.map((p) => (
            <li key={p.id} className="req"><p><b>{gt(p.goal_id)}</b> <span className="mono small">{formatDay(p.original_deadline)} → {formatDay(p.proposed_deadline)}</span></p><p className="small muted">Asked by {who.nameOf(p.requester_id)} · {timeAgo(p.created_at)} — “{p.reason}”</p>
              {p.requester_id === who.me?.id ? <Button size="sm" onClick={() => void run(() => cancelPostponement(p.id), { ok: 'Request cancelled', invalidate: ['postponements', 'change_log'] })}>Cancel request</Button>
                : <div className="row wrap"><Button size="sm" variant="primary" onClick={() => { setDeciding({ id: p.id, approve: true }); setNote(''); }}>Approve</Button><Button size="sm" onClick={() => { setDeciding({ id: p.id, approve: false }); setNote(''); }}>Decline</Button></div>}</li>))}</ul>)}
      </section>
      <section><h2>History</h2>
        {decided.length === 0 ? <p className="muted">Past requests will be listed here.</p> : (
          <div className="sheet-wrap"><table className="tbl"><thead><tr><th scope="col">Goal</th><th scope="col">Change</th><th scope="col">Asked by</th><th scope="col">Result</th><th scope="col">Reason</th></tr></thead>
            <tbody>{decided.map((p) => <tr key={p.id}><th scope="row">{gt(p.goal_id)}</th><td className="mono">{formatDay(p.original_deadline)} → {formatDay(p.proposed_deadline)}</td><td>{who.nameOf(p.requester_id)}</td><td><Badge tone={p.status === 'approved' ? 'done' : p.status === 'rejected' ? 'warn' : 'neutral'}>{p.status}</Badge>{p.decided_by && <span className="small muted"> {who.nameOf(p.decided_by)}</span>}</td><td className="small">{p.reason}{p.decision_note ? ` — reply: ${p.decision_note}` : ''}</td></tr>)}</tbody></table></div>)}
      </section>
      <Dialog open={!!deciding} onClose={() => setDeciding(null)} title={deciding?.approve ? 'Approve postponement' : 'Decline postponement'}
        footer={<><Button onClick={() => setDeciding(null)}>Cancel</Button><Button variant={deciding?.approve ? 'primary' : 'danger'} onClick={() => { if (deciding) void run(() => decidePostponement(deciding.id, deciding.approve, note.trim() || null), { ok: deciding.approve ? 'Approved — deadline moved' : 'Declined', invalidate: ['postponements', 'goals', 'change_log'] }).then(() => setDeciding(null)); }}>{deciding?.approve ? 'Approve' : 'Decline'}</Button></>}>
        <Field label="Note (optional)" htmlFor="dec-note"><Textarea id="dec-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </Dialog>
    </div>
  );
}

function WeekView({ offset, setOffset, goals, rs, progress, learners, onOpenGoal, onUpdate, nextWeek, onPlanWeek, onSyllabus }: { offset: number; setOffset: (n: number) => void; goals: Goal[]; rs: GoalResource[]; progress: GoalProgress[]; learners: Learner[]; onOpenGoal: (id: string) => void; onUpdate: (id: string) => void; nextWeek: number | null; onPlanWeek: (w: number) => void; onSyllabus: () => void }) {
  const ws = addDays(startOfWeek(new Date()), offset * 7); const a = toISO(ws); const b = toISO(addDays(ws, 6));
  const list = goals.filter((g) => g.status === 'active' && g.start_date <= b && g.deadline >= a);
  return (
    <div className="stack-lg">
      <div className="weeknav" role="group" aria-label="Choose week"><Button size="sm" onClick={() => setOffset(offset - 1)}>← Earlier</Button><div className="weeknav-label"><b>{formatDay(a)} – {formatDay(b)}</b><span className="small muted">{offset === 0 ? 'This week' : offset > 0 ? `${offset} week${offset > 1 ? 's' : ''} ahead` : `${-offset} week${offset < -1 ? 's' : ''} ago`}</span></div><Button size="sm" onClick={() => setOffset(offset + 1)}>Later →</Button>{offset !== 0 && <Button size="sm" variant="ghost" onClick={() => setOffset(0)}>This week</Button>}</div>
      {list.length === 0 ? <EmptyState icon={<CalendarClock size={26} />} title="No goal in this week" action={<div className="row wrap">{nextWeek && <Button variant="primary" onClick={() => onPlanWeek(nextWeek)}>Plan syllabus week {nextWeek}</Button>}<Button onClick={onSyllabus}>Choose another week</Button></div>}>You decide which syllabus week you work on — not the calendar. Pick the next one, or any week you like.</EmptyState> : list.map((g) => {
        const gr = rs.filter((r) => r.goal_id === g.id);
        return (
          <section key={g.id} className="jgoal" aria-labelledby={`gb-${g.id}`}>
            <header className="goalbox-head"><span className="jnum" aria-hidden>{g.curriculum_week ?? '•'}</span><div className="grow"><h2 id={`gb-${g.id}`}>{g.title}</h2><p className="small muted">{formatDay(g.start_date)} – {formatDay(g.deadline)}{g.deadline !== g.original_deadline ? ` (moved from ${formatDay(g.original_deadline)})` : ''}{g.description ? ` · ${g.description}` : ''}</p></div>
              <Button size="sm" onClick={() => onOpenGoal(g.id)}>Goal options</Button></header>
            <div className="goalbox-bars">{learners.map((l) => { const pc = learnerGoalPct(gr, progress, l.id); return <span key={l.id} className="gbar"><Avatar code={l.code} accent={l.accent} size={15} /> <span className="small">{l.display_name}</span> <MiniBar pct={pc} accent={l.accent} /> <b className="small">{pc}%</b></span>; })}</div>
            {gr.length === 0 ? <p className="muted small">No materials yet. Open “Goal options” → Edit to add some.</p> : <div className="stack">{gr.map((r) => <MaterialCard key={r.id} r={r} progress={progress} learners={learners} onUpdate={onUpdate} />)}</div>}
          </section>);
      })}
    </div>
  );
}
