import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, Check, HelpCircle, Languages, Megaphone, MessageSquareQuote, Minus, NotebookPen, Timer } from 'lucide-react';
import { useActivity, useAnnouncements, useAnnReads, useGoalResources, useGoals, useLearners, useMessages, useNotes, usePlan, usePostponements, useSessions, useVocabLog } from '@/api/queries';
import { setAnnouncementRead } from '@/api/mutations';
import { useRun } from '@/hooks/useRun';
import { useWho } from '@/hooks/useWho';
import { useQuick } from '@/hooks/useQuick';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Ring, SectionHeader, SkeletonCards, ProgressBar } from '@/components/ui/ui';
import { GroupedBars, PlanStrip, TugBar } from '@/components/charts';
import { activeDaysThisWeek, momentum, reviewsThisWeek, totalMinutes, weekCompletion, weeklyMinutes } from '@/lib/domain/stats';
import { addDays, daysUntil, formatDay, formatMinutes, isOverdue, planWeekNumber, startOfWeek, timeAgo, toISO, totalPlanWeeks, weekLabel } from '@/lib/domain/dates';
import { goalProgress, weeklyCommitment } from '@/lib/domain/progress';
import { ATTENTION_STATUSES, statusLabel } from '@/lib/domain/status';
import type { Learner } from '@/types/db';

export default function DashboardPage() {
  const who = useWho();
  const learners = useLearners(); const plan = usePlan(); const goals = useGoals(); const rs = useGoalResources(); const sessions = useSessions();
  const activity = useActivity(); const posts = usePostponements(); const anns = useAnnouncements(); const reads = useAnnReads(); const msgs = useMessages();
  const notes = useNotes(); const log = useVocabLog();
  const quick = useQuick(); const nav = useNavigate(); const run = useRun();

  const loading = [learners, plan, goals, rs, sessions].some((q) => q.isLoading);
  const failed = [learners, plan, goals, rs, sessions].find((q) => q.isError);

  const now = new Date();
  const today = toISO(now);
  const wkStart = toISO(startOfWeek(now)); const wkEnd = toISO(addDays(startOfWeek(now), 6));
  const me = who.me; const partner = who.partner;

  const data = useMemo(() => {
    if (!me) return null;
    const L = (who.learners.length ? who.learners : [me]) as Learner[];
    const g = goals.data ?? []; const r = rs.data ?? []; const s = sessions.data ?? [];
    const lane = (l: Learner) => {
      const mine = g.filter((x) => x.scope === 'shared' || x.owner_id === l.id);
      const commit = weeklyCommitment(mine, wkStart, wkEnd, today);
      const wk = weeklyMinutes(s, [l.id], 2, now);
      return { l, commit, minutes: wk[1].byLearner[l.id], lastWeek: wk[0].byLearner[l.id], days: activeDaysThisWeek(s, l.id, now), mom: momentum(s, l.id, now), total: totalMinutes(s, l.id),
        reviews: reviewsThisWeek(log.data ?? [], l.id, now), doneAll: mine.filter((x) => x.status === 'completed').length };
    };
    const lanes = L.map(lane);
    const attention: Array<{ key: string; icon: 'help' | 'req' | 'q' | 'late' | 'msg'; text: string; to: string }> = [];
    for (const p of posts.data ?? []) if (p.status === 'pending') {
      const goal = g.find((x) => x.id === p.goal_id);
      attention.push(p.requester_id === me.id ? { key: p.id, icon: 'req', text: `Waiting for ${partner?.display_name ?? 'your partner'} to answer your postponement of “${goal?.title ?? 'a goal'}”`, to: '/plan?tab=requests' }
        : { key: p.id, icon: 'req', text: `${who.nameOf(p.requester_id)} asks to postpone “${goal?.title ?? 'a goal'}” to ${formatDay(p.proposed_deadline)} — your decision`, to: '/plan?tab=requests' });
    }
    for (const x of r) if (ATTENTION_STATUSES.includes(x.status) && x.status !== 'awaiting_review') {
      const goal = g.find((q) => q.id === x.goal_id); if (!goal) continue;
      const owner = goal.owner_id ?? null;
      if (owner && owner !== me.id) attention.push({ key: x.id, icon: 'help', text: `${who.nameOf(owner)}: “${x.title}” — ${statusLabel(x.status).toLowerCase()}`, to: `/plan?goal=${goal.id}` });
    }
    for (const n of notes.data ?? []) if (n.kind === 'question' && n.question_state !== 'answered' && n.visibility === 'shared' && n.owner_id !== me.id)
      attention.push({ key: n.id, icon: 'q', text: `${who.nameOf(n.owner_id)} asked: ${n.title ?? n.body.slice(0, 70)}`, to: `/notes?note=${n.id}` });
    const late = g.filter((x) => (x.scope === 'shared' || x.owner_id === me.id) && x.status !== 'completed' && x.status !== 'dropped' && isOverdue(x.deadline, now));
    for (const x of late.slice(0, 3)) attention.push({ key: x.id, icon: 'late', text: `Overdue: “${x.title}” (was due ${formatDay(x.deadline)})`, to: `/plan?goal=${x.id}` });
    const unreadMsgs = (msgs.data ?? []).filter((m) => m.sender_id !== me.id && !m.read_at).length;
    if (unreadMsgs) attention.push({ key: 'msgs', icon: 'msg', text: `${unreadMsgs} unread message${unreadMsgs > 1 ? 's' : ''}`, to: '/chat' });

    const upcoming = g.filter((x) => x.status !== 'completed' && x.status !== 'dropped' && daysUntil(x.deadline, now) >= 0 && daysUntil(x.deadline, now) <= 7).sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 6);
    const weekGoals = g.filter((x) => x.status !== 'dropped' && ((x.original_deadline >= wkStart && x.original_deadline <= wkEnd) || (x.deadline >= wkStart && x.deadline <= wkEnd)));
    const weeks = plan.data ? totalPlanWeeks(plan.data.start_date, plan.data.target_end_date) : 52;
    const strips = L.map((l) => ({ learner: l, cells: plan.data ? weekCompletion(g, l.id, plan.data.start_date, weeks) : [] }));
    return { L, lanes, attention, upcoming, weekGoals, weeks, strips, bars: weeklyMinutes(s, L.map((l) => l.id), 8, now), r, g };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, who.learners, goals.data, rs.data, sessions.data, posts.data, notes.data, msgs.data, log.data, plan.data, partner]);

  const visibleNotices = useMemo(() => {
    const readMap = new Map((reads.data ?? []).map((x) => [x.announcement_id, x]));
    const t = Date.now();
    return (anns.data ?? []).filter((a) => !a.expires_at || new Date(a.expires_at).getTime() > t).filter((a) => !readMap.get(a.id)?.dismissed)
      .sort((a, b) => (a.priority === b.priority ? b.created_at.localeCompare(a.created_at) : a.priority === 'important' ? -1 : 1)).slice(0, 2)
      .map((a) => ({ a, unread: !readMap.has(a.id) && a.author_id !== me?.id }));
  }, [anns.data, reads.data, me?.id]);

  if (failed) return <ErrorState message={(failed.error as Error).message} onRetry={() => void failed.refetch()} />;
  if (loading || !data || !me) return <SkeletonCards n={4} />;
  const [A, B] = data.lanes.length > 1 ? [data.lanes.find((x) => x.l.id === me.id)!, data.lanes.find((x) => x.l.id !== me.id)!] : [data.lanes[0], null];
  const wkNo = plan.data ? planWeekNumber(plan.data.start_date, now) : null;
  const noPlanData = (goals.data ?? []).length === 0;

  return (
    <div className="stack-lg">
      <div className="hello">
        <div>
          <h1>Hallo, {me.display_name}</h1>
          <p className="muted">{weekLabel(wkStart)}{wkNo && wkNo >= 1 ? ` · week ${wkNo} of ${data.weeks}` : ''}</p>
        </div>
        <div className="row wrap">
          <Button variant="primary" icon={<Timer size={16} aria-hidden />} onClick={quick.openSession}>Log time</Button>
          <Button icon={<Languages size={16} aria-hidden />} onClick={() => quick.openWord()}>Add word</Button>
          <Button icon={<NotebookPen size={16} aria-hidden />} onClick={() => quick.openNote()}>Note</Button>
        </div>
      </div>

      {visibleNotices.length > 0 && (
        <section aria-label="Announcements" className="stack-sm">
          {visibleNotices.map(({ a, unread }) => (
            <div key={a.id} className={`notice ${a.priority === 'important' ? 'notice-important' : ''}`}>
              <Megaphone size={18} aria-hidden />
              <div className="grow">
                <p><b>{a.title}</b> {a.priority === 'important' && <Badge tone="warn">Important</Badge>} {unread && <Badge tone="info">New</Badge>}</p>
                <p className="small muted clamp2">{a.body}</p>
                <p className="small muted">{who.nameOf(a.author_id)} · {timeAgo(a.created_at)}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => void run(() => setAnnouncementRead(me.id, a.id, true), { invalidate: ['ann_reads'] })}>Dismiss</Button>
            </div>
          ))}
          <Link to="/notices" className="small">All notices</Link>
        </section>
      )}

      {noPlanData && (
        <Card><EmptyState icon={<CalendarClock size={28} />} title="Start with this week" action={<Button variant="primary" onClick={() => nav('/plan?new=1')}>Plan this week</Button>}>
          Nothing is planned yet. Create your first weekly goal — you can pick files and page ranges from your library, or write a goal by hand. The curriculum suggests a sequence for each week.</EmptyState></Card>
      )}

      <Card className="duo" aria-labelledby="duo-h">
        <SectionHeader title="This week, side by side" sub="Weekly goals finished and study minutes. Missing a day doesn’t break anything." />
        <h2 id="duo-h" className="sr-only">This week, side by side</h2>
        <div className="duo-grid">
          {[A, B].filter(Boolean).map((x) => x && (
            <div key={x.l.id} className={`lane lane-${x.l.accent}`}>
              <div className="lane-head"><Avatar code={x.l.code} accent={x.l.accent} size={36} /><div><b>{x.l.id === me.id ? 'You' : x.l.display_name}</b><p className="small muted">{x.days} study day{x.days === 1 ? '' : 's'} this week</p></div></div>
              <div className="lane-stats">
                <Ring value={x.commit.pct} tone={x.l.accent} size={72} label={`${x.l.display_name} weekly goals`}><b>{x.commit.completed}/{x.commit.total}</b></Ring>
                <dl className="kv">
                  <div><dt>Goals done</dt><dd>{x.commit.completed} of {x.commit.total}{x.commit.postponed ? ` · ${x.commit.postponed} postponed` : ''}</dd></div>
                  <div><dt>Minutes</dt><dd>{formatMinutes(x.minutes)}</dd></div>
                  <div><dt>Reviews</dt><dd>{x.reviews} words</dd></div>
                  <div><dt>Momentum</dt><dd>
                    {x.mom.change === null ? <span className="muted">building a baseline</span> : x.mom.change > 5 ? <span className="up"><ArrowUpRight size={14} aria-hidden /> {x.mom.change}% vs previous 4 wks</span> : x.mom.change < -5 ? <span className="down"><ArrowDownRight size={14} aria-hidden /> {Math.abs(x.mom.change)}% vs previous 4 wks</span> : <span><Minus size={14} aria-hidden /> steady</span>}
                  </dd></div>
                </dl>
              </div>
            </div>
          ))}
        </div>
        {A && B && (
          <div className="tugs">
            <div><p className="small muted">Study minutes this week</p><TugBar a={A.minutes} b={B.minutes} la={A.l} lb={B.l} unit="minutes" /></div>
            <div><p className="small muted">Goals completed this week</p><TugBar a={A.commit.completed} b={B.commit.completed} la={A.l} lb={B.l} unit="goals" /></div>
          </div>
        )}
      </Card>

      <div className="grid-dash">
        <Card>
          <SectionHeader title="Needs attention" />
          {data.attention.length === 0 ? <p className="muted"><Check size={16} aria-hidden /> All clear. Nothing is waiting on you.</p> : (
            <ul className="plain-list attn">
              {data.attention.slice(0, 8).map((a) => (
                <li key={a.key}><Link to={a.to} className="attn-item">
                  {a.icon === 'late' ? <AlertTriangle size={18} aria-hidden /> : a.icon === 'q' ? <MessageSquareQuote size={18} aria-hidden /> : <HelpCircle size={18} aria-hidden />}
                  <span>{a.text}</span></Link></li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionHeader title="Coming up" sub="Next 7 days" action={<Link to="/plan" className="small">Open plan</Link>} />
          {data.upcoming.length === 0 ? <p className="muted">No deadlines in the next week.</p> : (
            <ul className="plain-list">
              {data.upcoming.map((g) => {
                const d = daysUntil(g.deadline, now);
                return <li key={g.id} className="row between"><span className="row"><Avatar code={who.codeOf(g.owner_id).slice(0, 2) || '··'} accent={who.accentOf(g.owner_id)} size={24} label={who.nameOf(g.owner_id)} /><Link to={`/plan?goal=${g.id}`}>{g.title}</Link></span>
                  <Badge tone={d <= 1 ? 'warn' : 'neutral'}>{d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : formatDay(g.deadline)}</Badge></li>;
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <SectionHeader title="Goals this week" action={<Link to="/plan" className="small">Manage</Link>} />
        <div className="grid2">
          {data.L.map((l) => {
            const mine = data.weekGoals.filter((g) => (l.id === me.id ? true : true) && (g.scope === 'shared' || g.owner_id === l.id));
            return (
              <div key={l.id}>
                <p className="lane-title"><Avatar code={l.code} accent={l.accent} size={22} /> {l.id === me.id ? 'You' : l.display_name}</p>
                {mine.length === 0 ? <p className="small muted">No goals set.</p> : (
                  <ul className="plain-list stack-sm">
                    {mine.map((g) => { const p = goalProgress(g, data.r.filter((x) => x.goal_id === g.id)); return (
                      <li key={g.id}><div className="row between"><Link to={`/plan?goal=${g.id}`}>{g.title}</Link><span className="small muted">{p}%</span></div>
                        <ProgressBar value={p} label={`${g.title} progress`} tone={g.status === 'completed' ? 'done' : l.accent} /></li>); })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid-dash">
        <Card><SectionHeader title="Study minutes, last 8 weeks" /><GroupedBars rows={data.bars} learners={data.L} /></Card>
        <Card>
          <SectionHeader title="The whole plan" sub={plan.data ? `${formatDay(plan.data.start_date)} → ${formatDay(plan.data.target_end_date)}` : undefined} />
          {plan.data ? (
            <>
              <div className="row between wrap">
                <Ring value={Math.min(100, Math.round((Math.max(0, wkNo ?? 0) / data.weeks) * 100))} size={76} tone="amber" label="Time elapsed in the plan"><b>{Math.max(0, wkNo ?? 0)}</b></Ring>
                <dl className="kv">
                  <div><dt>Week</dt><dd>{Math.max(0, wkNo ?? 0)} of {data.weeks}</dd></div>
                  {data.lanes.map((x) => <div key={x.l.id}><dt>{x.l.id === me.id ? 'You' : x.l.display_name}</dt><dd>{x.doneAll} goals · {formatMinutes(x.total)}</dd></div>)}
                </dl>
              </div>
              <PlanStrip lanes={data.strips} currentWeek={wkNo ?? 0} />
              <p className="small muted">Each cell is a week; darker means more of that week’s goals were completed.</p>
            </>
          ) : <p className="muted">No active plan. Set one in Settings.</p>}
        </Card>
      </div>

      <Card>
        <SectionHeader title="Recent activity" />
        {(activity.data ?? []).length === 0 ? <p className="muted">Activity from both of you appears here as it happens.</p> : (
          <ol className="timeline">
            {(activity.data ?? []).slice(0, 12).map((a) => (
              <li key={a.id}><Avatar code={who.codeOf(a.learner_id)} accent={who.accentOf(a.learner_id)} size={22} /> <span><b>{a.learner_id === me.id ? 'You' : who.nameOf(a.learner_id)}</b> · {a.summary}</span> <span className="muted small">{timeAgo(a.created_at)}</span></li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
