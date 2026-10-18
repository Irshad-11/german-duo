-- STEP 1 of 3 — tables, security rules (RLS), change log and live sync.
-- Paste ALL of this into Supabase → SQL Editor → New query → Run.
-- (If an older version of this app was installed, its tables are cleared first — nothing else is touched.)

-- Clears this app's tables from an earlier version (and does nothing on a fresh project). Auth users are NOT touched.
do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname = 'public' loop execute format('drop table if exists public.%I cascade', r.tablename); end loop;
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' loop execute 'drop function if exists ' || r.sig || ' cascade'; end loop;
  for r in select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'e' loop execute format('drop type if exists public.%I cascade', r.typname); end loop;
end $$;

-- =====================================================================
-- German Duo v2 — shared-everything schema.
-- Two learners follow the SAME goals. Each has their own progress row per assignment (visible to both).
-- Every change to shared data is written to change_log and can be reverted.
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

-- ---------- learners ----------
create table public.learners (
  id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z]{2,4}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  accent text not null default 'blue' check (accent in ('blue','orange')),
  theme_pref text not null default 'system' check (theme_pref in ('light','dark','system')),
  last_login_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create or replace function public.is_learner() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.learners where id = (select auth.uid()))
$$;
-- called by the app: p_login = true right after a fresh sign-in
create or replace function public.touch_session(p_login boolean default false) returns void language sql security definer set search_path = public as $$
  update public.learners set last_seen_at = now(), last_login_at = case when p_login then now() else last_login_at end where id = (select auth.uid());
$$;

-- ---------- plan, library, curriculum ----------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text,
  start_date date not null,
  target_end_date date not null,
  is_active boolean not null default true,
  created_by uuid default auth.uid() references public.learners(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_end_date > start_date)
);
create unique index plans_one_active_idx on public.plans (is_active) where is_active;
create trigger plans_updated before update on public.plans for each row execute function public.set_updated_at();

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  library_path text unique,
  level text not null check (level in ('A1','A2','B1','B2','C1','C2','ALL')),
  category text not null default 'coursebook',
  source_folder text not null default '',
  filename text not null,
  file_type text not null default 'pdf',
  page_count int check (page_count is null or page_count > 0),
  size_kb numeric,
  title text not null,
  external_url text check (external_url is null or external_url ~* '^https?://'),
  notes text,
  is_catalog boolean not null default false,
  created_by uuid default auth.uid() references public.learners(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index resources_level_idx on public.resources (level, category);
create trigger resources_updated before update on public.resources for each row execute function public.set_updated_at();

create table public.curriculum_weeks (week_no int primary key check (week_no > 0), level text not null, theme text not null, goal text);
create table public.curriculum_items (
  id uuid primary key default gen_random_uuid(),
  week_no int not null references public.curriculum_weeks(week_no) on delete cascade,
  position int not null default 0,
  resource_path text references public.resources(library_path) on delete cascade on update cascade,
  role text not null default 'lesson',
  start_page int check (start_page is null or start_page > 0),
  end_page int,
  est_minutes int check (est_minutes is null or est_minutes > 0),
  note text,
  needs_page_selection boolean not null default false,
  unique (week_no, position),
  check (start_page is null or end_page is null or end_page >= start_page)
);

-- ---------- goals (shared by both learners) ----------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.plans(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  description text,
  start_date date not null,
  deadline date not null,
  original_deadline date not null,
  priority smallint not null default 2 check (priority between 1 and 3),
  est_minutes int check (est_minutes is null or est_minutes > 0),
  status text not null default 'active' check (status in ('active','dropped')),
  curriculum_week int,
  created_by uuid default auth.uid() references public.learners(id) on delete set null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (deadline >= start_date)
);
create index goals_dates_idx on public.goals (start_date, deadline);

create or replace function public.goals_guard() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.reverting', true), '') = 'on' then
    if tg_op = 'UPDATE' then new.version := old.version + 1; new.updated_at := now(); end if;
    return new;
  end if;
  if tg_op = 'INSERT' then new.original_deadline := new.deadline; return new; end if;
  if new.original_deadline <> old.original_deadline then raise exception 'original deadline cannot be changed' using errcode = '42501'; end if;
  if new.deadline <> old.deadline and coalesce(current_setting('app.deadline_rpc', true), '') <> 'on' then
    raise exception 'deadline changes must go through a postponement request that the other learner approves' using errcode = '42501';
  end if;
  new.version := old.version + 1; new.updated_at := now();
  return new;
end $$;
create trigger goals_guard_biu before insert or update on public.goals for each row execute function public.goals_guard();

-- the things to study inside a goal (the definition — identical for both learners)
create table public.goal_resources (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  resource_id uuid references public.resources(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  filename text,
  level text check (level is null or level in ('A1','A2','B1','B2','C1','C2','ALL')),
  category text,
  source_folder text,
  file_type text,
  page_count int check (page_count is null or page_count > 0),
  start_page int check (start_page is null or start_page > 0),
  end_page int,
  external_url text check (external_url is null or external_url ~* '^https?://'),
  instructions text,
  est_minutes int check (est_minutes is null or est_minutes > 0),
  measure_unit text,                         -- optional measurable target besides pages, e.g. 'exercises', 'words'
  measure_target numeric check (measure_target is null or measure_target > 0),
  notes text,
  position int not null default 0,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_page is null or end_page is null or end_page >= start_page),
  check (page_count is null or end_page is null or end_page <= page_count),
  check ((start_page is null) = (end_page is null))
);
create index goal_resources_goal_idx on public.goal_resources (goal_id, position);
create or replace function public.bump_version() returns trigger language plpgsql as $$ begin new.version := old.version + 1; new.updated_at := now(); return new; end $$;
create trigger goal_resources_bump before update on public.goal_resources for each row execute function public.bump_version();

create type public.resource_status as enum (
  'not_started','ready','opened','reading','paused','continuing','completed','awaiting_review','ready_for_questions','needs_help'
);

-- one row per learner per assignment: that learner's status, page, measured amount and note
create table public.goal_progress (
  id uuid primary key default gen_random_uuid(),
  goal_resource_id uuid not null references public.goal_resources(id) on delete cascade,
  learner_id uuid not null default auth.uid() references public.learners(id) on delete cascade,
  status public.resource_status not null default 'not_started',
  current_page int check (current_page is null or current_page > 0),
  pages_done int not null default 0 check (pages_done >= 0),
  measure_done numeric not null default 0 check (measure_done >= 0),
  note text,
  minutes_total int not null default 0 check (minutes_total >= 0),
  last_activity_at timestamptz,
  completed_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (goal_resource_id, learner_id)
);
create index goal_progress_learner_idx on public.goal_progress (learner_id);

create or replace function public.goal_progress_guard() returns trigger language plpgsql as $$
declare r public.goal_resources;
begin
  select * into r from public.goal_resources where id = new.goal_resource_id;
  if r.start_page is not null and new.pages_done > r.end_page - r.start_page + 1 then
    raise exception 'pages_done cannot exceed the assigned page range' using errcode = '23514';
  end if;
  if r.start_page is not null and new.current_page is not null and (new.current_page < r.start_page or new.current_page > r.end_page) then
    raise exception 'current_page must be inside the assigned range' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.learner_id <> old.learner_id or new.goal_resource_id <> old.goal_resource_id then raise exception 'cannot reassign progress' using errcode = '42501'; end if;
    new.version := old.version + 1; new.updated_at := now();
    if new.status <> old.status then new.last_activity_at := now(); end if;
  end if;
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status <> 'completed') then new.completed_at := now(); end if;
  if new.status <> 'completed' then new.completed_at := null; end if;
  return new;
end $$;
create trigger goal_progress_guard_biu before insert or update on public.goal_progress for each row execute function public.goal_progress_guard();

-- study time (per learner)
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null default auth.uid() references public.learners(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete set null,
  goal_resource_id uuid references public.goal_resources(id) on delete set null,
  label text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  minutes int not null check (minutes between 1 and 720),
  source text not null default 'manual' check (source in ('manual','timer')),
  start_page int check (start_page is null or start_page > 0),
  end_page int,
  measure_amount numeric check (measure_amount is null or measure_amount >= 0),
  interrupted boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  check (start_page is null or end_page is null or end_page >= start_page)
);
create index study_sessions_learner_idx on public.study_sessions (learner_id, started_at desc);
create index study_sessions_resource_idx on public.study_sessions (goal_resource_id, learner_id);

create or replace function public.study_sessions_after() returns trigger language plpgsql security definer set search_path = public as $$
declare rid uuid; lid uuid; total int;
begin
  rid := coalesce(new.goal_resource_id, old.goal_resource_id); lid := coalesce(new.learner_id, old.learner_id);
  if rid is not null and exists (select 1 from public.goal_resources where id = rid) then
    select coalesce(sum(minutes), 0) into total from public.study_sessions where goal_resource_id = rid and learner_id = lid;
    insert into public.goal_progress (goal_resource_id, learner_id, minutes_total, last_activity_at) values (rid, lid, total, now())
    on conflict (goal_resource_id, learner_id) do update set minutes_total = excluded.minutes_total, last_activity_at = now();
  end if;
  return null;
end $$;
create trigger study_sessions_ai after insert or update of minutes or delete on public.study_sessions for each row execute function public.study_sessions_after();

-- ---------- postponement (either learner asks, the other decides) ----------
create table public.postponement_requests (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  requester_id uuid not null references public.learners(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) >= 3),
  original_deadline date not null,
  proposed_deadline date not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decided_by uuid references public.learners(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  check (proposed_deadline > original_deadline)
);
create unique index postponement_one_pending_idx on public.postponement_requests (goal_id) where status = 'pending';

create or replace function public.request_postponement(p_goal uuid, p_proposed date, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g public.goals; rid uuid;
begin
  if not public.is_learner() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into g from public.goals where id = p_goal for update;
  if g.id is null then raise exception 'goal not found' using errcode = 'P0002'; end if;
  if g.status <> 'active' then raise exception 'goal is closed' using errcode = '22023'; end if;
  if p_proposed <= g.deadline then raise exception 'new deadline must be after the current deadline' using errcode = '22023'; end if;
  insert into public.postponement_requests (goal_id, requester_id, reason, original_deadline, proposed_deadline)
  values (g.id, (select auth.uid()), p_reason, g.deadline, p_proposed) returning id into rid;
  return rid;
end $$;

create or replace function public.decide_postponement(p_request uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r public.postponement_requests; g public.goals; me uuid := (select auth.uid());
begin
  if not public.is_learner() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into r from public.postponement_requests where id = p_request for update;
  if r.id is null then raise exception 'request not found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'request was already decided' using errcode = '22023'; end if;
  if r.requester_id = me then raise exception 'the other learner has to decide this request' using errcode = '42501'; end if;
  select * into g from public.goals where id = r.goal_id for update;
  if p_approve and g.deadline <> r.original_deadline then raise exception 'the deadline changed since this request; ask again' using errcode = '22023'; end if;
  update public.postponement_requests set status = case when p_approve then 'approved' else 'rejected' end, decided_by = me, decided_at = now(), decision_note = p_note where id = r.id;
  if p_approve then
    perform set_config('app.deadline_rpc', 'on', true);
    update public.goals set deadline = r.proposed_deadline where id = g.id;
  end if;
end $$;

create or replace function public.cancel_postponement(p_request uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.postponement_requests set status = 'cancelled', decided_by = (select auth.uid()), decided_at = now()
  where id = p_request and status = 'pending' and requester_id = (select auth.uid());
  if not found then raise exception 'nothing to cancel' using errcode = '22023'; end if;
end $$;

-- ---------- vocabulary ----------
create table public.vocab_words (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references public.learners(id) on delete set null,
  german text not null check (char_length(btrim(german)) between 1 and 200),
  word_type text not null default 'noun' check (word_type in ('noun','verb','adjective','adverb','preposition','conjunction','pronoun','numeral','phrase','other')),
  article text check (article in ('der','die','das')),
  gender text generated always as (case article when 'der' then 'masculine' when 'die' then 'feminine' when 'das' then 'neuter' end) stored,
  plural text,
  details jsonb not null default '{}'::jsonb,
  meaning_en text,
  meaning_bn text,
  pronunciation text,
  pronunciation_verified boolean not null default false,
  translation_verified boolean not null default false,
  example_de text,
  example_en text,
  example_bn text,
  topic_tags text[] not null default '{}',
  level text check (level is null or level in ('A1','A2','B1','B2','C1','C2')),
  source text,
  starred boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (article is null or word_type = 'noun'),
  check (plural is null or word_type = 'noun'),
  check (meaning_en is not null or meaning_bn is not null)
);
create unique index vocab_unique_idx on public.vocab_words (lower(btrim(german)), word_type, coalesce(article, ''));
create index vocab_tags_idx on public.vocab_words using gin (topic_tags);
create trigger vocab_updated before update on public.vocab_words for each row execute function public.set_updated_at();

create table public.vocab_review_state (
  learner_id uuid not null default auth.uid() references public.learners(id) on delete cascade,
  word_id uuid not null references public.vocab_words(id) on delete cascade,
  ease numeric(4,2) not null default 2.5 check (ease between 1.3 and 3.5),
  interval_days int not null default 0 check (interval_days >= 0),
  repetitions int not null default 0 check (repetitions >= 0),
  lapses int not null default 0 check (lapses >= 0),
  due_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  primary key (learner_id, word_id)
);
create table public.vocab_review_log (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null default auth.uid() references public.learners(id) on delete cascade,
  word_id uuid not null references public.vocab_words(id) on delete cascade,
  rating text not null check (rating in ('again','hard','good','easy')),
  prior_interval int not null default 0,
  new_interval int not null default 0,
  reviewed_at timestamptz not null default now()
);
create index vocab_review_log_idx on public.vocab_review_log (learner_id, reviewed_at desc);

-- ---------- notes (all shared) ----------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.learners(id) on delete cascade,
  kind text not null default 'note' check (kind in ('note','word','grammar','question','confusing','reminder')),
  title text check (title is null or char_length(title) <= 200),
  body text not null check (char_length(btrim(body)) >= 1),
  category text,
  tags text[] not null default '{}',
  question_state text check (question_state in ('open','answered','discuss')),
  link_goal_id uuid references public.goals(id) on delete set null,
  link_goal_resource_id uuid references public.goal_resources(id) on delete set null,
  link_resource_id uuid references public.resources(id) on delete set null,
  link_word_id uuid references public.vocab_words(id) on delete set null,
  link_page int check (link_page is null or link_page > 0),
  link_topic text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'question') = (question_state is not null))
);
create index notes_updated_idx on public.notes (updated_at desc);
create or replace function public.notes_guard() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and coalesce(current_setting('app.reverting', true), '') <> 'on' then
    if new.author_id <> old.author_id then raise exception 'author cannot change' using errcode = '42501'; end if;
    if old.author_id <> (select auth.uid()) and (old.kind <> 'question'
       or (to_jsonb(new) - 'question_state' - 'updated_at') is distinct from (to_jsonb(old) - 'question_state' - 'updated_at')) then
      raise exception 'only the author can edit this note; anyone can change the state of a question' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger notes_guard_biu before insert or update on public.notes for each row execute function public.notes_guard();

create table public.note_replies (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.learners(id) on delete cascade,
  body text not null check (char_length(btrim(body)) >= 1),
  created_at timestamptz not null default now()
);
create index note_replies_note_idx on public.note_replies (note_id, created_at);

-- ---------- chat & notices ----------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null default auth.uid() references public.learners(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index messages_created_idx on public.messages (created_at desc);
create or replace function public.mark_messages_read() returns int language plpgsql security definer set search_path = public as $$
declare c int;
begin
  update public.messages set read_at = now() where sender_id <> (select auth.uid()) and read_at is null and public.is_learner();
  get diagnostics c = row_count; return c;
end $$;

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.learners(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 140),
  body text not null check (char_length(btrim(body)) >= 1),
  priority text not null default 'normal' check (priority in ('normal','important')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger announcements_updated before update on public.announcements for each row execute function public.set_updated_at();
create table public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  learner_id uuid not null default auth.uid() references public.learners(id) on delete cascade,
  read_at timestamptz not null default now(),
  dismissed boolean not null default false,
  primary key (announcement_id, learner_id)
);

-- "last time this person looked at a tab" → drives the update dots
create table public.tab_seen (
  learner_id uuid not null default auth.uid() references public.learners(id) on delete cascade,
  tab text not null check (tab in ('plan','library','words','notes','notices','chat','log')),
  seen_at timestamptz not null default now(),
  primary key (learner_id, tab)
);

-- =====================================================================
-- change log + revert
-- =====================================================================
create table public.change_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.learners(id) on delete set null,
  table_name text not null,
  row_id uuid,
  op text not null check (op in ('INSERT','UPDATE','DELETE')),
  label text,
  changes jsonb,                 -- UPDATE only: { "field": [old, new] }
  old_row jsonb,
  new_row jsonb,
  txid bigint not null default txid_current(),
  revert_of bigint,              -- set when this entry IS a revert of another entry
  reverted_at timestamptz,
  reverted_by uuid references public.learners(id) on delete set null,
  created_at timestamptz not null default now()
);
create index change_log_created_idx on public.change_log (created_at desc);
create index change_log_actor_idx on public.change_log (actor_id, created_at desc);
create index change_log_tx_idx on public.change_log (txid);

create or replace function public.log_change() returns trigger language plpgsql security definer set search_path = public as $$
declare
  o jsonb; n jsonb; src jsonb; ch jsonb := '{}'::jsonb; k text; lbl text;
  skip text[] := array['updated_at','version','created_at','minutes_total','last_activity_at','id'];
begin
  if tg_op in ('UPDATE','DELETE') then o := to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then n := to_jsonb(new); end if;
  src := coalesce(n, o);
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if not (k = any(skip)) and (o -> k) is distinct from (n -> k) then ch := ch || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k)); end if;
    end loop;
    if ch = '{}'::jsonb then return null; end if;
  end if;
  -- the empty progress row created automatically when time is logged is not an "action"
  if tg_table_name = 'goal_progress' and tg_op = 'INSERT' and n ->> 'status' = 'not_started' and n -> 'note' = 'null'::jsonb and n ->> 'pages_done' = '0' then return null; end if;
  lbl := case tg_table_name
    when 'goals' then src ->> 'title'
    when 'goal_resources' then src ->> 'title'
    when 'goal_progress' then (select title from public.goal_resources where id = (src ->> 'goal_resource_id')::uuid)
    when 'study_sessions' then coalesce(src ->> 'label', 'General practice')
    when 'vocab_words' then concat_ws(' ', src ->> 'article', src ->> 'german')
    when 'notes' then coalesce(src ->> 'title', left(src ->> 'body', 60))
    when 'announcements' then src ->> 'title'
    when 'resources' then src ->> 'title'
    when 'curriculum_items' then src ->> 'resource_path'
    when 'plans' then src ->> 'title'
    when 'postponement_requests' then (select title from public.goals where id = (src ->> 'goal_id')::uuid)
    else tg_table_name end;
  insert into public.change_log (actor_id, table_name, row_id, op, label, changes, old_row, new_row, revert_of)
  values ((select auth.uid()), tg_table_name, (src ->> 'id')::uuid, tg_op, coalesce(lbl, 'item'), case when tg_op = 'UPDATE' then ch end, o, n,
          nullif(current_setting('app.revert_of', true), '')::bigint);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['plans','resources','curriculum_items','goals','goal_resources','goal_progress','study_sessions','vocab_words','notes','announcements','postponement_requests'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.log_change()', t || '_log', t);
  end loop;
end $$;

-- Reverts one change (or, with p_group, every change made in the same database transaction).
create or replace function public.revert_change(p_id bigint, p_group boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare
  me uuid := (select auth.uid()); c public.change_log; ids bigint[]; one bigint; n int := 0; setlist text; rc int;
  ranks text[] := array['plans','resources','curriculum_items','goals','goal_resources','goal_progress','study_sessions','vocab_words','notes','announcements'];
begin
  if not public.is_learner() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into c from public.change_log where id = p_id;
  if c.id is null then raise exception 'log entry not found' using errcode = 'P0002'; end if;
  if p_group then
    select array_agg(id order by case op when 'DELETE' then 0 when 'UPDATE' then 1 else 2 end,
                     case when op = 'INSERT' then -array_position(ranks, table_name) else array_position(ranks, table_name) end, id)
      into ids from public.change_log where txid = c.txid and reverted_at is null and table_name <> 'postponement_requests';
  else ids := array[p_id];
  end if;
  foreach one in array ids loop
    select * into c from public.change_log where id = one for update;
    if c.reverted_at is not null then continue; end if;
    if c.table_name = 'postponement_requests' then raise exception 'postponement requests cannot be reverted; ask again instead' using errcode = '22023'; end if;
    if c.table_name in ('goal_progress','study_sessions') and c.actor_id is distinct from me then
      raise exception 'only the person who made this progress entry can revert it' using errcode = '42501';
    end if;
    perform set_config('app.reverting', 'on', true);
    perform set_config('app.revert_of', c.id::text, true);
    if c.op = 'INSERT' then
      execute format('delete from public.%I where id = $1', c.table_name) using c.row_id;
    elsif c.op = 'DELETE' then
      begin
        execute format('insert into public.%1$I select * from jsonb_populate_record(null::public.%1$I, $1)', c.table_name) using c.old_row;
      exception when unique_violation then null;   -- already restored
      end;
    else
      select string_agg(format('%1$I = r.%1$I', key), ', ') into setlist from jsonb_object_keys(c.changes) as key where key <> 'gender';
      if setlist is not null then
        execute format('update public.%1$I x set %2$s from jsonb_populate_record(null::public.%1$I, $2) r where x.id = $1', c.table_name, setlist) using c.row_id, c.old_row;
        get diagnostics rc = row_count;
        if rc = 0 then raise exception 'the item no longer exists' using errcode = 'P0002'; end if;
      end if;
    end if;
    update public.change_log set reverted_at = now(), reverted_by = me where id = c.id;
    n := n + 1;
  end loop;
  perform set_config('app.reverting', 'off', true);
  perform set_config('app.revert_of', '', true);
  return n;
end $$;


-- Row Level Security. Model: exactly two learners. Everything is visible to both.
-- Per-person rows (progress, sessions, review schedule, tab-seen) can only be written by that person.
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public, anon;
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.change_log, public.postponement_requests from authenticated;
revoke update on public.learners from authenticated; grant update (display_name, theme_pref) on public.learners to authenticated;
revoke insert, delete on public.learners from authenticated;
revoke delete, update on public.messages from authenticated;
revoke delete on public.vocab_review_log from authenticated; revoke update on public.vocab_review_log from authenticated;
grant execute on function public.is_learner(), public.touch_session(boolean), public.mark_messages_read(),
  public.request_postponement(uuid, date, text), public.decide_postponement(uuid, boolean, text), public.cancel_postponement(uuid),
  public.revert_change(bigint, boolean) to authenticated;
grant all on all tables in schema public to service_role;

create policy learners_select on public.learners for select to authenticated using (public.is_learner());
create policy learners_update on public.learners for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- read-only for clients
create policy change_log_select on public.change_log for select to authenticated using (public.is_learner());
create policy postponement_select on public.postponement_requests for select to authenticated using (public.is_learner());

-- shared and editable by both
do $$ declare t text; begin
  foreach t in array array['plans','resources','curriculum_weeks','curriculum_items','goals','goal_resources','vocab_words'] loop
    execute format('create policy %I on public.%I for all to authenticated using (public.is_learner()) with check (public.is_learner())', t || '_all', t);
  end loop;
end $$;
-- catalog resources from the inventory cannot be deleted
drop policy resources_all on public.resources;
create policy resources_sel on public.resources for select to authenticated using (public.is_learner());
create policy resources_ins on public.resources for insert to authenticated with check (public.is_learner());
create policy resources_upd on public.resources for update to authenticated using (public.is_learner()) with check (public.is_learner());
create policy resources_del on public.resources for delete to authenticated using (public.is_learner() and not is_catalog);
drop policy vocab_words_all on public.vocab_words;
create policy vocab_sel on public.vocab_words for select to authenticated using (public.is_learner());
create policy vocab_ins on public.vocab_words for insert to authenticated with check (public.is_learner() and created_by = (select auth.uid()));
create policy vocab_upd on public.vocab_words for update to authenticated using (public.is_learner()) with check (public.is_learner());
create policy vocab_del on public.vocab_words for delete to authenticated using (public.is_learner());

-- per-person rows: visible to both, writable by the person only
create policy progress_sel on public.goal_progress for select to authenticated using (public.is_learner());
create policy progress_ins on public.goal_progress for insert to authenticated with check (learner_id = (select auth.uid()));
create policy progress_upd on public.goal_progress for update to authenticated using (learner_id = (select auth.uid())) with check (learner_id = (select auth.uid()));
create policy progress_del on public.goal_progress for delete to authenticated using (learner_id = (select auth.uid()));
create policy sessions_sel on public.study_sessions for select to authenticated using (public.is_learner());
create policy sessions_ins on public.study_sessions for insert to authenticated with check (learner_id = (select auth.uid()));
create policy sessions_upd on public.study_sessions for update to authenticated using (learner_id = (select auth.uid())) with check (learner_id = (select auth.uid()));
create policy sessions_del on public.study_sessions for delete to authenticated using (learner_id = (select auth.uid()));
create policy state_sel on public.vocab_review_state for select to authenticated using (public.is_learner());
create policy state_w on public.vocab_review_state for all to authenticated using (learner_id = (select auth.uid())) with check (learner_id = (select auth.uid()));
create policy rlog_sel on public.vocab_review_log for select to authenticated using (public.is_learner());
create policy rlog_ins on public.vocab_review_log for insert to authenticated with check (learner_id = (select auth.uid()));
create policy tab_seen_all on public.tab_seen for all to authenticated using (learner_id = (select auth.uid())) with check (learner_id = (select auth.uid()));
create policy ann_reads_all on public.announcement_reads for all to authenticated using (learner_id = (select auth.uid())) with check (learner_id = (select auth.uid()));

-- notes, replies, messages, announcements: visible to both; author writes
create policy notes_sel on public.notes for select to authenticated using (public.is_learner());
create policy notes_ins on public.notes for insert to authenticated with check (public.is_learner() and author_id = (select auth.uid()));
create policy notes_upd on public.notes for update to authenticated using (public.is_learner()) with check (public.is_learner());
create policy notes_del on public.notes for delete to authenticated using (author_id = (select auth.uid()));
create policy replies_sel on public.note_replies for select to authenticated using (public.is_learner());
create policy replies_ins on public.note_replies for insert to authenticated with check (author_id = (select auth.uid()) and public.is_learner());
create policy replies_del on public.note_replies for delete to authenticated using (author_id = (select auth.uid()));
create policy messages_sel on public.messages for select to authenticated using (public.is_learner());
create policy messages_ins on public.messages for insert to authenticated with check (sender_id = (select auth.uid()) and public.is_learner());
create policy ann_sel on public.announcements for select to authenticated using (public.is_learner());
create policy ann_ins on public.announcements for insert to authenticated with check (author_id = (select auth.uid()) and public.is_learner());
create policy ann_upd on public.announcements for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy ann_del on public.announcements for delete to authenticated using (author_id = (select auth.uid()));


do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['learners','plans','resources','curriculum_items','goals','goal_resources','goal_progress','study_sessions','change_log','postponement_requests',
      'vocab_words','vocab_review_log','vocab_review_state','notes','note_replies','messages','announcements','announcement_reads','tab_seen'] loop
      begin execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null; end;
    end loop;
  end if;
end $$;
