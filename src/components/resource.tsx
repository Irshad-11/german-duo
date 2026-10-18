import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Clock, ExternalLink, FileImage, FileText, Folder, HelpCircle, History, Link2Off, MessageSquarePlus, Pause, Play, Timer } from 'lucide-react';
import { Badge, Button, Dialog, Field, Input, ProgressBar, Select, Textarea, cx } from '@/components/ui/ui';
import { useStatusHistory, useSessions } from '@/api/queries';
import { correctResourceStatus, createNote, logSession, updateGoalResource, voidSession } from '@/api/mutations';
import { useResourceActions } from '@/hooks/useResourceActions';
import { useRun } from '@/hooks/useRun';
import { useWho } from '@/hooks/useWho';
import { assignedPages, clampPage, resourceProgress } from '@/lib/domain/progress';
import { STATUSES, STATUS_BY_VALUE, quickActions, requiresCorrection } from '@/lib/domain/status';
import { checkResourceUrl, LINK_HELP } from '@/lib/domain/links';
import { categoryLabel, folderColor, folderCrumbs, pageRangeLabel } from '@/lib/domain/folders';
import { formatMinutes, formatTime, timeAgo } from '@/lib/domain/dates';
import type { Goal, GoalResource, Level, ResourceStatus } from '@/types/db';

/* ---------- folder provenance: coloured by level, shows the original directory path ---------- */
export function FolderTag({ level, folder, category }: { level: Level | null; folder: string | null; category?: string | null }) {
  const crumbs = folderCrumbs(folder);
  return (
    <span className="folder-tag" style={{ ['--tag' as string]: folderColor(level) }} title={`Original location: ${crumbs.join(' / ') || '—'}`}>
      <Folder size={13} aria-hidden />
      <span className="folder-level">{level ?? '—'}</span>
      {crumbs.slice(level && crumbs[0] === level ? 1 : 0).map((c, i) => <span key={i} className="folder-crumb"><i aria-hidden>›</i>{c}</span>)}
      {category && <span className="folder-cat">{categoryLabel(category)}</span>}
    </span>
  );
}

export function StatusBadge({ status }: { status: ResourceStatus }) {
  const m = STATUS_BY_VALUE[status];
  const icon = status === 'reading' || status === 'continuing' ? <Play size={12} aria-hidden /> : status === 'paused' ? <Pause size={12} aria-hidden /> : status === 'needs_help' ? <HelpCircle size={12} aria-hidden /> : null;
  return <Badge tone={m.tone} icon={icon}>{m.label}</Badge>;
}

const QUICK_MIN = [5, 10, 15, 25, 45];

/* ---------- card ---------- */
export function ResourceCard({ r, goal, canEdit, onOpenDetail }: { r: GoalResource; goal: Goal; canEdit: boolean; onOpenDetail: (r: GoalResource) => void }) {
  const { setStatus, quickLog } = useResourceActions();
  const p = resourceProgress(r);
  const actions = quickActions(r.status).slice(0, 2);
  const isImg = (r.file_type ?? '').match(/png|jpe?g|webp|gif/);
  const Icon = isImg ? FileImage : FileText;
  const [logOpen, setLogOpen] = useState(false);

  return (
    <article className={cx('res', r.status === 'completed' && 'res-done')} style={{ ['--tag' as string]: folderColor(r.level) }} aria-label={r.title}>
      <div className="res-top">
        <FolderTag level={r.level} folder={r.source_folder} category={r.category} />
      </div>
      <div className="res-main">
        <Icon size={20} className="res-icon" aria-hidden />
        <div className="res-titles">
          <button type="button" className="linklike res-title" onClick={() => onOpenDetail(r)}>{r.title}</button>
          <p className="small muted res-meta">
            {pageRangeLabel(r.start_page, r.end_page, r.page_count)}
            {r.est_minutes ? <> · ~{formatMinutes(r.est_minutes)}</> : null}
            {r.total_minutes ? <> · <Clock size={12} aria-hidden /> {formatMinutes(r.total_minutes)} logged</> : null}
          </p>
        </div>
        <StatusBadge status={r.status} />
      </div>
      {p.hasRange ? (
        <div className="res-progress">
          <ProgressBar value={p.pct} label={`${r.title} progress`} tone={r.status === 'completed' ? 'done' : 'accent'} />
          <p className="small muted">{p.done} of {p.total} pages{p.remaining ? ` · ${p.remaining} left` : ''}{r.current_page && r.status !== 'completed' ? ` · on p. ${r.current_page}` : ''}</p>
        </div>
      ) : (
        <p className="small muted">{r.status === 'completed' ? 'Completed' : 'No page range assigned — progress follows the status.'}</p>
      )}
      {r.help_note && r.status === 'needs_help' && <p className="small res-help"><HelpCircle size={14} aria-hidden /> {r.help_note}</p>}
      <div className="res-actions">
        {r.external_url ? (
          <a className="btn btn-secondary btn-sm" href={r.external_url} target="_blank" rel="noopener noreferrer"
             onClick={() => { if (canEdit && (r.status === 'not_started' || r.status === 'ready')) void setStatus(r, 'opened', goal); }}>
            <ExternalLink size={15} aria-hidden /> Open file
          </a>
        ) : <Button size="sm" onClick={() => onOpenDetail(r)} icon={<Link2Off size={15} aria-hidden />}>Add link</Button>}
        {canEdit && actions.map((a) => (
          <Button key={a} size="sm" variant={a === 'completed' ? 'primary' : 'secondary'} onClick={() => void setStatus(r, a, goal)}>
            {a === 'continuing' && r.current_page ? `Continue p. ${r.current_page}` : STATUS_BY_VALUE[a].label}
          </Button>
        ))}
        {canEdit && r.status !== 'completed' && <Button size="sm" variant="ghost" icon={<Timer size={15} aria-hidden />} onClick={() => setLogOpen((v) => !v)} aria-expanded={logOpen}>Log time</Button>}
        <Button size="sm" variant="ghost" onClick={() => onOpenDetail(r)}>Details</Button>
      </div>
      {logOpen && canEdit && (
        <div className="quicklog" role="group" aria-label="Log study time">
          {QUICK_MIN.map((m) => <button key={m} className="chip" onClick={() => { void quickLog(r, m).then((ok) => ok && setLogOpen(false)); }}>{m} min</button>)}
        </div>
      )}
    </article>
  );
}

/* ---------- timer (measures elapsed wall-clock time since Start; it cannot know whether you are actually reading) ---------- */
const TIMER_KEY = 'gd-timer';
interface TimerDraft { resourceId: string; startedAt: number }
function readTimer(): TimerDraft | null { try { const v = localStorage.getItem(TIMER_KEY); return v ? (JSON.parse(v) as TimerDraft) : null; } catch { return null; } }

function StudyTimer({ r, onSaved }: { r: GoalResource; onSaved: () => void }) {
  const { setStatus } = useResourceActions();
  const run = useRun();
  const [draft, setDraft] = useState<TimerDraft | null>(() => { const d = readTimer(); return d && d.resourceId === r.id ? d : null; });
  const [now, setNow] = useState(Date.now());
  const [confirm, setConfirm] = useState<{ minutes: number; startedAt: number } | null>(null);
  const [interrupted, setInterrupted] = useState(false);

  useEffect(() => { if (!draft) return; const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, [draft]);
  const elapsed = draft ? Math.max(0, Math.floor((now - draft.startedAt) / 1000)) : 0;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0'); const ss = String(elapsed % 60).padStart(2, '0');

  function start() {
    const d = { resourceId: r.id, startedAt: Date.now() };
    try { localStorage.setItem(TIMER_KEY, JSON.stringify(d)); } catch { /* ignore */ }
    setDraft(d); setNow(Date.now());
    if (r.status === 'not_started' || r.status === 'ready' || r.status === 'opened' || r.status === 'paused') void setStatus(r, r.status === 'paused' ? 'continuing' : 'reading');
  }
  function stop() {
    if (!draft) return;
    setConfirm({ minutes: Math.max(1, Math.round((Date.now() - draft.startedAt) / 60000)), startedAt: draft.startedAt });
  }
  function discard() { try { localStorage.removeItem(TIMER_KEY); } catch { /* ignore */ } setDraft(null); setConfirm(null); }
  async function save() {
    if (!confirm) return;
    const res = await run(() => logSession({ minutes: Math.min(720, Math.max(1, confirm.minutes)), source: 'timer', goal_id: r.goal_id, goal_resource_id: r.id, label: r.title,
      started_at: new Date(confirm.startedAt).toISOString(), ended_at: new Date().toISOString(), interrupted }), { ok: 'Session saved', invalidate: ['sessions', 'goal_resources'] });
    if (res.ok) { discard(); onSaved(); }
  }

  return (
    <div className="timer">
      {draft ? (
        <>
          <output className="timer-clock" aria-live="off">{mm}:{ss}</output>
          <Button variant="primary" onClick={stop}>Stop &amp; save</Button>
          <Button variant="ghost" onClick={discard}>Discard</Button>
        </>
      ) : <Button icon={<Timer size={16} aria-hidden />} onClick={start}>Start timer</Button>}
      <p className="small muted">The timer counts time since you pressed Start — it can’t tell whether you were reading. Saved as “timer”, not “verified”.</p>
      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title="Save this session" footer={<><Button onClick={() => setConfirm(null)}>Keep timing</Button><Button variant="primary" onClick={() => void save()}>Save session</Button></>}>
        <Field label="Minutes studied" htmlFor="tm-min" hint="Edit if you took a break while the timer was running.">
          <Input id="tm-min" type="number" min={1} max={720} inputMode="numeric" value={confirm?.minutes ?? 0} onChange={(e) => setConfirm((c) => (c ? { ...c, minutes: Number(e.target.value) } : c))} />
        </Field>
        <label className="check"><input type="checkbox" checked={interrupted} onChange={(e) => setInterrupted(e.target.checked)} /> I was interrupted during this session</label>
      </Dialog>
    </div>
  );
}

/* ---------- detail dialog ---------- */
export function ResourceDialog({ r, goal, canEdit, onClose }: { r: GoalResource | null; goal: Goal | null; canEdit: boolean; onClose: () => void }) {
  return (
    <Dialog open={!!r} onClose={onClose} title={r?.title ?? ''} wide>
      {r && goal && <ResourceDetail key={r.id} r={r} goal={goal} canEdit={canEdit} onClose={onClose} />}
    </Dialog>
  );
}

function ResourceDetail({ r, goal, canEdit, onClose }: { r: GoalResource; goal: Goal; canEdit: boolean; onClose: () => void }) {
  const { patch, setStatus, readUpTo, quickLog } = useResourceActions();
  const run = useRun();
  const who = useWho();
  const { data: history } = useStatusHistory(r.id);
  const { data: allSessions } = useSessions();
  const sessions = useMemo(() => (allSessions ?? []).filter((s) => s.goal_resource_id === r.id), [allSessions, r.id]);
  const p = resourceProgress(r);
  const total = assignedPages(r);
  const [page, setPage] = useState<string>(String(r.current_page ?? r.start_page ?? ''));
  const [url, setUrl] = useState(r.external_url ?? '');
  const [help, setHelp] = useState(r.help_note ?? '');
  const [customMin, setCustomMin] = useState('');
  const [correction, setCorrection] = useState<{ to: ResourceStatus; reason: string } | null>(null);
  const [voiding, setVoiding] = useState<{ id: string; reason: string } | null>(null);
  const linkCheck = checkResourceUrl(url);

  async function saveUrl() {
    if (!linkCheck.ok) return;
    await patch(r, { external_url: linkCheck.normalized ?? (url.trim() || null) }, 'Link saved');
  }
  async function changeStatus(to: ResourceStatus) {
    if (to === r.status) return;
    if (requiresCorrection(r.status, to)) { setCorrection({ to, reason: '' }); return; }
    await setStatus(r, to, goal);
    if (to === 'needs_help' && help.trim() !== (r.help_note ?? '')) await patch(r, { help_note: help.trim() || null });
  }
  async function askAboutThis(kind: 'question' | 'confusing', title: string) {
    await run(() => createNote({ visibility: 'shared', kind, title, body: title, question_state: 'open', link_goal_id: goal.id, link_goal_resource_id: r.id, link_resource_id: r.resource_id, link_page: r.current_page ?? r.start_page }),
      { ok: 'Question shared', invalidate: ['notes'] });
  }
  const customN = Number(customMin);

  return (
    <div className="stack">
      <FolderTag level={r.level} folder={r.source_folder} category={r.category} />
      <p className="small muted">{r.filename ? <>File: <code>{r.filename}</code> · </> : null}{r.file_type?.toUpperCase()} · {pageRangeLabel(r.start_page, r.end_page, r.page_count)}</p>
      {r.instructions && <p className="note-box"><BookOpen size={16} aria-hidden /> {r.instructions}</p>}
      {r.notes && <p className="small muted">{r.notes}</p>}

      <section className="stack-sm" aria-labelledby="rd-status">
        <h3 id="rd-status">Status</h3>
        <div className="row wrap"><StatusBadge status={r.status} /><span className="small muted">changed {timeAgo(r.status_changed_at)}</span></div>
        {canEdit && (
          <>
            <Field label="Change status" htmlFor="rd-sel">
              <Select id="rd-sel" value={r.status} onChange={(e) => void changeStatus(e.target.value as ResourceStatus)}>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label} — {s.hint}</option>)}
              </Select>
            </Field>
            {(r.status === 'needs_help' || r.status === 'ready_for_questions') && (
              <Field label="What do you need help with?" htmlFor="rd-help">
                <Textarea id="rd-help" rows={2} value={help} onChange={(e) => setHelp(e.target.value)} onBlur={() => { if (help.trim() !== (r.help_note ?? '')) void patch(r, { help_note: help.trim() || null }); }} />
              </Field>
            )}
          </>
        )}
      </section>

      <section className="stack-sm" aria-labelledby="rd-pages">
        <h3 id="rd-pages">Page progress</h3>
        {p.hasRange ? (
          <>
            <ProgressBar value={p.pct} label="Page progress" />
            <p className="small muted">{p.done} of {p.total} assigned pages done · {p.remaining} remaining{r.current_page ? ` · saved page ${r.current_page}` : ''}</p>
            {canEdit && r.status !== 'completed' && (
              <div className="row wrap align-end">
                <Field label={`I have read up to page (${r.start_page}–${r.end_page})`} htmlFor="rd-page">
                  <Input id="rd-page" type="number" inputMode="numeric" min={r.start_page ?? 1} max={r.end_page ?? undefined} value={page} onChange={(e) => setPage(e.target.value)} />
                </Field>
                <Button variant="primary" disabled={!page || Number.isNaN(Number(page))} onClick={() => { void readUpTo(r, Number(page)); setPage(String(clampPage(Number(page), r))); }}>Save page</Button>
              </div>
            )}
          </>
        ) : <p className="small muted">No page range was assigned, so progress follows the status. {canEdit && 'Edit the goal to assign pages.'}</p>}
        {total !== null && r.page_count && <p className="small muted">This file has {r.page_count} pages in total (from the inventory).</p>}
      </section>

      <section className="stack-sm" aria-labelledby="rd-time">
        <h3 id="rd-time">Time <span className="muted small">· {formatMinutes(r.total_minutes)} logged{r.est_minutes ? ` of ~${formatMinutes(r.est_minutes)}` : ''}</span></h3>
        {canEdit && r.status !== 'completed' && (
          <>
            <div className="quicklog" role="group" aria-label="Log study time (self-reported)">
              {QUICK_MIN.map((m) => <button key={m} className="chip" onClick={() => void quickLog(r, m)}>+{m} min</button>)}
              <span className="row"><Input aria-label="Custom minutes" className="input-sm" type="number" min={1} max={720} placeholder="min" value={customMin} onChange={(e) => setCustomMin(e.target.value)} />
                <Button size="sm" disabled={!(customN >= 1 && customN <= 720)} onClick={() => { void quickLog(r, Math.round(customN)).then(() => setCustomMin('')); }}>Log</Button></span>
            </div>
            <StudyTimer r={r} onSaved={() => undefined} />
          </>
        )}
        {sessions.length > 0 && (
          <ul className="plain-list small">
            {sessions.slice(0, 8).map((s) => (
              <li key={s.id} className={cx(s.voided_at && 'struck')}>
                <b>{s.minutes} min</b> · {who.nameOf(s.learner_id)} · {timeAgo(s.started_at)} · <Badge tone={s.source === 'timer' ? 'info' : 'neutral'}>{s.source === 'timer' ? 'timer' : 'self-reported'}</Badge>
                {s.interrupted && ' · interrupted'}{s.voided_at && ` · voided (${s.void_reason})`}
                {s.learner_id === who.me?.id && !s.voided_at && <button className="linklike" onClick={() => setVoiding({ id: s.id, reason: '' })}>Void</button>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack-sm" aria-labelledby="rd-link">
        <h3 id="rd-link">Link</h3>
        {r.external_url && (
          <div className="row wrap">
            <a className="btn btn-primary btn-sm" href={r.external_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} aria-hidden /> Open in Google Drive / browser</a>
            <Button size="sm" variant="ghost" icon={<Link2Off size={15} aria-hidden />} onClick={() => void askAboutThis('question', `Link not working: ${r.title}`)}>Link not working?</Button>
          </div>
        )}
        {r.external_url && <p className="small muted">{LINK_HELP}</p>}
        {canEdit && (
          <Field label="Drive or web link" htmlFor="rd-url" error={linkCheck.ok ? null : linkCheck.message} hint={linkCheck.ok && linkCheck.message ? linkCheck.message : 'Paste the “Share → Copy link” address. We check its shape, not whether it is shared with you.'}>
            <div className="row">
              <Input id="rd-url" type="url" inputMode="url" placeholder="https://drive.google.com/file/d/…" value={url} onChange={(e) => setUrl(e.target.value)} />
              <Button disabled={!linkCheck.ok || url.trim() === (r.external_url ?? '')} onClick={() => void saveUrl()}>Save</Button>
            </div>
          </Field>
        )}
      </section>

      <section className="stack-sm" aria-labelledby="rd-ask">
        <h3 id="rd-ask">Questions</h3>
        <div className="row wrap">
          <Button size="sm" icon={<MessageSquarePlus size={15} aria-hidden />} onClick={() => void askAboutThis('question', `Question about ${r.title}${r.current_page ? ` (p. ${r.current_page})` : ''}`)}>Flag a question</Button>
          <Button size="sm" variant="ghost" onClick={() => void askAboutThis('confusing', `Confusing part in ${r.title}${r.current_page ? ` (p. ${r.current_page})` : ''}`)}>Mark confusing</Button>
        </div>
        <p className="small muted">Creates a shared question linked to this file and page. Add details from the Notes page.</p>
      </section>

      <section className="stack-sm" aria-labelledby="rd-hist">
        <h3 id="rd-hist"><History size={16} aria-hidden /> History</h3>
        {history && history.length > 0 ? (
          <ol className="timeline small">
            {history.map((h) => (
              <li key={h.id}>
                <b>{h.from_status ? `${STATUS_BY_VALUE[h.from_status].label} → ` : ''}{STATUS_BY_VALUE[h.to_status].label}</b>
                {h.kind === 'correction' && <> <Badge tone="warn">correction</Badge></>}
                <span className="muted"> · {who.nameOf(h.changed_by)} · {formatTime(h.created_at)} · {timeAgo(h.created_at)}</span>
                {h.reason && <p className="muted">“{h.reason}”</p>}
              </li>
            ))}
          </ol>
        ) : <p className="small muted">No status changes yet.</p>}
      </section>

      <div className="row end"><Button onClick={onClose}>Close</Button></div>

      <Dialog open={!!correction} onClose={() => setCorrection(null)} title="Correct a completed item"
        footer={<><Button onClick={() => setCorrection(null)}>Cancel</Button>
          <Button variant="primary" disabled={(correction?.reason.trim().length ?? 0) < 3} onClick={() => { if (!correction) return; void run(() => correctResourceStatus(r.id, correction.to, correction.reason.trim()), { ok: 'Status corrected', invalidate: ['goal_resources', 'status_history'] }).then(() => setCorrection(null)); }}>Save correction</Button></>}>
        <p className="muted">Completed work is protected. Reopening it is recorded in the history together with your reason; nothing is deleted.</p>
        <Field label={`Why change “Completed” to “${correction ? STATUS_BY_VALUE[correction.to].label : ''}”?`} htmlFor="corr-reason">
          <Textarea id="corr-reason" rows={3} value={correction?.reason ?? ''} onChange={(e) => setCorrection((c) => (c ? { ...c, reason: e.target.value } : c))} />
        </Field>
      </Dialog>
      <Dialog open={!!voiding} onClose={() => setVoiding(null)} title="Void this session"
        footer={<><Button onClick={() => setVoiding(null)}>Cancel</Button>
          <Button variant="danger" disabled={(voiding?.reason.trim().length ?? 0) < 2} onClick={() => { if (!voiding) return; void run(() => voidSession(voiding.id, voiding.reason.trim()), { ok: 'Session voided', invalidate: ['sessions', 'goal_resources'] }).then(() => setVoiding(null)); }}>Void session</Button></>}>
        <p className="muted">The session stays in the history but no longer counts toward minutes.</p>
        <Field label="Reason" htmlFor="void-reason"><Input id="void-reason" value={voiding?.reason ?? ''} onChange={(e) => setVoiding((v) => (v ? { ...v, reason: e.target.value } : v))} /></Field>
      </Dialog>
    </div>
  );
}

// re-export for goal editor sizing helpers
export { updateGoalResource };
