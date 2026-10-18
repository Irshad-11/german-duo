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
