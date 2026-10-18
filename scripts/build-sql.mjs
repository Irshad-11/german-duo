// Concatenates supabase/migrations into the three files you paste into the Supabase SQL Editor.
import { readFileSync, writeFileSync } from 'node:fs';
const m = (n) => readFileSync(new URL(`../supabase/migrations/${n}`, import.meta.url), 'utf8');
const w = (n, t) => writeFileSync(new URL(`../sql/${n}`, import.meta.url), t);
w('1_setup.sql', `-- STEP 1 of 3 — tables, security rules (RLS) and live sync. Paste all of this into Supabase → SQL Editor → Run.\n\n${m('0001_schema.sql')}\n\n${m('0004_rls_policies.sql')}\n\n${m('0005_realtime.sql')}`);
w('2_library_and_curriculum.sql', `-- STEP 2 of 3 — your 121 library files and the proposed 52-week curriculum. Paste → Run.\n\n${m('0002_seed_library.sql')}\n\n${m('0003_seed_curriculum.sql')}`);
console.log('sql/ written');
