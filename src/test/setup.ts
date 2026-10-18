import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';

const BAD = /cannot be a child of|validateDOMNesting|hydration|Each child in a list should have a unique|cannot contain a nested/i;
let seen: string[] = [];
beforeEach(() => { seen = []; const orig = console.error; vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { const m = a.map(String).join(' '); if (BAD.test(m)) seen.push(m.slice(0, 400)); else orig(...(a as [unknown])); }); });
afterEach(() => { vi.restoreAllMocks(); if (seen.length) throw new Error(`React reported invalid markup: ${seen[0]}`); });

if (typeof window !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => { cleanup(); localStorage.clear(); });
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })) as unknown as typeof window.matchMedia;
  }
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
  }
}
