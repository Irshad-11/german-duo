import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAnnouncements, useAnnReads, useChangeLog, useGoalResources, useGoals, useLearners, useMessages, useNotes, usePlan, usePostponements, useProgress, useSessions, useVocabLog } from '@/api/queries';
import { useWho } from '@/hooks/useWho';
import { useQuick } from '@/hooks/useQuick';
import { Avatar, Button, EmptyState, ErrorState, SkeletonCards } from '@/components/ui/ui';
import { MiniBar } from '@/components/people';
import { MinutesChart } from '@/components/charts';
import { ChangeList } from '@/components/ChangeList';
import { activeDaysThisWeek, minutesInWeek, reviewsThisWeek, totalMinutes, weeklyMinutes } from '@/lib/domain/stats';
import { addDays, formatDay, formatMinutes, planWeekNumber, startOfWeek, timeAgo, toISO, totalPlanWeeks, weekLabel } from '@/lib/domain/dates';
import { describe, lastUpdateBy } from '@/lib/domain/changelog';
import { goalState, learnerGoalPct, measure } from '@/lib/domain/progress';
import { ATTENTION_STATUSES, statusLabel } from '@/lib/domain/status';

const full = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export default function DashboardPage() {
  const who = useWho(); const quick = useQuick();
  const learners = useLearners(); const plan = usePlan(); const goals = useGoals(); const rs = useGoalResources(); const progress = useProgress(); const sessions = useSessions();
  const log = useChangeLog(300); const posts = usePostponements(); const anns = useAnnouncements(); const reads = useAnnReads(); const msgs = useMessages(); const notes = useNotes(); const vlog = useVocabLog();
  const failed = [learners, goals, rs, progress, sessions].find((q) => q.isError);
  const loading = [learners, goals, rs, progress, sessions, plan].some((q) => q.isLoading);
  const now = new Date(); const today = toISO(now); const wkS = toISO(startOfWeek(now)); const wkE = toISO(addDays(startOfWeek(now), 6));
  const me = who.me;

  const d = useMemo(() => {
    if (!me) return null;
    const L = who.learners; const g = goals.data ?? []; const r = rs.data ?? []; const p = progress.data ?? []; const s = sessions.data ?? [];
    const weekGoals = g.filter((x) => x.status === 'active' && x.start_date <= wkE && x.deadline >= wkS);
    const last = lastUpdateBy(log.data ?? []);
    const people = L.map((l) => {
      const asg = r.filter((x) => weekGoals.some((w) => w.id === x.goal_id));
      const done = asg.filter((x) => p.find((q) => q.goal_resource_id === x.id && q.learner_id === l.id)?.status === 'completed').length;
      const pct = asg.length ? Math.round(asg.reduce((a, x) => a + (measure(x, p.find((q) => q.goal_resource_id === x.id && q.learner_id === l.id)).pct ?? 0), 0) / asg.length) : 0;
      return { l, done, total: asg.length, pct, minutes: minutesInWeek(s, l.id, now), days: activeDaysThisWeek(s, l.id, now), words: reviewsThisWeek(vlog.data ?? [], l.id, now), total_min: totalMinutes(s, l.id), last: last[l.id] };
    });
    const attention: Array<{ key: string; text: string; to: string }> = [];
    for (const q of posts.data ?? []) if (q.status === 'pending' && q.requester_id !== me.id) attention.push({ key: q.id, text: `${who.nameOf(q.requester_id)} asks to postpone “${g.find((x) => x.id === q.goal_id)?.title}” to ${formatDay(q.proposed_deadline)} — needs a decision`, to: '/plan?v=requests' });
    for (const q of p) if (q.learner_id !== me.id && ATTENTION_STATUSES.includes(q.status) && q.status !== 'awaiting_review') { const res = r.find((x) => x.id === q.goal_resource_id); if (res) attention.push({ key: q.id, text: `${who.nameOf(q.learner_id)}: “${res.title}” — ${statusLabel(q.status).toLowerCase()}`, to: `/plan?goal=${res.goal_id}` }); }
    for (const n of notes.data ?? []) if (n.kind === 'question' && n.question_state !== 'answered' && n.author_id !== me.id) attention.push({ key: n.id, text: `${who.nameOf(n.author_id)} asked: ${n.title ?? n.body.slice(0, 70)}`, to: `/notes?note=${n.id}` });
    for (const x of g) if (goalState(x, r.filter((y) => y.goal_id === x.id), p, L.map((l) => l.id), today) === 'overdue') attention.push({ key: x.id, text: `Overdue: “${x.title}” (due ${formatDay(x.deadline)})`, to: `/plan?goal=${x.id}` });
    const un = (msgs.data ?? []).filter((m) => m.sender_id !== me.id && !m.read_at).length; if (un) attention.push({ key: 'm', text: `${un} unread message${un > 1 ? 's' : ''}`, to: '/chat' });
    return { L, people, weekGoals, attention, bars: weeklyMinutes(s, L.map((l) => l.id), 8, now), r, p, weeks: plan.data ? totalPlanWeeks(plan.data.start_date, plan.data.target_end_date) : 52 };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, who.learners, goals.data, rs.data, progress.data, sessions.data, log.data, posts.data, notes.data, msgs.data, vlog.data, plan.data]);

  const notices = useMemo(() => { const readMap = new Map((reads.data ?? []).map((x) => [x.announcement_id, x])); const t = Date.now();
    return (anns.data ?? []).filter((a) => !a.expires_at || new Date(a.expires_at).getTime() > t).filter((a) => !readMap.get(a.id)?.dismissed).sort((a, b) => (a.priority === b.priority ? b.created_at.localeCompare(a.created_at) : a.priority === 'important' ? -1 : 1)).slice(0, 2); }, [anns.data, reads.data]);

  if (failed) return <ErrorState message={(failed.error as Error).message} onRetry={() => void failed.refetch()} />;
  if (loading || !d || !me) return <SkeletonCards n={3} />;
  const wk = plan.data ? planWeekNumber(plan.data.start_date, now) : null;

  return (
    <div className="stack-lg">
      <div className="row between wrap">
        <div><h1>This week</h1><p className="muted mono small">{weekLabel(wkS)}{wk && wk >= 1 ? ` · week ${wk} of ${d.weeks}` : ''}</p></div>
        <div className="row wrap"><Button size="sm" onClick={quick.openSession}>Log time</Button><Button size="sm" onClick={() => quick.openWord()}>Add word</Button><Button size="sm" onClick={() => quick.openNote()}>Note</Button><Link className="btn btn-primary btn-sm" to="/plan?new=1">New goal</Link></div>
      </div>

      {notices.map((a) => <div key={a.id} className={`notice ${a.priority === 'important' ? 'notice-important' : ''}`}><b>{a.title}</b> <span className="muted">— {a.body.slice(0, 140)}{a.body.length > 140 ? '…' : ''}</span> <span className="small muted">({who.nameOf(a.author_id)}, {timeAgo(a.created_at)})</span></div>)}

      <section aria-labelledby="h-people"><h2 id="h-people">Both of us</h2>
        <div className="sheet-wrap"><table className="tbl tbl-people">
          <thead><tr><th scope="col">Person</th><th scope="col">Last login</th><th scope="col">Last seen</th><th scope="col">Last update</th><th scope="col">Goals this week</th><th scope="col">Minutes</th><th scope="col">Study days</th><th scope="col">Words</th></tr></thead>
          <tbody>{d.people.map((x) => (
            <tr key={x.l.id}>
              <th scope="row"><Avatar code={x.l.code} accent={x.l.accent} /> <span className="small">{x.l.display_name}</span></th>
              <td title={full(x.l.last_login_at)}>{x.l.last_login_at ? timeAgo(x.l.last_login_at) : <span className="muted">never</span>}</td>
              <td title={full(x.l.last_seen_at)}>{x.l.last_seen_at ? timeAgo(x.l.last_seen_at) : <span className="muted">—</span>}</td>
              <td>{x.last ? <span title={full(x.last.created_at)}>{timeAgo(x.last.created_at)}<br /><span className="small muted">{describe(x.last)}: {x.last.label}</span></span> : <span className="muted">—</span>}</td>
              <td><span className="mono">{x.pct}%</span> <MiniBar pct={x.pct} accent={x.l.accent} /><br /><span className="small muted">{x.done}/{x.total} files done</span></td>
              <td className="mono">{formatMinutes(x.minutes)}<br /><span className="small muted">total {formatMinutes(x.total_min)}</span></td>
              <td className="mono">{x.days}/7</td><td className="mono">{x.words}</td>
            </tr>))}</tbody></table></div>
      </section>

      {d.weekGoals.length === 0 ? <EmptyState title="No goals this week" action={<Link className="btn btn-primary" to="/plan?new=1">Plan the week</Link>}>Create a goal both of you follow. The Plan tab can suggest one from the curriculum.</EmptyState> : (
        <section aria-labelledby="h-goals"><h2 id="h-goals">Goals this week</h2>
          <div className="sheet-wrap"><table className="tbl"><thead><tr><th scope="col">Goal</th><th scope="col">Due</th>{d.L.map((l) => <th key={l.id} scope="col"><span className={`txt-${l.accent}`}>{l.code}</span></th>)}</tr></thead>
            <tbody>{d.weekGoals.map((g) => { const gr = d.r.filter((x) => x.goal_id === g.id); return (
              <tr key={g.id}><th scope="row"><Link to={`/plan?goal=${g.id}`}>{g.title}</Link></th><td className="mono">{formatDay(g.deadline)}</td>
                {d.L.map((l) => { const pc = learnerGoalPct(gr, d.p, l.id); return <td key={l.id}><span className="mono">{pc}%</span> <MiniBar pct={pc} accent={l.accent} /></td>; })}</tr>); })}</tbody></table></div>
        </section>
      )}

      <div className="two">
        <section aria-labelledby="h-attn"><h2 id="h-attn">Needs attention</h2>
          {d.attention.length === 0 ? <p className="muted">Nothing is waiting.</p> : <ul className="plain-list attn">{d.attention.slice(0, 8).map((a) => <li key={a.key}><Link to={a.to}>{a.text}</Link></li>)}</ul>}
        </section>
        <section aria-labelledby="h-min"><h2 id="h-min">Minutes per week</h2><MinutesChart rows={d.bars} learners={d.L} /></section>
      </div>

      <section aria-labelledby="h-log"><div className="row between"><h2 id="h-log">Latest changes</h2><Link to="/log" className="small">Full log &amp; revert</Link></div>
        <ChangeList entries={(log.data ?? []).slice(0, 8)} compact /></section>
    </div>
  );
}
