import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, Lightbulb, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCurriculum, useDeadlineHistory, useGoalResources, useGoals, usePlan, usePostponements, useResources } from '@/api/queries';
import { cancelPostponement, decidePostponement, deleteGoal, postponeOwnGoal, requestPostponement, updateGoal } from '@/api/mutations';
import { useRun } from '@/hooks/useRun';
import { useWho, type Who } from '@/hooks/useWho';
import { Avatar, Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, ProgressBar, Segmented, SectionHeader, SkeletonCards, Textarea } from '@/components/ui/ui';
import { ResourceCard, ResourceDialog } from '@/components/resource';
import { GoalEditor, draftFromResource, type Draft } from '@/components/GoalEditor';
import { PlanStrip } from '@/components/charts';
import { addDays, daysUntil, formatDay, formatDayLong, isOverdue, parseISO, planWeekNumber, startOfWeek, timeAgo, toISO, totalPlanWeeks, weekLabel, weekStartForPlanWeek } from '@/lib/domain/dates';
import { goalProgress, resourcesRemainingMinutes } from '@/lib/domain/progress';
import { PRIORITY_LABEL } from '@/lib/domain/status';
import { weekCompletion } from '@/lib/domain/stats';
import { postponeSchema } from '@/lib/validation';
import type { Goal, GoalResource } from '@/types/db';

type Tab = 'week' | 'requests' | 'overview';
type Who3 = 'all' | 'me' | 'partner' | 'shared';

export default function PlanPage() {
  const who = useWho(); const run = useRun();
  const [sp, setSp] = useSearchParams();
  const goals = useGoals(); const rs = useGoalResources(); const plan = usePlan(); const posts = usePostponements(); const cur = useCurriculum(); const resources = useResources();
  const tab = (sp.get('tab') as Tab) || 'week';
  const todayWeek = toISO(startOfWeek(new Date()));
  const weekStart = sp.get('w') ?? todayWeek;
  const [filter, setFilter] = useState<Who3>('all');
  const [editor, setEditor] = useState<{ goal: Goal | null; prefill: { title: string; description?: string; curriculumWeek?: number; drafts: Draft[] } | null } | null>(null);
  const [detail, setDetail] = useState<{ r: GoalResource; goal: Goal } | null>(null);
  const [postponeGoal, setPostponeGoal] = useState<Goal | null>(null);
  const [deleting, setDeleting] = useState<Goal | null>(null);
  const [completing, setCompleting] = useState<Goal | null>(null);

  const setParam = (k: string, v: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (v === null) n.delete(k); else n.set(k, v); return n; }, { replace: true });

  useEffect(() => {
    if (!sp.get('new')) return;
    setEditor({ goal: null, prefill: null });
    setSp((p) => { const n = new URLSearchParams(p); n.delete('new'); return n; }, { replace: true });
  }, [sp, setSp]);

  const weekEnd = toISO(addDays(parseISO(weekStart), 6));
  const focusGoal = sp.get('goal');

  const weekGoals = useMemo(() => (goals.data ?? []).filter((g) => g.week_start === weekStart || (g.original_deadline >= weekStart && g.original_deadline <= weekEnd) || (g.deadline >= weekStart && g.deadline <= weekEnd)), [goals.data, weekStart, weekEnd]);
  const shown = weekGoals.filter((g) => filter === 'all' || (filter === 'shared' ? g.scope === 'shared' : filter === 'me' ? g.owner_id === who.me?.id : g.owner_id === who.partner?.id));
  const unfinished = useMemo(() => (goals.data ?? []).filter((g) => g.status !== 'completed' && g.status !== 'dropped' && g.deadline < todayWeek && (g.scope === 'shared' || g.owner_id === who.me?.id)), [goals.data, todayWeek, who.me?.id]);
  const planWeekNo = plan.data ? planWeekNumber(plan.data.start_date, parseISO(weekStart)) : null;
  const curWeek = cur.data?.weeks.find((w) => w.week_no === planWeekNo);
  const curItems = (cur.data?.items ?? []).filter((i) => i.week_no === planWeekNo);
  const pendingForMe = (posts.data ?? []).filter((p) => p.status === 'pending' && p.requester_id !== who.me?.id);

  useEffect(() => { if (focusGoal) document.getElementById(`goal-${focusGoal}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [focusGoal, goals.data]);

  if (goals.isError) return <ErrorState message={(goals.error as Error).message} onRetry={() => void goals.refetch()} />;
  if (goals.isLoading || rs.isLoading || !who.me) return <SkeletonCards n={3} />;

  function fromCurriculum() {
    const drafts: Draft[] = [];
    for (const it of curItems) {
      const r = (resources.data ?? []).find((x) => x.library_path === it.resource_path); if (!r) continue;
      drafts.push(draftFromResource(r, { start: it.start_page, end: it.end_page, est: it.est_minutes, instructions: it.note, needsPages: it.needs_page_selection }));
    }
    setEditor({ goal: null, prefill: { title: curWeek ? `Week ${planWeekNo}: ${curWeek.theme}` : '', description: curWeek?.goal ?? undefined, curriculumWeek: planWeekNo ?? undefined, drafts } });
  }
  async function completeGoal(g: Goal) {
    await run(() => updateGoal(g.id, g.version, { status: 'completed' }), { ok: 'Goal completed — well done', invalidate: ['goals'] });
    setCompleting(null);
  }

  return (
    <div className="stack-lg">
      <div className="row between wrap">
        <h1>Plan</h1>
        <div className="row wrap">
          <Segmented<Tab> label="Plan section" value={tab} onChange={(v) => setParam('tab', v === 'week' ? null : v)}
            options={[{ value: 'week', label: 'Week' }, { value: 'requests', label: <>Requests{pendingForMe.length > 0 && <span className="count">{pendingForMe.length}</span>}</> }, { value: 'overview', label: 'Overview' }]} />
          <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setEditor({ goal: null, prefill: null })}>New goal</Button>
        </div>
      </div>

      {tab === 'week' && (
        <>
          <div className="weeknav" role="group" aria-label="Choose week">
            <Button size="sm" variant="ghost" aria-label="Previous week" icon={<ChevronLeft size={18} aria-hidden />} onClick={() => setParam('w', toISO(addDays(parseISO(weekStart), -7)))} />
            <div className="weeknav-label"><b>{weekLabel(weekStart)}</b><span className="small muted">{planWeekNo && planWeekNo >= 1 ? `Plan week ${planWeekNo}` : 'Before the plan'}{weekStart === todayWeek ? ' · this week' : ''}</span></div>
            <Button size="sm" variant="ghost" aria-label="Next week" icon={<ChevronRight size={18} aria-hidden />} onClick={() => setParam('w', toISO(addDays(parseISO(weekStart), 7)))} />
            {weekStart !== todayWeek && <Button size="sm" onClick={() => setParam('w', null)}>This week</Button>}
          </div>

          {curWeek && curItems.length > 0 && (
            <Card className="suggest">
              <div className="row between wrap">
                <div><p className="row"><Lightbulb size={18} aria-hidden /> <b>Suggested for week {planWeekNo}: {curWeek.theme}</b></p><p className="small muted">{curWeek.goal} Sequence inferred from file names — contents not verified. Edit freely.</p></div>
                <Button onClick={fromCurriculum} icon={<CalendarPlus size={16} aria-hidden />}>Plan from this</Button>
              </div>
              <ul className="plain-list small">{curItems.map((i) => { const r = (resources.data ?? []).find((x) => x.library_path === i.resource_path); return <li key={i.id}>{r?.title ?? i.resource_path} {i.needs_page_selection && <Badge tone="warn">choose pages</Badge>}</li>; })}</ul>
            </Card>
          )}

          <Segmented<Who3> label="Show goals of" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'me', label: 'Me' }, { value: 'partner', label: who.partner?.display_name ?? 'Partner' }, { value: 'shared', label: 'Shared' }]} />

          {shown.length === 0 ? (
            <Card><EmptyState icon={<CalendarClock size={28} />} title="No goals for this week" action={<Button variant="primary" onClick={() => setEditor({ goal: null, prefill: null })}>Add a goal</Button>}>
              Set a goal for yourself, for both of you, or start from the suggested curriculum above.</EmptyState></Card>
          ) : (
            <div className="stack">{shown.map((g) => (
              <GoalCard key={g.id} g={g} weekStart={weekStart} weekEnd={weekEnd} who={who} resources={(rs.data ?? []).filter((r) => r.goal_id === g.id)} focused={focusGoal === g.id}
                onEdit={() => setEditor({ goal: g, prefill: null })} onPostpone={() => setPostponeGoal(g)} onDelete={() => setDeleting(g)} onComplete={() => setCompleting(g)}
                onOpenResource={(r) => setDetail({ r, goal: g })} />
            ))}</div>
          )}

          {unfinished.length > 0 && (
            <Card>
              <SectionHeader title="Unfinished from earlier weeks" sub="These stay where they are — nothing is moved or counted as done automatically." />
              <ul className="plain-list stack-sm">{unfinished.map((g) => <li key={g.id} className="row between"><Button variant="ghost" size="sm" onClick={() => setParam('w', g.deadline >= weekStart ? weekStart : toISO(startOfWeek(parseISO(g.deadline))))}>{g.title}</Button><Badge tone="warn">due {formatDay(g.deadline)}</Badge></li>)}</ul>
            </Card>
          )}
        </>
      )}

      {tab === 'requests' && <RequestsTab who={who} />}
      {tab === 'overview' && <OverviewTab who={who} onPick={(w) => { setParam('tab', null); setParam('w', w); }} />}

      <GoalEditor key={editor ? (editor.goal?.id ?? `new-${editor.prefill?.title ?? ''}`) : 'closed'} open={!!editor} onClose={() => setEditor(null)} goal={editor?.goal} prefill={editor?.prefill}
        resources={editor?.goal ? (rs.data ?? []).filter((r) => r.goal_id === editor.goal!.id) : undefined} weekStart={weekStart} />
      <ResourceDialog r={detail ? (rs.data ?? []).find((x) => x.id === detail.r.id) ?? detail.r : null} goal={detail ? (goals.data ?? []).find((x) => x.id === detail.goal.id) ?? detail.goal : null}
        canEdit={!!detail && (detail.goal.scope === 'shared' || detail.goal.owner_id === who.me.id)} onClose={() => setDetail(null)} />
      <PostponeDialog goal={postponeGoal} onClose={() => setPostponeGoal(null)} who={who} />
      <ConfirmDialog open={!!deleting} danger title="Delete this goal?" confirmLabel="Delete goal" onCancel={() => setDeleting(null)}
        message={<>“{deleting?.title}” and its file assignments will be deleted. A copy of the change stays in the audit log.</>}
        onConfirm={() => { if (deleting) void run(() => deleteGoal(deleting.id), { ok: 'Goal deleted', invalidate: ['goals', 'goal_resources'] }).then(() => setDeleting(null)); }} />
      <ConfirmDialog open={!!completing} title="Complete this goal?" confirmLabel="Complete goal" onCancel={() => setCompleting(null)}
        message={(() => { const open = (rs.data ?? []).filter((r) => r.goal_id === completing?.id && r.status !== 'completed').length; return open ? `${open} file${open > 1 ? 's are' : ' is'} not marked completed yet. You can still complete the goal; the files keep their own status.` : 'Everything in this goal is marked completed.'; })()}
        onConfirm={() => { if (completing) void completeGoal(completing); }} />
    </div>
  );
}

/* ---------- goal card ---------- */
function GoalCard({ g, weekStart, weekEnd, who, resources, focused, onEdit, onPostpone, onDelete, onComplete, onOpenResource }: {
  g: Goal; weekStart: string; weekEnd: string; who: Who; resources: GoalResource[]; focused: boolean;
  onEdit: () => void; onPostpone: () => void; onDelete: () => void; onComplete: () => void; onOpenResource: (r: GoalResource) => void;
}) {
  const run = useRun();
  const { data: hist } = useDeadlineHistory();
  const mine = g.scope === 'shared' || g.owner_id === who.me?.id;
  const progress = goalProgress(g, resources);
  const overdue = g.status !== 'completed' && g.status !== 'dropped' && isOverdue(g.deadline);
  const carriedIn = g.week_start < weekStart && g.deadline >= weekStart && g.deadline <= weekEnd;
  const postponedOut = g.original_deadline >= weekStart && g.original_deadline <= weekEnd && g.deadline > weekEnd;
  const history = (hist ?? []).filter((h) => h.goal_id === g.id);
  const remaining = resourcesRemainingMinutes(resources);
  const [open, setOpen] = useState(true);
  const closed = g.status === 'completed' || g.status === 'dropped';

  return (
    <Card as="article" id={`goal-${g.id}`} className={`goal ${focused ? 'goal-focus' : ''} ${g.status === 'completed' ? 'goal-done' : ''}`} aria-label={g.title}>
      <div className="goal-head">
        <Avatar code={g.owner_id ? who.codeOf(g.owner_id) : 'DU'} accent={who.accentOf(g.owner_id)} size={34} label={g.owner_id ? who.nameOf(g.owner_id) : 'Shared'} />
        <div className="grow">
          <h3>{g.title}</h3>
          <p className="small muted">{g.scope === 'shared' ? 'Shared goal' : who.nameOf(g.owner_id)} · <span className={overdue ? 'txt-warn' : ''}>due {formatDayLong(g.deadline)}{overdue ? ' (overdue)' : ''}</span>{g.est_minutes ? ` · ~${g.est_minutes} min` : ''}{remaining ? ` · ~${remaining} min left` : ''}</p>
        </div>
        <div className="col-end">
          {g.status === 'completed' ? <Badge tone="done">Completed</Badge> : g.status === 'dropped' ? <Badge>Dropped</Badge> : g.status === 'in_progress' ? <Badge tone="active">In progress</Badge> : <Badge>Planned</Badge>}
          {g.priority === 1 && !closed && <Badge tone="warn">{PRIORITY_LABEL[1]} priority</Badge>}
        </div>
      </div>
      <div className="row wrap">
        {carriedIn && <Badge tone="warn">carried over from {formatDay(g.original_deadline)}</Badge>}
        {postponedOut && <Badge tone="warn">postponed to {formatDay(g.deadline)}</Badge>}
        {g.deadline !== g.original_deadline && !carriedIn && !postponedOut && <Badge tone="warn">postponed from {formatDay(g.original_deadline)}</Badge>}
      </div>
      {g.description && <p className="muted">{g.description}</p>}
      <ProgressBar value={progress} label={`${g.title} progress`} tone={g.status === 'completed' ? 'done' : who.accentOf(g.owner_id)} />
      <p className="small muted">{progress}% · {resources.filter((r) => r.status === 'completed').length}/{resources.length} files done</p>

      {resources.length > 0 && (
        <>
          <button className="linklike small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Hide files' : `Show ${resources.length} file${resources.length > 1 ? 's' : ''}`}</button>
          {open && <div className="stack-sm">{resources.map((r) => <ResourceCard key={r.id} r={r} goal={g} canEdit={mine && !closed} onOpenDetail={onOpenResource} />)}</div>}
        </>
      )}

      {mine && (
        <div className="row wrap goal-actions">
          {g.status !== 'completed' && g.status !== 'dropped' && <Button variant="primary" size="sm" onClick={onComplete}>Complete goal</Button>}
          {g.status === 'completed' && <Button size="sm" onClick={() => void run(() => updateGoal(g.id, g.version, { status: 'in_progress' }), { ok: 'Goal reopened', invalidate: ['goals'] })}>Reopen</Button>}
          <Button size="sm" icon={<Pencil size={14} aria-hidden />} onClick={onEdit}>Edit</Button>
          {!closed && <Button size="sm" icon={<CalendarClock size={14} aria-hidden />} onClick={onPostpone}>Postpone</Button>}
          {!closed && <Button size="sm" variant="ghost" onClick={() => void run(() => updateGoal(g.id, g.version, { status: 'dropped' }), { ok: 'Goal dropped', invalidate: ['goals'] })}>Drop</Button>}
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} aria-hidden />} onClick={onDelete} aria-label={`Delete ${g.title}`}>Delete</Button>
        </div>
      )}
      {history.length > 0 && (
        <details className="split"><summary>Deadline history ({history.length})</summary>
          <ul className="plain-list small">{history.map((h) => <li key={h.id}>{formatDay(h.old_deadline)} → <b>{formatDay(h.new_deadline)}</b> · {h.via === 'mutual_approval' ? 'approved by partner' : 'by owner'} · “{h.reason}” · {timeAgo(h.created_at)}</li>)}</ul></details>
      )}
    </Card>
  );
}

/* ---------- postpone ---------- */
type PostponeForm = z.infer<typeof postponeSchema>;
function PostponeDialog({ goal, onClose, who }: { goal: Goal | null; onClose: () => void; who: Who }) {
  return <Dialog open={!!goal} onClose={onClose} title="Postpone this goal">{goal && <PostponeBody goal={goal} onClose={onClose} who={who} />}</Dialog>;
}
function PostponeBody({ goal, onClose, who }: { goal: Goal; onClose: () => void; who: Who }) {
  const run = useRun();
  const direct = goal.scope === 'personal' && goal.postpone_policy === 'owner';
  const min = toISO(addDays(parseISO(goal.deadline), 1));
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<PostponeForm>({ resolver: zodResolver(postponeSchema), defaultValues: { deadline: toISO(addDays(parseISO(goal.deadline), 7)), reason: '' } });
  async function submit(v: PostponeForm) {
    if (v.deadline < min) return;
    const res = await run(() => (direct ? postponeOwnGoal(goal.id, v.deadline, v.reason.trim()) : requestPostponement(goal.id, v.deadline, v.reason.trim())),
      { ok: direct ? 'Deadline moved and recorded' : `Request sent to ${who.partner?.display_name ?? 'your partner'}`, invalidate: ['goals', 'postponements', 'deadline_history'] });
    if (res.ok) onClose();
  }
  return (
    <form className="stack" onSubmit={handleSubmit(submit)} noValidate>
      <p className="muted">“{goal.title}” is due <b>{formatDayLong(goal.deadline)}</b>{goal.deadline !== goal.original_deadline && <> (originally {formatDay(goal.original_deadline)})</>}.</p>
      <p className="note-box">{direct ? 'This goal lets you reschedule it yourself. The change is recorded and your partner can see it.' : `${who.partner?.display_name ?? 'Your partner'} has to approve this. Until then the deadline stays as it is.`}</p>
      <Field label="New deadline" htmlFor="pp-d" error={errors.deadline?.message}><Input id="pp-d" type="date" min={min} {...register('deadline')} /></Field>
      <Field label="Reason" htmlFor="pp-r" error={errors.reason?.message}><Textarea id="pp-r" rows={3} {...register('reason')} placeholder="What got in the way?" /></Field>
      <div className="dialog-actions"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" busy={isSubmitting}>{direct ? 'Move deadline' : 'Send request'}</Button></div>
    </form>
  );
}

/* ---------- requests tab ---------- */
function RequestsTab({ who }: { who: Who }) {
  const run = useRun();
  const { data: posts } = usePostponements(); const { data: goals } = useGoals();
  const [deciding, setDeciding] = useState<{ id: string; approve: boolean } | null>(null);
  const [note, setNote] = useState('');
  const pending = (posts ?? []).filter((p) => p.status === 'pending'); const decided = (posts ?? []).filter((p) => p.status !== 'pending');
  const gt = (id: string) => (goals ?? []).find((g) => g.id === id)?.title ?? 'Goal';
  return (
    <div className="stack-lg">
      <Card>
        <SectionHeader title="Waiting for a decision" />
        {pending.length === 0 ? <p className="muted">No open requests.</p> : (
          <ul className="plain-list stack">{pending.map((p) => {
            const mine = p.requester_id === who.me?.id;
            return (
              <li key={p.id} className="req">
                <p><b>{gt(p.goal_id)}</b></p>
                <p className="small">{formatDay(p.original_deadline)} → <b>{formatDay(p.proposed_deadline)}</b> · asked by {who.nameOf(p.requester_id)} · {timeAgo(p.created_at)}</p>
                <p className="muted">“{p.reason}”</p>
                {mine ? <Button size="sm" onClick={() => void run(() => cancelPostponement(p.id), { ok: 'Request cancelled', invalidate: ['postponements'] })}>Cancel request</Button>
                  : <div className="row wrap"><Button size="sm" variant="primary" onClick={() => { setDeciding({ id: p.id, approve: true }); setNote(''); }}>Approve</Button><Button size="sm" onClick={() => { setDeciding({ id: p.id, approve: false }); setNote(''); }}>Decline</Button></div>}
              </li>);
          })}</ul>
        )}
      </Card>
      <Card>
        <SectionHeader title="History" />
        {decided.length === 0 ? <p className="muted">Past decisions will be listed here.</p> : (
          <ul className="plain-list stack-sm">{decided.map((p) => (
            <li key={p.id} className="small"><Badge tone={p.status === 'approved' ? 'done' : p.status === 'rejected' ? 'warn' : 'neutral'}>{p.status}</Badge> <b>{gt(p.goal_id)}</b> · {formatDay(p.original_deadline)} → {formatDay(p.proposed_deadline)} · {who.nameOf(p.requester_id)}
              {p.decided_by && <> · decided by {who.nameOf(p.decided_by)}</>} · “{p.reason}”{p.decision_note && <> — reply: “{p.decision_note}”</>}</li>))}</ul>
        )}
      </Card>
      <Dialog open={!!deciding} onClose={() => setDeciding(null)} title={deciding?.approve ? 'Approve postponement' : 'Decline postponement'}
        footer={<><Button onClick={() => setDeciding(null)}>Cancel</Button><Button variant={deciding?.approve ? 'primary' : 'danger'} onClick={() => { if (deciding) void run(() => decidePostponement(deciding.id, deciding.approve, note.trim() || null), { ok: deciding.approve ? 'Approved — deadline moved' : 'Declined', invalidate: ['postponements', 'goals', 'deadline_history'] }).then(() => setDeciding(null)); }}>{deciding?.approve ? 'Approve' : 'Decline'}</Button></>}>
        <Field label="Note to your partner (optional)" htmlFor="dec-note"><Textarea id="dec-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </Dialog>
    </div>
  );
}

/* ---------- overview tab ---------- */
function OverviewTab({ who, onPick }: { who: Who; onPick: (weekStart: string) => void }) {
  const { data: plan } = usePlan(); const { data: goals } = useGoals(); const { data: cur } = useCurriculum();
  if (!plan) return <Card><EmptyState title="No active plan">Create one in Settings → Learning plan.</EmptyState></Card>;
  const weeks = totalPlanWeeks(plan.start_date, plan.target_end_date);
  const now = planWeekNumber(plan.start_date, new Date());
  const daysLeft = daysUntil(plan.target_end_date);
  const lanes = who.learners.map((l) => ({ learner: l, cells: weekCompletion(goals ?? [], l.id, plan.start_date, weeks) }));
  const levelOf = (n: number) => cur?.weeks.find((w) => w.week_no === n);
  return (
    <div className="stack-lg">
      <Card>
        <SectionHeader title={plan.title} sub={`${formatDay(plan.start_date)} → ${formatDay(plan.target_end_date)} · ${daysLeft >= 0 ? `${daysLeft} days left` : `ended ${Math.abs(daysLeft)} days ago — extend or replace it in Settings`}`} />
        <PlanStrip lanes={lanes} currentWeek={now} />
        <p className="small muted">The plan target is a starting point, not a hard stop. You can extend or replace it in Settings.</p>
      </Card>
      <Card>
        <SectionHeader title="All weeks" />
        <div className="table-wrap"><table className="table">
          <thead><tr><th scope="col">Week</th><th scope="col">Dates</th><th scope="col">Curriculum</th>{who.learners.map((l) => <th key={l.id} scope="col">{l.code}</th>)}</tr></thead>
          <tbody>{Array.from({ length: weeks }, (_, i) => {
            const ws = weekStartForPlanWeek(plan.start_date, i + 1); const c = levelOf(i + 1);
            return (
              <tr key={i} className={i + 1 === now ? 'row-now' : ''}>
                <th scope="row"><button className="linklike" onClick={() => onPick(ws)}>{i + 1}</button></th><td>{formatDay(ws)}</td><td>{c ? <><Badge>{c.level}</Badge> {c.theme}</> : <span className="muted">—</span>}</td>
                {lanes.map((l) => <td key={l.learner.id}>{l.cells[i].total ? `${l.cells[i].done}/${l.cells[i].total}` : '·'}</td>)}
              </tr>);
          })}</tbody></table></div>
      </Card>
    </div>
  );
}
