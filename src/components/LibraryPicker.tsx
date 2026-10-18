import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button, Chip, Dialog, EmptyState, Input, Select } from '@/components/ui/ui';
import { FolderTag } from '@/components/people';
import { useResources } from '@/api/queries';
import { CATEGORIES, LEVELS, categoryLabel, formatSize } from '@/lib/domain/folders';
import type { Level, Resource } from '@/types/db';

export function filterResources(rs: Resource[], q: string, level: Level | null, category: string): Resource[] {
  const n = q.trim().toLowerCase();
  return rs.filter((r) => (!level || r.level === level) && (!category || r.category === category) &&
    (!n || r.title.toLowerCase().includes(n) || r.filename.toLowerCase().includes(n) || r.source_folder.toLowerCase().includes(n)));
}

export function LibraryPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (r: Resource) => void }) {
  const { data, isLoading } = useResources();
  const [q, setQ] = useState(''); const [level, setLevel] = useState<Level | null>(null); const [cat, setCat] = useState('');
  const [added, setAdded] = useState(0);
  const list = useMemo(() => filterResources(data ?? [], q, level, cat).slice(0, 80), [data, q, level, cat]);
  return (
    <Dialog open={open} onClose={onClose} title="Add from the library" wide footer={<><span className="muted small">{added ? `${added} added` : ''}</span><Button variant="primary" onClick={onClose}>Done</Button></>}>
      <div className="stack-sm">
        <div className="search"><Search size={16} aria-hidden /><Input aria-label="Search files" placeholder="Search by title, file name or folder" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="chips" role="group" aria-label="Level">{LEVELS.map((l) => <Chip key={l} on={level === l} onClick={() => setLevel(level === l ? null : l)}>{l}</Chip>)}</div>
        <Select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}</Select>
      </div>
      {isLoading ? <p className="muted">Loading…</p> : list.length === 0 ? <EmptyState title="No files match">Try a different search or clear a filter.</EmptyState> : (
        <ul className="plain-list picker">
          {list.map((r) => (
            <li key={r.id} className="picker-row" style={{ ['--tag' as string]: `var(--lvl-${r.level.toLowerCase()})` }}>
              <div className="grow">
                <FolderTag level={r.level} folder={r.source_folder} category={r.category} />
                <p><b>{r.title}</b></p>
                <p className="small muted">{r.file_type.toUpperCase()}{r.page_count ? ` · ${r.page_count} pages` : ''}{r.size_kb ? ` · ${formatSize(r.size_kb)}` : ''}{r.external_url ? ' · link saved' : ''}</p>
              </div>
              <Button size="sm" icon={<Plus size={15} aria-hidden />} onClick={() => { onPick(r); setAdded((n) => n + 1); }} aria-label={`Add ${r.title}`}>Add</Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
