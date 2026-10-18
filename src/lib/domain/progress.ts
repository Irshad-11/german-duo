import type { Goal, GoalProgress, GoalResource } from '@/types/db';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const assignedPages = (r: Pick<GoalResource, 'start_page' | 'end_page'>): number | null =>
  r.start_page != null && r.end_page != null && r.end_page >= r.start_page ? r.end_page - r.start_page + 1 : null;

export interface Measured { pct: number | null; done: number | null; total: number | null; unit: 'pages' | string | null; remaining: number | null; completed: boolean }
type PRow = Pick<GoalProgress, 'status' | 'pages_done' | 'measure_done'> | undefined | null;

/** One learner's measurable progress on one assignment. Pages win; else a custom measure; else only "completed" counts. Never above 100%. */
export function measure(r: Pick<GoalResource, 'start_page' | 'end_page' | 'measure_target' | 'measure_unit'>, p: PRow): Measured {
  const completed = p?.status === 'completed';
  const pages = assignedPages(r);
  if (pages !== null) {
    const done = completed ? pages : clamp(p?.pages_done ?? 0, 0, pages);
    return { pct: clamp(Math.round((done / pages) * 100), 0, 100), done, total: pages, unit: 'pages', remaining: pages - done, completed };
  }
  if (r.measure_target) {
    const done = completed ? r.measure_target : clamp(Number(p?.measure_done ?? 0), 0, r.measure_target);
    return { pct: clamp(Math.round((done / r.measure_target) * 100), 0, 100), done, total: r.measure_target, unit: r.measure_unit ?? 'units', remaining: r.measure_target - done, completed };
  }
  return { pct: completed ? 100 : null, done: null, total: null, unit: null, remaining: null, completed };
}

/** Mean progress of one learner over a goal's assignments (assignments without a measurable pct count 0 until completed). */
export function learnerGoalPct(resources: GoalResource[], progress: GoalProgress[], learnerId: string): number {
  if (!resources.length) return 0;
  const sum = resources.reduce((a, r) => a + (measure(r, progress.find((p) => p.goal_resource_id === r.id && p.learner_id === learnerId)).pct ?? 0), 0);
  return clamp(Math.round(sum / resources.length), 0, 100);
}
export const clampPage = (page: number, r: Pick<GoalResource, 'start_page' | 'end_page'>): number =>
  r.start_page == null || r.end_page == null ? Math.max(1, Math.round(page)) : clamp(Math.round(page), r.start_page, r.end_page);

export function evenSplit(startPage: number, endPage: number, parts: number): Array<[number, number]> {
  const total = endPage - startPage + 1;
  if (total <= 0 || parts <= 0) return [];
  const n = Math.min(parts, total); const base = Math.floor(total / n); let extra = total % n; let cur = startPage;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) { const len = base + (extra > 0 ? 1 : 0); if (extra > 0) extra--; out.push([cur, cur + len - 1]); cur += len; }
  return out;
}

export type GoalState = 'upcoming' | 'active' | 'overdue' | 'done' | 'dropped';
/** A goal is done when BOTH learners have completed every assignment. */
export function goalState(g: Pick<Goal, 'status' | 'start_date' | 'deadline'>, resources: GoalResource[], progress: GoalProgress[], learnerIds: string[], today: string): GoalState {
  if (g.status === 'dropped') return 'dropped';
  const done = resources.length > 0 && learnerIds.length > 0 && resources.every((r) => learnerIds.every((l) => progress.find((p) => p.goal_resource_id === r.id && p.learner_id === l)?.status === 'completed'));
  if (done) return 'done';
  if (g.deadline < today) return 'overdue';
  return g.start_date > today ? 'upcoming' : 'active';
}
