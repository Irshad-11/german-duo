# German Duo — setup with only the Supabase website

Two learners (IR and LA) follow the **same goals**. Each records their own progress on the same files; both see everything. Every change is logged and can be reverted.

## A. Supabase (browser only)
1. **SQL Editor → New query**: paste the whole of `sql/1_setup.sql` → **Run**. Then `sql/2_library_and_curriculum.sql` → **Run**.
   (`1_setup.sql` first clears this app's tables from any earlier version. Auth users are not touched.)
2. **Authentication → Users → Add user → Create new user** (tick *Auto Confirm User*), or keep the existing ones:
   | Email | Password (= the access key) |
   |---|---|
   | irshadrisad@gmail.com | IR-23282 |
   | irshad.wife@gmail.com | LA-23282 |
3. **Run `sql/3_add_learners.sql`** (it must list 2 rows: IR, LA).
4. **Authentication → Sign In / Providers → Email**: turn off "Allow new users to sign up" and "Confirm email".
5. **Project Settings → API**: copy the Project URL and the *anon public* key (never the service_role key).

## B. Run
```bash
npm install
cp .env.example .env      # fill the 3 values (URL, anon key, the two login emails — IR first)
npm run dev               # http://localhost:5173
```
Online: any static host (Cloudflare Pages / Netlify / Vercel). Build `npm run build`, output `dist`, set the same `.env` values as environment variables.

## What's in the app
- **Home** — both people side by side: last login, last seen, last update (and what it was), weekly goal %, minutes, study days, words; this week's goals; things needing attention; recent changes.
- **Plan** — *Timeline* (Gantt: both people's progress inside each bar, postponed stretch hatched, today line), *Sheet* (goal → files table with both people's status/pages/minutes/notes), *Requests* (postponement: either asks, the other approves).
- **Library, Words (spaced repetition), Notes & questions, Chat, Notices.**
- **Log** — every change with before → after, **Revert** / **Restore**. Delete and edit actions show an **Undo** toast instead of "are you sure?".
- **Bubbles** — Plan, Words, Chat, Notes, Library and Notices show a count when the other person changed something since you last opened that tab.
- **Splash screen** on every start (~1.7 s, skipped animation if the device asks for reduced motion).

## Security
Keys are the Supabase Auth passwords of the two users (hashed by Supabase, rate-limited by Supabase). Row Level Security is on every table: only the two learners can read; each person can write only their own progress/time/review rows; deadline changes only through request → approval; the change log can't be edited by clients.

## Checks
`npm run typecheck && npm run lint && npm test && npm run build` · `npm run test:db` (SQL security tests; needs a *local* PostgreSQL).

## Troubleshooting
- *Access key not recognised* — the user's password in Authentication → Users differs, or `VITE_LEARNER_EMAILS` doesn't match the two emails (restart `npm run dev` after editing `.env`).
- *"This account is not a registered learner"* — run `sql/3_add_learners.sql`.
- *Not updating live* — header should read "Live"; re-run `sql/1_setup.sql` if not.
- *Too many attempts* — wait a few minutes (Supabase rate limit).

## Honest notes
Curriculum = proposal from file names/page counts (PDFs not read; large books have no page range on purpose). Drive links are checked for shape only. "Timer" time = elapsed since Start, labelled as such. Edits are not queued offline.
