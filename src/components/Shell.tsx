import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CalendarRange, Download, History, Home, Languages, Library, LogOut, MessageCircle, Monitor, Moon, Plus, Settings, Sun, WifiOff, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useLiveStatus } from '@/hooks/useRealtime';
import { useQuick } from '@/hooks/useQuick';
import { useTabDots } from '@/hooks/useTabDots';
import { useSessions } from '@/api/queries';
import { Avatar, Dialog, Dot, cx } from '@/components/ui/ui';
import { UpdateHost } from '@/components/UpdateDialog';
import { PetDock } from '@/pet/PetDock';
import { useInstall } from '@/pwa';

const TALK = ['/chat', '/notes', '/notices'];
interface Item { to: string; label: string; icon: ReactNode; dot?: number; active?: (p: string) => boolean }

export function Shell() {
  const { me, signOut } = useAuth(); const { pref, setPref } = useTheme(); const live = useLiveStatus(); const quick = useQuick(); const dots = useTabDots(); const loc = useLocation(); const nav = useNavigate();
  const { data: sessions } = useSessions(); const inst = useInstall();
  const [add, setAdd] = useState(false); const [menu, setMenu] = useState(false); const [guide, setGuide] = useState(false);
  const [banner, setBanner] = useState(() => { try { return localStorage.getItem('gd-install-dismissed') !== '1'; } catch { return true; } });
  const shared = useMemo(() => (sessions ?? []).reduce((a, s) => a + s.minutes, 0), [sessions]); const menuRef = useRef<HTMLDivElement>(null);
  const ThemeIcon = pref === 'dark' ? Moon : pref === 'light' ? Sun : Monitor; const next = pref === 'system' ? 'light' : pref === 'light' ? 'dark' : 'system';
  const talkDots = (dots.chat ?? 0) + (dots.notes ?? 0) + (dots.notices ?? 0);
  const items: Item[] = [
    { to: '/', label: 'Today', icon: <Home size={20} aria-hidden /> }, { to: '/plan', label: 'Plan', icon: <CalendarRange size={20} aria-hidden />, dot: dots.plan },
    { to: '/words', label: 'Words', icon: <Languages size={20} aria-hidden />, dot: dots.words }, { to: '/library', label: 'Library', icon: <Library size={20} aria-hidden />, dot: dots.library },
    { to: '/chat', label: 'Talk', icon: <MessageCircle size={20} aria-hidden />, dot: talkDots, active: (p) => TALK.some((t) => p.startsWith(t)) },
  ];
  const link = (i: Item, cls: string): ReactNode => (
    <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => cx(cls, (i.active ? i.active(loc.pathname) : isActive) && 'on')}><span className="nav-ic">{i.icon}</span><span className="nav-tx">{i.label}</span><Dot n={i.dot} /></NavLink>
  );
  useEffect(() => { setMenu(false); }, [loc.pathname]);
  useEffect(() => { if (!menu) return; const h = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); }; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); }; document.addEventListener('mousedown', h); document.addEventListener('keydown', k); return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); }; }, [menu]);
  const showBanner = banner && !inst.installed && (inst.canPrompt || inst.ios);

  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <div id="app-content" className="app">
        <header className="top">
          <div className="top-in">
            <NavLink to="/" className="brand" aria-label="German Duo, home"><span className="brand-mark"><i /><i /></span><span className="brand-name">German Duo</span></NavLink>
            <nav className="top-nav" aria-label="Main">{items.map((i) => link(i, 'top-item'))}</nav>
            <div className="top-right">
              <span className={cx('live', `live-${live}`)} role="status" aria-label={`Sync: ${live}`}><i aria-hidden /><span className="live-tx">{live === 'live' ? 'Live' : live === 'connecting' ? 'Connecting' : 'Offline'}</span></span>
              <button className="top-add" onClick={() => setAdd(true)}><Plus size={17} aria-hidden /><span>Add</span></button>
              <div className="acct" ref={menuRef}>
                <button className="acct-btn" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu} aria-label="Account menu">{me && <Avatar code={me.code} accent={me.accent} size={22} label={me.display_name} />}</button>
                {menu && (
                  <div className="acct-menu" role="menu">
                    <p className="acct-who">{me?.display_name}</p>
                    <button role="menuitem" onClick={() => nav('/log')}><History size={16} aria-hidden /> History &amp; undo</button>
                    <button role="menuitem" onClick={() => nav('/settings')}><Settings size={16} aria-hidden /> Settings</button>
                    <button role="menuitem" onClick={() => setPref(next)}><ThemeIcon size={16} aria-hidden /> Theme: {pref}</button>
                    {!inst.installed && <button role="menuitem" onClick={() => { setMenu(false); if (inst.canPrompt) void inst.install(); else setGuide(true); }}><Download size={16} aria-hidden /> Install app</button>}
                    <button role="menuitem" onClick={() => void signOut()}><LogOut size={16} aria-hidden /> Sign out</button>
                  </div>)}
              </div>
            </div>
          </div>
        </header>
        {live === 'offline' && <div className="banner" role="alert"><WifiOff size={15} aria-hidden /> Offline — changes can’t be saved right now. Reconnecting automatically.</div>}
        {showBanner && (
          <div className="install" role="region" aria-label="Install the app"><span className="grow"><b>Install German Duo</b> on your phone — it opens like a normal app.</span>
            <button className="install-go" onClick={() => { if (inst.canPrompt) void inst.install(); else setGuide(true); }}>{inst.canPrompt ? 'Install' : 'How?'}</button>
            <button className="icon-btn icon-btn-sm" aria-label="Hide" onClick={() => { setBanner(false); try { localStorage.setItem('gd-install-dismissed', '1'); } catch { /* ignore */ } }}><X size={16} aria-hidden /></button></div>)}
        <div className="scroll"><main id="main" tabIndex={-1} className="page" data-path={loc.pathname}><Outlet /></main></div>
        <nav className="bar" aria-label="Main mobile">{items.map((i) => link(i, 'bar-item'))}</nav>
      </div>
      <div id="layer" />

      <Dialog open={add} onClose={() => setAdd(false)} title="Add">
        <ul className="plain-list menu">
          <li><button className="menu-item" onClick={() => { setAdd(false); quick.openSession(); }}>Log study time</button></li>
          <li><button className="menu-item" onClick={() => { setAdd(false); nav('/words'); }}>Add words (quick)</button></li>
          <li><button className="menu-item" onClick={() => { setAdd(false); quick.openNote('question'); }}>Ask a question</button></li>
          <li><button className="menu-item" onClick={() => { setAdd(false); quick.openNote('note'); }}>Write a note</button></li>
          <li><NavLink className="menu-item" to="/plan?new=1" onClick={() => setAdd(false)}>New goal</NavLink></li>
        </ul>
      </Dialog>
      <Dialog open={guide} onClose={() => setGuide(false)} title="Install on your phone">
        <ol className="how-steps big">
          <li><b>iPhone / iPad (Safari):</b> tap the Share button, then “Add to Home Screen”, then “Add”.</li>
          <li><b>Android (Chrome):</b> open the ⋮ menu, then “Install app” (or “Add to Home screen”).</li>
          <li><b>Computer (Chrome / Edge):</b> click the install icon at the right of the address bar.</li>
        </ol>
        <p className="small muted">After installing, it opens full screen with its own icon and splash screen, and the app itself works offline (your data needs a connection).</p>
      </Dialog>
      <UpdateHost />
      <PetDock totalMinutes={shared} />
    </div>
  );
}
