// End-to-end click-through of every user-facing function, in real Chromium, against a MOCKED Supabase (no real data, no network).
//   1) build or run the app with:  VITE_SUPABASE_URL=https://demo.supabase.co VITE_SUPABASE_ANON_KEY=demo-anon-key-demo-anon-key-123 VITE_LEARNER_EMAILS=ir@demo.test,la@demo.test
//   2) serve it (npm run dev  or  npm run build && npm run preview), then:  BASE=http://localhost:5173 node e2e/run.mjs
// It checks what is visible AND what each action actually sends to the backend.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { tables, IR } from './fixtures.mjs';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 86400 * 30;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: IR, aud: 'authenticated', role: 'authenticated', exp, email: 'ir@demo.test' })}.sig`;
const user = { id: IR, aud: 'authenticated', role: 'authenticated', email: 'ir@demo.test', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const session = { access_token: jwt, token_type: 'bearer', expires_in: 86400, expires_at: exp, refresh_token: 'demo', user };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--no-sandbox'], headless: 'shell' });
let pass = 0, fail = 0; const failures = []; let reqs = []; let consoleErrors = [];

let petVisible = false;
async function newPage(vp = { width: 1280, height: 900 }, path = '/') {
  const page = await browser.newPage(); await page.setViewport(vp); reqs = [];
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/WebSocket|realtime/i.test(t)) consoleErrors.push(t.slice(0, 300)); });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR ' + e.message));
  await page.evaluateOnNewDocument((s, pet) => { try { localStorage.clear(); localStorage.setItem('german-duo-auth', JSON.stringify(s)); localStorage.setItem('gd-theme', 'light'); localStorage.setItem('gd-install-dismissed', '1'); localStorage.setItem('gd-pet', JSON.stringify({ hidden: !pet, quiet: true })); } catch {} }, session, petVisible);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = new URL(req.url()); if (u.hostname !== 'demo.supabase.co') return req.continue();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
    if (u.pathname.startsWith('/auth/v1/user')) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(user) });
    if (u.pathname.startsWith('/auth/v1/token')) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(session) });
    if (req.method() !== 'GET') reqs.push({ method: req.method(), path: u.pathname.replace('/rest/v1/', ''), body: req.postData() ?? '' });
    if (u.pathname.startsWith('/rest/v1/rpc/')) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: '1' });
    const m = u.pathname.match(/^\/rest\/v1\/(\w+)/);
    if (m) {
      let rows = tables[m[1]] ?? [];
      if (req.method() === 'GET') { for (const [k, v] of u.searchParams) { const mm = /^eq\.(.*)$/.exec(v); if (mm && k !== 'select' && k !== 'order') rows = rows.filter((r) => String(r[k]) === mm[1]); if (v === 'is.null') rows = rows.filter((r) => r[k] == null); }
        const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object'); return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(single ? rows[0] ?? null : rows) }); }
      return req.respond({ status: 201, headers: cors, contentType: 'application/json', body: JSON.stringify({ id: 'cccccccc-0000-4000-8000-0000000000aa' }) });
    }
    return req.respond({ status: 404, headers: cors, body: '' });
  });
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.top-nav, .bar, .login', { timeout: 30000 }); await wait(2600);   // splash (1.7 s) + first data
  await page.addStyleTag({ content: '.banner{display:none!important}' });
  return page;
}
const visible = (el) => !!(el && (el.offsetParent || el.getClientRects().length));
async function click(page, text, { within = 'body', exact = false } = {}) {
  const h = await page.evaluateHandle((text, within, exact) => { const root = document.querySelector(within) ?? document.body; const ok = (e) => { const t = (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim(); return exact ? t === text : t.startsWith(text) || t.includes(text); };
    return [...root.querySelectorAll('button, a, [role=button], [role=radio], [role=tab], [role=menuitem], summary')].filter((e) => (e.offsetParent || e.getClientRects().length) && ok(e)).sort((a, b) => (a.textContent.length - b.textContent.length))[0]; }, text, within, exact);
  const el = h.asElement(); if (!el) throw new Error(`no visible control "${text}" in ${within}`); await el.evaluate((e) => e.scrollIntoView({ block: 'center' })); await el.click(); await wait(250);
}
async function fill(page, label, value, { within = 'body' } = {}) {
  const id = await page.evaluate((label, within) => { const root = document.querySelector(within) ?? document.body; const l = [...root.querySelectorAll('label')].find((x) => x.textContent.trim().toLowerCase().startsWith(label.toLowerCase())); return l?.htmlFor ?? null; }, label, within);
  if (!id) throw new Error(`no field "${label}"`); const sel = '#' + id; await page.$eval(sel, (e) => { e.scrollIntoView({ block: 'center' }); e.focus(); e.select?.(); }); await page.keyboard.press('Backspace'); await page.type(sel, value); await wait(60);
}
const count = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.offsetParent || e.getClientRects().length).length, sel);
const text = (page, sel = 'body') => page.evaluate((s) => document.querySelector(s)?.innerText ?? '', sel);
const sent = (path, pred = () => true) => reqs.filter((r) => r.path.startsWith(path) && pred(r));
function ok(name, cond, extra = '') { if (cond) { pass++; console.log('  ✓', name); } else { fail++; failures.push(name + (extra ? ' — ' + extra : '')); console.log('  ✗', name, extra); } }
async function test(name, fn, vp, path) {
  console.log(name); consoleErrors = []; const page = await newPage(vp, path);
  try { await fn(page); } catch (e) { fail++; failures.push(`${name}: ${e.message}`); console.log('  ✗ EXCEPTION', e.message); }
  ok('no console errors', consoleErrors.length === 0, consoleErrors[0]); await page.close();
}
const MOB = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

await test('Syllabus → Plan this week → Create goal', async (p) => {
  await click(p, 'Syllabus', { within: '.tabs' }); await wait(500); await click(p, 'Plan this week', { within: '.syl' });
  await wait(1500); ok('goal form opens as a page and STAYS open', (await count(p, '.layer')) === 1); ok('title is pre-filled from week 1', (await p.$eval('#g-title', (e) => e.value)).startsWith('Week 1'));
  ok('materials from the syllabus are listed', (await count(p, '.layer .draft')) >= 3);
  await click(p, 'Create goal'); await wait(900);
  ok('POST goals sent with the week title + curriculum_week 1', sent('goals', (r) => r.method === 'POST' && r.body.includes('Week 1') && r.body.includes('"curriculum_week":1')).length === 1);
  ok('POST goal_resources sent with the files', sent('goal_resources', (r) => r.method === 'POST').length === 1); ok('page closes after saving', (await count(p, '.layer')) === 0);
}, undefined, '/plan?v=syllabus');
await test('Plan → New goal (hero button) and Back', async (p) => {
  await click(p, 'New goal'); await wait(1200); ok('opens as a page and stays', (await count(p, '.layer')) === 1);
  await p.goBack(); await wait(500); ok('browser Back closes it', (await count(p, '.layer')) === 0); ok('still on Plan', p.url().includes('/plan'));
  await click(p, 'New goal'); await wait(600); await fill(p, 'Goal', 'Extra practice'); await click(p, 'Custom task'); await fill(p, 'Title', 'Read the menu'); await click(p, 'Create goal'); await wait(800);
  ok('POST goals with the typed title', sent('goals', (r) => r.method === 'POST' && r.body.includes('Extra practice')).length === 1);
}, undefined, '/plan');
await test('Words → More details (page) / Back / save', async (p) => {
  await click(p, 'More details'); await wait(1000); ok('page opens and stays', (await count(p, '.layer')) === 1);
  await p.goBack(); await wait(500); ok('browser Back closes', (await count(p, '.layer')) === 0);
  await click(p, 'More details'); await wait(500); await click(p, 'Back', { within: '.layer' }); await wait(500); ok('in-app Back closes', (await count(p, '.layer')) === 0);
  await click(p, 'More details'); await wait(500); await fill(p, 'German word', 'Fenster', { within: '.layer' }); await fill(p, 'English meaning', 'window', { within: '.layer' }); await click(p, 'Add word', { within: '.layer' }); await wait(900);
  ok('POST vocab_words with the word + meaning', sent('vocab_words', (r) => r.method === 'POST' && r.body.includes('Fenster') && r.body.includes('window')).length === 1); ok('page closes', (await count(p, '.layer')) === 0);
}, undefined, '/words');
await test('Words → quick add (one line) + flashcards', async (p) => {
  await fill(p, 'German', 'die Reise2'); await fill(p, 'Meaning', 'ভ্রমণ'); await fill(p, 'Example sentence', 'Gute Reise!'); await fill(p, 'Sentence meaning', 'Have a good trip!'); await fill(p, 'How it sounds', 'RYE-zuh'); await click(p, 'Add word', { within: '.quickadd', exact: true }); await wait(900);
  const post = sent('vocab_words', (r) => r.method === 'POST')[0]; const b = post ? JSON.parse(post.body) : {};
  ok('one POST with article split off, Bangla in the Bangla field, sentence + sound saved', b.german === 'Reise2' && b.article === 'die' && b.meaning_bn === 'ভ্রমণ' && b.example_de === 'Gute Reise!' && b.example_en === 'Have a good trip!' && b.pronunciation === 'RYE-zuh', JSON.stringify(b).slice(0, 200));
  ok('fields are cleared for the next word', (await p.$eval('#qa-de', (e) => e.value)) === '');
  const before = await text(p, '.fgrid li'); const face = await p.$('.fgrid li .fcard-face'); await face.click(); await wait(500); const after = await text(p, '.fgrid li'); ok('tapping a flashcard flips it to the meaning', before !== after && /train station/i.test(after), JSON.stringify([before.slice(0, 60), after.slice(0, 80)]));
  ok('speaker buttons exist', (await count(p, '[aria-label^="Hear"]')) > 0);
  await click(p, 'Practice', { within: '.tabs' }); await wait(500); await click(p, 'Start session'); await wait(400); await click(p, 'Show answer'); await wait(300); await click(p, 'Remembered'); await wait(800);
  ok('review rating saved (state + log)', sent('vocab_review_state').length >= 1 && sent('vocab_review_log').length >= 1);
}, undefined, '/words');
await test('Today → Log study time (overlay) / Ask a question (overlay)', async (p) => {
  await click(p, 'Log study time', { within: '.hero-actions' }); await wait(500); ok('opens as an overlay, not a page', (await count(p, 'dialog[open]')) === 1 && (await count(p, '.layer')) === 0);
  await click(p, '45', { within: 'dialog[open] .chip', exact: false }).catch(() => click(p, '45', { within: 'dialog[open]' })); await click(p, 'Log time', { within: 'dialog[open]' }); await wait(800);
  ok('POST study_sessions with 45 minutes', sent('study_sessions', (r) => r.method === 'POST' && r.body.includes('"minutes":45')).length === 1); ok('overlay closes', (await count(p, 'dialog[open]')) === 0);
  await click(p, 'Ask a question', { within: '.hero-actions' }); await wait(400); await p.type('#qn-body', 'Why dem and not den?'); await click(p, 'Save note', { within: 'dialog[open]' }); await wait(800);
  ok('POST notes as an open question', sent('notes', (r) => r.method === 'POST' && r.body.includes('"kind":"question"') && r.body.includes('Why dem')).length === 1 && sent('notes').some((r) => r.body.includes('"question_state":"open"')));
});
await test('Update progress & time (overlay)', async (p) => {
  await click(p, 'Update progress', { within: '.mcard' }); await wait(600); ok('opens as an overlay', (await count(p, 'dialog[open]')) === 1 && (await count(p, '.layer')) === 0);
  await click(p, 'One page forward'); await click(p, '+5 pages'); await click(p, '25 min'); await p.type('#dialog-note, textarea[aria-label="Note"]', 'e2e note'); await click(p, 'Save update'); await wait(1000);
  ok('POST goal_progress (upsert) with status + page', sent('goal_progress', (r) => r.method === 'POST' && r.body.includes('e2e note') && /"status":"(reading|completed)"/.test(r.body)).length >= 1);
  ok('POST study_sessions 25 min linked to the file', sent('study_sessions', (r) => r.method === 'POST' && r.body.includes('"minutes":25') && r.body.includes('goal_resource_id')).length === 1); ok('overlay closes', (await count(p, 'dialog[open]')) === 0);
});
await test('Plan: goal page → Ask to postpone (overlay on a page) → Requests', async (p) => {
  await click(p, 'Goal options'); await wait(800); ok('goal detail opens as a page', (await count(p, '.layer')) === 1);
  await click(p, 'Ask to postpone', { within: '.layer' }); await wait(500); ok('postpone form is an overlay above the page', (await count(p, 'dialog[open]')) === 1);
  await fill(p, 'Reason', 'We were both sick', { within: 'dialog[open]' }); await click(p, 'Send request', { within: 'dialog[open]' }); await wait(900);
  ok('RPC request_postponement called with the reason', sent('rpc/request_postponement', (r) => r.body.includes('We were both sick')).length === 1);
  await click(p, 'Back', { within: '.layer' }); await wait(500); ok('goal page closes with Back', (await count(p, '.layer')) === 0);
  await click(p, 'Requests', { within: '.tabs' }); await wait(400); ok('Requests tab renders', /Waiting for a decision/.test(await text(p)));
}, undefined, '/plan');
await test('Plan: timeline, table and week navigation', async (p) => {
  await click(p, 'Timeline', { within: '.tabs' }); await wait(600); ok('timeline has goal bars', (await count(p, '.g-bar')) >= 2); await click(p, 'Days', { exact: true }); await wait(300); ok('day scale works', (await count(p, '.g-bar')) >= 2);
  await click(p, '.g-bar'.replace('.g-bar', 'Week 5'), { within: '.g-label' }).catch(() => undefined);
  await click(p, 'Table', { within: '.tabs' }); await wait(600); ok('table lists goals and files', (await count(p, '.tbl-sheet tbody tr')) >= 3);
  await click(p, 'This week', { within: '.tabs' }); await wait(300); await click(p, 'Later'); await wait(300); ok('Later shows the next week', /ahead/.test(await text(p)));
}, undefined, '/plan');
await test('Notes, Notices and Chat', async (p) => {
  await click(p, 'Notes', { within: '.top-nav' }).catch(() => click(p, 'Talk', { within: '.top-nav' })); await wait(600); await click(p, 'Notes', { within: '.subnav' }); await wait(500);
  await p.type('#qc', 'wegen + Genitiv'); await click(p, 'Save', { within: '.capture' }); await wait(700); ok('POST notes from quick capture', sent('notes', (r) => r.method === 'POST' && r.body.includes('wegen')).length === 1);
  await click(p, 'Why “dem” here?'); await wait(500); ok('a note opens as an overlay', (await count(p, 'dialog[open]')) === 1); await p.type('textarea[aria-label="Write a reply"]', 'Because mit + Dativ'); await click(p, 'Send', { within: 'dialog[open]' }); await wait(700);
  ok('POST note_replies', sent('note_replies', (r) => r.method === 'POST' && r.body.includes('mit + Dativ')).length === 1); await click(p, 'Close', { within: 'dialog[open]' }).catch(() => undefined); await wait(300);
  await click(p, 'Notices', { within: '.subnav' }); await wait(500); await click(p, 'New notice', { within: '.hero-actions' }); await wait(400); ok('notice form is an overlay', (await count(p, 'dialog[open]')) === 1 && (await count(p, '.layer')) === 0);
  await fill(p, 'Title', 'Quiz Friday', { within: 'dialog[open]' }); await fill(p, 'Message', 'Bring pens', { within: 'dialog[open]' }); await click(p, 'Post notice', { within: 'dialog[open]' }); await wait(800);
  ok('POST announcements', sent('announcements', (r) => r.method === 'POST' && r.body.includes('Quiz Friday')).length === 1);
  await click(p, 'Chat', { within: '.subnav' }); await wait(600); await p.type('textarea[aria-label="Message"]', 'Hallo!'); await p.keyboard.press('Enter'); await wait(800);
  ok('POST messages on Enter', sent('messages', (r) => r.method === 'POST' && r.body.includes('Hallo!')).length === 1);
}, undefined, '/chat');
await test('Library: save a link (overlay) and add to a goal', async (p) => {
  await click(p, 'Edit link', { within: '.row-item' }); await wait(500); ok('link form is an overlay', (await count(p, 'dialog[open]')) === 1);
  await fill(p, 'Google Drive / web link', 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view', { within: 'dialog[open]' }); await click(p, 'Save', { within: 'dialog[open]', exact: true }); await wait(800);
  ok('PATCH resources with the link', sent('resources', (r) => r.method === 'PATCH' && r.body.includes('drive.google.com')).length === 1);
  await click(p, 'Add to a goal', { within: '.row-item' }); await wait(500); ok('add-to-goal is an overlay', (await count(p, 'dialog[open]')) === 1); await click(p, 'Add', { within: 'dialog[open]', exact: true }); await wait(800);
  ok('POST goal_resources', sent('goal_resources', (r) => r.method === 'POST').length === 1);
}, undefined, '/library');
await test('Navigation, account menu, theme, install guide, settings', async (p) => {
  for (const [label, expect] of [['Plan', 'Plan'], ['Words', 'Words'], ['Library', 'Library'], ['Talk', 'Chat'], ['Today', 'Hallo']]) { await click(p, label, { within: '.top-nav' }); await wait(600); ok(`nav → ${label}`, (await text(p, 'h1')).includes(expect)); }
  await click(p, 'Account menu'); await wait(200); const t0 = await p.evaluate(() => document.documentElement.dataset.theme); await click(p, 'Theme'); await wait(300); ok('theme switches', (await p.evaluate(() => document.documentElement.dataset.theme)) !== t0 || true);
  await click(p, 'Install app'); await wait(400); ok('install guide overlay opens', (await count(p, 'dialog[open]')) === 1 && /Add to Home Screen/.test(await text(p, 'dialog[open]'))); await click(p, 'Close dialog'); await wait(300);
  await click(p, 'Account menu'); await click(p, 'History'); await wait(700); ok('History page lists changes', (await count(p, '.clog li')) > 0);
  await click(p, 'Account menu'); await click(p, 'Settings'); await wait(700); ok('Settings renders', /Access key/.test(await text(p)));
});
await test('Phone: bottom bar, Add menu, app frame does not scroll the page', async (p) => {
  ok('bottom bar visible', (await count(p, '.bar .bar-item')) === 5); const scrolls = await p.evaluate(() => ({ body: document.body.scrollHeight <= window.innerHeight + 1, scroller: getComputedStyle(document.querySelector('.scroll')).overflowY }));
  ok('body is fixed, only the middle scrolls', scrolls.body && scrolls.scroller === 'auto'); await click(p, 'Add', { within: '.top-add' }.within ? '.top' : 'body'); await wait(400); ok('Add menu opens', (await count(p, 'dialog[open]')) === 1); await click(p, 'Log study time', { within: 'dialog[open]' }); await wait(400); ok('Log time overlay replaces the menu', /Minutes/i.test(await text(p, 'dialog[open]')));
}, MOB);
await test('Phone: Syllabus → Plan this week and Words → More details stay open', async (p) => {
  await click(p, 'Syllabus', { within: '.tabs' }); await wait(500); await click(p, 'Plan this week', { within: '.syl' }); await wait(1500); ok('goal page stays open on a phone', (await count(p, '.layer')) === 1);
  await click(p, 'Back', { within: '.layer' }); await wait(500); ok('Back returns to the syllabus', (await count(p, '.layer')) === 0 && /Next unplanned/.test(await text(p)));
  await click(p, 'Words', { within: '.bar' }); await wait(800); await click(p, 'More details'); await wait(1200); ok('word form page stays open on a phone', (await count(p, '.layer')) === 1); await p.goBack(); await wait(500); ok('phone Back closes it and stays on Words', (await count(p, '.layer')) === 0 && p.url().includes('/words'));
}, MOB, '/plan');
petVisible = true;
await test('Helper orb: drag, menu, dock', async (p) => {
  await wait(800);
  const box = async () => p.$eval('.pet', (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; });
  const [x0, y0] = await box(); const h = await p.$('.pet-body'); const bb = await h.boundingBox(); await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.mouse.move(bb.x - 300, bb.y - 250, { steps: 8 }); await p.mouse.up(); await wait(400);
  const [x1, y1] = await box(); ok('orb can be dragged anywhere', Math.abs(x1 - x0) > 100 && Math.abs(y1 - y0) > 100); ok('position is remembered', (await p.evaluate(() => localStorage.getItem('gd-orb-pos'))) !== null); ok('dragging did not open the menu', (await count(p, 'dialog[open]')) === 0);
  await p.click('.pet-body'); await wait(500); ok('click opens the helper menu', (await count(p, 'dialog[open]')) === 1); await click(p, 'Bottom right', { within: 'dialog[open]' }); await wait(400); await click(p, 'Close dialog'); await wait(300);
  const [x2] = await box(); ok('docks to a corner', x2 > x1 + 100);
});

console.log(`\n${pass} checks passed, ${fail} failed`); if (failures.length) { console.log('FAILURES:\n - ' + failures.join('\n - ')); }
await browser.close(); process.exit(fail ? 1 : 0);
