import { describe, it, expect } from 'vitest';
import { resourceProgress, goalProgress, evenSplit, weeklyCommitment, clampPage, minutesByLearner } from './progress';
import { schedule, INITIAL_SRS, isDue } from './srs';
import { quickActions, requiresCorrection, STATUSES } from './status';
import { checkResourceUrl } from './links';
import { planWeekNumber, startOfWeek, toISO, parseISO, weekStartISO, isOverdue, formatMinutes, totalPlanWeeks } from './dates';
import type { Goal, GoalResource, StudySession } from '@/types/db';

const res = (o: Partial<GoalResource> = {}): GoalResource => ({
  id: 'r', goal_id: 'g', resource_id: null, title: 't', filename: null, level: 'A1', category: null, source_folder: null, file_type: 'pdf', page_count: 106,
  start_page: 10, end_page: 19, external_url: null, instructions: null, est_minutes: 60, priority: 2, notes: null, position: 0, status: 'reading', current_page: 12,
  pages_done: 3, total_minutes: 0, help_note: null, status_changed_at: '', completed_at: null, completed_by: null, last_activity_at: null, version: 1, created_at: '', updated_at: '', ...o,
});
const goal = (o: Partial<Goal> = {}): Goal => ({
  id: 'g', plan_id: null, scope: 'personal', owner_id: 'a', title: 'x', description: null, week_start: '2026-10-12', deadline: '2026-10-18', original_deadline: '2026-10-18',
  priority: 2, est_minutes: null, status: 'planned', progress_manual: null, postpone_policy: 'mutual', curriculum_week: null, created_by: 'a', completed_at: null, version: 1, created_at: '', updated_at: '', ...o,
});

describe('page-level progress', () => {
  it('computes assigned range progress and never exceeds 100%', () => {
    expect(resourceProgress(res())).toMatchObject({ pct: 30, done: 3, total: 10, remaining: 7, hasRange: true });
    expect(resourceProgress(res({ pages_done: 999 })).pct).toBe(100);
    expect(resourceProgress(res({ pages_done: -5 })).pct).toBe(0);
  });
  it('treats a completed assignment as 100% regardless of pages_done', () => {
    expect(resourceProgress(res({ status: 'completed', pages_done: 2 })).pct).toBe(100);
  });
  it('handles missing page ranges without inventing a percentage', () => {
    const p = resourceProgress(res({ start_page: null, end_page: null, page_count: null }));
    expect(p.pct).toBeNull(); expect(p.hasRange).toBe(false);
    expect(resourceProgress(res({ start_page: null, end_page: null, status: 'completed' })).pct).toBe(100);
  });
  it('clamps the current page into the assigned range', () => {
    expect(clampPage(200, res())).toBe(19); expect(clampPage(1, res())).toBe(10); expect(clampPage(14.4, res())).toBe(14);
  });
  it('goal progress averages resources; unknown items count as 0 until done', () => {
    const rs = [res({ pages_done: 10 }), res({ start_page: null, end_page: null }), res({ status: 'completed' }), res({ pages_done: 0 })];
    expect(goalProgress(goal(), rs)).toBe(Math.round((100 + 0 + 100 + 0) / 4));
    expect(goalProgress(goal({ status: 'completed' }), [])).toBe(100);
    expect(goalProgress(goal({ progress_manual: 40 }), [])).toBe(40);
    expect(goalProgress(goal({ progress_manual: 400 }), [])).toBe(100);
  });
  it('splits pages evenly without gaps or overlaps', () => {
    const parts = evenSplit(1, 106, 4);
    expect(parts[0][0]).toBe(1); expect(parts.at(-1)![1]).toBe(106);
    for (let i = 1; i < parts.length; i++) expect(parts[i][0]).toBe(parts[i - 1][1] + 1);
    expect(evenSplit(5, 7, 10)).toHaveLength(3); expect(evenSplit(5, 4, 2)).toEqual([]);
  });
});

describe('weekly commitment', () => {
  it('never counts postponed unfinished goals as completed', () => {
    const goals = [
      goal({ id: '1', status: 'completed' }),
      goal({ id: '2', deadline: '2026-10-25' }),               // postponed
      goal({ id: '3', status: 'dropped' }),
      goal({ id: '4', status: 'in_progress' }),
    ];
    const c = weeklyCommitment(goals, '2026-10-12', '2026-10-18', '2026-10-19');
    expect(c).toMatchObject({ total: 3, completed: 1, postponed: 1, inProgress: 1 });
    expect(c.pct).toBe(33); expect(c.overdue).toBe(1);
  });
  it('sums minutes per learner and ignores voided sessions', () => {
    const s = (o: Partial<StudySession>): StudySession => ({ id: 'x', learner_id: 'a', goal_id: null, goal_resource_id: null, label: null, started_at: '2026-10-14T10:00:00', ended_at: null, minutes: 20, source: 'manual', start_page: null, end_page: null, interrupted: false, note: null, voided_at: null, void_reason: null, created_at: '', ...o });
    const out = minutesByLearner([s({}), s({ learner_id: 'b', minutes: 30 }), s({ voided_at: 'now', void_reason: 'dup' }), s({ started_at: '2026-09-01T10:00:00' })], new Date(2026, 9, 12), new Date(2026, 9, 19));
    expect(out).toEqual({ a: 20, b: 30 });
  });
});

describe('spaced repetition', () => {
  const now = new Date('2026-10-18T10:00:00Z');
  it('expands intervals on successful recall', () => {
    let st = { ...INITIAL_SRS };
    const a = schedule(st, 'good', now); expect(a.interval_days).toBe(1); st = a;
    const b = schedule(st, 'good', now); expect(b.interval_days).toBe(3); st = b;
    const c = schedule(st, 'good', now); expect(c.interval_days).toBe(Math.round(3 * 2.5)); expect(c.repetitions).toBe(3);
  });
  it('relearns within minutes after "again" and counts lapses', () => {
    const r = schedule({ ease: 2.5, interval_days: 20, repetitions: 5, lapses: 0 }, 'again', now);
    expect(r.interval_days).toBe(0); expect(r.repetitions).toBe(0); expect(r.lapses).toBe(1);
    expect(r.due_at.getTime() - now.getTime()).toBe(10 * 60 * 1000); expect(r.ease).toBe(2.3);
  });
  it('keeps ease within bounds and easy grows faster than good', () => {
    let st = { ...INITIAL_SRS };
    for (let i = 0; i < 20; i++) st = schedule(st, 'again', now);
    expect(st.ease).toBe(1.3);
    const good = schedule({ ease: 2.5, interval_days: 6, repetitions: 3, lapses: 0 }, 'good', now);
    const easy = schedule({ ease: 2.5, interval_days: 6, repetitions: 3, lapses: 0 }, 'easy', now);
    expect(easy.interval_days).toBeGreaterThan(good.interval_days); expect(easy.ease).toBeLessThanOrEqual(3.5);
  });
  it('reports due state', () => { expect(isDue('2026-10-18T09:00:00Z', now)).toBe(true); expect(isDue('2026-10-19T09:00:00Z', now)).toBe(false); });
});

describe('statuses', () => {
  it('offers sensible quick actions and protects completion', () => {
    expect(STATUSES).toHaveLength(10);
    expect(quickActions('paused')).toContain('continuing');
    expect(quickActions('completed')).toEqual([]);
    expect(requiresCorrection('completed', 'reading')).toBe(true);
    expect(requiresCorrection('reading', 'completed')).toBe(false);
  });
});

describe('links', () => {
  it('accepts Drive file/folder links and flags broken ones', () => {
    expect(checkResourceUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing')).toMatchObject({ ok: true, kind: 'drive-file' });
    expect(checkResourceUrl('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp')).toMatchObject({ ok: true, kind: 'drive-folder' });
    expect(checkResourceUrl('https://drive.google.com/')).toMatchObject({ ok: false });
    expect(checkResourceUrl('')).toMatchObject({ ok: true, kind: null });
  });
  it('rejects non-http(s) and malformed links', () => {
    expect(checkResourceUrl('javascript:alert(1)').ok).toBe(false);
    expect(checkResourceUrl('not a url').ok).toBe(false);
    expect(checkResourceUrl('ftp://x.y/z').ok).toBe(false);
  });
});

describe('dates', () => {
  it('uses Monday-based weeks and plan week numbers', () => {
    expect(toISO(startOfWeek(new Date(2026, 9, 18)))).toBe('2026-10-12');   // Sunday 18 Oct 2026 -> Monday 12 Oct
    expect(weekStartISO(new Date(2026, 9, 12))).toBe('2026-10-12');
    expect(planWeekNumber('2026-10-12', new Date(2026, 9, 18))).toBe(1);
    expect(planWeekNumber('2026-10-12', new Date(2026, 9, 19))).toBe(2);
    expect(planWeekNumber('2026-10-14', new Date(2026, 9, 14))).toBe(1);
  });
  it('round-trips ISO dates without timezone drift', () => { expect(toISO(parseISO('2026-03-29'))).toBe('2026-03-29'); });
  it('detects overdue and spans a 365-day plan as 53 weeks max', () => {
    expect(isOverdue('2026-10-17', new Date(2026, 9, 18))).toBe(true); expect(isOverdue('2026-10-18', new Date(2026, 9, 18))).toBe(false);
    expect(totalPlanWeeks('2026-10-18', '2027-10-18')).toBe(53);
  });
  it('formats minutes', () => { expect(formatMinutes(0)).toBe('0 min'); expect(formatMinutes(95)).toBe('1 h 35 min'); expect(formatMinutes(120)).toBe('2 h'); });
});
