import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useTabDots } from '@/hooks/useTabDots';
import { Dot, cx } from '@/components/ui/ui';

/** Every screen: a deep-green title band, then open content on paper (no boxed dashboard widgets). */
export function Page({ kicker, title, lead, actions, children, narrow }: { kicker?: ReactNode; title: ReactNode; lead?: ReactNode; actions?: ReactNode; children: ReactNode; narrow?: boolean }) {
  return (
    <>
      <section className="hero-band"><div className="inner">
        {kicker && <p className="kicker">{kicker}</p>}<h1>{title}</h1>{lead && <p className="lead-text">{lead}</p>}{actions && <div className="hero-actions">{actions}</div>}
      </div></section>
      <div className={cx('inner body', narrow && 'inner-narrow')}>{children}</div>
    </>
  );
}

/** Chat, Notes and Notices live together under "Talk". */
export function TalkTabs() {
  const d = useTabDots();
  const items: Array<[string, string, number | undefined]> = [['/chat', 'Chat', d.chat], ['/notes', 'Notes & questions', d.notes], ['/notices', 'Notices', d.notices]];
  return <nav className="subnav" aria-label="Talk">{items.map(([to, label, n]) => <NavLink key={to} to={to} className={({ isActive }) => cx('subnav-item', isActive && 'on')}>{label}<Dot n={n} /></NavLink>)}</nav>;
}
