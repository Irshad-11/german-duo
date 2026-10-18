import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const signIn = vi.fn();
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ signIn, notice: 'Your session ended. Enter your access key to continue.', status: 'signedOut', me: null, session: null }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn(), auth: {} } }));

import { LoginPage } from '@/pages/LoginPage';
import { Splash } from '@/components/Splash';
import { ThemeProvider, useTheme } from '@/hooks/useTheme';
import { ToastProvider, useToast } from '@/hooks/useToast';
import { FolderTag, PersonCell, StatusMark } from '@/components/people';
import { MinutesChart } from '@/components/charts';
import { Gantt } from '@/components/Gantt';
import { Dot, Tabs, Avatar } from '@/components/ui/ui';
import { friendlyError } from '@/lib/errors';
import type { Goal, GoalProgress, GoalResource, Learner, Plan } from '@/types/db';

const wrap = (ui: ReactNode) => <QueryClientProvider client={new QueryClient()}><ThemeProvider><ToastProvider>{ui}</ToastProvider></ThemeProvider></QueryClientProvider>;
const IR = { id: 'a', code: 'IR', display_name: 'IR', accent: 'blue' } as Learner; const LA = { id: 'b', code: 'LA', display_name: 'LA', accent: 'orange' } as Learner;
const res = { id: 'r1', goal_id: 'g', title: 'Menschen A1-1', level: 'A1', source_folder: 'A1/Books', page_count: 106, start_page: 10, end_page: 19, measure_target: null, measure_unit: null } as GoalResource;
const prog = (o: Partial<GoalProgress>) => ({ id: 'p', goal_resource_id: 'r1', learner_id: 'a', status: 'reading', current_page: 12, pages_done: 3, measure_done: 0, note: 'slow start', minutes_total: 25, ...o }) as GoalProgress;

describe('login', () => {
  beforeEach(() => signIn.mockReset());
  it('validates empty input without calling the server, and shows the session notice', async () => {
    render(wrap(<LoginPage />));
    expect(screen.getByText(/session ended/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /enter/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/enter your access key/i); expect(signIn).not.toHaveBeenCalled();
  });
  it('shows invalid, rate-limit and network messages and clears the field', async () => {
    signIn.mockResolvedValueOnce({ ok: false, reason: 'invalid' }).mockResolvedValueOnce({ ok: false, reason: 'rate_limited' }).mockResolvedValueOnce({ ok: false, reason: 'network' });
    render(wrap(<LoginPage />)); const input = screen.getByLabelText('Access key') as HTMLInputElement; expect(input.type).toBe('password');
    for (const msg of [/not recognised/i, /too many attempts/i, /no connection/i]) { await userEvent.type(input, 'abcdefgh'); await userEvent.click(screen.getByRole('button', { name: /enter/i })); expect(await screen.findByText(msg)).toBeInTheDocument(); expect(input.value).toBe(''); }
  });
  it('can reveal the key (accessible toggle)', async () => {
    render(wrap(<LoginPage />)); await userEvent.click(screen.getByRole('button', { name: /show access key/i }));
    expect((screen.getByLabelText('Access key') as HTMLInputElement).type).toBe('text'); expect(screen.getByRole('button', { name: /hide access key/i })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('splash', () => { it('is announced to assistive tech and can fade out', () => { const { rerender } = render(<Splash />); expect(screen.getByRole('status', { name: /loading german duo/i })).toBeInTheDocument(); expect(screen.getByText('German Duo')).toBeInTheDocument(); rerender(<Splash leaving />); expect(document.querySelector('.splash-out')).not.toBeNull(); }); });

describe('theme', () => {
  function Probe() { const { pref, setPref } = useTheme(); return <><output data-testid="t">{pref}</output><button onClick={() => setPref('dark')}>dark</button><button onClick={() => setPref('light')}>light</button></>; }
  it('persists, applies to <html> and is restored on next mount', async () => {
    const persist = vi.fn(); const { unmount } = render(<ThemeProvider onPersist={persist}><Probe /></ThemeProvider>);
    await userEvent.click(screen.getByText('dark')); expect(document.documentElement.getAttribute('data-theme')).toBe('dark'); expect(localStorage.getItem('gd-theme')).toBe('dark'); expect(persist).toHaveBeenCalledWith('dark');
    unmount(); render(<ThemeProvider><Probe /></ThemeProvider>); expect(screen.getByTestId('t')).toHaveTextContent('dark');
    await act(async () => { await userEvent.click(screen.getByText('light')); }); expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

describe('shared progress display', () => {
  it('shows both people’s status, percentage, pages, minutes and note in one cell', () => {
    render(<><PersonCell learner={IR} r={res} p={prog({})} /><PersonCell learner={LA} r={res} p={undefined} /></>);
    expect(screen.getByText(/30%/)).toBeInTheDocument(); expect(screen.getByText(/3\/10 p/)).toBeInTheDocument(); expect(screen.getByText(/at p\.12/)).toBeInTheDocument(); expect(screen.getByText(/25m/)).toBeInTheDocument(); expect(screen.getByText(/slow start/)).toBeInTheDocument();
    expect(screen.getByText('Not started')).toBeInTheDocument(); expect(screen.getAllByRole('progressbar')).toHaveLength(2);
  });
  it('never exceeds 100% and shows folder provenance + status symbols as text', () => {
    render(<><PersonCell learner={IR} r={res} p={prog({ pages_done: 99 })} /><FolderTag level="A2" folder="A2/A2 course Bangla" category="grammar-lesson" /><StatusMark status="needs_help" /></>);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100'); expect(screen.getByTitle('Original location: A2 / A2 course Bangla')).toBeInTheDocument(); expect(screen.getByText('Needs help')).toBeInTheDocument();
  });
});

describe('ui', () => {
  it('tab bubbles show the count and are labelled; people have shape+code markers', async () => {
    const on = vi.fn(); render(<Tabs label="x" value="a" onChange={on} tabs={[{ value: 'a', label: 'Plan', dot: 3 }, { value: 'b', label: 'Words' }]} />);
    expect(screen.getByLabelText('3 new')).toHaveTextContent('3'); await userEvent.click(screen.getByRole('tab', { name: /words/i })); expect(on).toHaveBeenCalledWith('b');
    const { container } = render(<><Dot n={0} /><Avatar code="LA" accent="orange" /></>); expect(container.querySelector('.dotc')).toBeNull(); expect(container.querySelector('.person-orange .mk')).not.toBeNull();
  });
  it('undo toast runs its action and disappears', async () => {
    const undo = vi.fn(); function T() { const t = useToast(); return <button onClick={() => t.undoable('Goal deleted', undo)}>go</button>; }
    render(<ToastProvider><T /></ToastProvider>); await userEvent.click(screen.getByText('go')); expect(screen.getByText('Goal deleted')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' })); expect(undo).toHaveBeenCalledTimes(1); expect(screen.queryByText('Goal deleted')).toBeNull();
  });
  it('chart exposes its numbers in a table and errors read in plain language', () => {
    render(<MinutesChart rows={[{ weekStart: '2026-10-12', byLearner: { a: 30, b: 45 } }]} learners={[IR, LA]} />); expect(screen.getByText('45', { selector: 'td' })).toBeInTheDocument();
    expect(friendlyError({ message: 'Failed to fetch' })).toMatch(/no connection/i); expect(friendlyError({ code: '42501', message: 'row-level security' })).toMatch(/permission/i); expect(friendlyError({ message: 'JWT expired' })).toMatch(/session expired/i);
  });
});

describe('gantt', () => {
  const goal = { id: 'g1', title: 'Week 1: Sounds', start_date: '2026-10-12', deadline: '2026-10-18', original_deadline: '2026-10-18', status: 'active' } as Goal;
  const plan = { start_date: '2026-10-12', target_end_date: '2027-10-12' } as Plan;
  it('renders one bar per goal with both learners’ progress in its accessible name, and opens on click', async () => {
    const open = vi.fn();
    render(<Gantt goals={[goal]} resources={[{ ...res, goal_id: 'g1' }]} progress={[prog({}), prog({ id: 'q', learner_id: 'b', status: 'completed' })]} learners={[IR, LA]} plan={plan} scale="weeks" today="2026-10-14" onOpen={open} />);
    const bar = screen.getByRole('button', { name: /Week 1: Sounds, .*IR 30%, LA 100%/ }); await userEvent.click(bar); expect(open).toHaveBeenCalledWith('g1');
    expect(screen.getByRole('region', { name: /timeline of goals/i })).toHaveAttribute('tabindex', '0');
  });
  it('shows a helpful message when there are no goals', () => { render(<Gantt goals={[]} resources={[]} progress={[]} learners={[IR, LA]} plan={plan} scale="days" today="2026-10-14" onOpen={() => undefined} />); expect(screen.getByText(/No goals yet/)).toBeInTheDocument(); });
});
