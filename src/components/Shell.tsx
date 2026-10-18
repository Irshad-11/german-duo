import { useMemo, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, BookMarked, CalendarCheck2, Home, Languages, Library, LogOut, Megaphone, MessageCircle, Monitor, Moon, NotebookPen, Plus, Settings, Sun, WifiOff, MoreHorizontal, StickyNote, Timer } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useLiveStatus } from '@/hooks/useRealtime';
import { useQuick } from '@/hooks/useQuick';
import { useWho } from '@/hooks/useWho';
import { useAnnouncements, useAnnReads, useMessages, useNotifications, usePlan } from '@/api/queries';
import { markAllNotificationsRead, markNotificationRead, updateProfile } from '@/api/mutations';
import { Avatar, Badge, Dialog, IconButton, Button, cx } from '@/components/ui/ui';
import { planWeekNumber, timeAgo } from '@/lib/domain/dates';
import { useRun } from '@/hooks/useRun';

interface NavItem { to: string; label: string; icon: ReactNode; badge?: number }

export function Shell() {
  const { signOut, me } = useAuth();
  const { pref, setPref } = useTheme();
  const live = useLiveStatus();
  const quick = useQuick();
  const who = useWho();
  const nav = useNavigate();
  const loc = useLocation();
  const run = useRun();
  const { data: plan } = usePlan();
  const { data: messages } = useMessages();
  const { data: anns } = useAnnouncements();
  const { data: reads } = useAnnReads();
  const { data: notifs } = useNotifications();
  const [more, setMore] = useState(false);
  const [bell, setBell] = useState(false);
  const [fab, setFab] = useState(false);

  const unreadChat = useMemo(() => (messages ?? []).filter((m) => m.sender_id !== me?.id && !m.read_at).length, [messages, me?.id]);
  const unreadNotices = useMemo(() => {
    const seen = new Set((reads ?? []).map((r) => r.announcement_id));
    const now = Date.now();
    return (anns ?? []).filter((a) => a.author_id !== me?.id && !seen.has(a.id) && (!a.expires_at || new Date(a.expires_at).getTime() > now)).length;
  }, [anns, reads, me?.id]);
  const unreadNotifs = (notifs ?? []).filter((n) => !n.read_at);
  const week = plan ? planWeekNumber(plan.start_date, new Date()) : null;

  const items: NavItem[] = [
    { to: '/', label: 'Dashboard', icon: <Home size={20} aria-hidden /> },
    { to: '/plan', label: 'Plan', icon: <CalendarCheck2 size={20} aria-hidden /> },
    { to: '/library', label: 'Library', icon: <Library size={20} aria-hidden /> },
    { to: '/words', label: 'Words', icon: <Languages size={20} aria-hidden /> },
    { to: '/notes', label: 'Notes', icon: <NotebookPen size={20} aria-hidden /> },
    { to: '/chat', label: 'Chat', icon: <MessageCircle size={20} aria-hidden />, badge: unreadChat },
    { to: '/notices', label: 'Notices', icon: <Megaphone size={20} aria-hidden />, badge: unreadNotices },
    { to: '/settings', label: 'Settings', icon: <Settings size={20} aria-hidden /> },
  ];
  const tabs = [items[0], items[1], items[3], items[5]];
  const moreItems = [items[2], items[4], items[6], items[7]];
  const moreBadge = unreadNotices;

  function cycleTheme() {
    const next = pref === 'system' ? 'light' : pref === 'light' ? 'dark' : 'system';
    setPref(next);
  }
  const ThemeIcon = pref === 'dark' ? Moon : pref === 'light' ? Sun : Monitor;

  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <aside className="rail" aria-label="Primary">
        <div className="rail-brand"><span className="dot dot-a" /><span className="dot dot-b" /><b>German Duo</b></div>
        <nav>
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => cx('rail-link', isActive && 'on')}>
              {i.icon}<span>{i.label}</span>{!!i.badge && <span className="count" aria-label={`${i.badge} unread`}>{i.badge}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="rail-foot">
          <Button variant="primary" icon={<Plus size={18} aria-hidden />} onClick={() => setFab(true)}>Quick add</Button>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <div className="topbar-left">
            <span className="topbar-title">{items.find((i) => (i.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(i.to)))?.label ?? 'German Duo'}</span>
            {week !== null && week >= 1 && <Badge tone="info">Week {week}</Badge>}
          </div>
          <div className="topbar-right">
            <span className={cx('live', `live-${live}`)} role="status" aria-label={live === 'live' ? 'Live sync on' : live === 'connecting' ? 'Connecting' : 'Offline'}><i aria-hidden />{live === 'live' ? 'Live' : live === 'connecting' ? 'Connecting' : 'Offline'}</span>
            <IconButton label={`Theme: ${pref}. Change theme`} onClick={cycleTheme}><ThemeIcon size={20} aria-hidden /></IconButton>
            <IconButton label={`Notifications${unreadNotifs.length ? `, ${unreadNotifs.length} unread` : ''}`} onClick={() => setBell(true)} className="bell">
              <Bell size={20} aria-hidden />{unreadNotifs.length > 0 && <span className="dot-badge" aria-hidden>{unreadNotifs.length}</span>}
            </IconButton>
            {me && <button className="avatar-btn" aria-label="Open settings" onClick={() => nav('/settings')}><Avatar code={me.code} accent={me.accent} size={34} label={me.display_name} /></button>}
          </div>
        </header>
        {live === 'offline' && <div className="banner" role="alert"><WifiOff size={16} aria-hidden /> You are offline or the live connection dropped. Changes can’t be saved until you reconnect — we’ll refresh automatically.</div>}
        <main id="main" tabIndex={-1} className="page"><Outlet /></main>
      </div>

      <nav className="tabbar" aria-label="Primary mobile">
        {tabs.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => cx('tab', isActive && 'on')}>
            <span className="tab-ico">{i.icon}{!!i.badge && <span className="dot-badge" aria-label={`${i.badge} unread`}>{i.badge}</span>}</span><span>{i.label}</span>
          </NavLink>
        ))}
        <button className="tab" onClick={() => setMore(true)} aria-haspopup="dialog"><span className="tab-ico"><MoreHorizontal size={20} aria-hidden />{moreBadge > 0 && <span className="dot-badge" aria-hidden>{moreBadge}</span>}</span><span>More</span></button>
      </nav>
      <button className="fab" aria-label="Quick add" onClick={() => setFab(true)}><Plus size={26} aria-hidden /></button>

      <Dialog open={more} onClose={() => setMore(false)} title="More">
        <ul className="plain-list menu">
          {moreItems.map((i) => <li key={i.to}><button className="menu-item" onClick={() => { setMore(false); nav(i.to); }}>{i.icon}<span>{i.label}</span>{!!i.badge && <span className="count">{i.badge}</span>}</button></li>)}
          <li><button className="menu-item" onClick={() => { setMore(false); void signOut(); }}><LogOut size={20} aria-hidden /><span>Sign out</span></button></li>
        </ul>
        {who.partner && <p className="small muted">Learning with {who.partner.display_name}.</p>}
      </Dialog>

      <Dialog open={fab} onClose={() => setFab(false)} title="Quick add">
        <ul className="plain-list menu">
          <li><button className="menu-item" onClick={() => { setFab(false); quick.openSession(); }}><Timer size={20} aria-hidden /><span>Log study time</span></button></li>
          <li><button className="menu-item" onClick={() => { setFab(false); quick.openWord(); }}><Languages size={20} aria-hidden /><span>Add a word</span></button></li>
          <li><button className="menu-item" onClick={() => { setFab(false); quick.openNote('note'); }}><StickyNote size={20} aria-hidden /><span>Capture a note or question</span></button></li>
          <li><button className="menu-item" onClick={() => { setFab(false); nav('/plan?new=1'); }}><BookMarked size={20} aria-hidden /><span>New weekly goal</span></button></li>
        </ul>
      </Dialog>

      <Dialog open={bell} onClose={() => setBell(false)} title="Notifications" footer={unreadNotifs.length > 0 ? <Button onClick={() => void run(() => markAllNotificationsRead(unreadNotifs.map((n) => n.id)), { invalidate: ['notifications'] })}>Mark all as read</Button> : undefined}>
        {(notifs ?? []).length === 0 ? <p className="muted">Nothing yet. Requests, help calls and notices will show up here.</p> : (
          <ul className="plain-list notif-list">
            {(notifs ?? []).map((n) => (
              <li key={n.id} className={cx(!n.read_at && 'unread')}>
                <button className="menu-item" onClick={() => { void run(() => markNotificationRead(n.id), { invalidate: ['notifications'] }); setBell(false); if (n.link) nav(n.link); }}>
                  <span><b>{n.title}</b>{n.body && <><br /><span className="muted small">{n.body}</span></>}<br /><span className="muted small">{timeAgo(n.created_at)}</span></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </div>
  );
}

/** Persist the theme preference on the learner profile so it follows them across devices. */
export function useThemePersist() {
  const { me } = useAuth();
  return useMemo(() => (p: 'light' | 'dark' | 'system') => { if (me) void updateProfile(me.id, { theme_pref: p }).catch(() => undefined); }, [me]);
}
