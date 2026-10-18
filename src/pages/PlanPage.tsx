import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useCurriculum, useGoalResources, useGoals, usePlan, usePostponements, useProgress, useResources } from '@/api/queries';
import { cancelPostponement, decidePostponement } from '@/api/mutations';
import { useRun } from '@/hooks/useRun';
import { useWho } from '@/hooks/useWho';
import { Badge, Button, Dialog, EmptyState, ErrorState, Field, Input, Segmented, SkeletonCards, Tabs, Textarea } from '@/components/ui/ui';
import { FolderTag, MiniBar, PersonCell } from '@/components/people';
import { Gantt } from '@/components/Gantt';
import { GoalEditor, draftFromResource, type Draft } from '@/components/GoalEditor';
import { GoalDialog } from '@/components/GoalDialog';
import { ProgressDialog } from '@/components/ProgressDialog';
import { addDays, formatDay, planWeekNumber, startOfWeek, timeAgo, toISO, parseISO } from '@/lib/domain/dates';
import { goalState, learnerGoalPct } from '@/lib/domain/progress';
import { pageRangeLabel } from '@/lib/domain/folders';
import type { GanttScale } from '@/lib/domain/gantt';
import type { Goal } from '@/types/db';

type View = 'timeline' | 'sheet' | 'requests';
type Filter = 'week' | 'open' | 'all' | 'done';

export default function PlanPage() {
  const who = useWho();
  const [sp, setSp] = useSearchParams();
  const goals = useGoals(); const rs = useGoalResources(); const progress = useProgress(); const plan = usePlan(); const posts = usePostponements(); const cur = useCurriculum(); const resources = useResources();
  const view = (sp.get('v') as View) || 'timeline';
  const goalId = sp.get('goal');
  const [scale, setScale] = useState<GanttScale>('weeks'); const [filter, setFilter] = useState<Filter>('open'); const [q, setQ] = useState('');
  const [editor, setEditor] = useState<{ goal: Goal | null; prefill: { title: string; description?: string; curriculumWeek?: number; drafts: Draft[] } | null } | null>(null);
  const [resId, setResId] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const setParam = (k: string, v: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (v === null) n.delete(k); else n.set(k, v); return n; }, { replace: true });
  useEffect(() => { if (!sp.get('new')) return; setEditor({ goal: null, prefill: null }); setSp((p) => { const n = new URLSearchParams(p); n.delete('new'); return n; }, { replace: true }); }, [sp, setSp]);

  const today = toISO(new Date()); const wkS = toISO(startOfWeek(new Date())); const wkE = toISO(addDays(startOfWeek(new Date()), 6));
  const ids = who.learners.map((l) => l.id);
  const list = useMemo(() => (goals.data ?? []).filter((g) => {
    const state = goalState(g, (rs.data ?? []).filter((r) => r.goal_id === g.id), progress.data ?? [], ids, today);
    const f = filter === 'all' || (filter === 'week' && g.status === 'active' && g.start_date <= wkE && g.deadline >= wkS) || (filter === 'open' && (state === 'active' || state === 'overdue' || state === 'upcoming')) || (filter === 'done' && (state === 'done' || state === 'dropped'));
    return f && (!q.trim() || g.title.toLowerCase().includes(q.trim().toLowerCase()));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [goals.data, rs.data, progress.data, filter, q, today]);
  const pendingForMe = (posts.data ?? []).filter((p) => p.status === 'pending' && p.requester_id !== who.me?.id).length;
  const planWeek = plan.data ? planWeekNumber(plan.data.start_date, new Date()) : null;
  const curWeek = cur.data?.weeks.find((w) => w.week_no === planWeek); const curItems = (cur.data?.items ?? []).filter((i) => i.week_no === planWeek);

  if (goals.isError) return <ErrorState message={(goals.error as Error).message} onRetry={() => void goals.refetch()} />;
  if (goals.isLoading || rs.isLoading || progress.isLoading || !who.me) return <SkeletonCards n={3} />;

  function fromCurriculum() {
    const drafts: Draft[] = [];
    for (const it of curItems) { const r = (resources.data ?? []).find((x) => x.library_path === it.resource_path); if (r) drafts.push(draftFromResource(r, { start: it.start_page, end: it.end_page, est: it.est_minutes, instructions: it.note, needsPages: it.needs_page_selection })); }
    setEditor({ goal: null, prefill: { title: curWeek ? `Week ${planWeek}: ${curWeek.theme}` : '', description: curWeek?.goal ?? undefined, curriculumWeek: planWeek ?? undefined, drafts } });
  }

  return (
    <div className="stack-lg">
      <div className="row between wrap"><h1>Plan</h1><Button variant="primary" icon={<Plus size={15} aria-hidden />} onClick={() => setEditor({ goal: null, prefill: null })}>New goal</Button></div>
      <Tabs<View> label="Plan views" value={view} onChange={(v) => setParam('v', v === 'timeline' ? null : v)} tabs={[{ value: 'timeline', label: 'Timeline' }, { value: 'sheet', label: 'Sheet' }, { value: 'requests', label: 'Requests', dot: pendingForMe }]} />

      {view !== 'requests' && (
        <div className="row between wrap">
          <Segmented<Filter> label="Which goals" value={filter} onChange={setFilter} options={[{ value: 'week', label: 'This week' }, { value: 'open', label: 'Open' }, { value: 'all', label: 'All' }, { value: 'done', label: 'Done' }]} />
          <div className="row wrap"><Input aria-label="Search goals" className="input-search" placeholder="Search goals" value={q} onChange={(e) => setQ(e.target.value)} />
            {view === 'timeline' && <Segmented<GanttScale> label="Timeline scale" value={scale} onChange={setScale} options={[{ value: 'weeks', label: 'Weeks' }, { value: 'days', label: 'Days' }]} />}</div>
        </div>
      )}

      {view !== 'requests' && curWeek && curItems.length > 0 && !(goals.data ?? []).some((g) => g.curriculum_week === planWeek) && (
        <div className="suggest"><p><b>Suggested for week {planWeek}: {curWeek.theme}.</b> <span className="muted">{curWeek.goal} Based on file names only — contents not verified.</span></p><Button size="sm" onClick={fromCurriculum}>Create goal from this</Button></div>
      )}

      {view === 'timeline' && (list.length === 0 && (goals.data ?? []).length === 0
        ? <EmptyState title="No goals yet" action={<Button variant="primary" onClick={() => setEditor({ goal: null, prefill: null })}>Create the first goal</Button>}>A goal is shared: both of you follow it and record progress on the same files.</EmptyState>
        : <Gantt goals={list} resources={rs.data ?? []} progress={progress.data ?? []} learners={who.learners} plan={plan.data ?? null} scale={scale} today={today} onOpen={(id) => setParam('goal', id)} />)}

      {view === 'sheet' && (
        <div className="sheet-wrap"><table className="tbl tbl-sheet">
          <thead><tr><th scope="col" className="sticky-col">Goal / file</th><th scope="col">Where</th><th scope="col">Pages</th><th scope="col">Due</th>{who.learners.map((l) => <th key={l.id} scope="col"><span className={`txt-${l.accent}`}>{l.code}</span>{l.id === who.me?.id && <span className="small muted"> ✎</span>}</th>)}</tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={4 + who.learners.length} className="muted">No goals match.</td></tr>}
            {list.map((g) => {
              const gr = (rs.data ?? []).filter((r) => r.goal_id === g.id); const isOpen = open[g.id] ?? filter !== 'all';
              return [
                <tr key={g.id} className={`goal-row ${g.status === 'dropped' ? 'dim' : ''}`}>
                  <th scope="row" className="sticky-col"><button className="exp" aria-expanded={isOpen} aria-label={isOpen ? 'Collapse files' : 'Expand files'} onClick={() => setOpen((o) => ({ ...o, [g.id]: !isOpen }))}>{isOpen ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}</button>
                    <button className="linklike" onClick={() => setParam('goal', g.id)}>{g.title}</button></th>
                  <td /><td /><td className="mono">{formatDay(g.deadline)}{g.deadline !== g.original_deadline && <Badge tone="warn">moved</Badge>}</td>
                  {who.learners.map((l) => { const pc = learnerGoalPct(gr, progress.data ?? [], l.id); return <td key={l.id}><span className="mono">{pc}%</span> <MiniBar pct={pc} accent={l.accent} /></td>; })}
                </tr>,
                ...(isOpen ? gr.map((r) => (
                  <tr key={r.id} className="res-row">
                    <th scope="row" className="sticky-col"><button className="linklike indent" onClick={() => setResId(r.id)}>{r.title}</button></th>
                    <td><FolderTag level={r.level} folder={r.source_folder} /></td><td className="mono small">{pageRangeLabel(r.start_page, r.end_page, r.page_count)}</td><td />
                    {who.learners.map((l) => <td key={l.id}><PersonCell learner={l} r={r} p={(progress.data ?? []).find((p) => p.goal_resource_id === r.id && p.learner_id === l.id)} /></td>)}
                  </tr>)) : []),
              ];
            })}
          </tbody></table></div>
      )}

      {view === 'requests' && <Requests />}

      <GoalDialog goalId={goalId} onClose={() => setParam('goal', null)} onEdit={(g) => { setParam('goal', null); setEditor({ goal: g, prefill: null }); }} onOpenResource={setResId} />
      <ProgressDialog resourceId={resId} onClose={() => setResId(null)} />
      <GoalEditor key={editor ? (editor.goal?.id ?? `n-${editor.prefill?.title ?? ''}`) : 'x'} open={!!editor} onClose={() => setEditor(null)} goal={editor?.goal} prefill={editor?.prefill}
        resources={editor?.goal ? (rs.data ?? []).filter((r) => r.goal_id === editor.goal!.id) : undefined} defaultStart={toISO(startOfWeek(parseISO(today)))} />
    </div>
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
