import type { Goal, GoalProgress, GoalResource } from '@/types/db';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const assignedPages = (r: Pick<GoalResource, 'start_page' | 'end_page'>): number | null =>
  r.start_page != null && r.end_page != null && r.end_page >= r.start_page ? r.end_page - r.start_page + 1 : null;

export interface Measured { pct: number | null; done: number | null; total: number | null; unit: 'pages' | string | null; remaining: number | null; completed: boolean; /** the % was typed in by the learner */ manual: boolean }
type PRow = (Pick<GoalProgress, 'status' | 'pages_done' | 'measure_done'> & Partial<Pick<GoalProgress, 'manual_pct' | 'ready_for_questions'>>) | undefined | null;

/** A task is for both learners unless it names one person. */
export const appliesTo = (r: { assignee_id?: string | null }, learnerId: string): boolean => !r.assignee_id || r.assignee_id === learnerId;
/** The “ready for questions” badge: finished properly, so the other person may ask about it. (The old single status of the same name counts too.) */
export const isReadyForQuestions = (p: PRow): boolean => !!p && (p.ready_for_questions === true || p.status === 'ready_for_questions');

/** One learner's progress on one assignment. Finished = 100%. Otherwise a percentage typed in by hand wins; else pages; else a custom measure; else nothing is invented. Never above 100%. */
export function measure(r: Pick<GoalResource, 'start_page' | 'end_page' | 'measure_target' | 'measure_unit'>, p: PRow): Measured {
  const completed = p?.status === 'completed';
  const manual = !completed && p?.manual_pct != null;
  const hand = manual ? clamp(Math.round(Number(p!.manual_pct)), 0, 100) : null;
  const pages = assignedPages(r);
  if (pages !== null) {
    const done = completed ? pages : clamp(p?.pages_done ?? 0, 0, pages);
    return { pct: hand ?? clamp(Math.round((done / pages) * 100), 0, 100), done, total: pages, unit: 'pages', remaining: pages - done, completed, manual };
  }
  if (r.measure_target) {
    const done = completed ? r.measure_target : clamp(Number(p?.measure_done ?? 0), 0, r.measure_target);
    return { pct: hand ?? clamp(Math.round((done / r.measure_target) * 100), 0, 100), done, total: r.measure_target, unit: r.measure_unit ?? 'units', remaining: r.measure_target - done, completed, manual };
  }
  return { pct: completed ? 100 : hand, done: null, total: null, unit: null, remaining: null, completed, manual };
}

/** Mean progress of one learner over the assignments meant for them (assignments without a measurable pct count 0 until completed). */
export function learnerGoalPct(resources: GoalResource[], progress: GoalProgress[], learnerId: string): number {
  const mine = resources.filter((r) => appliesTo(r, learnerId));
  if (!mine.length) return 0;
  const sum = mine.reduce((a, r) => a + (measure(r, progress.find((p) => p.goal_resource_id === r.id && p.learner_id === learnerId)).pct ?? 0), 0);
  return clamp(Math.round(sum / mine.length), 0, 100);
}

export interface Finish { learnerId: string; at: string }
const doneAt = (p: GoalProgress): string => p.completed_at ?? p.updated_at ?? '';
/** Who finished one assignment, earliest first. */
export function finishedOrder(r: Pick<GoalResource, 'id'>, progress: GoalProgress[], learnerIds: string[]): Finish[] {
  return learnerIds.flatMap((id) => { const p = progress.find((x) => x.goal_resource_id === r.id && x.learner_id === id); return p?.status === 'completed' ? [{ learnerId: id, at: doneAt(p) }] : []; })
    .sort((a, b) => a.at.localeCompare(b.at));
}
/** Who finished the WHOLE goal (every task meant for them), earliest first; “at” is the moment their last task was finished. */
export function goalFinishedOrder(resources: GoalResource[], progress: GoalProgress[], learnerIds: string[]): Finish[] {
  const out: Finish[] = [];
  for (const id of learnerIds) {
    const mine = resources.filter((r) => appliesTo(r, id)); if (!mine.length) continue;
    const ps = mine.map((r) => progress.find((x) => x.goal_resource_id === r.id && x.learner_id === id));
    if (ps.every((p) => p?.status === 'completed')) out.push({ learnerId: id, at: ps.map((p) => doneAt(p!)).sort().at(-1)! });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
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
/** A goal is done when each learner has completed every assignment meant for them (tasks for one person only count for that person). */
export function goalState(g: Pick<Goal, 'status' | 'start_date' | 'deadline'>, resources: GoalResource[], progress: GoalProgress[], learnerIds: string[], today: string): GoalState {
  if (g.status === 'dropped') return 'dropped';
  const done = resources.length > 0 && learnerIds.length > 0 && resources.every((r) => learnerIds.filter((l) => appliesTo(r, l)).every((l) => progress.find((p) => p.goal_resource_id === r.id && p.learner_id === l)?.status === 'completed'));
  if (done) return 'done';
  if (g.deadline < today) return 'overdue';
  return g.start_date > today ? 'upcoming' : 'active';
}
