// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseQuickWord, splitMeaning } from '@/lib/quickword';
import { nextSyllabusWeek } from '@/components/Syllabus';

const root = join(__dirname, '..', '..');
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const pngSize = (p: string) => { const b = readFileSync(p); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

describe('overlay for quick tasks, page for heavy ones', () => {
  const src = (f: string) => readFileSync(join(root, 'src', f), 'utf8');
  it('only the long, multi-part tasks are full pages (goal editor, goal details, full word form)', () => {
    const pages = walk(join(root, 'src')).filter((f) => /\.tsx$/.test(f) && !f.includes('.test.')).filter((f) => /<FormPage[\s>]/.test(readFileSync(f, 'utf8'))).map((f) => f.replace(join(root, 'src') + '/', '')).sort();
    expect(pages).toEqual(['components/GoalDialog.tsx', 'components/GoalEditor.tsx', 'components/dialogs.tsx']);
  });
  it('quick tasks (log time, question/note, update progress, notice, link, postpone, picker, plan settings) are overlays', () => {
    for (const f of ['components/UpdateDialog.tsx', 'components/LibraryPicker.tsx', 'components/Syllabus.tsx', 'pages/NoticesPage.tsx', 'pages/NotesPage.tsx', 'pages/LibraryPage.tsx', 'pages/SettingsPage.tsx']) { const t = src(f); expect(t, f).toMatch(/<Dialog[\s>]/); expect(t, f).not.toMatch(/<FormPage[\s>]/); }
    const d = src('components/dialogs.tsx'); expect(d).toMatch(/title="Log study time"/); expect(d).toMatch(/<Dialog open=\{open\} onClose=\{onClose\} title="Log study time"/); expect(d).toMatch(/<Dialog open=\{open\} onClose=\{onClose\} title="Capture a note"/);
    expect(src('components/GoalDialog.tsx')).toMatch(/<Dialog open=\{ask\}/);
  });
});

describe('installable app (PWA)', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.webmanifest'), 'utf8')) as { display: string; start_url: string; name: string; background_color: string; theme_color: string; icons: Array<{ src: string; sizes: string; purpose?: string }> };
  it('has a standalone manifest with real, correctly sized icons including a maskable one', () => {
    expect(manifest.display).toBe('standalone'); expect(manifest.name).toBe('German Duo'); expect(manifest.background_color).toMatch(/^#/); expect(manifest.theme_color).toMatch(/^#/);
    for (const i of manifest.icons) { const f = join(root, 'public', i.src); expect(existsSync(f), i.src).toBe(true); const [w, h] = pngSize(f); expect(`${w}x${h}`, i.src).toBe(i.sizes); }
    expect(manifest.icons.some((i) => i.sizes === '192x192' && i.purpose === 'any')).toBe(true); expect(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
  });
  it('index.html links the manifest, iOS icon and splash screens, and every referenced file exists', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    for (const must of ['rel="manifest"', 'apple-touch-icon', 'apple-mobile-web-app-capable', 'viewport-fit=cover']) expect(html).toContain(must);
    const splash = [...html.matchAll(/apple-touch-startup-image" href="([^"]+)"/g)].map((m) => m[1]); expect(splash.length).toBeGreaterThanOrEqual(8);
    for (const s of splash) expect(existsSync(join(root, 'public', s)), s).toBe(true);
  });
  it('has a service worker that never caches other origins (Supabase data stays live)', () => {
    const sw = readFileSync(join(root, 'public/sw.js'), 'utf8'); expect(sw).toContain("addEventListener('fetch'"); expect(sw).toContain('url.origin !== self.location.origin'); expect(sw).toContain("req.method !== 'GET'");
  });
});

describe('quick word entry', () => {
  it('splits the article and keeps everything else as typed', () => {
    expect(parseQuickWord('die Reise')).toEqual({ article: 'die', german: 'Reise' }); expect(parseQuickWord('  DER   Tisch ')).toEqual({ article: 'der', german: 'Tisch' });
    expect(parseQuickWord('gehen')).toEqual({ article: null, german: 'gehen' }); expect(parseQuickWord('das')).toEqual({ article: null, german: 'das' }); expect(parseQuickWord('Guten Morgen')).toEqual({ article: null, german: 'Guten Morgen' });
  });
  it('puts Bangla meanings in the Bangla field automatically', () => {
    expect(splitMeaning('journey')).toEqual({ en: 'journey', bn: null }); expect(splitMeaning('ভ্রমণ')).toEqual({ en: null, bn: 'ভ্রমণ' }); expect(splitMeaning('  ')).toEqual({ en: null, bn: null });
  });
});

describe('syllabus week choice', () => {
  const weeks = [1, 2, 3, 4].map((week_no) => ({ week_no }));
  it('suggests the first unplanned week but never forces it', () => {
    expect(nextSyllabusWeek(weeks, [])).toBe(1);
    expect(nextSyllabusWeek(weeks, [{ curriculum_week: 1, status: 'active' }, { curriculum_week: 3, status: 'active' }])).toBe(2);
    expect(nextSyllabusWeek(weeks, [{ curriculum_week: 1, status: 'dropped' }])).toBe(1);
    expect(nextSyllabusWeek(weeks, weeks.map((w) => ({ curriculum_week: w.week_no, status: 'active' })))).toBeNull();
  });
});

describe('hover states stay readable', () => {
  const css = readFileSync(join(root, 'src/styles/app.css'), 'utf8');
  // every top-level rule that has :hover must sit inside @media (hover: hover) — a tap on a phone must not leave a stuck hover colour
  const rules: Array<{ sel: string; atTop: boolean }> = [];
  { let depth = 0, buf = '', top = ''; for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
      if (ch === '{') { if (depth === 0) top = buf.trim(); else rules.push({ sel: buf.trim(), atTop: false }); if (depth === 0 && !buf.trim().startsWith('@')) rules.push({ sel: buf.trim(), atTop: true }); depth++; buf = ''; }
      else if (ch === '}') { depth--; buf = ''; } else if (ch !== ';' || depth === 0) buf += ch; else buf += ch; void top; } }
  it('has no :hover rule outside @media (hover: hover)', () => {
    expect(rules.filter((r) => r.atTop && r.sel.includes(':hover')).map((r) => r.sel)).toEqual([]);
    expect(css).toContain('@media (hover: hover)');
  });
  it('the generic hover colours skip selected / coloured controls (white text on a pale hover colour was unreadable)', () => {
    expect(css).toContain('.chip:hover:not(.chip-on)'); expect(css).toContain('.choice:hover:not(.on)'); expect(css).toContain('.btn:hover:not(:disabled)');
    expect(css).toMatch(/\.chip-on:hover \{ background: var\(--primary-d\)/); expect(css).toMatch(/\.btn-danger:hover:not\(:disabled\)/); expect(css).toMatch(/\.hero-band \.btn\.btn-primary:hover/); expect(css).toMatch(/\.toast \.icon-btn:hover/);
  });
});
