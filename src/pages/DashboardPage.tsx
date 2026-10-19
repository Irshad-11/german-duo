import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MessageSquarePlus, Plus, Timer } from 'lucide-react';
import { useAnnouncements, useAnnReads, useChangeLog, useCurriculum, useGoalResources, useGoals, useLearners, useMessages, useNotes, usePlan, usePostponements, useProgress, useResources, useSessions, useVocab, useVocabLog, useVocabState } from '@/api/queries';
import { useWho } from '@/hooks/useWho';
import { useQuick } from '@/hooks/useQuick';
import { Avatar, Button, EmptyState, ErrorState, Ring, SkeletonCards } from '@/components/ui/ui';
import { MaterialCard } from '@/components/material';
import { Heatmap, Journey, MinutesChart } from '@/components/charts';
import { ChangeList } from '@/components/ChangeList';
import { Welcome } from '@/components/Welcome';
import { Page } from '@/components/Page';
import { nextSyllabusWeek } from '@/components/Syllabus';
import { activeDaysThisWeek, minutesInWeek, reachedCurriculumWeek, reviewsThisWeek, totalMinutes, weeklyMinutes } from '@/lib/domain/stats';
import { formatMinutesShort, timeAgo, totalPlanWeeks } from '@/lib/domain/dates';
import { describe, lastUpdateBy } from '@/lib/domain/changelog';
import { appliesTo, measure } from '@/lib/domain/progress';
import { observe, upNext } from '@/pet/observe';

const full = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const dateLine = () => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export default function DashboardPage() {
  const who = useWho(); const quick = useQuick(); const [, setSp] = useSearchParams(); const navigate = useNavigate();
  const learners = useLearners(); const plan = usePlan(); const goals = useGoals(); const rs = useGoalResources(); const progress = useProgress(); const sessions = useSessions(); const cur = useCurriculum();
  const log = useChangeLog(300); const posts = usePostponements(); const anns = useAnnouncements(); const reads = useAnnReads(); const msgs = useMessages(); const notes = useNotes(); const vlog = useVocabLog();
  const vocab = useVocab(); const vstate = useVocabState(); const lib = useResources();
  const failed = [learners, goals, rs, progress, sessions].find((q) => q.isError);
  const loading = [learners, goals, rs, progress, sessions, plan].some((q) => q.isLoading);
  const me = who.me; const now = new Date();

  const d = useMemo(() => {
    if (!me) return null;
    const L = who.learners; const g = goals.data ?? []; const r = rs.data ?? []; const p = progress.data ?? []; const s = sessions.data ?? [];
    const ctx = { me, other: who.other, learners: L, goals: g, resources: r, progress: p, sessions: s, words: vocab.data ?? [], wordState: vstate.data ?? [], notes: notes.data ?? [], posts: posts.data ?? [], messages: msgs.data ?? [], now };
    const obs = observe(ctx); const last = lastUpdateBy(log.data ?? []);
    const people = L.map((l) => {
      const mine = r.filter((x) => appliesTo(x, l.id) && g.some((y) => y.id === x.goal_id && y.status === 'active'));
      const done = mine.filter((x) => p.find((q) => q.goal_resource_id === x.id && q.learner_id === l.id)?.status === 'completed').length;
      const pct = mine.length ? Math.round(mine.reduce((a, x) => a + (measure(x, p.find((q) => q.goal_resource_id === x.id && q.learner_id === l.id)).pct ?? 0), 0) / mine.length) : 0;
      return { l, done, total: mine.length, pct, minutes: minutesInWeek(s, l.id, now), days: activeDaysThisWeek(s, l.id, now), words: reviewsThisWeek(vlog.data ?? [], l.id, now), all: totalMinutes(s, l.id), last: last[l.id], reached: reachedCurriculumWeek(g, r, p, l.id) };
    });
    return { L, ctx, obs, people, next: upNext(ctx, 3), bars: weeklyMinutes(s, L.map((l) => l.id), 8, now), weeks: plan.data ? totalPlanWeeks(plan.data.start_date, plan.data.target_end_date) : 52 };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, who.learners, who.other, goals.data, rs.data, progress.data, sessions.data, log.data, posts.data, notes.data, msgs.data, vlog.data, vocab.data, vstate.data, plan.data]);

  const notices = useMemo(() => { const m = new Map((reads.data ?? []).map((x) => [x.announcement_id, x])); const t = Date.now();
    return (anns.data ?? []).filter((a) => !a.expires_at || new Date(a.expires_at).getTime() > t).filter((a) => !m.get(a.id)?.dismissed).sort((a, b) => (a.priority === b.priority ? b.created_at.localeCompare(a.created_at) : a.priority === 'important' ? -1 : 1)).slice(0, 2); }, [anns.data, reads.data]);

  if (failed) return <ErrorState message={(failed.error as Error).message} onRetry={() => void failed.refetch()} />;
  if (loading || !d || !me) return <Page title={'Today'}><SkeletonCards n={3} /></Page>;
  const nextWeek = cur.data ? nextSyllabusWeek(cur.data.weeks, goals.data ?? []) : null;
  const attention = d.obs.filter((o) => o.priority >= 70 && !o.materialId);
  const reached = Object.fromEntries(d.people.map((x) => [x.l.id, x.reached]));
  const lead = d.obs.find((o) => !o.materialId) ?? d.obs[0];
  const welcome = { hasGoal: (goals.data ?? []).length > 0, hasLink: (lib.data ?? []).some((x) => x.external_url) || (rs.data ?? []).some((x) => x.external_url), hasSession: (sessions.data ?? []).length > 0, hasWord: (vocab.data ?? []).length > 0, otherSeen: !!who.other?.last_login_at, otherName: who.other?.display_name ?? '' };

  return (
    <Page kicker={<>{dateLine()}{nextWeek ? <span className="kick-extra"> · Syllabus: next is week {nextWeek}</span> : null}</>} title={`Hallo, ${me.display_name}`} lead={lead?.text}
      actions={<><Button variant="primary" icon={<Timer size={17} aria-hidden />} onClick={quick.openSession}>Log study time</Button><Button className="btn-light" icon={<Plus size={17} aria-hidden />} onClick={() => navigate('/words')}>Add words</Button><Button className="btn-light" icon={<MessageSquarePlus size={17} aria-hidden />} onClick={() => quick.openNote('question')}>Ask a question</Button></>}>
      <div className="layout-2">
        <div className="col-main">
          <Welcome s={welcome} />
          <section aria-labelledby="h-next"><h2 id="h-next" className="sec-title">Next for {me.display_name}</h2>
            {d.next.length === 0 ? <EmptyState title="Nothing to study right now" action={<Link className="btn btn-primary" to="/plan?v=syllabus">Choose a syllabus week</Link>}>Pick any week of the syllabus and press “Plan this week”. Each material then shows up here with one button: “Update progress &amp; time”.</EmptyState>
              : <div className="stack">{d.next.map((n) => <MaterialCard key={n.r.id} r={n.r} goal={n.g} progress={progress.data ?? []} learners={d.L} onUpdate={(id) => setSp((p) => { const x = new URLSearchParams(p); x.set('update', id); return x; }, { replace: true })} />)}
                <p className="small"><Link to="/plan">Open the whole week in Plan →</Link></p></div>}
          </section>
          <section aria-labelledby="h-jour"><h2 id="h-jour" className="sec-title">The road from A1 to B1</h2><Journey weeks={cur.data?.weeks ?? []} learners={d.L} reached={reached} planWeek={null} /></section>
        </div>

        <aside className="col-side" aria-label="Both of us">
          <section aria-labelledby="h-people"><h2 id="h-people" className="sec-title">Both of us <span className="sec-sub">· this week</span></h2>
            <div className="people">{d.people.map((x) => (
              <div key={x.l.id} className={`pcard pcard-${x.l.accent}`}>
                <div className="pc-top"><Ring value={x.pct} size={56} stroke={6} accent={x.l.accent} label={`${x.l.display_name}, all active materials`} /><div className="grow"><p className="pc-name"><Avatar code={x.l.code} accent={x.l.accent} size={15} /> {x.l.display_name}</p><p className="small muted">{x.done} of {x.total} materials finished</p></div></div>
                <dl className="pc-stats"><div title="Study minutes this week"><dt>Minutes</dt><dd>{formatMinutesShort(x.minutes)}</dd></div><div title="Days with study time, out of 7"><dt>Days</dt><dd>{x.days}/7</dd></div><div title="Words practised this week"><dt>Words</dt><dd>{x.words}</dd></div></dl>
                <p className="small muted" title={full(x.l.last_login_at)}>Last login: {x.l.last_login_at ? timeAgo(x.l.last_login_at) : 'never'}</p>
                <p className="small muted" title={x.last ? full(x.last.created_at) : ''}>Last update: {x.last ? `${timeAgo(x.last.created_at)} — ${describe(x.last).toLowerCase()}, ${x.last.label}` : '—'}</p>
              </div>))}</div>
          </section>
          {notices.length > 0 && <section aria-labelledby="h-not"><h2 id="h-not" className="sec-title">Notices</h2><div className="stack-sm">{notices.map((a) => <div key={a.id} className={`notice ${a.priority === 'important' ? 'notice-important' : ''}`}><b>{a.title}</b><p className="small">{a.body.slice(0, 160)}{a.body.length > 160 ? '…' : ''}</p><p className="small muted">{who.nameOf(a.author_id)}, {timeAgo(a.created_at)}</p></div>)}</div></section>}
          {attention.length > 0 && <section aria-labelledby="h-attn"><h2 id="h-attn" className="sec-title">Needs attention</h2><ul className="plain-list attn">{attention.slice(0, 5).map((o) => <li key={o.id}>{o.to ? <Link to={o.to}>{o.text}</Link> : o.text}</li>)}</ul></section>}
        </aside>
      </div>

      <div className="two">
        <section aria-labelledby="h-heat"><h2 id="h-heat" className="sec-title">Study days</h2><Heatmap sessions={sessions.data ?? []} learners={d.L} /></section>
        <section aria-labelledby="h-min"><h2 id="h-min" className="sec-title">Minutes per week</h2><MinutesChart rows={d.bars} learners={d.L} /></section>
      </div>
      <section aria-labelledby="h-log"><div className="row between"><h2 id="h-log" className="sec-title">Latest changes</h2><Link to="/log" className="small">History &amp; undo →</Link></div><ChangeList entries={(log.data ?? []).slice(0, 6)} compact /></section>
    </Page>
  );
}
