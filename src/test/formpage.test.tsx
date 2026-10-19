import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { FormPage } from '@/components/ui/ui';

function Host({ onClose = () => undefined }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return <><div id="app-content"><button onClick={() => setOpen(true)}>Open form</button></div><FormPage open={open} onClose={() => { setOpen(false); onClose(); }} title="Add something"><input aria-label="Field" /></FormPage></>;
}
describe('FormPage', () => {
  it('opens as a labelled page with a Back button, makes the page behind inert, and closes with Back', async () => {
    const onClose = vi.fn(); render(<Host onClose={onClose} />);
    await userEvent.click(screen.getByText('Open form'));
    expect(screen.getByRole('region', { name: 'Add something' })).toBeInTheDocument(); expect(document.getElementById('app-content')).toHaveAttribute('inert'); expect(document.body).toHaveClass('has-layer');
    expect((window.history.state as { gdLayer?: number }).gdLayer).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onClose).toHaveBeenCalledTimes(1); expect(screen.queryByRole('region', { name: 'Add something' })).toBeNull(); expect(document.getElementById('app-content')).not.toHaveAttribute('inert');
  });
  it('closes when the browser/phone Back button is used (popstate) and on Escape', async () => {
    const onClose = vi.fn(); render(<Host onClose={onClose} />);
    await userEvent.click(screen.getByText('Open form')); await act(async () => { window.history.back(); await new Promise((r) => setTimeout(r, 30)); });
    expect(onClose).toHaveBeenCalledTimes(1); expect(screen.queryByRole('region', { name: 'Add something' })).toBeNull();
    await userEvent.click(screen.getByText('Open form')); await userEvent.keyboard('{Escape}'); expect(onClose).toHaveBeenCalledTimes(2);
  });
  it('keeps focus on an auto-focused field instead of stealing it', async () => {
    render(<Host />); await userEvent.click(screen.getByText('Open form')); expect(screen.getByRole('region')).toContainElement(document.activeElement as HTMLElement);
  });
});
