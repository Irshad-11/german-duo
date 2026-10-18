import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/hooks/useToast';
import { useRun } from '@/hooks/useRun';
import { usePlan } from '@/api/queries';
import { replacePlan, rotateAccessKey, updatePlan, updateProfile } from '@/api/mutations';
import { Button, Card, ConfirmDialog, Dialog, Field, Input, SectionHeader, Segmented, Textarea } from '@/components/ui/ui';
import { newKeySchema } from '@/lib/validation';
import { addDays, formatDay, parseISO, toISO } from '@/lib/domain/dates';
import type { Plan, ThemePref } from '@/types/db';

type KeyForm = z.infer<typeof newKeySchema>;

export default function SettingsPage() {
  const { me, session, signOut, refreshMe } = useAuth(); const { pref, setPref } = useTheme(); const run = useRun(); const toast = useToast(); const qc = useQueryClient();
  const plan = usePlan();
  const [name, setName] = useState(me?.display_name ?? '');
  const [planDlg, setPlanDlg] = useState<'edit' | 'new' | null>(null);
  const [extendBy, setExtendBy] = useState<number | null>(null);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<KeyForm>({ resolver: zodResolver(newKeySchema), defaultValues: { current: '', next: '', confirm: '' } });
  async function changeKey(v: KeyForm) {
    const res = await rotateAccessKey(session?.user.email ?? '', v.current, v.next);
    if (res.ok) { toast.success('Access key changed. Use the new key next time you sign in.'); reset(); } else toast.error(res.message);
  }
  if (!me) return null;
  const p = plan.data;

  return (
    <div className="stack-lg narrow">
      <h1>Settings</h1>
      <Card>
        <SectionHeader title="Profile" />
        <Field label="Display name" htmlFor="st-name"><div className="row"><Input id="st-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <Button disabled={!name.trim() || name.trim() === me.display_name} onClick={() => void run(async () => { await updateProfile(me.id, { display_name: name.trim() }); await refreshMe(); }, { ok: 'Name saved', invalidate: ['learners'] })}>Save</Button></div></Field>
        <p className="small muted">Your learner code is <b>{me.code}</b>. It identifies you everywhere in the app.</p>
      </Card>

      <Card>
        <SectionHeader title="Appearance" sub="Saved to your profile, so it follows you to your other devices." />
        <Segmented<ThemePref> label="Theme" value={pref} onChange={(v) => setPref(v)} options={[{ value: 'system', label: <><Monitor size={15} aria-hidden /> System</> }, { value: 'light', label: <><Sun size={15} aria-hidden /> Light</> }, { value: 'dark', label: <><Moon size={15} aria-hidden /> Dark</> }]} />
      </Card>

      <Card>
        <SectionHeader title="Learning plan" sub="The first target is 365 days — not a hard stop." />
        {p ? (
          <>
            <p><b>{p.title}</b></p><p className="muted small">{formatDay(p.start_date)} → {formatDay(p.target_end_date)}{p.description ? ` · ${p.description}` : ''}</p>
            <div className="row wrap"><Button onClick={() => setExtendBy(4)}>Extend by 4 weeks</Button><Button onClick={() => setExtendBy(13)}>Extend by 13 weeks</Button><Button onClick={() => setPlanDlg('edit')}>Edit plan</Button><Button variant="ghost" onClick={() => setPlanDlg('new')}>Start a new plan</Button></div>
            <p className="small muted">Starting a new plan keeps the old one in the history. Existing goals stay as they are.</p>
          </>
        ) : <><p className="muted">No active plan.</p><Button variant="primary" onClick={() => setPlanDlg('new')}>Create a plan</Button></>}
      </Card>

      <Card>
        <SectionHeader title="Access key" sub="Your key signs you in. Change it if someone else might know it." />
        <form className="stack" onSubmit={handleSubmit(changeKey)} noValidate>
          <Field label="Current key" htmlFor="k-cur" error={errors.current?.message}><Input id="k-cur" type="password" autoComplete="current-password" {...register('current')} /></Field>
          <Field label="New key" htmlFor="k-new" error={errors.next?.message} hint="At least 8 characters. Keep it different from your partner’s key."><Input id="k-new" type="password" autoComplete="new-password" {...register('next')} /></Field>
          <Field label="Repeat new key" htmlFor="k-conf" error={errors.confirm?.message}><Input id="k-conf" type="password" autoComplete="new-password" {...register('confirm')} /></Field>
          <div><Button type="submit" busy={isSubmitting} icon={<KeyRound size={16} aria-hidden />}>Change access key</Button></div>
        </form>
      </Card>

      <Card>
        <SectionHeader title="Session" />
        <Button icon={<LogOut size={16} aria-hidden />} onClick={() => void signOut()}>Sign out</Button>
        <p className="small muted">You stay signed in on this device until you sign out or the session expires.</p>
      </Card>

      <Card>
        <SectionHeader title="About this app" />
        <ul className="small muted bullets">
          <li>Everything you see is stored in your Supabase database; this device only keeps theme, an unsent chat draft and a running timer.</li>
          <li>“Timer” sessions measure time since you pressed Start — they cannot prove you were reading. Self-reported minutes are labelled as such.</li>
          <li>The curriculum was proposed from file names and page counts. PDF contents were not read.</li>
          <li>Links to Google Drive are checked for shape only; whether a file is shared with you is up to Drive.</li>
        </ul>
        <Button variant="ghost" size="sm" onClick={() => void qc.invalidateQueries()}>Refresh all data</Button>
      </Card>

      <ConfirmDialog open={extendBy !== null} title="Extend the plan?" confirmLabel="Extend" onCancel={() => setExtendBy(null)}
        message={p && extendBy ? `The target end moves from ${formatDay(p.target_end_date)} to ${formatDay(toISO(addDays(parseISO(p.target_end_date), extendBy * 7)))}.` : ''}
        onConfirm={() => { if (p && extendBy) void run(() => updatePlan(p.id, { target_end_date: toISO(addDays(parseISO(p.target_end_date), extendBy * 7)) }), { ok: 'Plan extended', invalidate: ['plan'] }).then(() => setExtendBy(null)); }} />
      <PlanDialog mode={planDlg} plan={p ?? null} onClose={() => setPlanDlg(null)} />
    </div>
  );
}

function PlanDialog({ mode, plan, onClose }: { mode: 'edit' | 'new' | null; plan: Plan | null; onClose: () => void }) {
  return <Dialog open={!!mode} onClose={onClose} title={mode === 'new' ? 'Start a new plan' : 'Edit plan'}>{mode && <PlanForm mode={mode} plan={plan} onClose={onClose} />}</Dialog>;
}
function PlanForm({ mode, plan, onClose }: { mode: 'edit' | 'new'; plan: Plan | null; onClose: () => void }) {
  const run = useRun();
  const fresh = mode === 'new' || !plan;
  const [title, setTitle] = useState(fresh ? 'Next learning plan' : plan!.title); const [desc, setDesc] = useState(fresh ? '' : plan!.description ?? '');
  const [start, setStart] = useState(fresh ? toISO(new Date()) : plan!.start_date); const [end, setEnd] = useState(fresh ? toISO(addDays(new Date(), 180)) : plan!.target_end_date);
  const err = !title.trim() ? 'Give the plan a name' : end <= start ? 'The end must be after the start' : null;
  async function save() {
    if (err) return;
    const out = await run(() => (fresh ? replacePlan(plan?.id ?? null, { title: title.trim(), description: desc.trim() || null, start_date: start, target_end_date: end }) : updatePlan(plan!.id, { title: title.trim(), description: desc.trim() || null, start_date: start, target_end_date: end })),
      { ok: 'Plan saved', invalidate: ['plan'] });
    if (out.ok) onClose();
  }
  return (
    <div className="stack">
      <Field label="Name" htmlFor="pl-t" error={err && !title.trim() ? err : null}><Input id="pl-t" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Description" htmlFor="pl-d"><Textarea id="pl-d" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
      <div className="grid2"><Field label="Start" htmlFor="pl-s"><Input id="pl-s" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Target end" htmlFor="pl-e" error={title.trim() ? err : null}><Input id="pl-e" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field></div>
      {!fresh && <p className="small muted">Changing the start date shifts which plan week each date belongs to; goals keep their own dates.</p>}
      <div className="dialog-actions"><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!!err} onClick={() => void save()}>Save plan</Button></div>
    </div>
  );
}
