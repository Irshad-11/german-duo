import { Folder, MessageCircleQuestion } from 'lucide-react';
import { Avatar } from '@/components/ui/ui';
import { STATUS_BY_VALUE } from '@/lib/domain/status';
import { appliesTo, isReadyForQuestions, measure } from '@/lib/domain/progress';
import { folderColor, folderCrumbs, categoryLabel } from '@/lib/domain/folders';
import type { GoalProgress, GoalResource, Learner, Level, ResourceStatus } from '@/types/db';

const GLYPH: Record<ResourceStatus, string> = { not_started: '○', ready: '○', opened: '◔', reading: '◑', continuing: '◑', paused: '‖', awaiting_review: '◕', ready_for_questions: '?', needs_help: '!', completed: '●' };
export function StatusMark({ status }: { status: ResourceStatus }) {
  const m = STATUS_BY_VALUE[status];
  return <span className={`st st-${m.tone}`}><b aria-hidden>{GLYPH[status]}</b> {m.label}</span>;
}

/** “Finished properly — ask me about it.” Shown next to a finished task. */
export function ReadyBadge({ short }: { short?: boolean }) {
  return <span className="rq-badge" title="Finished properly — you can ask about this now"><MessageCircleQuestion size={12} aria-hidden /> {short ? 'Ready' : 'Ready for questions'}</span>;
}
/** “Only for IR” — a task that is not meant for both. */
export function OnlyFor({ learner }: { learner: Learner | undefined }) {
  return <span className="only-for" title="This task is only for one person">Only for {learner?.display_name ?? 'one person'}</span>;
}

/** Original folder location, coloured by level. */
export function FolderTag({ level, folder, category }: { level: Level | null; folder: string | null; category?: string | null }) {
  const crumbs = folderCrumbs(folder);
  return (
    <span className="folder" style={{ ['--tag' as string]: folderColor(level) }} title={`Original location: ${crumbs.join(' / ') || '—'}`}>
      <Folder size={12} aria-hidden /><b>{level ?? '—'}</b>{crumbs.slice(level && crumbs[0] === level ? 1 : 0).map((c, i) => <span key={i}><i aria-hidden>/</i>{c}</span>)}{category && <em>{categoryLabel(category)}</em>}
    </span>
  );
}

export function MiniBar({ pct, accent }: { pct: number | null; accent: 'blue' | 'orange' }) {
  return <span className={`mini mini-${accent}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} aria-label="progress"><i style={{ width: `${pct ?? 0}%` }} /></span>;
}

/** One learner's state on one assignment, in a single compact cell. */
export function PersonCell({ learner, r, p }: { learner: Learner; r: GoalResource; p?: GoalProgress }) {
  if (!appliesTo(r, learner.id)) return <div className="pcell"><span className="small muted">Not for {learner.display_name}</span></div>;
  const m = measure(r, p);
  return (
    <div className="pcell">
      <StatusMark status={p?.status ?? 'not_started'} />{p?.status === 'completed' && isReadyForQuestions(p) && <ReadyBadge />}
      <MiniBar pct={m.pct} accent={learner.accent} />
      <span className="small muted">
        {m.pct === null ? '' : `${m.pct}%`}{m.total && m.unit === 'pages' ? ` · ${m.done}/${m.total} p` : m.total ? ` · ${m.done}/${m.total} ${m.unit}` : ''}{p?.current_page && p.status !== 'completed' ? ` · at p.${p.current_page}` : ''}{p?.minutes_total ? ` · ${p.minutes_total}m` : ''}
      </span>
      {p?.note && <span className="pnote" title={p.note}>“{p.note.length > 60 ? p.note.slice(0, 57) + '…' : p.note}”</span>}
    </div>
  );
}
export { Avatar };
