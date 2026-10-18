import type { Goal, GoalResource, StudySession } from '@/types/db';

export interface ResourceProgress {
  /** 0..100, or null when progress cannot be expressed in pages and the item is not complete. */
  pct: number | null;
  done: number | null;
  total: number | null;
  remaining: number | null;
  hasRange: boolean;
}
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function assignedPages(r: Pick<GoalResource, 'start_page' | 'end_page'>): number | null {
  return r.start_page != null && r.end_page != null && r.end_page >= r.start_page ? r.end_page - r.start_page + 1 : null;
}

export function resourceProgress(r: Pick<GoalResource, 'status' | 'start_page' | 'end_page' | 'pages_done'>): ResourceProgress {
  const total = assignedPages(r);
  if (total === null) {
    return { pct: r.status === 'completed' ? 100 : null, done: null, total: null, remaining: null, hasRange: false };
  }
  const done = r.status === 'completed' ? total : clamp(r.pages_done, 0, total);
  return { pct: clamp(Math.round((done / total) * 100), 0, 100), done, total, remaining: total - done, hasRange: true };
}

/** Pages a learner can legitimately record as "current page" (inside the assigned range). */
export function clampPage(page: number, r: Pick<GoalResource, 'start_page' | 'end_page'>): number {
  if (r.start_page == null || r.end_page == null) return Math.max(1, Math.round(page));
  return clamp(Math.round(page), r.start_page, r.end_page);
}

/** Progress of a goal: mean of its resources (unknown-progress items count 0 until completed); manual % if no resources. */
export function goalProgress(goal: Pick<Goal, 'status' | 'progress_manual'>, resources: GoalResource[]): number {
  if (goal.status === 'completed') return 100;
  if (resources.length === 0) return clamp(goal.progress_manual ?? 0, 0, 100);
  const sum = resources.reduce((acc, r) => acc + (resourceProgress(r).pct ?? 0), 0);
  return clamp(Math.round(sum / resources.length), 0, 100);
}

export function resourcesRemainingMinutes(rs: GoalResource[]): number {
  return rs.reduce((acc, r) => {
    if (r.status === 'completed' || r.est_minutes == null) return acc;
    const p = resourceProgress(r).pct;
    return acc + Math.round(r.est_minutes * (1 - (p ?? 0) / 100));
  }, 0);
}

export function activeSessions(sessions: StudySession[]): StudySession[] { return sessions.filter((s) => !s.voided_at); }

export function minutesByLearner(sessions: StudySession[], from: Date, to: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of activeSessions(sessions)) {
    const t = new Date(s.started_at).getTime();
    if (t >= from.getTime() && t < to.getTime()) out[s.learner_id] = (out[s.learner_id] ?? 0) + s.minutes;
  }
  return out;
}

export interface WeeklyCommitment { total: number; completed: number; inProgress: number; postponed: number; overdue: number; pct: number }
/** Weekly commitment counts goals whose ORIGINAL deadline falls in the week; postponed unfinished work is never counted as completed. */
export function weeklyCommitment(goals: Goal[], weekStartISO: string, weekEndISO: string, today: string): WeeklyCommitment {
  const mine = goals.filter((g) => g.status !== 'dropped' && g.original_deadline >= weekStartISO && g.original_deadline <= weekEndISO);
  const completed = mine.filter((g) => g.status === 'completed').length;
  const postponed = mine.filter((g) => g.status !== 'completed' && g.deadline > g.original_deadline).length;
  const overdue = mine.filter((g) => g.status !== 'completed' && g.deadline < today).length;
  const inProgress = mine.filter((g) => g.status === 'in_progress').length;
  return { total: mine.length, completed, inProgress, postponed, overdue, pct: mine.length ? Math.round((completed / mine.length) * 100) : 0 };
}

/** Even page split helper for planning big books. Result is mechanical (NOT chapter-aligned). */
export function evenSplit(startPage: number, endPage: number, parts: number): Array<[number, number]> {
  const total = endPage - startPage + 1;
  if (total <= 0 || parts <= 0) return [];
  const n = Math.min(parts, total);
  const base = Math.floor(total / n); let extra = total % n; let cur = startPage;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) { const len = base + (extra > 0 ? 1 : 0); if (extra > 0) extra--; out.push([cur, cur + len - 1]); cur += len; }
  return out;
}
