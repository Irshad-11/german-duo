import { addDays, parseISO, startOfWeek, toISO } from './dates';
import type { StudySession, VocabReviewLog } from '@/types/db';

export function weeklyMinutes(sessions: StudySession[], learnerIds: string[], weeks: number, now: Date = new Date()) {
  const thisWeek = startOfWeek(now);
  const out = Array.from({ length: weeks }, (_, i) => ({ weekStart: toISO(addDays(thisWeek, -(weeks - 1 - i) * 7)), byLearner: Object.fromEntries(learnerIds.map((id) => [id, 0])) as Record<string, number> }));
  const idx = new Map(out.map((r, i) => [r.weekStart, i]));
  for (const s of sessions) { const i = idx.get(toISO(startOfWeek(new Date(s.started_at)))); if (i !== undefined && s.learner_id in out[i].byLearner) out[i].byLearner[s.learner_id] += s.minutes; }
  return out;
}
/** Days with at least one session this week (a gentle consistency signal — not a streak). */
export function activeDaysThisWeek(sessions: StudySession[], learnerId: string, now: Date = new Date()): number {
  const a = startOfWeek(now).getTime(); const b = addDays(startOfWeek(now), 7).getTime(); const days = new Set<string>();
  for (const s of sessions) { const t = new Date(s.started_at); if (s.learner_id === learnerId && t.getTime() >= a && t.getTime() < b) days.add(toISO(t)); }
  return days.size;
}
export function minutesInWeek(sessions: StudySession[], learnerId: string, now: Date = new Date()): number {
  return weeklyMinutes(sessions, [learnerId], 1, now)[0].byLearner[learnerId];
}
export function totalMinutes(sessions: StudySession[], learnerId: string): number { return sessions.filter((s) => s.learner_id === learnerId).reduce((a, s) => a + s.minutes, 0); }
export function reviewsThisWeek(log: VocabReviewLog[], learnerId: string, now: Date = new Date()): number {
  const start = startOfWeek(now).getTime(); return log.filter((l) => l.learner_id === learnerId && new Date(l.reviewed_at).getTime() >= start).length;
}
export function daysBetweenISO(a: string, b: string): number { return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000); }
