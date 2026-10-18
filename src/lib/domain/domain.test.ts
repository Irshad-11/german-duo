import { describe, it, expect } from 'vitest';
import { measure, learnerGoalPct, goalState, evenSplit, clampPage } from './progress';
import { schedule, INITIAL_SRS, isDue } from './srs';
import { checkResourceUrl } from './links';
import { planWeekNumber, startOfWeek, toISO, parseISO, isOverdue, formatMinutes, totalPlanWeeks } from './dates';
import { weeklyMinutes, activeDaysThisWeek, minutesInWeek, reviewsThisWeek } from './stats';
import { barBox, ganttRange, monthSpans, todayOffset, weekTicks, DAY_PX } from './gantt';
import { diffParts, describe as desc, unreadByTab, lastUpdateBy, formatValue } from './changelog';
import { validatePageRange, wordSchema, newKeySchema, goalSchema } from '../validation';
import type { ChangeEntry, Goal, GoalProgress, GoalResource, StudySession, VocabReviewLog } from '@/types/db';

const R = (o: Partial<GoalResource> = {}): GoalResource => ({ id: 'r1', goal_id: 'g', resource_id: null, title: 't', filename: null, level: 'A1', category: null, source_folder: null, file_type: 'pdf', page_count: 106, start_page: 10, end_page: 19,
  external_url: null, instructions: null, est_minutes: 60, measure_unit: null, measure_target: null, notes: null, position: 0, version: 1, created_at: '', updated_at: '', ...o });
const P = (o: Partial<GoalProgress> = {}): GoalProgress => ({ id: 'p', goal_resource_id: 'r1', learner_id: 'a', status: 'reading', current_page: 12, pages_done: 3, measure_done: 0, note: null, minutes_total: 0, last_activity_at: null, completed_at: null, version: 1, created_at: '', updated_at: '', ...o });
const G = (o: Partial<Goal> = {}): Goal => ({ id: 'g', plan_id: null, title: 'x', description: null, start_date: '2026-10-12', deadline: '2026-10-18', original_deadline: '2026-10-18', priority: 2, est_minutes: null, status: 'active', curriculum_week: null, created_by: null, version: 1, created_at: '', updated_at: '', ...o });

describe('measurable progress', () => {
  it('uses the assigned page range and never exceeds 100%', () => {
    expect(measure(R(), P())).toMatchObject({ pct: 30, done: 3, total: 10, remaining: 7, unit: 'pages' });
    expect(measure(R(), P({ pages_done: 99 })).pct).toBe(100);
    expect(measure(R(), P({ status: 'completed', pages_done: 1 })).pct).toBe(100);
    expect(measure(R(), undefined).pct).toBe(0);
  });
  it('falls back to a custom measure, then to completion only — without inventing a percentage', () => {
    const m = R({ start_page: null, end_page: null, measure_target: 20, measure_unit: 'exercises' });
    expect(measure(m, P({ measure_done: 5 }))).toMatchObject({ pct: 25, unit: 'exercises', total: 20 });
    expect(measure(m, P({ measure_done: 50 })).pct).toBe(100);
    const bare = R({ start_page: null, end_page: null });
    expect(measure(bare, P()).pct).toBeNull(); expect(measure(bare, P({ status: 'completed' })).pct).toBe(100);
  });
  it('averages per learner and reports a goal as done only when BOTH completed everything', () => {
    const rs = [R(), R({ id: 'r2' })];
    const prog = [P({ pages_done: 10 }), P({ goal_resource_id: 'r2', status: 'completed' }), P({ id: 'q', learner_id: 'b', pages_done: 5 })];
    expect(learnerGoalPct(rs, prog, 'a')).toBe(100); expect(learnerGoalPct(rs, prog, 'b')).toBe(25); expect(learnerGoalPct([], prog, 'a')).toBe(0);
    const doneA = [P({ status: 'completed' }), P({ goal_resource_id: 'r2', status: 'completed' })];
    expect(goalState(G(), rs, doneA, ['a', 'b'], '2026-10-14')).toBe('active');
    const both = [...doneA, ...doneA.map((p, i) => ({ ...p, id: 'b' + i, learner_id: 'b' }))];
    expect(goalState(G(), rs, both, ['a', 'b'], '2026-10-14')).toBe('done');
    expect(goalState(G({ deadline: '2026-10-01' }), rs, [], ['a', 'b'], '2026-10-14')).toBe('overdue');
    expect(goalState(G({ start_date: '2026-11-01', deadline: '2026-11-07' }), rs, [], ['a', 'b'], '2026-10-14')).toBe('upcoming');
    expect(goalState(G({ status: 'dropped' }), rs, [], ['a', 'b'], '2026-10-14')).toBe('dropped');
  });
  it('clamps pages and splits books without gaps', () => {
    expect(clampPage(200, R())).toBe(19); expect(clampPage(1, R())).toBe(10);
    const parts = evenSplit(1, 106, 4); expect(parts[0][0]).toBe(1); expect(parts.at(-1)![1]).toBe(106);
    for (let i = 1; i < parts.length; i++) expect(parts[i][0]).toBe(parts[i - 1][1] + 1);
  });
});

describe('spaced repetition', () => {
  const now = new Date('2026-10-18T10:00:00Z');
  it('expands intervals, relearns after a miss, keeps ease bounded', () => {
    let st = { ...INITIAL_SRS }; st = schedule(st, 'good', now); expect(st.interval_days).toBe(1); st = schedule(st, 'good', now); expect(st.interval_days).toBe(3); st = schedule(st, 'good', now); expect(st.interval_days).toBe(8);
    const miss = schedule(st, 'again', now); expect(miss.interval_days).toBe(0); expect(miss.lapses).toBe(1); expect(miss.due_at.getTime() - now.getTime()).toBe(600000);
    let low = { ...INITIAL_SRS }; for (let i = 0; i < 20; i++) low = schedule(low, 'again', now); expect(low.ease).toBe(1.3);
    expect(isDue('2026-10-18T09:00:00Z', now)).toBe(true); expect(isDue('2026-10-19T09:00:00Z', now)).toBe(false);
  });
});

describe('links, dates, validation', () => {
  it('validates link shape', () => {
    expect(checkResourceUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view')).toMatchObject({ ok: true, kind: 'drive-file' });
    expect(checkResourceUrl('https://drive.google.com/')).toMatchObject({ ok: false }); expect(checkResourceUrl('javascript:alert(1)').ok).toBe(false); expect(checkResourceUrl('')).toMatchObject({ ok: true });
  });
  it('Monday weeks, plan weeks, overdue, minutes', () => {
    expect(toISO(startOfWeek(new Date(2026, 9, 18)))).toBe('2026-10-12'); expect(planWeekNumber('2026-10-12', new Date(2026, 9, 19))).toBe(2); expect(toISO(parseISO('2026-03-29'))).toBe('2026-03-29');
    expect(isOverdue('2026-10-17', new Date(2026, 9, 18))).toBe(true); expect(totalPlanWeeks('2026-10-18', '2027-10-18')).toBe(53); expect(formatMinutes(95)).toBe('1 h 35 min');
  });
  it('page ranges, words, key change and goals', () => {
    expect(validatePageRange({ start: '1', end: '101', pageCount: 100 })).toMatch(/only 100/); expect(validatePageRange({ start: '10', end: '19', pageCount: 106 })).toBeNull(); expect(validatePageRange({ start: '9', end: '3', pageCount: null })).toMatch(/before/);
    const base = { german: 'Tisch', word_type: 'noun', article: 'der', plural: 'Tische', meaning_en: 'table', meaning_bn: 'টেবিল', pronunciation: '', pronunciation_verified: false, translation_verified: false, example_de: '', example_en: '', example_bn: '', tags: '', level: '', source: '', details: {}, private_note: '' } as const;
    expect(wordSchema.safeParse(base).success).toBe(true); expect(wordSchema.safeParse({ ...base, word_type: 'verb' }).success).toBe(false); expect(wordSchema.safeParse({ ...base, meaning_en: '', meaning_bn: '' }).success).toBe(false);
    expect(newKeySchema.safeParse({ current: 'old-key-1', next: 'new-key-123', confirm: 'new-key-123' }).success).toBe(true); expect(newKeySchema.safeParse({ current: 'old-key-1', next: 'short', confirm: 'short' }).success).toBe(false);
    expect(goalSchema.safeParse({ title: 'x', deadline: '2026-10-18', week_start: '2026-10-12' }).success).toBe(true); expect(goalSchema.safeParse({ title: 'x', deadline: '2026-10-01', week_start: '2026-10-12' }).success).toBe(false);
  });
});

const S = (l: string, iso: string, minutes = 20): StudySession => ({ id: iso + l, learner_id: l, goal_id: null, goal_resource_id: null, label: null, started_at: iso, ended_at: null, minutes, source: 'manual', start_page: null, end_page: null, measure_amount: null, interrupted: false, note: null, created_at: iso });
const now = new Date(2026, 9, 18, 12);
describe('stats', () => {
  it('buckets minutes by Monday week and counts study days (not streaks)', () => {
    const ss = [S('a', '2026-10-13T08:00:00'), S('a', '2026-10-13T20:00:00'), S('a', '2026-10-15T08:00:00'), S('b', '2026-10-05T10:00:00', 40)];
    const rows = weeklyMinutes(ss, ['a', 'b'], 3, now); expect(rows.map((r) => r.weekStart)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12']); expect(rows[2].byLearner.a).toBe(60); expect(rows[1].byLearner.b).toBe(40);
    expect(activeDaysThisWeek(ss, 'a', now)).toBe(2); expect(minutesInWeek(ss, 'a', now)).toBe(60);
    expect(reviewsThisWeek([{ learner_id: 'a', reviewed_at: '2026-10-14T10:00:00' }, { learner_id: 'a', reviewed_at: '2026-10-01T10:00:00' }] as VocabReviewLog[], 'a', now)).toBe(1);
  });
});

describe('gantt layout', () => {
  const goal = { start_date: '2026-10-14', deadline: '2026-10-20', original_deadline: '2026-10-18' };
  it('limits the range to the plan (whole weeks) and positions bars by day', () => {
    const range = ganttRange('2026-10-14', '2027-01-10', [goal]);
    expect(range.start).toBe('2026-10-12'); expect(range.end).toBe('2027-01-10'); expect(range.days % 7).toBe(0);
    const b = barBox(goal, range, 10); expect(b.left).toBe(20); expect(b.width).toBe(70); expect(b.origRight).toBe(20);
    expect(barBox({ ...goal, original_deadline: '2026-10-20' }, range, 10).origRight).toBeNull();
    expect(todayOffset(range, 10, '2026-10-12')).toBe(5); expect(todayOffset(range, 10, '2026-01-01')).toBeNull();
    expect(weekTicks(range)).toHaveLength(range.days / 7); expect(monthSpans(range).reduce((a, m) => a + m.days, 0)).toBe(range.days);
    expect(DAY_PX.days).toBeGreaterThan(DAY_PX.weeks);
  });
  it('still renders when nothing is planned', () => { expect(ganttRange(null, null, []).days).toBeGreaterThan(0); });
});

describe('change log helpers', () => {
  const E = (o: Partial<ChangeEntry>): ChangeEntry => ({ id: 1, actor_id: 'b', table_name: 'goal_progress', row_id: 'x', op: 'UPDATE', label: 'Menschen', changes: { status: ['reading', 'paused'], version: [1, 2], pages_done: [3, 5] }, old_row: null, new_row: null, txid: 1, revert_of: null, reverted_at: null, reverted_by: null, created_at: '2026-10-18T10:00:00Z', ...o });
  it('turns changes into readable field diffs and hides bookkeeping fields', () => {
    expect(diffParts(E({}))).toEqual([{ field: 'status', from: 'Reading', to: 'Paused' }, { field: 'pages done', from: '3', to: '5' }]);
    expect(desc(E({}))).toBe('Changed progress'); expect(desc(E({ op: 'DELETE', table_name: 'goals' }))).toBe('Deleted goal'); expect(desc(E({ revert_of: 4 }))).toBe('Reverted progress');
    expect(formatValue('x', null)).toBe('—'); expect(formatValue('priority', 1)).toBe('high'); expect(formatValue('x', 'a'.repeat(80)).length).toBeLessThan(50);
  });
  it('counts only the OTHER person’s changes since a tab was last seen', () => {
    const log = [E({ id: 3, created_at: '2026-10-18T12:00:00Z' }), E({ id: 2, actor_id: 'a', created_at: '2026-10-18T12:00:00Z' }), E({ id: 1, table_name: 'vocab_words', created_at: '2026-10-18T09:00:00Z' }), E({ id: 4, table_name: 'notes', created_at: '2026-10-18T13:00:00Z' })];
    expect(unreadByTab(log, { plan: '2026-10-18T11:00:00Z', words: '2026-10-18T10:00:00Z' }, 'a')).toEqual({ plan: 1, notes: 1 });
    expect(unreadByTab(log, {}, 'a')).toEqual({ plan: 1, words: 1, notes: 1 }); expect(unreadByTab(log, {}, undefined)).toEqual({});
    expect(lastUpdateBy(log).b.id).toBe(4); expect(lastUpdateBy(log).a.id).toBe(2);
  });
});
