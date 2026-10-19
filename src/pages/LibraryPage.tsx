import { useMemo, useState } from 'react';
import { FileImage, FileText, Link2, Plus, Search, Trash2 } from 'lucide-react';
import { useGoalResources, useGoals, useResources } from '@/api/queries';
import { addGoalResource, createResource, deleteResource, updateResource } from '@/api/mutations';
import { useRun } from '@/hooks/useRun';
import { Button, Chip, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, Select, SkeletonCards, Textarea } from '@/components/ui/ui';
import { Page } from '@/components/Page';
import { FolderTag } from '@/components/people';
import { MaterialLinks } from '@/components/material';
import { filterResources } from '@/components/LibraryPicker';
import { DRIVE_ROOT_URL } from '@/lib/config';
import { CATEGORIES, LEVELS, categoryLabel, formatSize } from '@/lib/domain/folders';
import { checkResourceUrl } from '@/lib/domain/links';
import { validatePageRange } from '@/lib/validation';
import { formatDay } from '@/lib/domain/dates';
import { draftFromResource } from '@/components/GoalEditor';
import type { Level, Resource } from '@/types/db';

export default function LibraryPage() {
  const res = useResources();
  const [q, setQ] = useState(''); const [level, setLevel] = useState<Level | null>(null); const [cat, setCat] = useState('');
  const [edit, setEdit] = useState<Resource | 'new' | null>(null); const [addTo, setAddTo] = useState<Resource | null>(null);
  const list = useMemo(() => filterResources(res.data ?? [], q, level, cat), [res.data, q, level, cat]);
  const grouped = useMemo(() => { const m = new Map<string, Resource[]>(); for (const r of list) { const k = r.source_folder || '(no folder)'; m.set(k, [...(m.get(k) ?? []), r]); } return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)); }, [list]);
  if (res.isError) return <ErrorState message={(res.error as Error).message} onRetry={() => void res.refetch()} />;
  if (res.isLoading) return <Page title="Library"><SkeletonCards /></Page>;
  const total = res.data?.length ?? 0; const withLink = (res.data ?? []).filter((r) => r.external_url).length;
  return (
    <Page kicker="Books & files" title="Library" lead={`${total} files from your Drive folder · ${withLink} with a saved link`} actions={<><a className="btn btn-light" href={DRIVE_ROOT_URL} target="_blank" rel="noopener noreferrer">Open the Drive folder</a><Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setEdit('new')}>Add a file</Button></>}>
      <p className="note-box">Drive cannot link to a file by name, so a file without a saved link opens the folder plus a name search. Save a file’s link once — then it opens directly for both of you. The 52-week plan lives in <b>Plan → Syllabus</b>.</p>
      <div className="filters">
        <div className="search"><Search size={15} aria-hidden /><Input aria-label="Search the library" placeholder="Search title, file name or folder" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="row wrap"><div className="chips" role="group" aria-label="Level">{LEVELS.map((l) => <Chip key={l} on={level === l} onClick={() => setLevel(level === l ? null : l)}>{l}</Chip>)}</div>
          <Select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}</Select></div>
      </div>
      {grouped.length === 0 ? <EmptyState title="No files match">Change the search or clear the filters.</EmptyState> : grouped.map(([folder, items]) => (
        <section key={folder} className="folder-section"><h2 className="folder-h"><FolderTag level={items[0].level} folder={folder} /> <span className="muted small">{items.length} file{items.length > 1 ? 's' : ''}</span></h2>
          <ul className="plain-list rows">{items.map((r) => { const Icon = /png|jpe?g|webp/.test(r.file_type) ? FileImage : FileText; return (
            <li key={r.id} className="row-item" style={{ ['--tag' as string]: `var(--lvl-${r.level.toLowerCase()})` }}>
              <Icon size={20} aria-hidden className="res-icon" />
              <div className="grow"><p className="row-title">{r.title}</p><p className="small muted">{r.filename}</p><p className="small muted">{categoryLabel(r.category)} · {r.file_type.toUpperCase()}{r.page_count ? ` · ${r.page_count} pages` : r.is_catalog && r.file_type === 'pdf' ? ' · page count unavailable' : ''}{r.size_kb ? ` · ${formatSize(r.size_kb)}` : ''}</p></div>
              <div className="row wrap end"><MaterialLinks url={r.external_url} filename={r.filename} title={r.title} compact />
                <Button size="sm" icon={<Link2 size={14} aria-hidden />} onClick={() => setEdit(r)} aria-label={`Edit link and details for ${r.title}`}>Link</Button><Button size="sm" variant="primary" onClick={() => setAddTo(r)}>Add to a goal</Button></div>
            </li>); })}</ul></section>))}
      <ResourceEditDialog target={edit} onClose={() => setEdit(null)} />
      <AddToGoalDialog r={addTo} onClose={() => setAddTo(null)} />
    </Page>
  );
}

/* ---------- edit / create resource (link, notes, custom file) ---------- */
function ResourceEditDialog({ target, onClose }: { target: Resource | 'new' | null; onClose: () => void }) {
  return <Dialog open={!!target} onClose={onClose} title={target === 'new' ? 'Add a file' : 'File details'}>{target && <ResourceEditBody target={target} onClose={onClose} />}</Dialog>;
}
function ResourceEditBody({ target, onClose }: { target: Resource | 'new'; onClose: () => void }) {
  const run = useRun();
  const r = target === 'new' ? null : target;
  const [title, setTitle] = useState(r?.title ?? ''); const [filename, setFilename] = useState(r?.filename ?? '');
  const [level, setLevel] = useState<Level>(r?.level ?? 'A1'); const [folder, setFolder] = useState(r?.source_folder ?? '');
  const [category, setCategory] = useState(r?.category ?? 'coursebook'); const [type, setType] = useState(r?.file_type ?? 'pdf');
  const [pages, setPages] = useState(r?.page_count ? String(r.page_count) : ''); const [url, setUrl] = useState(r?.external_url ?? ''); const [notes, setNotes] = useState(r?.notes ?? '');
  const [del, setDel] = useState(false);
  const check = checkResourceUrl(url);
  const pagesOk = !pages || (Number.isInteger(Number(pages)) && Number(pages) > 0);
  const locked = !!r?.is_catalog;   // inventory facts are preserved; only link and notes are editable

  async function save() {
    if (!check.ok || !pagesOk || !title.trim()) return;
    const common = { external_url: url.trim() ? (check.normalized ?? url.trim()) : null, notes: notes.trim() || null };
    const out = await run(async () => {
      if (r) await updateResource(r.id, locked ? common : { ...common, title: title.trim(), filename: filename.trim() || title.trim(), level, source_folder: folder, category, file_type: type, page_count: pages ? Number(pages) : null });
      else await createResource({ ...common, title: title.trim(), filename: filename.trim() || title.trim(), level, source_folder: folder.trim(), category, file_type: type, page_count: pages ? Number(pages) : null });
    }, { ok: 'Saved', invalidate: ['resources'] });
    if (out.ok) onClose();
  }
  return (
    <div className="stack">
      {r?.is_catalog && <FolderTag level={r.level} folder={r.source_folder} category={r.category} />}
      {r?.is_catalog && <p className="small muted"><code>{r.library_path}</code> — name, folder and page count come from your inventory and are preserved.</p>}
      <Field label="Title" htmlFor="rs-t"><Input id="rs-t" value={title} onChange={(e) => setTitle(e.target.value)} disabled={locked} /></Field>
      {!locked && (
        <>
          <Field label="File name (optional)" htmlFor="rs-f"><Input id="rs-f" value={filename} onChange={(e) => setFilename(e.target.value)} /></Field>
          <div className="grid2">
            <Field label="Level" htmlFor="rs-l"><Select id="rs-l" value={level} onChange={(e) => setLevel(e.target.value as Level)}>{[...LEVELS, 'ALL'].map((l) => <option key={l}>{l}</option>)}</Select></Field>
            <Field label="Category" htmlFor="rs-c"><Select id="rs-c" value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}</Select></Field>
          </div>
          <Field label="Original folder" htmlFor="rs-fo" hint="e.g. A1/Books — shown as the colour-coded location tag."><Input id="rs-fo" value={folder} onChange={(e) => setFolder(e.target.value)} /></Field>
          <div className="grid2">
            <Field label="Type" htmlFor="rs-ty"><Select id="rs-ty" value={type} onChange={(e) => setType(e.target.value)}>{['pdf', 'png', 'jpg', 'docx', 'mp3', 'mp4', 'link'].map((t) => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="Pages (if known)" htmlFor="rs-p" error={pagesOk ? null : 'Whole number above 0'}><Input id="rs-p" type="number" inputMode="numeric" min={1} value={pages} onChange={(e) => setPages(e.target.value)} /></Field>
          </div>
        </>
      )}
      <Field label="Google Drive / web link" htmlFor="rs-u" error={check.ok ? null : check.message} hint="Saved for both of you; every assignment of this file starts with it.">
        <Input id="rs-u" type="url" inputMode="url" placeholder="https://drive.google.com/file/d/…" value={url} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <Field label="Notes" htmlFor="rs-n"><Textarea id="rs-n" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <div className="dialog-actions">
        {r && !r.is_catalog && <Button variant="danger" icon={<Trash2 size={15} aria-hidden />} onClick={() => setDel(true)}>Delete</Button>}
        <Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!check.ok || !pagesOk || !title.trim()} onClick={() => void save()}>Save</Button>
      </div>
      <ConfirmDialog open={del} danger title="Delete this file?" confirmLabel="Delete" onCancel={() => setDel(false)} message="Existing goals keep their own copy of the title and pages."
        onConfirm={() => { if (r) void run(() => deleteResource(r.id), { ok: 'Deleted', invalidate: ['resources'] }).then(() => { setDel(false); onClose(); }); }} />
    </div>
  );
}

/* ---------- add a library file to a goal ---------- */
function AddToGoalDialog({ r, onClose }: { r: Resource | null; onClose: () => void }) {
  return <Dialog open={!!r} onClose={onClose} title="Add to a weekly goal">{r && <AddToGoalBody r={r} onClose={onClose} />}</Dialog>;
}
function AddToGoalBody({ r, onClose }: { r: Resource; onClose: () => void }) {
  const run = useRun();
  const { data: goals } = useGoals(); const { data: rs } = useGoalResources();
  const open = useMemo(() => (goals ?? []).filter((g) => g.status === 'active').sort((a, b) => a.deadline.localeCompare(b.deadline)), [goals]);
  const [goalId, setGoalId] = useState(open[0]?.id ?? '');
  const d = draftFromResource(r);
  const [start, setStart] = useState(d.start); const [end, setEnd] = useState(d.end); const [min, setMin] = useState('');
  const err = validatePageRange({ start, end, pageCount: r.page_count });
  async function save() {
    if (err || !goalId) return;
    const pos = (rs ?? []).filter((x) => x.goal_id === goalId).length;
    const out = await run(() => addGoalResource(goalId, { resource_id: r.id, title: r.title, filename: r.filename, level: r.level === 'ALL' ? null : r.level, category: r.category, source_folder: r.source_folder, file_type: r.file_type,
      page_count: r.page_count, start_page: start ? Number(start) : null, end_page: end ? Number(end) : null, external_url: r.external_url, est_minutes: min ? Number(min) : null }, pos), { ok: 'Added to the goal', invalidate: ['goal_resources', 'change_log'] });
    if (out.ok) onClose();
  }
  return (
    <div className="stack">
      <FolderTag level={r.level} folder={r.source_folder} category={r.category} /><p><b>{r.title}</b>{r.page_count ? <span className="muted"> · {r.page_count} pages</span> : null}</p>
      {open.length === 0 ? <EmptyState title="No open goals">Create a weekly goal in Plan first, then add this file to it.</EmptyState> : (
        <>
          <Field label="Goal" htmlFor="at-g"><Select id="at-g" value={goalId} onChange={(e) => setGoalId(e.target.value)}>{open.map((g) => <option key={g.id} value={g.id}>{g.title} — due {formatDay(g.deadline)}</option>)}</Select></Field>
          <div className="grid3">
            <Field label="First page" htmlFor="at-s" error={err}><Input id="at-s" type="number" min={1} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="Last page" htmlFor="at-e"><Input id="at-e" type="number" min={1} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
            <Field label="Minutes" htmlFor="at-m"><Input id="at-m" type="number" min={1} value={min} onChange={(e) => setMin(e.target.value)} /></Field>
          </div>
          <p className="small muted">{r.page_count && r.page_count > 12 ? 'This is a large file — enter just the pages for this goal.' : 'Leave pages empty to assign the whole file.'}</p>
        </>
      )}
      <div className="dialog-actions"><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!!err || !goalId} onClick={() => void save()}>Add</Button></div>
    </div>
  );
}

