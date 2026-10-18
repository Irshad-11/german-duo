import { addDays, parseISO, startOfWeek, toISO } from './dates';
import type { Goal, StudySession, VocabReviewLog } from '@/types/db';

const valid = (s: StudySession) => !s.voided_at;

/** Minutes per learner for each of the last `weeks` weeks (oldest first, current week last). */
export function weeklyMinutes(sessions: StudySession[], learnerIds: string[], weeks: number, now: Date = new Date()) {
  const thisWeek = startOfWeek(now);
  const out = Array.from({ length: weeks }, (_, i) => {
    const start = addDays(thisWeek, -(weeks - 1 - i) * 7);
    const row: { weekStart: string; byLearner: Record<string, number> } = { weekStart: toISO(start), byLearner: Object.fromEntries(learnerIds.map((id) => [id, 0])) };
    return row;
  });
  const idx = new Map(out.map((r, i) => [r.weekStart, i]));
  for (const s of sessions) {
    if (!valid(s)) continue;
    const k = toISO(startOfWeek(new Date(s.started_at)));
    const i = idx.get(k);
    if (i !== undefined && s.learner_id in out[i].byLearner) out[i].byLearner[s.learner_id] += s.minutes;
  }
  return out;
}

/** Distinct days with at least one session in the current Monday-based week (a gentle consistency signal — not a streak). */
export function activeDaysThisWeek(sessions: StudySession[], learnerId: string, now: Date = new Date()): number {
  const start = startOfWeek(now).getTime(); const end = addDays(startOfWeek(now), 7).getTime();
  const days = new Set<string>();
  for (const s of sessions) { const t = new Date(s.started_at); if (valid(s) && s.learner_id === learnerId && t.getTime() >= start && t.getTime() < end) days.add(toISO(t)); }
  return days.size;
}

/** Momentum = average weekly minutes of the last 4 full weeks vs the 4 before (percent change; null when no baseline). */
export function momentum(sessions: StudySession[], learnerId: string, now: Date = new Date()): { recent: number; prior: number; change: number | null } {
  const rows = weeklyMinutes(sessions, [learnerId], 9, now).slice(0, 8);   // exclude the in-progress week
  const sum = (a: typeof rows) => a.reduce((acc, r) => acc + (r.byLearner[learnerId] ?? 0), 0) / 4;
  const prior = sum(rows.slice(0, 4)); const recent = sum(rows.slice(4));
  return { recent: Math.round(recent), prior: Math.round(prior), change: prior > 0 ? Math.round(((recent - prior) / prior) * 100) : null };
}

export function totalMinutes(sessions: StudySession[], learnerId: string): number {
  return sessions.filter((s) => valid(s) && s.learner_id === learnerId).reduce((a, s) => a + s.minutes, 0);
}

export function reviewsThisWeek(log: VocabReviewLog[], learnerId: string, now: Date = new Date()): number {
  const start = startOfWeek(now).getTime();
  return log.filter((l) => l.learner_id === learnerId && new Date(l.reviewed_at).getTime() >= start).length;
}

/** Per-week completion ratio for the plan strip. Counts goals by ORIGINAL deadline week; dropped goals are excluded. */
export function weekCompletion(goals: Goal[], learnerId: string, planStartISO: string, weeks: number) {
  const base = startOfWeek(parseISO(planStartISO));
  const cells = Array.from({ length: weeks }, () => ({ total: 0, done: 0 }));
  for (const g of goals) {
    if (g.status === 'dropped') continue;
    if (!(g.scope === 'shared' || g.owner_id === learnerId)) continue;
    const i = Math.floor((startOfWeek(parseISO(g.original_deadline)).getTime() - base.getTime()) / (7 * 86400000));
    if (i >= 0 && i < weeks) { cells[i].total++; if (g.status === 'completed') cells[i].done++; }
  }
  return cells;
}
