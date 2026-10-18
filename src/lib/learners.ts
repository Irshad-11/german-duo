/** The two learner accounts are ordinary Supabase Auth users whose PASSWORD is the access key.
 *  Set VITE_LEARNER_EMAILS=first@x.com,second@y.com in .env (first = IR, second = LA). */
const DEFAULTS = ['ir@germanduo.example.com', 'la@germanduo.example.com'];
const fromEnv = (import.meta.env.VITE_LEARNER_EMAILS ?? '').split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);
export const LEARNER_EMAILS: readonly string[] = fromEnv.length ? fromEnv : DEFAULTS;
