import { describe, it, expect } from 'vitest';
import { activeDaysThisWeek, momentum, reviewsThisWeek, weekCompletion, weeklyMinutes } from './stats';
import { validatePageRange, wordSchema, newKeySchema, goalSchema } from '../validation';
import type { Goal, StudySession, VocabReviewLog } from '@/types/db';

const S = (learner: string, iso: string, minutes = 20, o: Partial<StudySession> = {}): StudySession => ({ id: iso + learner, learner_id: learner, goal_id: null, goal_resource_id: null, label: null, started_at: iso, ended_at: null, minutes, source: 'manual', start_page: null, end_page: null, interrupted: false, note: null, voided_at: null, void_reason: null, created_at: iso, ...o });
const now = new Date(2026, 9, 18, 12); // Sunday 18 Oct 2026

describe('stats', () => {
  it('buckets minutes into Monday-based weeks, oldest first', () => {
    const rows = weeklyMinutes([S('a', '2026-10-13T10:00:00'), S('a', '2026-10-05T10:00:00', 40), S('b', '2026-10-17T10:00:00', 15)], ['a', 'b'], 3, now);
    expect(rows.map((r) => r.weekStart)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12']);
    expect(rows[2].weekStart).toBe('2026-10-12'); expect(rows[2].byLearner).toEqual({ a: 20, b: 15 }); expect(rows[1].byLearner.a).toBe(40);
  });
  it('counts active days (not streaks) and ignores voided sessions', () => {
    const ss = [S('a', '2026-10-13T08:00:00'), S('a', '2026-10-13T20:00:00'), S('a', '2026-10-15T08:00:00'), S('a', '2026-10-16T08:00:00', 20, { voided_at: 'x', void_reason: 'dup' })];
    expect(activeDaysThisWeek(ss, 'a', now)).toBe(2);
  });
  it('momentum compares the last 4 full weeks with the 4 before and needs a baseline', () => {
    expect(momentum([], 'a', now).change).toBeNull();
    const ss = [S('a', '2026-09-20T10:00:00', 40), S('a', '2026-08-30T10:00:00', 40), S('a', '2026-09-27T10:00:00', 80)];
    const m = momentum(ss, 'a', now); expect(m.recent).toBeGreaterThan(m.prior);
  });
  it('counts weekly reviews and per-week goal completion by original deadline', () => {
    const log = [{ learner_id: 'a', reviewed_at: '2026-10-14T10:00:00' }, { learner_id: 'a', reviewed_at: '2026-10-01T10:00:00' }] as VocabReviewLog[];
    expect(reviewsThisWeek(log, 'a', now)).toBe(1);
    const g = (o: Partial<Goal>) => ({ scope: 'personal', owner_id: 'a', status: 'planned', original_deadline: '2026-10-14', ...o }) as Goal;
    const cells = weekCompletion([g({ status: 'completed' }), g({}), g({ owner_id: 'b' }), g({ scope: 'shared', owner_id: null, original_deadline: '2026-10-20' }), g({ status: 'dropped' })], 'a', '2026-10-12', 3);
    expect(cells).toEqual([{ total: 2, done: 1 }, { total: 1, done: 0 }, { total: 0, done: 0 }]);
  });
});

describe('validation', () => {
  it('validates page ranges against the real page count', () => {
    expect(validatePageRange({ start: '', end: '', pageCount: 100 })).toBeNull();
    expect(validatePageRange({ start: '5', end: '', pageCount: 100 })).toMatch(/both/i);
    expect(validatePageRange({ start: '9', end: '3', pageCount: 100 })).toMatch(/before/i);
    expect(validatePageRange({ start: '1', end: '101', pageCount: 100 })).toMatch(/only 100 pages/);
    expect(validatePageRange({ start: '1.5', end: '3', pageCount: null })).toMatch(/whole/i);
    expect(validatePageRange({ start: '10', end: '19', pageCount: 106 })).toBeNull();
  });
  const base = { german: 'Tisch', word_type: 'noun', article: 'der', plural: 'Tische', meaning_en: 'table', meaning_bn: 'টেবিল', pronunciation: '', pronunciation_verified: false, translation_verified: false,
    example_de: '', example_en: '', example_bn: '', tags: '', level: '', source: '', details: {}, private_note: '' } as const;
  it('vocabulary: noun-only fields are rejected for verbs and a meaning is required; Bangla is accepted', () => {
    expect(wordSchema.safeParse(base).success).toBe(true);
    expect(wordSchema.safeParse({ ...base, word_type: 'verb' }).success).toBe(false);
    expect(wordSchema.safeParse({ ...base, word_type: 'verb', article: '', plural: '', details: { partizip2: 'gegangen' } }).success).toBe(true);
    expect(wordSchema.safeParse({ ...base, meaning_en: '', meaning_bn: '' }).success).toBe(false);
    expect(wordSchema.safeParse({ ...base, meaning_en: '' }).success).toBe(true);
  });
  it('access-key change requires matching, different, long-enough keys', () => {
    expect(newKeySchema.safeParse({ current: 'old-key-1', next: 'new-key-123', confirm: 'new-key-123' }).success).toBe(true);
    expect(newKeySchema.safeParse({ current: 'old-key-1', next: 'short', confirm: 'short' }).success).toBe(false);
    expect(newKeySchema.safeParse({ current: 'old-key-1', next: 'new-key-123', confirm: 'nope' }).success).toBe(false);
    expect(newKeySchema.safeParse({ current: 'same-key-1', next: 'same-key-1', confirm: 'same-key-1' }).success).toBe(false);
  });
  it('goal needs a title and a deadline not before the week start', () => {
    expect(goalSchema.safeParse({ title: 'x', deadline: '2026-10-18', week_start: '2026-10-12' }).success).toBe(true);
    expect(goalSchema.safeParse({ title: '', deadline: '2026-10-18', week_start: '2026-10-12' }).success).toBe(false);
    expect(goalSchema.safeParse({ title: 'x', deadline: '2026-10-01', week_start: '2026-10-12' }).success).toBe(false);
  });
});
