import { useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button, Field, Input } from '@/components/ui/ui';
import { accessKeySchema } from '@/lib/validation';
import { useTheme } from '@/hooks/useTheme';

const MESSAGES = {
  invalid: 'That access key was not recognised. Check it and try again.',
  rate_limited: 'Too many attempts. Please wait about 15 minutes before trying again.',
  network: 'No connection. Check your internet and try again.',
  server: 'The sign-in service had a problem. Please try again in a moment.',
  not_learner: 'This account is not a registered learner.',
} as const;

export function LoginPage() {
  const { signIn, notice } = useAuth();
  const { pref, setPref } = useTheme();
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const parsed = accessKeySchema.safeParse(key);
    if (!parsed.success) { setError(parsed.error.issues[0].message); input.current?.focus(); return; }
    setBusy(true); setError(null);
    const res = await signIn(parsed.data);
    setBusy(false);
    if (!res.ok) { setError(MESSAGES[res.reason]); setKey(''); input.current?.focus(); }
  }

  return (
    <main className="login" id="main">
      <div className="login-card">
        <div className="login-brand" aria-hidden>
          <span className="dot dot-a" /><span className="dot dot-b" />
        </div>
        <h1>German Duo</h1>
        <p className="muted">Enter your personal access key. It tells the app who you are — no username needed.</p>
        {notice && <p className="note-box" role="status">{notice}</p>}
        <form onSubmit={(e) => void submit(e)} noValidate className="stack">
          <Field label="Access key" htmlFor="access-key" error={error}>
            <div className="row">
              <Input ref={input} id="access-key" name="access-key" type={show ? 'text' : 'password'} autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                value={key} onChange={(e) => { setKey(e.target.value); setError(null); }} aria-invalid={!!error} aria-describedby={error ? 'access-key-err' : undefined} autoFocus />
              <button type="button" className="icon-btn" aria-label={show ? 'Hide access key' : 'Show access key'} aria-pressed={show} onClick={() => setShow((s) => !s)}>{show ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}</button>
            </div>
          </Field>
          <Button type="submit" variant="primary" busy={busy} icon={<KeyRound size={18} aria-hidden />}>{busy ? 'Checking…' : 'Enter'}</Button>
        </form>
        <p className="small muted">Pasting and password managers work here. Your key is checked by Supabase and is never stored in the app.</p>
        <div className="login-theme">
          {(['system', 'light', 'dark'] as const).map((t) => <button key={t} type="button" className={`linklike ${pref === t ? 'on' : ''}`} aria-pressed={pref === t} onClick={() => setPref(t)}>{t}</button>)}
        </div>
      </div>
    </main>
  );
}

export function NotConfigured() {
  return (
    <main className="login" id="main">
      <div className="login-card">
        <h1>Almost there</h1>
        <p>Supabase is not configured yet. Copy <code>.env.example</code> to <code>.env</code>, fill in <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then restart the dev server.</p>
        <p className="muted small">Full instructions are in the README (Supabase setup).</p>
      </div>
    </main>
  );
}
