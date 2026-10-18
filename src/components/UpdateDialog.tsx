import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Minus, Plus } from 'lucide-react';
import { Button, Chip, Dialog, Field, Input, Select, Textarea, cx } from '@/components/ui/ui';
import { FolderTag, MiniBar } from '@/components/people';
import { MaterialLinks, PeopleLines } from '@/components/material';
import { ChangeList } from '@/components/ChangeList';
import { useChangeLog, useGoalResources, useGoals, useProgress, useSessions } from '@/api/queries';
import { deleteSession, latestLogId, logSession, revertChange, saveProgress, updateGoalResource } from '@/api/mutations';
import { useWho } from '@/hooks/useWho';
import { useRun } from '@/hooks/useRun';
import { useToast } from '@/hooks/useToast';
import { useQueryClient } from '@tanstack/react-query';
import { friendlyError } from '@/lib/errors';
import { emitPet } from '@/pet/bus';
import { assignedPages, measure } from '@/lib/domain/progress';
import { STATUSES, SIMPLE_LABEL, simpleOf, statusFromSimple, type Simple } from '@/lib/domain/status';
import { checkResourceUrl } from '@/lib/domain/links';
import { pageRangeLabel } from '@/lib/domain/folders';
import { formatDay, formatMinutes, timeAgo } from '@/lib/domain/dates';
import type { GoalProgress, GoalResource, ResourceStatus } from '@/types/db';

const CHOICES: Simple[] = ['not_started', 'studying', 'finished', 'help'];
const CHOICE_HINT: Record<Simple, string> = { not_started: 'Haven’t begun', studying: 'Working on it', finished: 'All done', help: 'I’m stuck' };
const MINUTES = [10, 15, 25, 45, 60];
const TIMER_KEY = 'gd-stopwatch';

/** Mounted once in the shell: any page opens it with ?update=<material id>. */
export function UpdateHost() {
  const [sp, setSp] = useSearchParams();
  return <UpdateDialog resourceId={sp.get('update')} onClose={() => setSp((p) => { const n = new URLSearchParams(p); n.delete('update'); return n; }, { replace: true })} />;
}

export function UpdateDialog({ resourceId, onClose }: { resourceId: string | null; onClose: () => void }) {
  const { data: rs } = useGoalResources(); const r = rs?.find((x) => x.id === resourceId) ?? null;
  return <Dialog open={!!resourceId} onClose={onClose} title={r ? `Update: ${r.title}` : 'Update'} wide>{r && <Body key={r.id} r={r} onClose={onClose} />}</Dialog>;
}

function Body({ r, onClose }: { r: GoalResource; onClose: () => void }) {
  const who = useWho(); const run = useRun(); const toast = useToast(); const qc = useQueryClient(); const me = who.me!;
  const { data: goals } = useGoals(); const { data: progress } = useProgress(); const { data: sessions } = useSessions(); const { data: log } = useChangeLog(300);
  const goal = goals?.find((g) => g.id === r.goal_id);
  const mine = progress?.find((p) => p.goal_resource_id === r.id && p.learner_id === me.id);
  const pages = assignedPages(r); const start = r.start_page ?? 1; const end = r.end_page ?? 1;

  const [status, setStatus] = useState<ResourceStatus>(mine?.status ?? 'not_started'); const [touched, setTouched] = useState(false);
  const [page, setPage] = useState<number | null>(mine?.current_page ?? null);
  const [amount, setAmount] = useState<number>(Number(mine?.measure_done ?? 0));
  const [minutes, setMinutes] = useState(0); const [custom, setCustom] = useState(''); const [note, setNote] = useState(mine?.note ?? '');
  const [watch, setWatch] = useState<number | null>(() => { try { const v = JSON.parse(localStorage.getItem(TIMER_KEY) ?? 'null') as { id: string; at: number } | null; return v?.id === r.id ? v.at : null; } catch { return null; } });
  const [watchStart, setWatchStart] = useState<number | null>(null); const [tick, setTick] = useState(Date.now());
  const [url, setUrl] = useState(r.external_url ?? ''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (watch === null) return; const t = window.setInterval(() => setTick(Date.now()), 1000); return () => window.clearInterval(t); }, [watch]);

  const simple = simpleOf(status);
  const pctPreview = measure(r, { status, pages_done: page ? page - start + 1 : 0, measure_done: amount }).pct;
  const setSimple = (s: Simple) => { setTouched(true); setStatus(statusFromSimple(s, status)); if (s === 'finished') { if (pages) setPage(end); if (r.measure_target && !pages) setAmount(r.measure_target); } };
  function bump(n: number) {
    const base = page ?? start - 1; const next = Math.min(end, Math.max(start - 1, base + n)); const v = next < start ? null : next; setPage(v);
    if (!touched) setStatus(v === null ? status : v >= end ? 'completed' : simpleOf(status) === 'studying' ? status : 'reading');
  }
  const customN = Number(custom); const chosenMinutes = custom !== '' && customN >= 1 ? Math.min(720, Math.round(customN)) : minutes;
  const elapsedMin = watch ? Math.max(1, Math.round((tick - watch) / 60000)) : 0;
  const hist = useMemo(() => (log ?? []).filter((e) => { const row = (e.new_row ?? e.old_row) as Record<string, unknown> | null;
    return (e.table_name === 'goal_resources' && e.row_id === r.id) || ((e.table_name === 'goal_progress' || e.table_name === 'study_sessions') && row?.goal_resource_id === r.id); }).slice(0, 20), [log, r.id]);
  const recent = (sessions ?? []).filter((s) => s.goal_resource_id === r.id).slice(0, 8);
  const link = checkResourceUrl(url);

  async function save() {
    setBusy(true);
    try {
      const patch: Partial<Pick<GoalProgress, 'status' | 'current_page' | 'pages_done' | 'measure_done' | 'note'>> = { status, note: note.trim() || null };
      if (pages !== null) { patch.current_page = status === 'completed' ? end : page; patch.pages_done = status === 'completed' ? pages : page ? page - start + 1 : 0; }
      if (r.measure_target && pages === null) patch.measure_done = status === 'completed' ? r.measure_target : amount;
      const changed = mine ? (mine.status !== status || (mine.note ?? null) !== patch.note || (pages !== null && ((mine.current_page ?? null) !== (patch.current_page ?? null) || mine.pages_done !== patch.pages_done)) || (patch.measure_done !== undefined && Number(mine.measure_done) !== patch.measure_done)) : (status !== 'not_started' || !!patch.note || page !== null || amount > 0);
      const undo: number[] = []; let pid = mine?.id;
      if (changed) { pid = await saveProgress(me.id, r.id, patch); const a = await latestLogId('goal_progress', pid, 'UPDATE'); const b = await latestLogId('goal_progress', pid, 'INSERT'); const m = Math.max(a ?? 0, b ?? 0); if (m) undo.push(m); }
      if (chosenMinutes > 0) {
        const sid = await logSession({ minutes: chosenMinutes, source: watchStart ? 'timer' : 'manual', goal_id: r.goal_id, goal_resource_id: r.id, label: r.title, started_at: watchStart ? new Date(watchStart).toISOString() : undefined, ended_at: watchStart ? new Date().toISOString() : undefined });
        const id = await latestLogId('study_sessions', sid, 'INSERT'); if (id) undo.push(id);
        try { localStorage.removeItem(TIMER_KEY); } catch { /* ignore */ }
      }
      if (!changed && chosenMinutes === 0) { toast.info('Nothing to save yet — change something first.'); setBusy(false); return; }
      for (const k of ['goal_progress', 'sessions', 'change_log']) void qc.invalidateQueries({ queryKey: [k] });
      const msg = chosenMinutes > 0 && changed ? `Saved update and ${chosenMinutes} min` : chosenMinutes > 0 ? `Logged ${chosenMinutes} min` : 'Progress saved';
      if (undo.length) toast.undoable(msg, () => { void (async () => { try { for (const id of undo.reverse()) await revertChange(id, false); toast.info('Undone'); emitPet({ kind: 'undone' }); for (const k of ['goal_progress', 'sessions', 'change_log']) void qc.invalidateQueries({ queryKey: [k] }); } catch (e) { toast.error(friendlyError(e)); } })(); }); else toast.success(msg);
      if (status === 'completed' && mine?.status !== 'completed') emitPet({ kind: 'finished', title: r.title }); else if (chosenMinutes > 0) emitPet({ kind: 'studied', minutes: chosenMinutes }); else emitPet({ kind: 'saved' });
      onClose();
    } catch (e) { toast.error(friendlyError(e)); emitPet({ kind: 'error' }); } finally { setBusy(false); }
  }

  return (
    <div className="stack">
      <div className="row between wrap"><FolderTag level={r.level} folder={r.source_folder} category={r.category} /><span className="small muted">{goal ? `${goal.title} · due ${formatDay(goal.deadline)}` : ''}</span></div>
      <p className="small muted">{pageRangeLabel(r.start_page, r.end_page, r.page_count)}{r.est_minutes ? ` · about ${formatMinutes(r.est_minutes)}` : ''}{r.measure_target ? ` · target ${r.measure_target} ${r.measure_unit ?? ''}` : ''}</p>
      {r.instructions && <p className="note-box">{r.instructions}</p>}
      <div><MaterialLinks url={r.external_url} filename={r.filename} title={r.title} folder={r.source_folder} /></div>

      <section className="step" aria-labelledby="u1"><h3 id="u1"><span className="num">1</span> Where are you with this?</h3>
        <div className="choices" role="radiogroup" aria-label="Progress">
          {CHOICES.map((c) => <button key={c} role="radio" aria-checked={simple === c} className={cx('choice', `choice-${c}`, simple === c && 'on')} onClick={() => setSimple(c)}><b>{SIMPLE_LABEL[c]}</b><span className="small">{CHOICE_HINT[c]}</span></button>)}
        </div>
        <details className="split"><summary>More detailed statuses</summary>
          <Field label="Exact status" htmlFor="u-st"><Select id="u-st" value={status} onChange={(e) => { setTouched(true); setStatus(e.target.value as ResourceStatus); }}>{STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label} — {s.hint}</option>)}</Select></Field></details>
      </section>

      {(pages !== null || (r.measure_target && pages === null)) && (
        <section className="step" aria-labelledby="u2"><h3 id="u2"><span className="num">2</span> {pages !== null ? 'How far did you get?' : `How many ${r.measure_unit ?? 'units'} are done?`}</h3>
          {pages !== null ? (
            <>
              <div className="stepper" role="group" aria-label="Page reached">
                <button className="btn" aria-label="One page back" onClick={() => bump(-1)}><Minus size={16} aria-hidden /></button>
                <div className="stepper-val"><span className="stepper-label">I have read up to page</span><b>{page ?? '—'}</b><span className="small muted">of {start}–{end}</span></div>
                <button className="btn" aria-label="One page forward" onClick={() => bump(1)}><Plus size={16} aria-hidden /></button>
              </div>
              <div className="chips"><Chip onClick={() => bump(5)}>+5 pages</Chip><Chip onClick={() => bump(10)}>+10 pages</Chip><Chip onClick={() => { setPage(end); if (!touched) setStatus('completed'); }}>Last page</Chip><Chip onClick={() => setPage(null)}>Reset</Chip>
                <label className="small row">or type: <Input aria-label="Page number" className="input-sm" type="number" inputMode="numeric" min={start} max={end} value={page ?? ''} onChange={(e) => { const n = Number(e.target.value); setPage(e.target.value === '' ? null : Math.min(end, Math.max(start, n))); }} /></label></div>
            </>
          ) : (
            <div className="stepper"><button className="btn" aria-label="One less" onClick={() => setAmount((a) => Math.max(0, a - 1))}><Minus size={16} aria-hidden /></button>
              <div className="stepper-val"><b>{amount}</b><span className="small muted">of {r.measure_target} {r.measure_unit}</span></div>
              <button className="btn" aria-label="One more" onClick={() => setAmount((a) => Math.min(r.measure_target ?? a, a + 1))}><Plus size={16} aria-hidden /></button></div>
          )}
          <div className="row"><MiniBar pct={pctPreview} accent={me.accent} /><span className="small muted">{pctPreview ?? 0}% of this material{page !== null && page >= end && status !== 'completed' ? ' — that’s the last page: choose “Finished”?' : ''}</span></div>
        </section>
      )}

      <section className="step" aria-labelledby="u3"><h3 id="u3"><span className="num">{pages !== null || r.measure_target ? 3 : 2}</span> How long did you study just now? <span className="muted small">(optional)</span></h3>
        <div className="chips" role="group" aria-label="Minutes">
          <Chip on={minutes === 0 && custom === ''} onClick={() => { setMinutes(0); setCustom(''); setWatchStart(null); }}>None</Chip>
          {MINUTES.map((m) => <Chip key={m} on={minutes === m && custom === ''} onClick={() => { setMinutes(m); setCustom(''); setWatchStart(null); }}>{m} min</Chip>)}
          <label className="small row">other: <Input aria-label="Other minutes" className="input-sm" type="number" inputMode="numeric" min={1} max={720} value={custom} onChange={(e) => { setCustom(e.target.value); setWatchStart(null); }} /> min</label></div>
        <div className="row wrap">
          {watch === null ? <Button size="sm" onClick={() => { const at = Date.now(); try { localStorage.setItem(TIMER_KEY, JSON.stringify({ id: r.id, at })); } catch { /* ignore */ } setWatch(at); setTick(at); }}>Start stopwatch</Button>
            : <><output className="stopwatch">{String(Math.floor((tick - watch) / 60000)).padStart(2, '0')}:{String(Math.floor((tick - watch) / 1000) % 60).padStart(2, '0')}</output>
              <Button size="sm" variant="primary" onClick={() => { setCustom(String(Math.min(720, elapsedMin))); setMinutes(0); setWatchStart(watch); setWatch(null); }}>Stop — use {elapsedMin} min</Button>
              <Button size="sm" variant="ghost" onClick={() => { try { localStorage.removeItem(TIMER_KEY); } catch { /* ignore */ } setWatch(null); }}>Cancel</Button></>}
          <span className="small muted">{watchStart ? 'Will be saved as measured by the stopwatch.' : 'The stopwatch only counts time since you pressed Start.'}</span></div>
      </section>

      <section className="step" aria-labelledby="u4"><h3 id="u4">Note <span className="muted small">(optional — both of you can read it)</span></h3>
        <Textarea aria-label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What went well? What was hard? What should we ask?" /></section>

      <div className="save-bar"><span className="small muted">{chosenMinutes > 0 ? `Will log ${formatMinutes(chosenMinutes)}.` : 'No time will be added.'}</span><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} onClick={() => void save()}>Save update</Button></div>

      <section aria-labelledby="u5" className="stack-sm"><h3 id="u5">How both of us are doing</h3><PeopleLines r={r} progress={progress ?? []} learners={who.learners} />
        <p className="small muted">Time so far: {who.learners.map((l) => `${l.display_name} ${formatMinutes(progress?.find((p) => p.goal_resource_id === r.id && p.learner_id === l.id)?.minutes_total ?? 0)}`).join(' · ')}</p></section>

      <details className="split"><summary>Link, sessions and history</summary>
        <div className="stack-sm">
          <Field label="Link to this file (shared by both)" htmlFor="u-url" error={link.ok ? null : link.message}><div className="row"><Input id="u-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/file/d/…" />
            <Button disabled={!link.ok || url.trim() === (r.external_url ?? '')} onClick={() => void run(() => updateGoalResource(r.id, { external_url: url.trim() ? link.normalized ?? url.trim() : null }), { ok: 'Link saved', invalidate: ['goal_resources', 'change_log'], undo: { table: 'goal_resources', op: 'UPDATE', rowId: r.id } })}>Save link</Button></div></Field>
          {recent.length > 0 && <ul className="plain-list small">{recent.map((s) => <li key={s.id} className="row between"><span><b>{s.minutes} min</b> · {who.nameOf(s.learner_id)} · {timeAgo(s.started_at)}{s.source === 'timer' ? ' · stopwatch' : ''}{s.note ? ` · “${s.note}”` : ''}</span>
            {s.learner_id === me.id && <button className="linklike" onClick={() => void run(() => deleteSession(s.id), { ok: 'Session removed', invalidate: ['sessions', 'goal_progress', 'change_log'], undo: { table: 'study_sessions', op: 'DELETE', rowId: s.id } })}>Remove</button>}</li>)}</ul>}
          <ChangeList entries={hist} compact />
        </div></details>
    </div>
  );
}
