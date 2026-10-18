import { useEffect, useMemo, useRef } from 'react';
import { Avatar } from '@/components/ui/ui';
import { DAY_PX, barBox, ganttRange, monthSpans, todayOffset, weekTicks, type GanttScale } from '@/lib/domain/gantt';
import { learnerGoalPct } from '@/lib/domain/progress';
import { addDays, formatDay, parseISO, toISO } from '@/lib/domain/dates';
import type { Goal, GoalProgress, GoalResource, Learner, Plan } from '@/types/db';

/** Timeline: constrained to the plan, sticky goal-name column and sticky date header, today line, weekend shading in day scale.
 *  Each bar shows both learners' progress as two thin lanes (IR on top, LA below). Postponed stretch is hatched. */
export function Gantt({ goals, resources, progress, learners, plan, scale, onOpen, today }: {
  goals: Goal[]; resources: GoalResource[]; progress: GoalProgress[]; learners: Learner[]; plan: Plan | null; scale: GanttScale; onOpen: (id: string) => void; today: string;
}) {
  const dayPx = DAY_PX[scale];
  const range = useMemo(() => ganttRange(plan?.start_date ?? null, plan?.target_end_date ?? null, goals), [plan, goals]);
  const width = range.days * dayPx;
  const tOff = todayOffset(range, dayPx, today);
  const scroller = useRef<HTMLDivElement>(null);
  const months = useMemo(() => monthSpans(range), [range]);
  const ticks = useMemo(() => weekTicks(range), [range]);
  const weekends = useMemo(() => {
    if (scale !== 'days') return [] as number[];
    const out: number[] = []; for (let i = 0; i < range.days; i++) { const d = addDays(parseISO(range.start), i).getDay(); if (d === 0 || d === 6) out.push(i); } return out;
  }, [scale, range]);

  useEffect(() => { if (scroller.current && tOff !== null) scroller.current.scrollLeft = Math.max(0, tOff - scroller.current.clientWidth * 0.3); }, [scale, tOff, range.start]);

  return (
    <div className="gantt" ref={scroller} role="region" aria-label="Timeline of goals (scrolls sideways)" tabIndex={0}>
      <div className="g-inner" style={{ ['--gw' as string]: `${width}px` }}>
        <div className="g-head">
          <div className="g-corner">Goal</div>
          <div className="g-scale" style={{ width }}>
            <div className="g-months">{months.map((m) => <span key={m.offsetDays} style={{ left: m.offsetDays * dayPx, width: m.days * dayPx }}>{m.days * dayPx > 44 ? m.label : ''}</span>)}</div>
            <div className="g-weeks">{ticks.map((t) => <span key={t.date} style={{ left: t.offsetDays * dayPx, width: 7 * dayPx }} title={`Week ${t.n}: ${formatDay(t.date)}`}>{scale === 'days' ? formatDay(t.date) : t.n % 4 === 1 ? `W${t.n}` : ''}</span>)}</div>
          </div>
        </div>
        {goals.length === 0 && <p className="muted g-empty">No goals yet. Add one with “New goal”.</p>}
        {goals.map((g) => {
          const rs = resources.filter((r) => r.goal_id === g.id);
          const box = barBox(g, range, dayPx);
          return (
            <div key={g.id} className={`g-row ${g.status === 'dropped' ? 'g-dropped' : ''}`}>
              <button className="g-label" onClick={() => onOpen(g.id)} title={g.title}><span>{g.title}</span><small className="mono muted">{formatDay(g.start_date)}–{formatDay(g.deadline)}</small></button>
              <div className="g-track" style={{ width }}>
                {weekends.map((i) => <i key={i} className="g-we" style={{ left: i * dayPx, width: dayPx }} />)}
                {ticks.map((t) => <i key={t.date} className="g-wk" style={{ left: t.offsetDays * dayPx }} />)}
                {tOff !== null && <i className="g-today" style={{ left: tOff }} aria-hidden />}
                <button className="g-bar" style={{ left: box.left, width: box.width }} onClick={() => onOpen(g.id)} aria-label={`${g.title}, ${formatDay(g.start_date)} to ${formatDay(g.deadline)}. ${learners.map((l) => `${l.display_name} ${learnerGoalPct(rs, progress, l.id)}%`).join(', ')}`}>
                  {box.origRight && <i className="g-post" style={{ width: box.origRight, right: 0 }} title="Postponed" />}
                  {box.width >= 120 && <b className="g-title">{g.title}</b>}
                  {learners.map((l) => <span key={l.id} className={`g-lane g-lane-${l.accent}`}><i style={{ width: `${learnerGoalPct(rs, progress, l.id)}%` }} /></span>)}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="g-legend small muted">
        {learners.map((l) => <span key={l.id}><Avatar code={l.code} accent={l.accent} size={14} /></span>)}<span>top lane = first, lower lane = second</span><span><i className="sw-post" /> postponed</span><span><i className="sw-today" /> today ({toISO(parseISO(today))})</span>
      </div>
    </div>
  );
}
