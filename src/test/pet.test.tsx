import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TIPS, MOODS, PAGE_MOOD } from '@/pet/tips';
import { observe, upNext, type Ctx } from '@/pet/observe';
import { Orb } from '@/pet/Orb';
import { MaterialLinks } from '@/components/material';
import { DRIVE_ROOT_URL, driveSearchUrl } from '@/lib/config';
import { Journey, Heatmap } from '@/components/charts';
import { reachedCurriculumWeek } from '@/lib/domain/stats';
import { HOWTO } from '@/pet/PetDock';
import type { Goal, GoalProgress, GoalResource, Learner, StudySession } from '@/types/db';

const ir = { id: 'a', code: 'IR', display_name: 'Irshad', accent: 'blue' } as Learner; const la = { id: 'b', code: 'LA', display_name: 'Lamia', accent: 'orange' } as Learner;
const g = (o: Partial<Goal>) => ({ id: 'g1', title: 'Week 5', start_date: '2026-10-12', deadline: '2026-10-25', original_deadline: '2026-10-25', status: 'active', curriculum_week: 5, ...o }) as Goal;
const r = (o: Partial<GoalResource>) => ({ id: 'r1', goal_id: 'g1', title: 'Story 7', start_page: 1, end_page: 4, page_count: 4, measure_target: null, measure_unit: null, ...o }) as GoalResource;
const p = (o: Partial<GoalProgress>) => ({ id: 'p1', goal_resource_id: 'r1', learner_id: 'a', status: 'reading', current_page: 3, pages_done: 3, measure_done: 0, note: null, minutes_total: 0, ...o }) as GoalProgress;
const ctx = (o: Partial<Ctx> = {}): Ctx => ({ me: ir, other: la, learners: [ir, la], goals: [g({})], resources: [r({})], progress: [], sessions: [], words: [], wordState: [], notes: [], posts: [], messages: [], now: new Date(2026, 9, 18, 12), ...o });

describe('study helper orb', () => {
  it('has 100+ unique, non-empty tips across app help, German, habits and teamwork', () => {
    expect(TIPS.length).toBeGreaterThanOrEqual(100); expect(new Set(TIPS.map((t) => t.id)).size).toBe(TIPS.length);
    for (const t of TIPS) { expect(t.text.length, t.id).toBeGreaterThan(15); if (t.mood) expect(MOODS).toContain(t.mood); }
    for (const c of ['app', 'german', 'habit', 'together'] as const) expect(TIPS.filter((t) => t.cat === c).length, c).toBeGreaterThanOrEqual(10);
    expect(TIPS.filter((t) => t.page).length).toBeGreaterThan(20); expect(HOWTO.length).toBeGreaterThanOrEqual(8);
  });
  it('has 14 moods and draws every mood at every level, with one glowing ring per level', () => {
    expect(MOODS).toHaveLength(14);
    for (const m of MOODS) for (const lvl of [0, 1, 2, 3]) { const { container, unmount } = render(<Orb mood={m} level={lvl} />); expect(container.querySelector(`.orb-${m}.orb-l${lvl}`)).not.toBeNull(); expect(container.querySelectorAll('.orb-ring').length).toBe(lvl); unmount(); }
  });
  it('every mood has a face (two eyes + a mouth) and every page has a reaction', () => {
    for (const m of MOODS) { const { container, unmount } = render(<Orb mood={m} />); expect(container.querySelectorAll('.orb-eye'), m).toHaveLength(2); expect(container.querySelector('.orb-mouth'), m).not.toBeNull(); unmount(); }
    expect(Object.keys(PAGE_MOOD).sort()).toEqual(['chat', 'home', 'library', 'log', 'notes', 'notices', 'plan', 'settings', 'words']); for (const m of Object.values(PAGE_MOOD)) expect(MOODS).toContain(m);
  });
  it('notices what matters: help requests and postponements outrank routine suggestions', () => {
    const o = observe(ctx({ progress: [p({ learner_id: 'b', status: 'needs_help', note: 'stuck' })], posts: [{ id: 'q', goal_id: 'g1', requester_id: 'b', status: 'pending', proposed_deadline: '2026-11-01' } as never] }));
    expect(o[0].id).toMatch(/^post-/); expect(o.map((x) => x.id).some((x) => x.startsWith('help-'))).toBe(true); expect(o[0].priority).toBeGreaterThan(o.at(-1)!.priority);
  });
  it('celebrates when both studied today and nudges when nobody has', () => {
    const s = (l: string): StudySession => ({ id: l, learner_id: l, started_at: new Date(2026, 9, 18, 8).toISOString(), minutes: 20 }) as StudySession;
    expect(observe(ctx({ sessions: [s('a'), s('b')] })).some((x) => x.id === 'both')).toBe(true);
    expect(observe(ctx()).some((x) => x.id === 'none-today')).toBe(true);
    expect(observe(ctx({ goals: [] })).some((x) => x.id === 'no-goal')).toBe(true);
  });
  it('upNext puts started material first, skips finished ones and respects the limit', () => {
    const res = [r({ id: 'r1' }), r({ id: 'r2' }), r({ id: 'r3' })]; const prog = [p({ goal_resource_id: 'r2', status: 'reading' }), p({ id: 'x', goal_resource_id: 'r3', status: 'completed' })];
    expect(upNext(ctx({ resources: res, progress: prog }), 3).map((x) => x.r.id)).toEqual(['r2', 'r1']);
    expect(upNext(ctx({ resources: res, progress: prog }), 1)).toHaveLength(1);
  });
});

describe('drive links', () => {
  it('opens the saved file directly', () => { render(<MaterialLinks url="https://drive.google.com/file/d/abc/view" filename="x.pdf" title="X" />); expect(screen.getByRole('link', { name: /open file/i })).toHaveAttribute('href', 'https://drive.google.com/file/d/abc/view'); });
  it('without a link falls back to the shared root folder and a name search', () => {
    render(<MaterialLinks url={null} filename="Menschen A1-1 KB.pdf" title="Menschen" folder="A1/Books" />);
    expect(DRIVE_ROOT_URL).toBe('https://drive.google.com/drive/folders/1FC3aFLlm1TaABG1qnPCXOyHtlsyHg8Qw?usp=sharing');
    expect(screen.getByRole('link', { name: /open drive folder/i })).toHaveAttribute('href', DRIVE_ROOT_URL);
    expect(screen.getByRole('link', { name: /find in drive/i })).toHaveAttribute('href', driveSearchUrl('Menschen A1-1 KB.pdf')); expect(screen.getByText(/A1 › Books/)).toBeInTheDocument();
  });
});

describe('visuals', () => {
  it('journey shows each person’s furthest finished curriculum week; heat map is labelled', () => {
    const goals = [g({ id: 'g4', curriculum_week: 4 }), g({ id: 'g5', curriculum_week: 5 })]; const rs = [r({ id: 'a', goal_id: 'g4' }), r({ id: 'b', goal_id: 'g5' })];
    const prog = [p({ goal_resource_id: 'a', status: 'completed' }), p({ id: '2', goal_resource_id: 'b', status: 'completed' }), p({ id: '3', learner_id: 'b', goal_resource_id: 'a', status: 'completed' })];
    expect(reachedCurriculumWeek(goals, rs, prog, 'a')).toBe(5); expect(reachedCurriculumWeek(goals, rs, prog, 'b')).toBe(4); expect(reachedCurriculumWeek(goals, rs, [], 'a')).toBe(0);
    render(<><Journey weeks={[{ week_no: 1, level: 'A1', theme: '', goal: null }, { week_no: 2, level: 'A2', theme: '', goal: null }]} learners={[ir, la]} reached={{ a: 2, b: 1 }} planWeek={1} /><Heatmap sessions={[]} learners={[ir, la]} /></>);
    expect(screen.getByText(/Irshad: week 2 · Lamia: week 1/)).toBeInTheDocument(); expect(screen.getByRole('img', { name: /Irshad: 0 study minutes/ })).toBeInTheDocument();
  });
});
