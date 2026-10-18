import { Undo2 } from 'lucide-react';
import { Avatar, Button } from '@/components/ui/ui';
import { useWho } from '@/hooks/useWho';
import { useRun } from '@/hooks/useRun';
import { revertChange } from '@/api/mutations';
import { describe, diffParts } from '@/lib/domain/changelog';
import { formatTime, timeAgo } from '@/lib/domain/dates';
import type { ChangeEntry } from '@/types/db';

export function ChangeList({ entries, compact }: { entries: ChangeEntry[]; compact?: boolean }) {
  const who = useWho(); const run = useRun();
  if (entries.length === 0) return <p className="muted small">Nothing logged yet.</p>;
  return (
    <ol className="clog">
      {entries.map((e) => {
        const parts = diffParts(e);
        const canRevert = !e.reverted_at && e.table_name !== 'postponement_requests';
        return (
          <li key={e.id} className={e.reverted_at ? 'clog-rev' : ''}>
            <div className="clog-head">
              <span className="mono small muted" title={new Date(e.created_at).toLocaleString('en-GB')}>{compact ? timeAgo(e.created_at) : `${formatTime(e.created_at)} · ${timeAgo(e.created_at)}`}</span>
              <Avatar code={who.codeOf(e.actor_id)} accent={who.accentOf(e.actor_id)} size={14} label={who.nameOf(e.actor_id)} />
              <span><b>{describe(e)}</b> <span className="muted">{e.label}</span></span>
              {e.reverted_at && <span className="small muted">· reverted {timeAgo(e.reverted_at)}{e.reverted_by ? ` by ${who.nameOf(e.reverted_by)}` : ''}</span>}
              {canRevert && (
                <Button size="sm" variant="ghost" icon={<Undo2 size={13} aria-hidden />} aria-label={`Revert: ${describe(e)} ${e.label ?? ''}`}
                  onClick={() => void run(() => revertChange(e.id, e.op === 'DELETE'), { ok: e.op === 'DELETE' ? 'Restored' : 'Reverted', invalidate: ['change_log', 'goals', 'goal_resources', 'goal_progress', 'sessions', 'vocab', 'notes', 'announcements', 'resources', 'curriculum', 'plan'] })}>
                  {e.op === 'DELETE' ? 'Restore' : 'Revert'}
                </Button>
              )}
            </div>
            {parts.length > 0 && <ul className="clog-diff mono small">{parts.map((p, i) => <li key={i}>{p.field}: <s>{p.from}</s> → <b>{p.to}</b></li>)}</ul>}
          </li>
        );
      })}
    </ol>
  );
}
