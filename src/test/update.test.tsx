import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { GoalProgress, GoalResource, Learner } from '@/types/db';

const me = { id: 'a', code: 'IR', display_name: 'Irshad', accent: 'blue' } as Learner; const other = { id: 'b', code: 'LA', display_name: 'Lamia', accent: 'orange' } as Learner;
const res = { id: 'r1', goal_id: 'g1', title: 'Menschen A1-1', filename: 'Menschen.pdf', level: 'A1', category: 'coursebook', source_folder: 'A1/Books', file_type: 'pdf', page_count: 106, start_page: 10, end_page: 19, external_url: null, instructions: null, est_minutes: 60, measure_unit: null, measure_target: null } as GoalResource;
let progressRows: GoalProgress[] = [];
const saveProgress = vi.fn().mockResolvedValue('p1'); const logSession = vi.fn().mockResolvedValue('s1');
vi.mock('@/api/queries', () => ({
  useGoalResources: () => ({ data: [res] }), useGoals: () => ({ data: [{ id: 'g1', title: 'Week 5', deadline: '2026-10-25', status: 'active' }] }), useProgress: () => ({ data: progressRows }), useSessions: () => ({ data: [] }), useChangeLog: () => ({ data: [] }),
}));
vi.mock('@/api/mutations', () => ({ saveProgress: (...a: unknown[]) => saveProgress(...a), logSession: (...a: unknown[]) => logSession(...a), latestLogId: vi.fn().mockResolvedValue(7), revertChange: vi.fn(), updateGoalResource: vi.fn(), deleteSession: vi.fn() }));
vi.mock('@/hooks/useWho', () => ({ useWho: () => ({ me, other, learners: [me, other], nameOf: (id: string) => (id === 'a' ? 'Irshad' : 'Lamia'), codeOf: (id: string) => (id === 'a' ? 'IR' : 'LA'), accentOf: (id: string) => (id === 'a' ? 'blue' : 'orange') }) }));
vi.mock('@/hooks/useRun', () => ({ useRun: () => async (fn: () => Promise<unknown>) => ({ ok: true, value: await fn() }) }));
import { UpdateDialog } from '@/components/UpdateDialog';
import { ToastProvider } from '@/hooks/useToast';

const mount = (onClose = vi.fn()) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><ToastProvider><UpdateDialog resourceId="r1" onClose={onClose} /></ToastProvider></MemoryRouter></QueryClientProvider>);

describe('the one-step update (progress + time)', () => {
  beforeEach(() => { saveProgress.mockClear(); logSession.mockClear(); progressRows = []; });
  it('saves status, page and minutes together with one button', async () => {
    const onClose = vi.fn(); mount(onClose);
    expect(screen.getByRole('radio', { name: /not started/i })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('button', { name: /one page forward/i })); await userEvent.click(screen.getByRole('button', { name: '+5 pages' }));
    expect(screen.getByRole('radio', { name: /studying/i })).toHaveAttribute('aria-checked', 'true');         // status follows the page automatically
    await userEvent.click(screen.getByRole('button', { name: '25 min' })); await userEvent.type(screen.getByLabelText('Note'), 'chapter 2 was hard');
    await userEvent.click(screen.getByRole('button', { name: /save update/i }));
    await waitFor(() => expect(saveProgress).toHaveBeenCalledTimes(1));
    expect(saveProgress).toHaveBeenCalledWith('a', 'r1', expect.objectContaining({ status: 'reading', current_page: 15, pages_done: 6, note: 'chapter 2 was hard' }));
    expect(logSession).toHaveBeenCalledWith(expect.objectContaining({ minutes: 25, source: 'manual', goal_resource_id: 'r1', goal_id: 'g1' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
  it('reaching the last page suggests Finished and saves the whole range as done', async () => {
    mount(); await userEvent.click(screen.getByRole('button', { name: 'Last page' }));
    expect(screen.getByRole('radio', { name: /finished/i })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('button', { name: /save update/i }));
    await waitFor(() => expect(saveProgress).toHaveBeenCalled());
    expect(saveProgress).toHaveBeenCalledWith('a', 'r1', expect.objectContaining({ status: 'completed', current_page: 19, pages_done: 10 })); expect(logSession).not.toHaveBeenCalled();
  });
  it('only time: logs the session and does not touch progress that has not changed', async () => {
    progressRows = [{ id: 'p', goal_resource_id: 'r1', learner_id: 'a', status: 'reading', current_page: 12, pages_done: 3, measure_done: 0, note: null, minutes_total: 0 } as GoalProgress];
    mount(); await userEvent.click(screen.getByRole('button', { name: '15 min' })); await userEvent.click(screen.getByRole('button', { name: /save update/i }));
    await waitFor(() => expect(logSession).toHaveBeenCalledWith(expect.objectContaining({ minutes: 15 }))); expect(saveProgress).not.toHaveBeenCalled();
  });
  it('shows both people in plain language, a Drive fallback when no link exists, and refuses an empty save', async () => {
    progressRows = [{ id: 'q', goal_resource_id: 'r1', learner_id: 'b', status: 'needs_help', current_page: 12, pages_done: 3, measure_done: 0, note: 'stuck here', minutes_total: 30 } as GoalProgress];
    mount(); expect(screen.getByText('Need help', { selector: '.pline-state' })).toBeInTheDocument(); expect(screen.getByText(/stuck here/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open drive folder/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /save update/i })); expect(await screen.findByText(/nothing to save yet/i)).toBeInTheDocument(); expect(saveProgress).not.toHaveBeenCalled();
  });
});
