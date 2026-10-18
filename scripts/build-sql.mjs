// Concatenates supabase/migrations into the files you paste into the Supabase SQL Editor.
import { readFileSync, writeFileSync } from 'node:fs';
const m = (n) => readFileSync(new URL(`../supabase/migrations/${n}`, import.meta.url), 'utf8');
const w = (n, t) => writeFileSync(new URL(`../sql/${n}`, import.meta.url), t);
const RESET = `-- Clears this app's tables from an earlier version (and does nothing on a fresh project). Auth users are NOT touched.
do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname = 'public' loop execute format('drop table if exists public.%I cascade', r.tablename); end loop;
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' loop execute 'drop function if exists ' || r.sig || ' cascade'; end loop;
  for r in select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'e' loop execute format('drop type if exists public.%I cascade', r.typname); end loop;
end $$;
`;
w('1_setup.sql', `-- STEP 1 of 3 — tables, security rules (RLS), change log and live sync.\n-- Paste ALL of this into Supabase → SQL Editor → New query → Run.\n-- (If an older version of this app was installed, its tables are cleared first — nothing else is touched.)\n\n${RESET}\n${m('0001_schema.sql')}\n\n${m('0004_rls_policies.sql')}\n\n${m('0005_realtime.sql')}`);
w('2_library_and_curriculum.sql', `-- STEP 2 of 3 — your 121 library files and the proposed 52-week curriculum. Paste → Run.\n\n${m('0002_seed_library.sql')}\n\n${m('0003_seed_curriculum.sql')}`);
console.log('sql/ written');
