# German Duo — setup using only the Supabase website

React + Vite + TypeScript + Supabase. Two learners (IR and LA), each signs in with just an **access key**. No command-line tools for Supabase, no server functions.

## A. Supabase (about 10 minutes, all in the browser)
1. Create a project at supabase.com.
2. **Run the SQL** — open **SQL Editor → New query**, paste the whole file, press **Run**, one file at a time, in this order:
   1. `sql/1_setup.sql` (tables, security rules, live sync)
   2. `sql/2_library_and_curriculum.sql` (your 121 files + 52-week plan)
3. **Create the two logins** — **Authentication → Users → Add user → Create new user**. Tick "Auto Confirm User".
   | Email | Password |
   |---|---|
   | your own email for IR (or `ir@germanduo.example.com`) | IR's access key (e.g. `IR-23282`) |
   | your own email for LA (or `la@germanduo.example.com`) | LA's access key (e.g. `LA-23282`) |
   Any two emails work. Put them in `.env` as `VITE_LEARNER_EMAILS=irEmail,laEmail` (IR first) and use the same two in `sql/3_add_learners.sql`. The emails are never shown or typed in the app; only the key is.
   The access key *is* the password (min. 6 characters, the two must differ). Supabase stores it hashed.
4. **Run `sql/3_add_learners.sql`** the same way. It must show two rows (IR, LA). You may edit the display names in it first.
5. **Authentication → Sign In / Providers → Email:** turn **off** "Allow new users to sign up" (so nobody else can register) and turn off "Confirm email". Leave Email enabled.
6. **Project Settings → API:** copy the **Project URL** and the **anon public** key. (Never use the `service_role` key in this app.)

To change a key later: the app (Settings → Access key), or Authentication → Users → ⋯ → Send password / change password.

## B. Run it on your computer
```bash
npm install
cp .env.example .env     # put the Project URL and anon key into it
npm run dev              # open http://localhost:5173
```

## C. Put it online (free)
Any static host. Build command `npm run build`, output folder `dist`, and add the two environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- **Cloudflare Pages / Netlify:** works as is (`public/_redirects` included).
- **Vercel:** works as is (`vercel.json` included).
Then in Supabase → Authentication → URL Configuration, set the Site URL to your site (optional but tidy).

## How secure is it?
- Keys are checked by Supabase Auth (hashed, with its built-in rate limiting against guessing). The app does not contain the keys.
- Row Level Security is on every table: private notes, word annotations and review schedules are visible only to their owner; each person can edit only their own goals (either can edit shared ones); deadlines can only move through the request → partner-approves flow; completed work can only be reopened with a reason.
- The `anon` key in `.env` is meant to be public. Only logged-in learners can read or write anything.

## Checks (developers)
`npm run typecheck && npm run lint && npm test && npm run build`. `npm run test:db` runs the SQL security tests on a *local* PostgreSQL (see `scripts/test-db.sh`).

## Notes
- The curriculum was proposed from file names, folders and page counts only; PDF contents were not read. Large books have no page range on purpose — you pick pages when planning a week.
- Google Drive links are checked for shape only; the file must be shared with whoever opens it.
- "Timer" sessions measure time since you pressed Start; they cannot prove reading. Self-reported minutes are labelled.
- Edits are not queued offline; the app shows an offline banner and a message.

## Troubleshooting
- **"Supabase is not configured"** — `.env` missing or placeholders; restart `npm run dev`.
- **"Access key not recognised"** — the user's password in Authentication → Users doesn't match what you typed; set it again.
- **Signed in but empty / errors** — step 4 (`3_add_learners.sql`) was not run, or user emails differ from the table above.
- **"Too many attempts"** — wait a few minutes (Supabase rate limit).
- **Not updating live** — header should say Live; re-run `sql/1_setup.sql`'s realtime part if not.
