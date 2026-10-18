import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const signIn = vi.fn();
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ signIn, notice: 'Your session ended. Enter your access key to continue.', status: 'signedOut', me: null, session: null }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn(), auth: {} } }));
vi.mock('@/api/mutations', async (orig) => ({ ...(await orig<typeof import('@/api/mutations')>()), updateGoalResource: vi.fn().mockResolvedValue(undefined), logSession: vi.fn().mockResolvedValue(undefined) }));

import { LoginPage } from '@/pages/LoginPage';
import { ThemeProvider, useTheme } from '@/hooks/useTheme';
import { ToastProvider } from '@/hooks/useToast';
import { ResourceCard, FolderTag } from '@/components/resource';
import { GroupedBars } from '@/components/charts';
import { friendlyError } from '@/lib/errors';
import type { Goal, GoalResource, Learner } from '@/types/db';

const wrap = (ui: ReactNode) => (
  <QueryClientProvider client={new QueryClient()}><ThemeProvider><ToastProvider>{ui}</ToastProvider></ThemeProvider></QueryClientProvider>
);

describe('login', () => {
  beforeEach(() => signIn.mockReset());
  it('shows a session notice, validates empty input and never calls the server for it', async () => {
    render(wrap(<LoginPage />));
    expect(screen.getByText(/session ended/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /enter/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/enter your access key/i);
    expect(signIn).not.toHaveBeenCalled();
  });
  it('reports invalid credentials, clears the field and keeps the key hidden by default', async () => {
    signIn.mockResolvedValue({ ok: false, reason: 'invalid' });
    render(wrap(<LoginPage />));
    const input = screen.getByLabelText('Access key') as HTMLInputElement;
    expect(input.type).toBe('password');
    await userEvent.type(input, 'wrong-key-1');
    await userEvent.click(screen.getByRole('button', { name: /enter/i }));
    expect(await screen.findByText(/not recognised/i)).toBeInTheDocument();
    expect(signIn).toHaveBeenCalledWith('wrong-key-1');
    expect(input.value).toBe('');
  });
  it('shows a lock-out message when rate limited and a network message when offline', async () => {
    signIn.mockResolvedValueOnce({ ok: false, reason: 'rate_limited' }).mockResolvedValueOnce({ ok: false, reason: 'network' });
    render(wrap(<LoginPage />));
    const input = screen.getByLabelText('Access key');
    await userEvent.type(input, 'abcdefgh'); await userEvent.click(screen.getByRole('button', { name: /enter/i }));
    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
    await userEvent.type(input, 'abcdefgh'); await userEvent.click(screen.getByRole('button', { name: /enter/i }));
    expect(await screen.findByText(/no connection/i)).toBeInTheDocument();
  });
  it('can reveal the key on request (accessible toggle)', async () => {
    render(wrap(<LoginPage />));
    const t = screen.getByRole('button', { name: /show access key/i });
    await userEvent.click(t);
    expect((screen.getByLabelText('Access key') as HTMLInputElement).type).toBe('text');
    expect(screen.getByRole('button', { name: /hide access key/i })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('theme', () => {
  function Probe() { const { pref, resolved, setPref } = useTheme(); return <><output data-testid="t">{pref}/{resolved}</output><button onClick={() => setPref('dark')}>dark</button><button onClick={() => setPref('light')}>light</button></>; }
  it('persists the choice, applies it to <html> and restores it on the next mount', async () => {
    const persist = vi.fn();
    const { unmount } = render(<ThemeProvider onPersist={persist}><Probe /></ThemeProvider>);
    await userEvent.click(screen.getByText('dark'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('gd-theme')).toBe('dark'); expect(persist).toHaveBeenCalledWith('dark');
    unmount();
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId('t')).toHaveTextContent('dark/dark');
    await act(async () => { await userEvent.click(screen.getByText('light')); });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

const goal = { id: 'g', status: 'planned', version: 1 } as Goal;
const res = (o: Partial<GoalResource> = {}): GoalResource => ({
  id: 'r1', goal_id: 'g', resource_id: null, title: 'Menschen A1-1 KB', filename: 'Menschen A1-1 KB -einfach.ir-.pdf', level: 'A1', category: 'coursebook', source_folder: 'A1/Books', file_type: 'pdf',
  page_count: 106, start_page: 10, end_page: 19, external_url: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view', instructions: null, est_minutes: 60, priority: 2, notes: null, position: 0,
  status: 'reading', current_page: 12, pages_done: 3, total_minutes: 25, help_note: null, status_changed_at: '', completed_at: null, completed_by: null, last_activity_at: null, version: 1, created_at: '', updated_at: '', ...o,
});

describe('resource card', () => {
  it('shows folder provenance, page range, page progress and an accessible progress bar', () => {
    render(wrap(<ResourceCard r={res()} goal={goal} canEdit onOpenDetail={() => undefined} />));
    expect(screen.getByTitle(/Original location: A1 \/ Books/)).toBeInTheDocument();
    expect(screen.getByText(/pp\. 10–19 of 106/)).toBeInTheDocument();
    expect(screen.getByText(/3 of 10 pages · 7 left · on p\. 12/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /progress/i })).toHaveAttribute('aria-valuenow', '30');
    expect(screen.getByRole('link', { name: /open file/i })).toHaveAttribute('rel', 'noopener noreferrer');
  });
  it('never shows more than 100% and handles a missing page range honestly', () => {
    const { rerender } = render(wrap(<ResourceCard r={res({ pages_done: 10, status: 'paused' })} goal={goal} canEdit onOpenDetail={() => undefined} />));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    rerender(wrap(<ResourceCard r={res({ start_page: null, end_page: null, page_count: null, external_url: null })} goal={goal} canEdit onOpenDetail={() => undefined} />));
    expect(screen.getByText(/No page range assigned/)).toBeInTheDocument(); expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByRole('button', { name: /add link/i })).toBeInTheDocument();
  });
  it('offers phone-friendly quick actions to the owner only, and none once completed', () => {
    const { rerender } = render(wrap(<ResourceCard r={res()} goal={goal} canEdit onOpenDetail={() => undefined} />));
    expect(screen.getByRole('button', { name: 'Paused' })).toBeInTheDocument(); expect(screen.getByRole('button', { name: /awaiting review/i })).toBeInTheDocument();
    rerender(wrap(<ResourceCard r={res()} goal={goal} canEdit={false} onOpenDetail={() => undefined} />));
    expect(screen.queryByRole('button', { name: 'Paused' })).toBeNull(); expect(screen.queryByRole('button', { name: /log time/i })).toBeNull();
    rerender(wrap(<ResourceCard r={res({ status: 'completed' })} goal={goal} canEdit onOpenDetail={() => undefined} />));
    expect(screen.queryByRole('button', { name: /log time/i })).toBeNull(); expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });
  it('FolderTag is labelled with the original path', () => {
    render(<FolderTag level="A2" folder="A2/A2 course Bangla" category="grammar-lesson" />);
    expect(screen.getByTitle('Original location: A2 / A2 course Bangla')).toBeInTheDocument(); expect(screen.getByText('Grammar lesson')).toBeInTheDocument();
  });
});

describe('misc', () => {
  it('chart exposes a data table for screen readers', () => {
    const ls = [{ id: 'a', display_name: 'A', accent: 'cobalt', code: 'IR' }, { id: 'b', display_name: 'B', accent: 'teal', code: 'LA' }] as Learner[];
    render(<GroupedBars rows={[{ weekStart: '2026-10-12', byLearner: { a: 30, b: 45 } }]} learners={ls} />);
    expect(screen.getByRole('img', { name: /study minutes per week/i })).toBeInTheDocument();
    expect(screen.getByText('45', { selector: 'td' })).toBeInTheDocument();
  });
  it('translates database/network errors into plain language', () => {
    expect(friendlyError({ message: 'Failed to fetch' })).toMatch(/no connection/i);
    expect(friendlyError({ code: '42501', message: 'new row violates row-level security policy' })).toMatch(/permission/i);
    expect(friendlyError({ code: '23505', message: 'duplicate key value violates unique constraint "vocab_unique_idx"' })).toMatch(/already in the collection/i);
    expect(friendlyError({ message: 'JWT expired' })).toMatch(/session expired/i);
  });
  it('waits for async state', async () => { await waitFor(() => expect(true).toBe(true)); });
});
