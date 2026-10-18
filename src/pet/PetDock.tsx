import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { Dialog, Button, cx } from '@/components/ui/ui';
import { useWho } from '@/hooks/useWho';
import { useGoalResources, useGoals, useMessages, useNotes, usePostponements, useProgress, useSessions, useVocab, useVocabState } from '@/api/queries';
import { Orb } from './Orb';
import { PAGE_MOOD, TIPS, type Mood, type Tip } from './tips';
import { observe, type Observation } from './observe';
import { onPet } from './bus';

const PREF_KEY = 'gd-pet'; const POS_KEY = 'gd-orb-pos';
interface Pos { fx: number; fy: number }
const readPos = (): Pos | null => { try { const v = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null') as Pos | null; return v && typeof v.fx === 'number' && typeof v.fy === 'number' ? v : null; } catch { return null; } };
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
interface Pref { hidden: boolean; quiet: boolean }
const readPref = (): Pref => { try { return { hidden: false, quiet: false, ...(JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as Partial<Pref>) }; } catch { return { hidden: false, quiet: false }; } };
const PATH_PAGE: Record<string, Tip['page']> = { '/': 'home', '/plan': 'plan', '/words': 'words', '/notes': 'notes', '/chat': 'chat', '/library': 'library', '/notices': 'notices', '/log': 'log', '/settings': 'settings' };
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

export const HOWTO: Array<{ q: string; steps: string[] }> = [
  { q: 'Save my progress and study time', steps: ['Open Today or Plan and press “Update” on a material.', 'Choose where you are: Not started, Studying, Finished or Need help.', 'Tap +1 page / +5 pages (or type the page), pick the minutes you studied, write a note if you like.', 'Press “Save update”. Both of you see it right away.'] },
  { q: 'Only add study time', steps: ['Press “Add” (top right on phones) or “Quick add” (sidebar) → “Log study time”.', 'Pick the material (or “General practice”), tap the minutes, Save.'] },
  { q: 'Create this week’s goal', steps: ['Plan → “New goal”, or “Create goal from this” on the suggested week.', 'Give it a title, dates and add materials from the library with page ranges.', 'Both of you follow the same goal.'] },
  { q: 'Open a file from Google Drive', steps: ['Press “Open” on the material. If no link is saved, it opens the shared Drive folder.', 'Search for the file name (use “Find in Drive”). Open it, copy the share link.', 'Paste the link under “Link” in the Update window — saved for both of you.'] },
  { q: 'Move a deadline', steps: ['Plan → open the goal → “Ask to postpone”.', 'The other person gets a red bubble on Plan and decides in Plan → Requests.'] },
  { q: 'Undo or revert something', steps: ['Right after a change, press “Undo” in the message at the bottom.', 'Later: History → find the entry → “Revert” (changed) or “Restore” (deleted).'] },
  { q: 'Add and learn words', steps: ['Words → “Add word” (add article and plural for nouns).', 'Words → Review: Space shows the answer, then rate it 1–4.'] },
  { q: 'Ask the other person a question', steps: ['Notes → quick capture → choose “Question” → Save.', 'They see a bubble on Notes, reply there and mark it answered.'] },
];

export function PetDock({ totalMinutes }: { totalMinutes: number }) {
  const who = useWho(); const nav = useNavigate(); const loc = useLocation();
  const goals = useGoals(); const rs = useGoalResources(); const progress = useProgress(); const sessions = useSessions(); const vocab = useVocab(); const wstate = useVocabState();
  const notes = useNotes(); const posts = usePostponements(); const msgs = useMessages();
  const [pref, setPref] = useState<Pref>(readPref);
  const [pos, setPos] = useState<Pos | null>(readPos); const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight }); const [drag, setDrag] = useState(false); const [drift, setDrift] = useState({ x: 0, y: 0 }); const [near, setNear] = useState(false);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null); const bodyRef = useRef<HTMLButtonElement>(null);
  const [mood, setMood] = useState<Mood>('idle'); const [bubble, setBubble] = useState<{ text: string; key: number } | null>(null); const [menu, setMenu] = useState(false);
  const [tipCard, setTipCard] = useState<Tip | null>(null); const [open, setOpen] = useState<number | null>(null);
  const last = useRef({ spoke: 0, active: Date.now() }); const timers = useRef<number[]>([]); const shown = useRef(new Set<string>()); const key = useRef(0); const prefRef = useRef(pref); prefRef.current = pref;
  const level = totalMinutes >= 6000 ? 3 : totalMinutes >= 1500 ? 2 : totalMinutes >= 600 ? 1 : 0;

  const savePref = (p: Partial<Pref>) => setPref((old) => { const n = { ...old, ...p }; try { localStorage.setItem(PREF_KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const later = useCallback((fn: () => void, ms: number) => { const id = window.setTimeout(fn, ms); timers.current.push(id); }, []);
  const baseMood = useCallback((): Mood => { const h = new Date().getHours(); return (h >= 23 || h < 6) && Date.now() - last.current.active > 120000 ? 'sleeping' : 'idle'; }, []);
  const speak = useCallback((text: string, m: Mood, ms = 8000, force = false) => {
    if (prefRef.current.hidden || (prefRef.current.quiet && !force)) { setMood(m); later(() => setMood(baseMood()), 2500); return; }
    last.current.spoke = Date.now(); setMood(m); setBubble({ text, key: ++key.current });
    later(() => { setBubble((b) => (b && b.key === key.current ? null : b)); setMood(baseMood()); }, ms);
  }, [later, baseMood]);
  const flash = useCallback((m: Mood, ms = 2600) => { setMood(m); later(() => setMood(baseMood()), ms); }, [later, baseMood]);

  const ctx = useMemo(() => (who.me ? { me: who.me, other: who.other, learners: who.learners, goals: goals.data ?? [], resources: rs.data ?? [], progress: progress.data ?? [], sessions: sessions.data ?? [], words: vocab.data ?? [], wordState: wstate.data ?? [], notes: notes.data ?? [], posts: posts.data ?? [], messages: msgs.data ?? [], now: new Date() } : null),
    [who.me, who.other, who.learners, goals.data, rs.data, progress.data, sessions.data, vocab.data, wstate.data, notes.data, posts.data, msgs.data]);
  const obs: Observation[] = useMemo(() => (ctx ? observe(ctx) : []), [ctx]);
  const obsRef = useRef(obs); obsRef.current = obs;
  const ready = !!ctx && !goals.isLoading && !progress.isLoading;

  const nextTip = useCallback((page?: Tip['page']): Tip => {
    const pool = TIPS.filter((t) => (page ? t.page === page || !t.page : true) && !shown.current.has(t.id));
    if (pool.length === 0) { shown.current.clear(); return pick(TIPS); }
    const specific = page ? pool.filter((t) => t.page === page) : [];
    const t = specific.length && Math.random() < 0.7 ? pick(specific) : pick(pool); shown.current.add(t.id); return t;
  }, []);

  // greeting once per browser session, after the splash screen
  useEffect(() => {
    if (!ready || !who.me) return;
    let done = false; try { done = sessionStorage.getItem('gd-pet-hello') === '1'; } catch { /* ignore */ }
    if (done) return;
    try { sessionStorage.setItem('gd-pet-hello', '1'); } catch { /* ignore */ }
    const top = obsRef.current[0]; const hello = `Hallo ${who.me.display_name}!`;
    later(() => speak(top ? `${hello} ${top.text}` : `${hello} Schön, dass du da bist.`, top?.mood ?? 'wave', 11000), 2600);
  }, [ready, who.me, speak, later]);

  // a tip that fits the page you just opened
  useEffect(() => {
    if (!ready) return; const page = PATH_PAGE[loc.pathname]; if (!page) return;
    const id = window.setTimeout(() => { if (Date.now() - last.current.spoke > 30000) { const t = nextTip(page); speak(t.text, t.mood ?? 'reading', 10000); } }, 2200);
    return () => window.clearTimeout(id);
  }, [loc.pathname, ready, nextTip, speak]);

  // idle life: small animations, now and then a tip, falls asleep at night
  useEffect(() => {
    const idle = window.setInterval(() => { if (document.visibilityState !== 'visible' || menu) return;
      if (baseMood() === 'sleeping') { setMood('sleeping'); return; }
      if (Math.random() < 0.55) flash(pick<Mood>(['wave', 'thinking', 'happy', 'surprised', 'dance', 'reading']), 2200);
    }, 9000);
    const tip = window.setInterval(() => { if (document.visibilityState !== 'visible' || menu || !ready) return;
      if (Date.now() - last.current.spoke > 75000) { const o = obsRef.current[Math.floor(Math.random() * Math.min(3, obsRef.current.length))]; if (o && Math.random() < 0.4) speak(o.text, o.mood, 9000); else { const t = nextTip(PATH_PAGE[window.location.pathname]); speak(t.text, t.mood ?? 'idle', 9000); } }
    }, 40000);
    const touch = () => { last.current.active = Date.now(); };
    window.addEventListener('pointerdown', touch); window.addEventListener('keydown', touch);
    return () => { window.clearInterval(idle); window.clearInterval(tip); window.removeEventListener('pointerdown', touch); window.removeEventListener('keydown', touch); };
  }, [flash, speak, nextTip, menu, ready, baseMood]);

  // reactions to what you just did
  useEffect(() => onPet((e) => {
    last.current.active = Date.now();
    if (e.kind === 'finished') speak(pick([`Finished “${e.title}”! Wunderbar!`, 'Fertig! Das war stark.', `“${e.title}” is done. Gut gemacht!`]), 'cheer', 7000);
    else if (e.kind === 'studied') speak(e.minutes >= 25 ? `${e.minutes} minutes — das ist richtig fleißig!` : pick([`${e.minutes} minutes logged. Jeder Schritt zählt.`, `Nice, ${e.minutes} more minutes.`]), 'proud', 6000);
    else if (e.kind === 'saved') speak(pick(['Saved. Both of you can see it.', 'Gespeichert!', 'Got it.']), 'happy', 4500);
    else if (e.kind === 'word') speak(pick(['A new word! Ein neues Wort.', 'Nice word. Add its article too!']), 'reading', 5000);
    else if (e.kind === 'goal') speak('A new goal! Together you can do this.', 'cheer', 6000);
    else if (e.kind === 'undone') speak('Undone. Nothing is lost.', 'surprised', 4000);
    else if (e.kind === 'error') speak('Hm, that did not work. Check the message and try again.', 'worried', 6000);
    else speak(e.text, 'wave', 7000);
  }), [speak]);
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  const S = vp.w < 640 ? 46 : 54; const barH = vp.w < 900 ? 64 : 0;
  const defX = vp.w < 900 ? 12 : vp.w - S - 24; const defY = vp.h - barH - S - 16;
  const left = pos ? pos.fx * Math.max(0, vp.w - S) : defX; const top = pos ? pos.fy * Math.max(0, vp.h - S) : defY;
  const onRight = left + S / 2 > vp.w / 2; const below = top < 170;
  const savePos = (p: Pos) => { setPos(p); try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* ignore */ } };
  const moveTo = (x: number, y: number) => setPos({ fx: clamp01(x / Math.max(1, vp.w - S)), fy: clamp01(y / Math.max(1, vp.h - S)) });
  const dock = (c: 'tl' | 'tr' | 'bl' | 'br') => { savePos({ fx: c[1] === 'l' ? 0.01 : 0.99, fy: c[0] === 't' ? 0.12 : 1 - (barH + 12) / Math.max(1, vp.h - S) }); flash('wave', 2200); };

  useEffect(() => { const r = () => setVp({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  // it keeps itself busy: drifts a little, looks at your pointer, leans in when you come close
  useEffect(() => {
    const id = window.setInterval(() => { if (drag || menu || document.visibilityState !== 'visible') return; setDrift({ x: Math.round((Math.random() - 0.5) * 20), y: Math.round((Math.random() - 0.5) * 14) }); }, 6500);
    const mv = (e: PointerEvent) => { const el = bodyRef.current; if (!el) return; const r = el.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2); const dy = e.clientY - (r.top + r.height / 2); const d = Math.hypot(dx, dy);
      el.style.setProperty('--gx', String(Math.max(-1, Math.min(1, dx / 260)))); el.style.setProperty('--gy', String(Math.max(-1, Math.min(1, dy / 260)))); setNear(d < 100 && !drag); };
    window.addEventListener('pointermove', mv); return () => { window.clearInterval(id); window.removeEventListener('pointermove', mv); };
  }, [drag, menu]);

  // it notices what you do: opening a tab, typing, coming back to the window, being left alone
  const pathRef = useRef(loc.pathname); const typing = useRef(0);
  useEffect(() => {
    const page = PATH_PAGE[loc.pathname]; if (page && pathRef.current !== loc.pathname) { flash(PAGE_MOOD[page], 3200); } pathRef.current = loc.pathname;
  }, [loc.pathname, flash]);
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
    const fin = (e: FocusEvent) => { if (isField(e.target)) { last.current.active = Date.now(); setMood('reading'); } };
    const fout = (e: FocusEvent) => { if (isField(e.target)) setMood(baseMood()); };
    const key = (e: KeyboardEvent) => { if (!isField(e.target)) return; const n = Date.now(); if (n - typing.current > 1800) { typing.current = n; setMood('thinking'); later(() => setMood((m) => (m === 'thinking' ? 'reading' : m)), 1500); } };
    const vis = () => { if (document.visibilityState === 'visible' && Date.now() - last.current.active > 60000) { last.current.active = Date.now(); speak('Willkommen zurück!', 'wave', 4500); } };
    const sleepy = window.setInterval(() => { const idle = Date.now() - last.current.active; if (!bubble && !menu && !drag) { if (idle > 300000) setMood('sleeping'); else if (idle > 120000) setMood('sleepy'); } }, 15000);
    document.addEventListener('focusin', fin); document.addEventListener('focusout', fout); document.addEventListener('keydown', key); document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('focusin', fin); document.removeEventListener('focusout', fout); document.removeEventListener('keydown', key); document.removeEventListener('visibilitychange', vis); window.clearInterval(sleepy); };
  }, [baseMood, later, speak, bubble, menu, drag]);

  const down = (e: RPointerEvent<HTMLButtonElement>) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); dragRef.current = { sx: e.clientX, sy: e.clientY, ox: left, oy: top, moved: false }; last.current.active = Date.now(); };
  const moveP = (e: RPointerEvent<HTMLButtonElement>) => { const d = dragRef.current; if (!d) return; const dx = e.clientX - d.sx; const dy = e.clientY - d.sy; if (!d.moved && Math.hypot(dx, dy) > 6) { d.moved = true; setDrag(true); setBubble(null); setMood('surprised'); } if (d.moved) moveTo(d.ox + dx, d.oy + dy); };
  const up = (e: RPointerEvent<HTMLButtonElement>) => { const d = dragRef.current; dragRef.current = null; try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ } if (!d) return;
    if (d.moved) { setDrag(false); setPos((p) => { if (p) { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* ignore */ } } return p; }); flash('happy', 1800); }
    else { if (mood === 'sleeping') setMood('surprised'); setMenu(true); } };
  const keys = (e: RKeyboardEvent<HTMLButtonElement>) => { const step = e.shiftKey ? 90 : 24; const m: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }; const v = m[e.key]; if (!v) return; e.preventDefault(); savePos({ fx: clamp01((left + v[0]) / Math.max(1, vp.w - S)), fy: clamp01((top + v[1]) / Math.max(1, vp.h - S)) }); };

  if (!who.me) return null;
  const top3 = obs.filter((o) => o.priority >= 30).slice(0, 3);
  const dismissBubble = () => setBubble(null);

  if (pref.hidden) return <button className="pet-mini" aria-label="Show the study helper" onClick={() => savePref({ hidden: false })}><Orb mood="happy" level={level} size={30} label="" /></button>;
  return (
    <>
      <div className={cx('pet', bubble && 'pet-talking', drag && 'pet-drag', onRight ? 'pet-right' : 'pet-left', below ? 'pet-below' : 'pet-above')} style={{ left, top, width: S, height: S }}>
        {bubble && !drag && (
          <div className="pet-bubble" key={bubble.key} role="status" aria-live="polite">
            <button className="pet-x" aria-label="Dismiss message" onClick={dismissBubble}><X size={13} aria-hidden /></button>
            <p>{bubble.text}</p>
          </div>
        )}
        <div className="pet-drift" style={{ transform: `translate(${drift.x}px, ${drift.y}px) scale(${near ? 1.1 : 1})` }}>
          <button ref={bodyRef} className="pet-body" aria-label="Study helper. Press to open, drag to move, or use the arrow keys to move" aria-haspopup="dialog" onPointerDown={down} onPointerMove={moveP} onPointerUp={up} onPointerCancel={up} onKeyDown={keys}
            onClick={(e) => { if (e.detail === 0) setMenu(true); }} onDoubleClick={() => flash('love', 2600)}>
            <Orb mood={mood} level={level} size={S} />
          </button>
        </div>
      </div>

      <Dialog open={menu} onClose={() => { setMenu(false); setOpen(null); setTipCard(null); }} title="Lumi, your study helper">
        <div className="stack">
          <div className="pet-hero"><Orb mood={mood === 'sleeping' ? 'wave' : mood} level={level} size={72} /><p className="muted">Hallo {who.me.display_name}! I watch both your progress and tell you what is useful right now. {level > 0 ? `My glow has grown ${['', 'one ring', 'two rings', 'three rings'][level]} from your shared study time.` : 'Study together and I will start to glow.'}</p></div>

          <section aria-labelledby="pd-now"><h3 id="pd-now">What should I do now?</h3>
            {top3.length === 0 ? <p className="muted">Everything is calm. Maybe add a word or log ten minutes.</p> : (
              <ul className="plain-list stack-sm">{top3.map((o) => (
                <li key={o.id} className="pet-todo"><span>{o.text}</span>
                  {o.materialId ? <Button size="sm" variant="primary" onClick={() => { setMenu(false); nav(`${loc.pathname}?update=${o.materialId}`); }}>Update</Button>
                    : o.to ? <Button size="sm" onClick={() => { setMenu(false); nav(o.to!); }}>Go</Button> : null}</li>))}</ul>
            )}
          </section>

          <section aria-labelledby="pd-tip"><h3 id="pd-tip">A tip</h3>
            <p className="pet-tip">{tipCard ? tipCard.text : 'Press the button for a tip about German or about this app.'}</p>
            <div className="row wrap"><Button size="sm" onClick={() => { const t = nextTip(); setTipCard(t); flash(t.mood ?? 'reading', 3500); }}>Show me a tip</Button>
              <Button size="sm" onClick={() => { const t = nextTip(PATH_PAGE[loc.pathname]); setTipCard(t); flash(t.mood ?? 'reading', 3500); }}>A tip for this page</Button></div>
          </section>

          <section aria-labelledby="pd-how"><h3 id="pd-how">How do I…?</h3>
            <ul className="plain-list">{HOWTO.map((h, i) => (
              <li key={h.q} className="how"><button className="how-q" aria-expanded={open === i} onClick={() => { setOpen(open === i ? null : i); flash('thinking', 2000); }}>{h.q}</button>
                {open === i && <ol className="how-steps">{h.steps.map((s) => <li key={s}>{s}</li>)}</ol>}</li>))}</ul>
          </section>

          <section aria-labelledby="pd-pos"><h3 id="pd-pos">Where should I sit?</h3>
            <p className="small muted">Drag me anywhere, or pick a corner. (With the keyboard: focus me and use the arrow keys.)</p>
            <div className="chips">{([['Top left', 'tl'], ['Top right', 'tr'], ['Bottom left', 'bl'], ['Bottom right', 'br']] as Array<[string, 'tl' | 'tr' | 'bl' | 'br']>).map(([l, c]) => <button key={c} className="chip" onClick={() => dock(c)}>{l}</button>)}</div>
          </section>

          <section aria-labelledby="pd-play"><h3 id="pd-play">Play</h3>
            <div className="chips">{([['Pet me', 'love'], ['Cheer', 'cheer'], ['Dance', 'dance'], ['Sleep', 'sleeping'], ['Surprise', 'surprised'], ['Read', 'reading'], ['Sad', 'sad'], ['Proud', 'proud']] as Array<[string, Mood]>).map(([l, m]) => <button key={l} className="chip" onClick={() => flash(m, 3600)}>{l}</button>)}</div>
          </section>

          <div className="row between wrap">
            <label className="check"><input type="checkbox" checked={pref.quiet} onChange={(e) => savePref({ quiet: e.target.checked })} /> Quiet mode (only talk when asked)</label>
            <Button size="sm" variant="ghost" onClick={() => { savePref({ hidden: true }); setMenu(false); }}>Hide me</Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
