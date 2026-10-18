import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CalendarRange, History, Home, Languages, Library, LogOut, Megaphone, MessageCircle, Monitor, Moon, MoreHorizontal, NotebookPen, Plus, Settings, Sun, WifiOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useLiveStatus } from '@/hooks/useRealtime';
import { useQuick } from '@/hooks/useQuick';
import { useTabDots } from '@/hooks/useTabDots';
import { usePlan, useSessions } from '@/api/queries';
import { Avatar, Dialog, Dot, cx } from '@/components/ui/ui';
import { UpdateHost } from '@/components/UpdateDialog';
import { PetDock } from '@/pet/PetDock';
import { planWeekNumber } from '@/lib/domain/dates';
import type { TabName } from '@/types/db';
import { useMemo } from 'react';

interface Item { to: string; label: string; icon: ReactNode; tab?: TabName }
const ic = (n: ReactNode) => n;
const ITEMS: Item[] = [
  { to: '/', label: 'Today', icon: ic(<Home size={19} aria-hidden />) }, { to: '/plan', label: 'Plan', icon: <CalendarRange size={19} aria-hidden />, tab: 'plan' }, { to: '/words', label: 'Words', icon: <Languages size={19} aria-hidden />, tab: 'words' },
  { to: '/chat', label: 'Chat', icon: <MessageCircle size={19} aria-hidden />, tab: 'chat' }, { to: '/notes', label: 'Notes', icon: <NotebookPen size={19} aria-hidden />, tab: 'notes' }, { to: '/library', label: 'Library', icon: <Library size={19} aria-hidden />, tab: 'library' },
  { to: '/notices', label: 'Notices', icon: <Megaphone size={19} aria-hidden />, tab: 'notices' }, { to: '/log', label: 'History', icon: <History size={19} aria-hidden /> }, { to: '/settings', label: 'Settings', icon: <Settings size={19} aria-hidden /> },
];

export function Shell() {
  const { me, signOut } = useAuth(); const { pref, setPref } = useTheme(); const live = useLiveStatus(); const quick = useQuick(); const dots = useTabDots(); const loc = useLocation();
  const { data: plan } = usePlan(); const { data: sessions } = useSessions();
  const [more, setMore] = useState(false); const [add, setAdd] = useState(false);
  const week = plan ? planWeekNumber(plan.start_date, new Date()) : null;
  const shared = useMemo(() => (sessions ?? []).reduce((a, s) => a + s.minutes, 0), [sessions]);
  const ThemeIcon = pref === 'dark' ? Moon : pref === 'light' ? Sun : Monitor; const next = pref === 'system' ? 'light' : pref === 'light' ? 'dark' : 'system';
  const link = (i: Item, cls: string): ReactNode => <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => cx(cls, isActive && 'on')}><span className="nav-ic">{i.icon}</span><span className="nav-tx">{i.label}</span><Dot n={dots[i.tab as TabName]} /></NavLink>;
  const moreDots = (dots.notes ?? 0) + (dots.library ?? 0) + (dots.notices ?? 0);
  const current = ITEMS.find((i) => (i.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(i.to)));

  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <aside className="side" aria-label="Sidebar">
        <div className="brand"><span className="brand-mark"><i /><i /></span><span className="brand-name">German Duo</span></div>
        <nav className="side-nav" aria-label="Main">{ITEMS.map((i) => link(i, 'side-item'))}</nav>
        <div className="side-foot">
          <button className="btn btn-primary btn-block" onClick={() => setAdd(true)}><Plus size={17} aria-hidden /> Quick add</button>
          <div className="side-user">{me && <Avatar code={me.code} accent={me.accent} size={22} label={me.display_name} />}<span className="grow side-name">{me?.display_name}</span>
            <button className="icon-btn" aria-label={`Theme: ${pref}. Switch to ${next}`} onClick={() => setPref(next)}><ThemeIcon size={17} aria-hidden /></button>
            <button className="icon-btn" aria-label="Sign out" onClick={() => void signOut()}><LogOut size={17} aria-hidden /></button></div>
          <span className={cx('live', `live-${live}`)} role="status"><i aria-hidden />{live === 'live' ? 'Live sync' : live === 'connecting' ? 'Connecting…' : 'Offline'}</span>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <div><p className="crumb">{week && week >= 1 ? `Week ${week}` : 'German Duo'}</p><p className="topbar-title">{current?.label ?? 'German Duo'}</p></div>
          <div className="topbar-right"><span className={cx('live live-sm', `live-${live}`)} role="status" aria-label={`Sync: ${live}`}><i aria-hidden /></span>
            <button className="btn btn-primary btn-sm topbar-add" onClick={() => setAdd(true)}><Plus size={16} aria-hidden /> Add</button></div>
        </header>
        {live === 'offline' && <div className="banner" role="alert"><WifiOff size={15} aria-hidden /> Offline — changes can’t be saved right now. Reconnecting automatically.</div>}
        <main id="main" tabIndex={-1} className="page" data-path={loc.pathname}><Outlet /></main>
      </div>

      <nav className="bar" aria-label="Main mobile">{[ITEMS[0], ITEMS[1], ITEMS[2], ITEMS[3]].map((i) => link(i, 'bar-item'))}
        <button className={cx('bar-item', more && 'on')} onClick={() => setMore(true)} aria-haspopup="dialog"><span className="nav-ic"><MoreHorizontal size={19} aria-hidden /></span><span className="nav-tx">More</span><Dot n={moreDots} /></button></nav>

      <Dialog open={more} onClose={() => setMore(false)} title="More">
        <ul className="plain-list menu">{ITEMS.slice(4).map((i) => <li key={i.to}><NavLink to={i.to} className="menu-item" onClick={() => setMore(false)}><span className="row">{i.icon}{i.label}</span><Dot n={i.tab ? dots[i.tab] : undefined} /></NavLink></li>)}
          <li><button className="menu-item" onClick={() => { setMore(false); setPref(next); }}><span className="row"><ThemeIcon size={19} aria-hidden />Theme: {pref}</span></button></li>
          <li><button className="menu-item" onClick={() => { setMore(false); void signOut(); }}><span className="row"><LogOut size={19} aria-hidden />Sign out</span></button></li></ul>
      </Dialog>
      <Dialog open={add} onClose={() => setAdd(false)} title="Quick add">
        <ul className="plain-list menu">
          <li><button className="menu-item" onClick={() => { setAdd(false); quick.openSession(); }}>Log study time</button></li>
          <li><button className="menu-item" onClick={() => { setAdd(false); quick.openWord(); }}>Add a word</button></li>
          <li><button className="menu-item" onClick={() => { setAdd(false); quick.openNote('question'); }}>Ask a question</button></li>
          <li><button className="menu-item" onClick={() => { setAdd(false); quick.openNote('note'); }}>Write a note</button></li>
          <li><NavLink className="menu-item" to="/plan?new=1" onClick={() => setAdd(false)}>New goal</NavLink></li>
        </ul>
      </Dialog>
      <UpdateHost />
      <PetDock totalMinutes={shared} />
    </div>
  );
}
