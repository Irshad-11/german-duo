import { useState } from 'react';
import { Copy, ExternalLink, FolderOpen, Search } from 'lucide-react';
import { Avatar, Button, cx } from '@/components/ui/ui';
import { FolderTag, MiniBar } from '@/components/people';
import { DRIVE_ROOT_URL, driveSearchUrl } from '@/lib/config';
import { measure } from '@/lib/domain/progress';
import { SIMPLE_LABEL, simpleOf } from '@/lib/domain/status';
import { pageRangeLabel } from '@/lib/domain/folders';
import { formatDay, formatMinutes } from '@/lib/domain/dates';
import type { Goal, GoalProgress, GoalResource, Learner } from '@/types/db';

/** Opens the saved file link, or — when none is saved — the shared Drive root folder and a Drive search for the file name. */
export function MaterialLinks({ url, filename, title, folder, compact }: { url: string | null; filename: string | null; title: string; folder?: string | null; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const name = filename ?? title;
  if (url) return <a className={cx('btn', compact ? 'btn-sm' : '')} href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} aria-hidden /> Open file</a>;
  return (
    <span className="mlinks">
      <a className={cx('btn', compact && 'btn-sm')} href={DRIVE_ROOT_URL} target="_blank" rel="noopener noreferrer"><FolderOpen size={14} aria-hidden /> Open Drive folder</a>
      <a className={cx('btn', compact ? 'btn-sm' : '')} href={driveSearchUrl(name)} target="_blank" rel="noopener noreferrer"><Search size={14} aria-hidden /> Find in Drive</a>
      {!compact && (
        <>
          <Button size="sm" variant="ghost" icon={<Copy size={13} aria-hidden />} onClick={() => { void navigator.clipboard?.writeText(name).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }, () => undefined); }}>{copied ? 'Copied' : 'Copy file name'}</Button>
          <span className="small muted">{folder ? `Look in “${folder.split('/').join(' › ')}” for ` : 'Look for '}<i>{name}</i>. Save its link once and it opens directly next time.</span>
        </>
      )}
    </span>
  );
}

/** One plain-language line per learner, e.g. “IR · Studying · page 14 · 45%”. */
export function PeopleLines({ r, progress, learners }: { r: GoalResource; progress: GoalProgress[]; learners: Learner[] }) {
  return (
    <ul className="plain-list plines">
      {learners.map((l) => {
        const p = progress.find((x) => x.goal_resource_id === r.id && x.learner_id === l.id); const m = measure(r, p); const s = simpleOf(p?.status ?? 'not_started');
        return (
          <li key={l.id} className="pline">
            <Avatar code={l.code} accent={l.accent} size={15} label={l.display_name} /> <span className="pline-name">{l.display_name}</span>
            <span className={cx('pline-state', `s-${s}`)}>{SIMPLE_LABEL[s]}</span>
            <MiniBar pct={m.pct} accent={l.accent} />
            <span className="small muted">{m.pct !== null ? `${m.pct}%` : ''}{p?.current_page && s === 'studying' ? ` · page ${p.current_page}` : ''}{p?.minutes_total ? ` · ${formatMinutes(p.minutes_total)}` : ''}</span>
            {p?.note && <span className="pnote small">“{p.note.length > 70 ? p.note.slice(0, 67) + '…' : p.note}”</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** A material with both people’s progress and the two obvious actions. */
export function MaterialCard({ r, goal, progress, learners, onUpdate }: { r: GoalResource; goal?: Goal; progress: GoalProgress[]; learners: Learner[]; onUpdate: (id: string) => void }) {
  return (
    <article className="mcard" style={{ ['--tag' as string]: r.level ? `var(--lvl-${r.level.toLowerCase()})` : 'var(--lvl-all)' }}>
      <header className="mcard-head">
        <div className="grow"><h3 className="mcard-title">{r.title}</h3>
          <p className="small muted">{pageRangeLabel(r.start_page, r.end_page, r.page_count)}{r.est_minutes ? ` · about ${formatMinutes(r.est_minutes)}` : ''}{goal ? ` · ${goal.title}, due ${formatDay(goal.deadline)}` : ''}</p></div>
        <FolderTag level={r.level} folder={r.source_folder} />
      </header>
      {r.instructions && <p className="small">{r.instructions}</p>}
      <PeopleLines r={r} progress={progress} learners={learners} />
      <div className="mcard-actions"><MaterialLinks url={r.external_url} filename={r.filename} title={r.title} compact /><Button variant="primary" size="sm" onClick={() => onUpdate(r.id)}>Update progress &amp; time</Button></div>
    </article>
  );
}
