import { formatDay, formatMinutes } from '@/lib/domain/dates';
import type { Learner } from '@/types/db';

interface Row { weekStart: string; byLearner: Record<string, number> }

/** Grouped weekly-minutes bars (SVG, theme-aware via CSS variables). Includes a visually hidden data table for screen readers. */
export function GroupedBars({ rows, learners }: { rows: Row[]; learners: Learner[] }) {
  const max = Math.max(30, ...rows.flatMap((r) => Object.values(r.byLearner)));
  const W = 320; const H = 150; const padB = 22; const padT = 8; const gw = W / rows.length; const bw = Math.min(14, (gw - 8) / Math.max(1, learners.length));
  const y = (v: number) => padT + (H - padB - padT) * (1 - v / max);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Study minutes per week for each learner, last 8 weeks" preserveAspectRatio="xMidYMid meet">
        {[0.5, 1].map((t) => <line key={t} x1="0" x2={W} y1={y(max * t)} y2={y(max * t)} className="chart-grid" />)}
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="chart-axis" />
        {rows.map((r, i) => (
          <g key={r.weekStart} transform={`translate(${i * gw + gw / 2 - (bw * learners.length) / 2}, 0)`}>
            {learners.map((l, j) => {
              const v = r.byLearner[l.id] ?? 0;
              return <rect key={l.id} x={j * bw} y={y(v)} width={bw - 2} height={Math.max(v > 0 ? 2 : 0, y(0) - y(v))} rx="3" className={`bar-${l.accent}`}><title>{l.display_name}: {formatMinutes(v)}</title></rect>;
            })}
            <text x={(bw * learners.length) / 2} y={H - 6} textAnchor="middle" className="chart-tick">{formatDay(r.weekStart).replace(/ \w+$/, '')}</text>
          </g>
        ))}
        <text x="2" y="10" className="chart-tick">{formatMinutes(max)}</text>
      </svg>
      <figcaption className="legend">{learners.map((l) => <span key={l.id}><i className={`sw sw-${l.accent}`} aria-hidden />{l.display_name}</span>)}</figcaption>
      <table className="sr-only"><caption>Study minutes per week</caption>
        <thead><tr><th>Week starting</th>{learners.map((l) => <th key={l.id}>{l.display_name}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.weekStart}><th>{r.weekStart}</th>{learners.map((l) => <td key={l.id}>{r.byLearner[l.id] ?? 0}</td>)}</tr>)}</tbody></table>
    </figure>
  );
}

/** One row of week cells per learner; cell shade = share of that week's goals completed. */
export function PlanStrip({ lanes, currentWeek }: { lanes: Array<{ learner: Learner; cells: Array<{ total: number; done: number }> }>; currentWeek: number }) {
  return (
    <div className="strip" role="group" aria-label="Weekly goal completion across the plan">
      {lanes.map(({ learner, cells }) => (
        <div key={learner.id} className="strip-lane">
          <span className={`strip-name txt-${learner.accent}`}>{learner.code}</span>
          <div className="strip-cells">
            {cells.map((c, i) => {
              const ratio = c.total ? c.done / c.total : 0;
              return <i key={i} className={`cell cell-${learner.accent} ${i + 1 === currentWeek ? 'cell-now' : ''} ${c.total === 0 ? 'cell-empty' : ''}`}
                style={{ ['--fill' as string]: ratio }} title={`Week ${i + 1}: ${c.total ? `${c.done}/${c.total} goals done` : 'no goals'}`} />;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Friendly head-to-head split bar. */
export function TugBar({ a, b, la, lb, unit }: { a: number; b: number; la: Learner; lb: Learner; unit: string }) {
  const total = a + b;
  const pa = total ? (a / total) * 100 : 50;
  return (
    <div className="tug" role="img" aria-label={`${la.display_name} ${a} ${unit}, ${lb.display_name} ${b} ${unit}`}>
      <div className="tug-bar"><span className={`bar-${la.accent}`} style={{ width: `${pa}%` }} /><span className={`bar-${lb.accent}`} style={{ width: `${100 - pa}%` }} /></div>
    </div>
  );
}
