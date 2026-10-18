import { useMemo, useState } from 'react';
import { useChangeLog } from '@/api/queries';
import { useWho } from '@/hooks/useWho';
import { Button, EmptyState, ErrorState, Input, Segmented, SkeletonCards } from '@/components/ui/ui';
import { ChangeList } from '@/components/ChangeList';
import { AREAS, TABLE_TAB } from '@/lib/domain/changelog';
import type { TabName } from '@/types/db';

export default function LogPage() {
  const who = useWho();
  const [limit, setLimit] = useState(150);
  const log = useChangeLog(limit);
  const [person, setPerson] = useState('all'); const [area, setArea] = useState<TabName | 'all'>('all'); const [q, setQ] = useState('');
  const list = useMemo(() => (log.data ?? []).filter((e) => (person === 'all' || e.actor_id === person) && (area === 'all' || TABLE_TAB[e.table_name] === area) &&
    (!q.trim() || `${e.label} ${e.table_name}`.toLowerCase().includes(q.trim().toLowerCase()))), [log.data, person, area, q]);
  if (log.isError) return <ErrorState message={(log.error as Error).message} onRetry={() => void log.refetch()} />;
  if (log.isLoading) return <SkeletonCards n={3} />;
  return (
    <div className="stack-lg">
      <div><h1>Log</h1><p className="muted">Every change by either of us is recorded here with what changed. <b>Revert</b> puts the earlier value back (and is logged too); <b>Restore</b> brings back something deleted. Chat messages are not part of the log.</p></div>
      <div className="row between wrap">
        <Segmented<string> label="Person" value={person} onChange={setPerson} options={[{ value: 'all', label: 'Both' }, ...who.learners.map((l) => ({ value: l.id, label: l.code }))]} />
        <Input aria-label="Search the log" className="input-search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="chips" role="group" aria-label="Area">{AREAS.map((a) => <button key={a.value} className={`chip ${area === a.value ? 'chip-on' : ''}`} aria-pressed={area === a.value} onClick={() => setArea(a.value)}>{a.label}</button>)}</div>
      {list.length === 0 ? <EmptyState title="Nothing here">No changes match these filters yet.</EmptyState> : <ChangeList entries={list} />}
      {(log.data?.length ?? 0) >= limit && <div><Button onClick={() => setLimit((n) => n + 150)}>Load older entries</Button></div>}
    </div>
  );
}
