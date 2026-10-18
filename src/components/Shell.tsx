import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { WifiOff, Sun, Moon, Monitor, Plus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useLiveStatus } from '@/hooks/useRealtime';
import { useQuick } from '@/hooks/useQuick';
import { useTabDots } from '@/hooks/useTabDots';
import { usePlan } from '@/api/queries';
import { Avatar, Dialog, Dot, cx } from '@/components/ui/ui';
import { planWeekNumber } from '@/lib/domain/dates';
import type { TabName } from '@/types/db';

interface Item { to: string; label: string; tab?: TabName }
const ITEMS: Item[] = [
  { to: '/', label: 'Home' }, { to: '/plan', label: 'Plan', tab: 'plan' }, { to: '/words', label: 'Words', tab: 'words' }, { to: '/chat', label: 'Chat', tab: 'chat' },
  { to: '/notes', label: 'Notes', tab: 'notes' }, { to: '/library', label: 'Library', tab: 'library' }, { to: '/notices', label: 'Notices', tab: 'notices' }, { to: '/log', label: 'Log' }, { to: '/settings', label: 'Settings' },
];

export function Shell() {
  const { me, signOut } = useAuth(); const { pref, setPref } = useTheme(); const live = useLiveStatus(); const quick = useQuick(); const dots = useTabDots(); const loc = useLocation();
  const { data: plan } = usePlan();
  const [more, setMore] = useState(false); const [add, setAdd] = useState(false);
  const week = plan ? planWeekNumber(plan.start_date, new Date()) : null;
  const ThemeIcon = pref === 'dark' ? Moon : pref === 'light' ? Sun : Monitor;
  const next = pref === 'system' ? 'light' : pref === 'light' ? 'dark' : 'system';
  const nav = (i: Item): ReactNode => (
    <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => cx('nav-item', isActive && 'on')}>{i.label}{i.tab && <Dot n={dots[i.tab]} />}</NavLink>
  );
  const moreDots = (dots.notes ?? 0) + (dots.library ?? 0) + (dots.notices ?? 0);
  const current = ITEMS.find((i) => (i.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(i.to)));

  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <header className="top">
        <div className="top-row">
          <span className="brand"><i className="mk-a" /><i className="mk-b" />German Duo</span>
          <nav className="top-nav" aria-label="Main">{ITEMS.slice(0, 8).map(nav)}</nav>
          <div className="top-right">
            {week !== null && week >= 1 && <span className="mono small muted hide-s">W{week}</span>}
            <span className={cx('live', `live-${live}`)} role="status"><i aria-hidden />{live === 'live' ? 'Live' : live === 'connecting' ? 'Connecting' : 'Offline'}</span>
            <button className="icon-btn" aria-label={`Theme: ${pref}. Switch to ${next}`} onClick={() => setPref(next)}><ThemeIcon size={18} aria-hidden /></button>
            <NavLink to="/settings" className="who" aria-label="Settings">{me && <Avatar code={me.code} accent={me.accent} size={16} label={`Signed in as ${me.display_name}`} />}</NavLink>
          </div>
        </div>
        <p className="top-title">{current?.label ?? 'German Duo'}</p>
      </header>
      {live === 'offline' && <div className="banner" role="alert"><WifiOff size={15} aria-hidden /> Offline — changes can’t be saved right now. Reconnecting automatically.</div>}
      <main id="main" tabIndex={-1} className="page"><Outlet /></main>

      <nav className="bar" aria-label="Main mobile">
        {[ITEMS[0], ITEMS[1], ITEMS[2], ITEMS[3]].map(nav)}
        <button className={cx('nav-item', more && 'on')} onClick={() => setMore(true)} aria-haspopup="dialog">More<Dot n={moreDots} /></button>
      </nav>
      <button className="fab" aria-label="Quick add" onClick={() => setAdd(true)}><Plus size={22} aria-hidden /></button>

      <Dialog open={more} onClose={() => setMore(false)} title="More">
        <ul className="plain-list menu">
          {ITEMS.slice(4).map((i) => <li key={i.to}><NavLink to={i.to} className="menu-item" onClick={() => setMore(false)}>{i.label}<Dot n={i.tab ? dots[i.tab] : undefined} /></NavLink></li>)}
          <li><button className="menu-item" onClick={() => { setMore(false); void signOut(); }}>Sign out</button></li>
        </ul>
      </Dialog>
      <Dialog open={add} onClose={() => setAdd(false)} title="Quick add">
        <ul className="plain-list menu">
          <li><button className="menu-item" onClick={() => { setAdd(false); quick.openSession(); }}>Log study time</button></li>
          <li><button className="menu-item" onClick={() => { setAdd(false); quick.openWord(); }}>Add a word</button></li>
          <li><button className="menu-item" onClick={() => { setAdd(false); quick.openNote('note'); }}>Note or question</button></li>
          <li><NavLink className="menu-item" to="/plan?new=1" onClick={() => setAdd(false)}>New goal</NavLink></li>
        </ul>
      </Dialog>
    </div>
  );
}
