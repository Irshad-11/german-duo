import { formatDay, formatMinutes } from '@/lib/domain/dates';
import type { Learner } from '@/types/db';

interface Row { weekStart: string; byLearner: Record<string, number> }
/** Weekly minutes. Blue circle = first learner, orange square = second (shape + colour). */
export function MinutesChart({ rows, learners }: { rows: Row[]; learners: Learner[] }) {
  const max = Math.max(60, ...rows.flatMap((r) => Object.values(r.byLearner)));
  return (
    <div className="mchart">
      <table className="sr-only"><caption>Study minutes per week</caption><thead><tr><th>Week</th>{learners.map((l) => <th key={l.id}>{l.display_name}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.weekStart}><th>{r.weekStart}</th>{learners.map((l) => <td key={l.id}>{r.byLearner[l.id] ?? 0}</td>)}</tr>)}</tbody></table>
      <div className="mchart-grid" aria-hidden>
        {rows.map((r) => (
          <div key={r.weekStart} className="mchart-col">
            <div className="mchart-bars">{learners.map((l) => <span key={l.id} className={`mbar mbar-${l.accent}`} style={{ height: `${Math.max(((r.byLearner[l.id] ?? 0) / max) * 100, r.byLearner[l.id] ? 3 : 0)}%` }} title={`${l.display_name}: ${formatMinutes(r.byLearner[l.id] ?? 0)}`} />)}</div>
            <span className="mono tick">{formatDay(r.weekStart).replace(/ [A-Za-z]+$/, '')}</span>
          </div>
        ))}
      </div>
      <p className="small muted">Scale tops out at {formatMinutes(max)} per week.</p>
    </div>
  );
}

import { addDays, startOfWeek, toISO } from '@/lib/domain/dates';
import { minutesPerDay } from '@/lib/domain/stats';
import type { CurriculumWeek, StudySession } from '@/types/db';

const level = (m: number) => (m <= 0 ? 0 : m < 15 ? 1 : m < 30 ? 2 : m < 60 ? 3 : 4);
/** Calendar heat map of the last N weeks, one block per person (rows Mon–Sun). Darker = more minutes that day. */
export function Heatmap({ sessions, learners, weeks = 16 }: { sessions: StudySession[]; learners: Learner[]; weeks?: number }) {
  const first = addDays(startOfWeek(new Date()), -(weeks - 1) * 7); const today = toISO(new Date());
  return (
    <div className="heat">
      {learners.map((l) => {
        const per = minutesPerDay(sessions, l.id); let total = 0; const cells: Array<{ iso: string; m: number; future: boolean }> = [];
        for (let w = 0; w < weeks; w++) for (let d = 0; d < 7; d++) { const iso = toISO(addDays(first, w * 7 + d)); const m = per.get(iso) ?? 0; total += m; cells.push({ iso, m, future: iso > today }); }
        return (
          <div key={l.id} className="heat-row"><span className={`heat-name txt-${l.accent}`}>{l.display_name}</span>
            <div className="heat-grid" role="img" aria-label={`${l.display_name}: ${total} study minutes in the last ${weeks} weeks`}>
              {cells.map((c) => <i key={c.iso} className={`hc hc-${l.accent} hc-${c.future ? 'f' : level(c.m)}`} title={c.future ? '' : `${c.iso}: ${c.m} min`} />)}</div></div>
        );
      })}
      <p className="small muted">Each square is a day (last {weeks} weeks, Monday at the top). Empty squares are fine — it’s the overall picture that counts.</p>
    </div>
  );
}

/** Where each person is on the A1 → A2 → B1 road, based on the furthest curriculum week whose goal they completed. */
export function Journey({ weeks, learners, reached, planWeek }: { weeks: CurriculumWeek[]; learners: Learner[]; reached: Record<string, number>; planWeek: number | null }) {
  const total = Math.max(1, weeks.length || 52);
  const levels: Array<{ level: string; count: number }> = [];
  for (const w of weeks) { const l = levels[levels.length - 1]; if (l && l.level === w.level) l.count++; else levels.push({ level: w.level, count: 1 }); }
  const pct = (n: number) => `${Math.min(100, Math.max(0, (n / total) * 100))}%`;
  const none = learners.every((l) => !reached[l.id]);
  return (
    <div className="journey">
      <div className="jtrack" aria-hidden>
        {levels.map((l) => <span key={l.level} className={`jseg jseg-${l.level.toLowerCase()}`} style={{ flex: l.count }}>{l.level}</span>)}
        {planWeek !== null && planWeek >= 1 && planWeek <= total && <i className="jtoday" style={{ left: pct(planWeek) }} title={`Plan week ${planWeek}`} />}
        {learners.map((l, i) => reached[l.id] ? <b key={l.id} className={`jpin jpin-${l.accent}`} style={{ left: pct(reached[l.id]), top: i === 0 ? -16 : 'auto', bottom: i === 0 ? 'auto' : -16 }} title={`${l.display_name}: week ${reached[l.id]}`}>{l.code}</b> : null)}
      </div>
      <p className="small muted">{none ? 'Create goals from the suggested curriculum and finish them — your markers will appear on the road.' : learners.map((l) => `${l.display_name}: week ${reached[l.id] || 0}`).join(' · ')}{planWeek ? ` · plan is in week ${planWeek}` : ''}</p>
    </div>
  );
}
