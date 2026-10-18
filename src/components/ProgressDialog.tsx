import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Timer } from 'lucide-react';
import { Badge, Button, Chip, Dialog, Field, Input, Textarea } from '@/components/ui/ui';
import { FolderTag, PersonCell, StatusMark } from '@/components/people';
import { ChangeList } from '@/components/ChangeList';
import { useChangeLog, useGoalResources, useGoals, useProgress, useSessions } from '@/api/queries';
import { deleteSession, logSession, saveProgress, updateGoalResource } from '@/api/mutations';
import { useRun } from '@/hooks/useRun';
import { useWho } from '@/hooks/useWho';
import { assignedPages, clampPage } from '@/lib/domain/progress';
import { STATUSES } from '@/lib/domain/status';
import { checkResourceUrl, LINK_HELP } from '@/lib/domain/links';
import { pageRangeLabel } from '@/lib/domain/folders';
import { formatDay, formatMinutes, timeAgo } from '@/lib/domain/dates';
import type { GoalProgress, GoalResource, ResourceStatus } from '@/types/db';

const QUICK = [10, 15, 25, 45];
const TIMER_KEY = 'gd-timer';

export function ProgressDialog({ resourceId, onClose }: { resourceId: string | null; onClose: () => void }) {
  const { data: rs } = useGoalResources();
  const r = rs?.find((x) => x.id === resourceId) ?? null;
  return <Dialog open={!!resourceId} onClose={onClose} title={r?.title ?? 'File'} wide>{r && <Body r={r} onClose={onClose} />}</Dialog>;
}

function Body({ r, onClose }: { r: GoalResource; onClose: () => void }) {
  const who = useWho(); const run = useRun();
  const { data: goals } = useGoals(); const { data: progress } = useProgress(); const { data: sessions } = useSessions(); const { data: log } = useChangeLog(300);
  const goal = goals?.find((g) => g.id === r.goal_id);
  const me = who.me!;
  const mine = progress?.find((p) => p.goal_resource_id === r.id && p.learner_id === me.id);
  const pages = assignedPages(r);
  const [page, setPage] = useState(String(mine?.current_page ?? r.start_page ?? ''));
  const [amount, setAmount] = useState(String(mine?.measure_done ?? 0));
  const [note, setNote] = useState(mine?.note ?? '');
  const [url, setUrl] = useState(r.external_url ?? '');
  const [custom, setCustom] = useState(''); const [sessNote, setSessNote] = useState('');
  useEffect(() => { setNote(mine?.note ?? ''); }, [mine?.note]);
  const check = checkResourceUrl(url);

  const hist = useMemo(() => (log ?? []).filter((e) => {
    const row = (e.new_row ?? e.old_row) as Record<string, unknown> | null;
    return (e.table_name === 'goal_resources' && e.row_id === r.id) || ((e.table_name === 'goal_progress' || e.table_name === 'study_sessions') && row?.goal_resource_id === r.id);
  }).slice(0, 25), [log, r.id]);
  const mySessions = (sessions ?? []).filter((s) => s.goal_resource_id === r.id).slice(0, 12);

  const save = (patch: Partial<Pick<GoalProgress, 'status' | 'current_page' | 'pages_done' | 'measure_done' | 'note'>>, ok: string) =>
    run(() => saveProgress(me.id, r.id, patch), { ok, invalidate: ['goal_progress', 'change_log'], undo: { table: 'goal_progress', op: mine ? 'UPDATE' : 'INSERT', fromResult: (id: string) => id } });
  function setStatus(s: ResourceStatus) {
    const patch: Partial<GoalProgress> = { status: s };
    if ((s === 'reading' || s === 'continuing') && !mine?.current_page && r.start_page) patch.current_page = r.start_page;
    if (s === 'completed') { if (pages) { patch.pages_done = pages; patch.current_page = r.end_page; } if (r.measure_target && !pages) patch.measure_done = r.measure_target; }
    void save(patch, `${who.nameOf(me.id)}: ${STATUSES.find((x) => x.value === s)!.label}`);
  }
  function readUpTo() {
    const n = Number(page); if (!Number.isFinite(n)) return;
    const p = clampPage(n, r); const done = r.start_page ? p - r.start_page + 1 : mine?.pages_done ?? 0;
    const patch: Partial<GoalProgress> = { current_page: p, pages_done: Math.max(0, done) };
    if (!mine || ['not_started', 'ready', 'opened', 'paused'].includes(mine.status)) patch.status = mine?.status === 'paused' ? 'continuing' : 'reading';
    setPage(String(p)); void save(patch, `Saved: up to page ${p}`);
  }
  const addTime = (m: number, extra: { source?: 'manual' | 'timer'; started_at?: string; ended_at?: string } = {}) =>
    run(() => logSession({ minutes: m, source: extra.source ?? 'manual', goal_id: r.goal_id, goal_resource_id: r.id, label: r.title, note: sessNote.trim() || null, started_at: extra.started_at, ended_at: extra.ended_at }),
      { ok: `Logged ${m} min`, invalidate: ['sessions', 'goal_progress', 'change_log'], undo: { table: 'study_sessions', op: 'INSERT', fromResult: (id: string) => id } });

  return (
    <div className="stack">
      <div className="row between wrap"><FolderTag level={r.level} folder={r.source_folder} category={r.category} /><span className="small muted">{goal?.title} · due {goal ? formatDay(goal.deadline) : ''}</span></div>
      <p className="small muted">{r.filename ? <code>{r.filename}</code> : null} {r.file_type?.toUpperCase()} · {pageRangeLabel(r.start_page, r.end_page, r.page_count)}{r.est_minutes ? ` · about ${formatMinutes(r.est_minutes)}` : ''}{r.measure_target ? ` · target ${r.measure_target} ${r.measure_unit ?? ''}` : ''}</p>
      {r.instructions && <p className="note-box">{r.instructions}</p>}

      <table className="tbl tbl-compare"><thead><tr><th scope="col" /> {who.learners.map((l) => <th key={l.id} scope="col"><span className={`txt-${l.accent}`}>{l.code}</span></th>)}</tr></thead>
        <tbody><tr><th scope="row">Progress</th>{who.learners.map((l) => <td key={l.id}><PersonCell learner={l} r={r} p={progress?.find((p) => p.goal_resource_id === r.id && p.learner_id === l.id)} /></td>)}</tr>
          <tr><th scope="row">Last activity</th>{who.learners.map((l) => { const p = progress?.find((x) => x.goal_resource_id === r.id && x.learner_id === l.id); return <td key={l.id} className="small muted">{p?.last_activity_at ? timeAgo(p.last_activity_at) : '—'}</td>; })}</tr></tbody></table>

      <section className="stack-sm" aria-labelledby="pd-up"><h3 id="pd-up">Update status for {me.display_name}</h3>
        <div className="chips" role="group" aria-label="Status">{STATUSES.map((s) => <Chip key={s.value} on={(mine?.status ?? 'not_started') === s.value} onClick={() => setStatus(s.value)}>{s.label}</Chip>)}</div>
        <div className="grid2">
          {pages !== null && (
            <Field label={`Read up to page (${r.start_page}–${r.end_page})`} htmlFor="pd-page">
              <div className="row"><Input id="pd-page" type="number" inputMode="numeric" min={r.start_page ?? 1} max={r.end_page ?? undefined} value={page} onChange={(e) => setPage(e.target.value)} /><Button onClick={readUpTo}>Save</Button></div>
            </Field>
          )}
          {r.measure_target && pages === null && (
            <Field label={`${r.measure_unit ?? 'Amount'} done (of ${r.measure_target})`} htmlFor="pd-amt">
              <div className="row"><Input id="pd-amt" type="number" inputMode="decimal" min={0} max={r.measure_target} value={amount} onChange={(e) => setAmount(e.target.value)} />
                <Button onClick={() => void save({ measure_done: Math.min(r.measure_target!, Math.max(0, Number(amount) || 0)) }, 'Saved amount')}>Save</Button></div>
            </Field>
          )}
        </div>
        <Field label="Note (both of you can read it)" htmlFor="pd-note"><div className="row align-end"><Textarea id="pd-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What went well, what was hard, what to ask…" />
          <Button disabled={note.trim() === (mine?.note ?? '')} onClick={() => void save({ note: note.trim() || null }, 'Note saved')}>Save note</Button></div></Field>
      </section>

      <section className="stack-sm" aria-labelledby="pd-time"><h3 id="pd-time">Study time <span className="muted small">· {who.learners.map((l) => `${l.code} ${formatMinutes(progress?.find((p) => p.goal_resource_id === r.id && p.learner_id === l.id)?.minutes_total ?? 0)}`).join(' · ')}</span></h3>
        <div className="chips">{QUICK.map((m) => <Chip key={m} onClick={() => void addTime(m)}>+{m} min</Chip>)}
          <span className="row"><Input aria-label="Custom minutes" className="input-sm" type="number" min={1} max={720} placeholder="min" value={custom} onChange={(e) => setCustom(e.target.value)} /><Button size="sm" disabled={!(Number(custom) >= 1)} onClick={() => void addTime(Math.round(Number(custom))).then(() => setCustom(''))}>Add</Button></span></div>
        <Field label="Note for this session (optional)" htmlFor="pd-sn"><Input id="pd-sn" value={sessNote} onChange={(e) => setSessNote(e.target.value)} /></Field>
        <Timer_ onStop={(m, s, e) => void addTime(m, { source: 'timer', started_at: s, ended_at: e })} id={r.id} />
        {mySessions.length > 0 && <ul className="plain-list small">{mySessions.map((s) => <li key={s.id} className="row between"><span><b className="mono">{s.minutes} min</b> · {who.nameOf(s.learner_id)} · {timeAgo(s.started_at)} · <Badge tone={s.source === 'timer' ? 'info' : 'neutral'}>{s.source === 'timer' ? 'timer' : 'self-reported'}</Badge>{s.note ? ` · “${s.note}”` : ''}</span>
          {s.learner_id === me.id && <button className="linklike" onClick={() => void run(() => deleteSession(s.id), { ok: 'Session removed', invalidate: ['sessions', 'goal_progress', 'change_log'], undo: { table: 'study_sessions', op: 'DELETE', rowId: s.id } })}>Remove</button>}</li>)}</ul>}
      </section>

      <section className="stack-sm" aria-labelledby="pd-link"><h3 id="pd-link">Link</h3>
        {r.external_url ? <div className="row wrap"><a className="btn btn-primary btn-sm" href={r.external_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} aria-hidden /> Open file</a><span className="small muted">{LINK_HELP}</span></div> : <p className="muted small">No link yet.</p>}
        <Field label="Drive or web link (shared by both)" htmlFor="pd-url" error={check.ok ? null : check.message}><div className="row"><Input id="pd-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/file/d/…" />
          <Button disabled={!check.ok || url.trim() === (r.external_url ?? '')} onClick={() => void run(() => updateGoalResource(r.id, { external_url: url.trim() ? check.normalized ?? url.trim() : null }), { ok: 'Link saved', invalidate: ['goal_resources', 'change_log'], undo: { table: 'goal_resources', op: 'UPDATE', rowId: r.id } })}>Save</Button></div></Field>
      </section>

      <section className="stack-sm" aria-labelledby="pd-hist"><h3 id="pd-hist">History</h3><ChangeList entries={hist} compact /></section>
      <div className="row end"><Button onClick={onClose}>Close</Button></div>
    </div>
  );
}

/** Measures elapsed time since Start (it cannot tell whether you were reading). Saved with source = timer. */
function Timer_({ id, onStop }: { id: string; onStop: (minutes: number, startedAt: string, endedAt: string) => void }) {
  const [start, setStart] = useState<number | null>(() => { try { const v = JSON.parse(localStorage.getItem(TIMER_KEY) ?? 'null') as { id: string; at: number } | null; return v?.id === id ? v.at : null; } catch { return null; } });
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (start === null) return; const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, [start]);
  const sec = start ? Math.max(0, Math.floor((now - start) / 1000)) : 0;
  return (
    <div className="row wrap">
      {start === null ? <Button icon={<Timer size={15} aria-hidden />} onClick={() => { const at = Date.now(); try { localStorage.setItem(TIMER_KEY, JSON.stringify({ id, at })); } catch { /* ignore */ } setStart(at); setNow(at); }}>Start timer</Button>
        : <><output className="mono timer">{String(Math.floor(sec / 60)).padStart(2, '0')}:{String(sec % 60).padStart(2, '0')}</output>
          <Button variant="primary" onClick={() => { const m = Math.min(720, Math.max(1, Math.round((Date.now() - start) / 60000))); onStop(m, new Date(start).toISOString(), new Date().toISOString()); try { localStorage.removeItem(TIMER_KEY); } catch { /* ignore */ } setStart(null); }}>Stop &amp; save</Button>
          <Button variant="ghost" onClick={() => { try { localStorage.removeItem(TIMER_KEY); } catch { /* ignore */ } setStart(null); }}>Discard</Button></>}
      <span className="small muted">Counts time since Start; it can’t tell whether you were reading.</span>
    </div>
  );
}
export { StatusMark };
