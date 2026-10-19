import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Goal, GoalProgress, GoalResource, Learner } from '@/types/db';

const updateGoal = vi.fn().mockResolvedValue(undefined);
vi.mock('@/api/mutations', () => ({ updateGoal: (...a: unknown[]) => updateGoal(...a) }));
vi.mock('@/hooks/useRun', () => ({ useRun: () => async (fn: () => Promise<unknown>) => ({ ok: true, value: await fn() }) }));
import { WeeklyTable, dueNote, sortWeeks } from '@/components/WeeklyTable';
import { PersonCell } from '@/components/people';

const IR = { id: 'a', code: 'IR', display_name: 'IR', accent: 'blue' } as Learner; const LA = { id: 'b', code: 'LA', display_name: 'LA', accent: 'orange' } as Learner;
const G = (o: Partial<Goal>): Goal => ({ id: 'g', title: 'Week 2: Greetings', start_date: '2026-10-12', deadline: '2026-10-18', original_deadline: '2026-10-18', status: 'active', curriculum_week: 2, exam_date: null, created_at: '1', ...o }) as Goal;
const R = (o: Partial<GoalResource>): GoalResource => ({ id: 'r1', goal_id: 'g', title: 'Menschen A1-1', level: 'A1', source_folder: 'A1/Books', page_count: 106, start_page: 10, end_page: 19, measure_target: null, measure_unit: null, assignee_id: null, est_minutes: null, instructions: null, ...o }) as GoalResource;
const P = (o: Partial<GoalProgress>): GoalProgress => ({ id: 'p', goal_resource_id: 'r1', learner_id: 'a', status: 'reading', current_page: 12, pages_done: 3, measure_done: 0, manual_pct: null, ready_for_questions: false, note: null, minutes_total: 0, completed_at: null, updated_at: '', ...o }) as GoalProgress;

describe('weekly table', () => {
  it('orders the weeks by syllabus number and describes deadlines in words', () => {
    expect(sortWeeks([G({ id: 'x', curriculum_week: 5 }), G({ id: 'y', curriculum_week: null }), G({ id: 'z', curriculum_week: 2 })]).map((g) => g.id)).toEqual(['z', 'x', 'y']);
    const now = new Date(2026, 9, 14); expect(dueNote('2026-10-17', now)).toEqual({ text: 'in 3 days', late: false }); expect(dueNote('2026-10-13', now)).toEqual({ text: '1 day late', late: true }); expect(dueNote('2026-10-14', now).text).toBe('today');
  });
  it('shows the week, deadline, exam date, each person’s stage, who finished first and who is ready for questions', () => {
    const progress = [P({ status: 'completed', completed_at: '2026-10-14T10:00:00Z', ready_for_questions: true }), P({ id: 'q', learner_id: 'b', status: 'completed', completed_at: '2026-10-13T09:00:00Z' })];
    render(<WeeklyTable goals={[G({ exam_date: '2026-10-25' })]} resources={[R({})]} progress={progress} learners={[IR, LA]} onOpenGoal={vi.fn()} onUpdate={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Week 2: Greetings' })).toBeInTheDocument();
    expect(screen.getByLabelText('Exam session')).toHaveValue('2026-10-25');
    const row = screen.getByRole('row', { name: /Menschen A1-1/ });
    expect(within(row).getAllByText('Completed')).toHaveLength(2);
    expect(within(row).getByText('first')).toBeInTheDocument(); expect(within(row).getByText(/then IR/)).toBeInTheDocument();      // LA finished first, IR second
    expect(within(row).getAllByText('Ready')).toHaveLength(1);                                                                     // only IR carries the badge
  });
  it('saves the exam date by hand, and clears it', async () => {
    render(<WeeklyTable goals={[G({})]} resources={[]} progress={[]} learners={[IR, LA]} onOpenGoal={vi.fn()} onUpdate={vi.fn()} />);
    const input = screen.getByLabelText('Exam session'); await userEvent.type(input, '2026-11-02');
    expect(updateGoal).toHaveBeenCalledWith('g', { exam_date: '2026-11-02' });
    expect(screen.getByText(/No books or PDFs/)).toBeInTheDocument();
  });
  it('a task for one person shows “Not for …” for the other and “Only for …” beside the title', () => {
    render(<WeeklyTable goals={[G({})]} resources={[R({ assignee_id: 'a' })]} progress={[]} learners={[IR, LA]} onOpenGoal={vi.fn()} onUpdate={vi.fn()} />);
    expect(screen.getByText('Not for LA')).toBeInTheDocument(); expect(screen.getByText('Only for IR')).toBeInTheDocument();
  });
  it('opens the postpone options of the week', async () => {
    const open = vi.fn(); render(<WeeklyTable goals={[G({})]} resources={[]} progress={[]} learners={[IR, LA]} onOpenGoal={open} onUpdate={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /options & postpone/i })); expect(open).toHaveBeenCalledWith('g');
  });
});

describe('person cell with the new badge', () => {
  it('shows the badge only on a finished task, and says so when the task is not for that person', () => {
    const { rerender } = render(<PersonCell learner={IR} r={R({})} p={P({ status: 'completed', ready_for_questions: true })} />);
    expect(screen.getByText('Ready for questions')).toBeInTheDocument();
    rerender(<PersonCell learner={IR} r={R({})} p={P({ status: 'reading', ready_for_questions: true })} />); expect(screen.queryByText('Ready for questions')).toBeNull();
    rerender(<PersonCell learner={LA} r={R({ assignee_id: 'a' })} p={undefined} />); expect(screen.getByText('Not for LA')).toBeInTheDocument(); expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
