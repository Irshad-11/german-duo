// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseTree, resolveRef, buildCategory } from './lib-inventory.mjs';
import { weeks } from '../data/curriculum.mjs';

const lib = parseTree(readFileSync(new URL('../data/library-tree.txt', import.meta.url), 'utf8'));

describe('supplied inventory', () => {
  it('parses every file with hierarchy, level, size and page metadata', () => {
    expect(lib).toHaveLength(121);
    const byLevel = Object.groupBy(lib, (r) => r.level);
    expect(byLevel.A1).toHaveLength(14 + 6 + 18);
    expect(byLevel.A2).toHaveLength(13 + 3 + 7);
    const menschen = lib.find((r) => r.filename.startsWith('Menschen A1-1'));
    expect(menschen).toMatchObject({ source_folder: 'A1/Books', file_type: 'pdf', page_count: 106, level: 'A1' });
    expect(menschen.size_kb).toBeCloseTo(19.18 * 1024, 0);
  });
  it('keeps PNG lessons without pages and unknown page counts as null', () => {
    expect(lib.find((r) => r.filename.startsWith('Class-01 (')).page_count).toBeNull();
    expect(lib.find((r) => r.filename.includes('Kontext B2 Kursbuch.pdf')).page_count).toBeNull();
  });
  it('preserves odd filenames exactly (spaces, umlauts)', () => {
    expect(lib.some((r) => r.filename === 'Class-23 ( Case).pdf')).toBe(true);
    expect(lib.some((r) => r.filename === 'Prüfungstraining A2.pdf')).toBe(true);
    expect(lib.some((r) => r.library_path === 'Vocabulary/B1 Bangla Glossar.pdf')).toBe(true);
  });
  it('has unique library paths and categorises by filename heuristics', () => {
    expect(new Set(lib.map((r) => r.library_path)).size).toBe(lib.length);
    expect(buildCategory(lib.find((r) => r.filename.startsWith('Class-10 (')))).toBe('grammar-lesson');
    expect(buildCategory(lib.find((r) => r.filename.startsWith('A2_model 01')))).toBe('exam');
  });
});

describe('curriculum data', () => {
  it('covers 52 consecutive weeks: A1, then A2, then the start of B1', () => {
    expect(weeks.map((w) => w.week)).toEqual(Array.from({ length: 52 }, (_, i) => i + 1));
    const order = weeks.map((w) => w.level);
    expect(order.indexOf('A2')).toBeGreaterThan(order.lastIndexOf('A1') - 1);
    expect(order.lastIndexOf('A1')).toBeLessThan(order.indexOf('A2'));
    expect(order.lastIndexOf('A2')).toBeLessThan(order.indexOf('B1'));
  });
  it('every reference resolves to exactly one supplied file', () => {
    for (const w of weeks) for (const it of w.items) expect(() => resolveRef(lib, it.ref), it.ref).not.toThrow();
  });
  it("never invents page ranges: only 'all' (known page count) or null", () => {
    for (const w of weeks) for (const it of w.items) {
      expect(it.pages === null || it.pages === 'all').toBe(true);
      if (it.pages === 'all') expect(resolveRef(lib, it.ref).page_count, it.ref).toBeGreaterThan(0);
    }
  });
  it('does not assign whole large textbooks: big books are left for page selection', () => {
    for (const w of weeks) for (const it of w.items) {
      const r = resolveRef(lib, it.ref);
      if ((r.page_count ?? 0) > 60) expect(it.pages, `${it.ref} must not be assigned whole`).toBeNull();
    }
  });
});
