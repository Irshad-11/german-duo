-- =====================================================================
-- German Duo — core schema (PostgreSQL / Supabase)
-- Migration 0001: extensions, helper functions, tables, triggers, RPCs.
-- RLS policies live in 0004_rls_policies.sql; realtime in 0005_realtime.sql.
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

-- ---------- generic helpers ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

create or replace function public.bump_version() returns trigger
language plpgsql as $$ begin new.version := old.version + 1; new.updated_at := now(); return new; end $$;

-- ---------- learners ----------
create table public.learners (
  id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z]{2,4}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  accent text not null default 'cobalt' check (accent in ('cobalt','teal')),
  theme_pref text not null default 'system' check (theme_pref in ('light','dark','system')),
  created_at timestamptz not null default now()
);

create or replace function public.is_learner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.learners where id = (select auth.uid()))
$$;

create or replace function public.other_learner_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.learners where id <> (select auth.uid()) limit 1
$$;

-- ---------- notifications / activity / audit ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.learners(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

create table public.activity_log (
  id bigint generated always as identity primary key,
  learner_id uuid references public.learners(id) on delete set null,
  kind text not null,
  entity_type text,
  entity_id uuid,
  summary text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_log_created_idx on public.activity_log (created_at desc);
create index activity_log_learner_idx on public.activity_log (learner_id, created_at desc);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  table_name text not null,
  row_id text,
  op text not null,
  old_row jsonb,
  new_row jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_table_idx on public.audit_log (table_name, created_at desc);

create or replace function public.log_activity(p_kind text, p_type text, p_id uuid, p_summary text, p_meta jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.activity_log (learner_id, kind, entity_type, entity_id, summary, meta)
  values ((select auth.uid()), p_kind, p_type, p_id, p_summary, coalesce(p_meta, '{}'));
$$;

create or replace function public.notify_other(p_kind text, p_title text, p_body text, p_link text) returns void
language plpgsql security definer set search_path = public as $$
declare o uuid := public.other_learner_id();
begin
  if o is not null then
    insert into public.notifications (recipient_id, kind, title, body, link) values (o, p_kind, p_title, p_body, p_link);
  end if;
end $$;

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_id, table_name, row_id, op, old_row, new_row)
  values ((select auth.uid()), tg_table_name,
          coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id', null),
          tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- ---------- learning plan, library, curriculum ----------
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
  library_path text unique,                     -- original path inside the supplied inventory; null for custom resources
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
  is_catalog boolean not null default false,    -- true = seeded from the supplied inventory
  created_by uuid default auth.uid() references public.learners(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index resources_level_idx on public.resources (level, category);
create trigger resources_updated before update on public.resources for each row execute function public.set_updated_at();

create table public.curriculum_weeks (
  week_no int primary key check (week_no > 0),
  level text not null,
  theme text not null,
  goal text
);
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
create index curriculum_items_week_idx on public.curriculum_items (week_no);

-- ---------- weekly goals ----------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.plans(id) on delete set null,
  scope text not null default 'personal' check (scope in ('personal','shared')),
  owner_id uuid references public.learners(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  description text,
  week_start date not null check (extract(isodow from week_start) = 1),
  deadline date not null,
  original_deadline date not null,
  priority smallint not null default 2 check (priority between 1 and 3),   -- 1 high, 2 normal, 3 low
  est_minutes int check (est_minutes is null or est_minutes > 0),
  status text not null default 'planned' check (status in ('planned','in_progress','completed','dropped')),
  progress_manual smallint check (progress_manual between 0 and 100),
  postpone_policy text not null default 'mutual' check (postpone_policy in ('mutual','owner')),
  curriculum_week int,
  created_by uuid default auth.uid() references public.learners(id) on delete set null,
  completed_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'personal' and owner_id is not null) or (scope = 'shared' and owner_id is null)),
  check (scope = 'personal' or postpone_policy = 'mutual'),
  check (deadline >= week_start)
);
create index goals_week_idx on public.goals (week_start);
create index goals_owner_idx on public.goals (owner_id, week_start);
create index goals_deadline_idx on public.goals (deadline);

create or replace function public.can_edit_goal(p_goal uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.goals g where g.id = p_goal
                 and (g.scope = 'shared' or g.owner_id = (select auth.uid()))
                 and exists (select 1 from public.learners l where l.id = (select auth.uid())))
$$;

create or replace function public.goals_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.original_deadline := new.deadline;
    return new;
  end if;
  if new.scope <> old.scope or new.owner_id is distinct from old.owner_id
     or new.created_by is distinct from old.created_by or new.original_deadline <> old.original_deadline
     or new.week_start <> old.week_start then
    raise exception 'goal ownership, scope, week and original deadline cannot be changed' using errcode = '42501';
  end if;
  if old.postpone_policy = 'mutual' and new.postpone_policy = 'owner' then
    raise exception 'a goal that needs mutual approval cannot be switched to self-rescheduling' using errcode = '42501';
  end if;
  if new.deadline <> old.deadline and coalesce(current_setting('app.deadline_rpc', true), '') <> 'on' then
    raise exception 'deadline changes must go through the postponement workflow' using errcode = '42501';
  end if;
  if new.status = 'completed' and old.status <> 'completed' then new.completed_at := now(); end if;
  if new.status <> 'completed' then new.completed_at := null; end if;
  new.version := old.version + 1; new.updated_at := now();
  return new;
end $$;
create trigger goals_guard_biu before insert or update on public.goals for each row execute function public.goals_guard();
create trigger goals_audit after insert or update or delete on public.goals for each row execute function public.audit_row();

create or replace function public.goals_activity() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity('goal_created', 'goal', new.id, 'Planned: ' || new.title, jsonb_build_object('scope', new.scope));
  elsif new.status = 'completed' and old.status <> 'completed' then
    perform public.log_activity('goal_completed', 'goal', new.id, 'Completed goal: ' || new.title, '{}');
  end if;
  return new;
end $$;
create trigger goals_activity_ai after insert or update of status on public.goals for each row execute function public.goals_activity();

create table public.goal_deadline_history (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  changed_by uuid references public.learners(id) on delete set null,
  old_deadline date not null,
  new_deadline date not null,
  reason text not null,
  via text not null check (via in ('mutual_approval','owner')),
  request_id uuid,
  created_at timestamptz not null default now()
);
create index goal_deadline_history_goal_idx on public.goal_deadline_history (goal_id, created_at);

-- ---------- resources assigned to a goal ----------
create type public.resource_status as enum (
  'not_started','ready','opened','reading','paused','continuing','completed','awaiting_review','ready_for_questions','needs_help'
);

create table public.goal_resources (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  resource_id uuid references public.resources(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  filename text,
  level text check (level is null or level in ('A1','A2','B1','B2','C1','C2','ALL')),
  category text,
  source_folder text,                           -- provenance: original folder path
  file_type text,
  page_count int check (page_count is null or page_count > 0),
  start_page int check (start_page is null or start_page > 0),
  end_page int,
  external_url text check (external_url is null or external_url ~* '^https?://'),
  instructions text,
  est_minutes int check (est_minutes is null or est_minutes > 0),
  priority smallint not null default 2 check (priority between 1 and 3),
  notes text,
  position int not null default 0,
  status public.resource_status not null default 'not_started',
  current_page int check (current_page is null or current_page > 0),
  pages_done int not null default 0 check (pages_done >= 0),
  total_minutes int not null default 0 check (total_minutes >= 0),
  help_note text,
  status_changed_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid references public.learners(id) on delete set null,
  last_activity_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_page is null or end_page is null or end_page >= start_page),
  check (page_count is null or end_page is null or end_page <= page_count),
  check (start_page is null or end_page is not null),
  check (end_page is null or start_page is not null),
  check (end_page is null or pages_done <= end_page - start_page + 1)
);
create index goal_resources_goal_idx on public.goal_resources (goal_id, position);
create index goal_resources_status_idx on public.goal_resources (status);

create table public.resource_status_history (
  id uuid primary key default gen_random_uuid(),
  goal_resource_id uuid not null references public.goal_resources(id) on delete cascade,
  changed_by uuid references public.learners(id) on delete set null,
  from_status public.resource_status,
  to_status public.resource_status not null,
  kind text not null default 'change' check (kind in ('change','correction')),
  reason text,
  current_page int,
  created_at timestamptz not null default now()
);
create index resource_status_history_idx on public.resource_status_history (goal_resource_id, created_at);

create or replace function public.goal_resources_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'completed' and new.status <> 'completed'
       and coalesce(current_setting('app.correction', true), '') <> 'on' then
      raise exception 'completed work can only be reopened through a documented correction' using errcode = '42501';
    end if;
    if new.goal_id <> old.goal_id then raise exception 'cannot move assignment between goals' using errcode = '42501'; end if;
    if new.status <> old.status then new.status_changed_at := now(); end if;
    if new.status = 'completed' and old.status <> 'completed' then new.completed_at := now(); new.completed_by := (select auth.uid()); end if;
    if new.status <> 'completed' then new.completed_at := null; new.completed_by := null; end if;
    new.version := old.version + 1; new.updated_at := now();
  end if;
  return new;
end $$;
create trigger goal_resources_guard_biu before insert or update on public.goal_resources for each row execute function public.goal_resources_guard();
create trigger goal_resources_audit after insert or update or delete on public.goal_resources for each row execute function public.audit_row();

create or replace function public.goal_resources_status_trigger() returns trigger language plpgsql security definer set search_path = public as $$
declare t text; g text;
begin
  select title into g from public.goals where id = new.goal_id;
  t := new.title;
  insert into public.resource_status_history (goal_resource_id, changed_by, from_status, to_status, kind, reason, current_page)
  values (new.id, (select auth.uid()), old.status, new.status,
          case when coalesce(current_setting('app.correction', true), '') = 'on' then 'correction' else 'change' end,
          nullif(current_setting('app.reason', true), ''), new.current_page);
  perform public.log_activity('status_changed', 'goal_resource', new.id,
          t || ': ' || replace(old.status::text, '_', ' ') || ' → ' || replace(new.status::text, '_', ' '),
          jsonb_build_object('from', old.status, 'to', new.status, 'goal', g));
  if new.status in ('needs_help','ready_for_questions') then
    perform public.notify_other('help', case when new.status = 'needs_help' then 'Help requested' else 'Ready for questions' end,
                                t, '/plan?goal=' || new.goal_id::text);
  end if;
  return new;
end $$;
create trigger goal_resources_status_au after update of status on public.goal_resources
  for each row when (old.status is distinct from new.status) execute function public.goal_resources_status_trigger();

-- Reopen / correct a completed (or any) status with a mandatory reason; history is preserved.
create or replace function public.correct_resource_status(p_id uuid, p_status public.resource_status, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'a reason is required' using errcode = '22023'; end if;
  select goal_id into gid from public.goal_resources where id = p_id;
  if gid is null or not public.can_edit_goal(gid) then raise exception 'not allowed' using errcode = '42501'; end if;
  perform set_config('app.correction', 'on', true);
  perform set_config('app.reason', p_reason, true);
  update public.goal_resources set status = p_status where id = p_id;
end $$;

create or replace function public.can_edit_goal_resource(p_res uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.goal_resources r where r.id = p_res and public.can_edit_goal(r.goal_id))
$$;

-- ---------- study sessions ----------
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null default auth.uid() references public.learners(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete set null,
  goal_resource_id uuid references public.goal_resources(id) on delete set null,
  label text,                                   -- snapshot of the resource title
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  minutes int not null check (minutes between 1 and 720),
  source text not null default 'manual' check (source in ('manual','timer')),  -- manual = self-reported; timer = measured while the page was open
  start_page int check (start_page is null or start_page > 0),
  end_page int,
  interrupted boolean not null default false,
  note text,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  check (start_page is null or end_page is null or end_page >= start_page),
  check (voided_at is null or void_reason is not null)
);
create index study_sessions_learner_idx on public.study_sessions (learner_id, started_at desc);
create index study_sessions_resource_idx on public.study_sessions (goal_resource_id);

create or replace function public.study_sessions_after() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.goal_resource_id is not null then
    update public.goal_resources r set
      total_minutes = coalesce((select sum(minutes) from public.study_sessions s where s.goal_resource_id = r.id and s.voided_at is null), 0),
      last_activity_at = now()
    where r.id = new.goal_resource_id;
  end if;
  if tg_op = 'INSERT' then
    perform public.log_activity('session_logged', 'study_session', new.id,
      new.minutes || ' min' || coalesce(' · ' || new.label, ''), jsonb_build_object('minutes', new.minutes, 'source', new.source));
  end if;
  return new;
end $$;
create trigger study_sessions_ai after insert or update of minutes, voided_at on public.study_sessions for each row execute function public.study_sessions_after();

create or replace function public.study_sessions_guard() returns trigger language plpgsql as $$
begin
  if new.learner_id <> old.learner_id or new.minutes <> old.minutes or new.source <> old.source or new.started_at <> old.started_at then
    raise exception 'recorded session facts cannot be edited; void the session and log a new one' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger study_sessions_guard_bu before update on public.study_sessions for each row execute function public.study_sessions_guard();

-- ---------- postponement workflow ----------
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
create index postponement_status_idx on public.postponement_requests (status, created_at desc);

create or replace function public.request_postponement(p_goal uuid, p_proposed date, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g public.goals; me uuid := (select auth.uid()); rid uuid;
begin
  if not public.is_learner() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into g from public.goals where id = p_goal for update;
  if g.id is null then raise exception 'goal not found' using errcode = 'P0002'; end if;
  if g.scope = 'personal' and g.owner_id <> me then raise exception 'only the owner can request a postponement' using errcode = '42501'; end if;
  if g.status in ('completed','dropped') then raise exception 'goal is already closed' using errcode = '22023'; end if;
  if p_proposed <= g.deadline then raise exception 'new deadline must be after the current deadline' using errcode = '22023'; end if;
  insert into public.postponement_requests (goal_id, requester_id, reason, original_deadline, proposed_deadline)
  values (g.id, me, p_reason, g.deadline, p_proposed) returning id into rid;
  perform public.log_activity('postpone_requested', 'goal', g.id, 'Asked to postpone: ' || g.title, jsonb_build_object('to', p_proposed));
  perform public.notify_other('postponement', 'Postponement request', g.title || ' → ' || p_proposed::text, '/plan?request=' || rid::text);
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
  if r.requester_id = me then raise exception 'you cannot decide your own request' using errcode = '42501'; end if;
  select * into g from public.goals where id = r.goal_id for update;
  if p_approve and g.deadline <> r.original_deadline then
    raise exception 'the goal deadline changed since this request; ask again' using errcode = '22023';
  end if;
  if p_approve and g.status in ('completed','dropped') then raise exception 'goal is already closed' using errcode = '22023'; end if;
  update public.postponement_requests set status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = me, decided_at = now(), decision_note = p_note where id = r.id;
  if p_approve then
    perform set_config('app.deadline_rpc', 'on', true);
    update public.goals set deadline = r.proposed_deadline where id = g.id;
    insert into public.goal_deadline_history (goal_id, changed_by, old_deadline, new_deadline, reason, via, request_id)
    values (g.id, me, r.original_deadline, r.proposed_deadline, r.reason, 'mutual_approval', r.id);
  end if;
  perform public.log_activity(case when p_approve then 'postpone_approved' else 'postpone_rejected' end, 'goal', g.id,
          (case when p_approve then 'Approved postponement: ' else 'Declined postponement: ' end) || g.title, '{}');
  insert into public.notifications (recipient_id, kind, title, body, link)
  values (r.requester_id, 'postponement', case when p_approve then 'Postponement approved' else 'Postponement declined' end,
          g.title, '/plan?goal=' || g.id::text);
end $$;

create or replace function public.cancel_postponement(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.postponement_requests set status = 'cancelled', decided_by = (select auth.uid()), decided_at = now()
  where id = p_request and status = 'pending' and requester_id = (select auth.uid());
  if not found then raise exception 'nothing to cancel' using errcode = '22023'; end if;
end $$;

-- Personal goals whose policy is 'owner' may be rescheduled by the owner; the change is still recorded.
create or replace function public.postpone_goal_owner(p_goal uuid, p_new date, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare g public.goals; me uuid := (select auth.uid());
begin
  select * into g from public.goals where id = p_goal for update;
  if g.id is null or g.scope <> 'personal' or g.owner_id <> me or g.postpone_policy <> 'owner' then
    raise exception 'this goal requires approval from the other learner' using errcode = '42501';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'a reason is required' using errcode = '22023'; end if;
  if p_new <= g.deadline then raise exception 'new deadline must be after the current deadline' using errcode = '22023'; end if;
  perform set_config('app.deadline_rpc', 'on', true);
  update public.goals set deadline = p_new where id = g.id;
  insert into public.goal_deadline_history (goal_id, changed_by, old_deadline, new_deadline, reason, via)
  values (g.id, me, g.deadline, p_new, p_reason, 'owner');
  perform public.log_activity('postponed_by_owner', 'goal', g.id, 'Postponed own goal: ' || g.title, jsonb_build_object('to', p_new));
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
  details jsonb not null default '{}'::jsonb,   -- type-specific extras: verb forms, comparative, case governed, ...
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
  source_resource_id uuid references public.resources(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (article is null or word_type = 'noun'),
  check (plural is null or word_type = 'noun'),
  check (meaning_en is not null or meaning_bn is not null)
);
create unique index vocab_unique_idx on public.vocab_words (lower(btrim(german)), word_type, coalesce(article, ''));
create index vocab_level_idx on public.vocab_words (level);
create index vocab_tags_idx on public.vocab_words using gin (topic_tags);
create trigger vocab_updated before update on public.vocab_words for each row execute function public.set_updated_at();

create or replace function public.vocab_activity() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.log_activity('word_added', 'vocab_word', new.id, 'New word: ' || coalesce(new.article || ' ', '') || new.german, '{}');
  return new;
end $$;
create trigger vocab_activity_ai after insert on public.vocab_words for each row execute function public.vocab_activity();

create table public.vocab_favorites (
  learner_id uuid not null default auth.uid() references public.learners(id) on delete cascade,
  word_id uuid not null references public.vocab_words(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (learner_id, word_id)
);
create table public.vocab_annotations (           -- PRIVATE per learner
  learner_id uuid not null default auth.uid() references public.learners(id) on delete cascade,
  word_id uuid not null references public.vocab_words(id) on delete cascade,
  note text not null,
  updated_at timestamptz not null default now(),
  primary key (learner_id, word_id)
);
create table public.vocab_review_state (          -- PRIVATE per learner (spaced repetition schedule)
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
create index vocab_review_due_idx on public.vocab_review_state (learner_id, due_at);
create table public.vocab_review_log (            -- append-only; visible to both for friendly competition
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null default auth.uid() references public.learners(id) on delete cascade,
  word_id uuid not null references public.vocab_words(id) on delete cascade,
  rating text not null check (rating in ('again','hard','good','easy')),
  prior_interval int not null default 0,
  new_interval int not null default 0,
  reviewed_at timestamptz not null default now()
);
create index vocab_review_log_idx on public.vocab_review_log (learner_id, reviewed_at desc);

-- ---------- notes ----------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.learners(id) on delete cascade,
  visibility text not null default 'private' check (visibility in ('private','shared')),
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
  link_session_id uuid references public.study_sessions(id) on delete set null,
  link_page int check (link_page is null or link_page > 0),
  link_topic text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'question') = (question_state is not null))
);
create index notes_owner_idx on public.notes (owner_id, updated_at desc);
create index notes_vis_idx on public.notes (visibility, updated_at desc);
create index notes_tags_idx on public.notes using gin (tags);

create or replace function public.can_see_note(p_note uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.notes n where n.id = p_note
                 and (n.visibility = 'shared' or n.owner_id = (select auth.uid())))
$$;

create or replace function public.notes_guard() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    if new.owner_id <> old.owner_id then raise exception 'owner cannot change' using errcode = '42501'; end if;
    if old.owner_id <> (select auth.uid()) then
      -- the other learner may only change the state of a shared question
      if old.visibility <> 'shared' or old.kind <> 'question'
         or (to_jsonb(new) - 'question_state' - 'updated_at') is distinct from (to_jsonb(old) - 'question_state' - 'updated_at') then
        raise exception 'only the owner can edit this note' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger notes_guard_biu before insert or update on public.notes for each row execute function public.notes_guard();

create or replace function public.notes_notify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.visibility = 'shared' and new.kind = 'question' then
    perform public.notify_other('question', 'New question', coalesce(new.title, left(new.body, 80)), '/notes?note=' || new.id::text);
    perform public.log_activity('question_asked', 'note', new.id, 'Asked: ' || coalesce(new.title, left(new.body, 60)), '{}');
  end if;
  return new;
end $$;
create trigger notes_notify_ai after insert on public.notes for each row execute function public.notes_notify();

create table public.note_replies (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.learners(id) on delete cascade,
  body text not null check (char_length(btrim(body)) >= 1),
  created_at timestamptz not null default now()
);
create index note_replies_note_idx on public.note_replies (note_id, created_at);

-- ---------- messages ----------
create table public.messages (
  id uuid primary key default gen_random_uuid(),   -- client may supply the id => safe retries (idempotent send)
  sender_id uuid not null default auth.uid() references public.learners(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index messages_created_idx on public.messages (created_at desc);
create index messages_unread_idx on public.messages (sender_id) where read_at is null;

create or replace function public.mark_messages_read() returns int
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  update public.messages set read_at = now() where sender_id <> (select auth.uid()) and read_at is null and public.is_learner();
  get diagnostics c = row_count; return c;
end $$;

-- ---------- announcements ----------
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
create index announcements_created_idx on public.announcements (created_at desc);
create trigger announcements_updated before update on public.announcements for each row execute function public.set_updated_at();
create trigger announcements_audit after insert or update or delete on public.announcements for each row execute function public.audit_row();

create or replace function public.announcements_notify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_other('announcement', case when new.priority = 'important' then 'Important notice' else 'New notice' end, new.title, '/notices');
  perform public.log_activity('announcement', 'announcement', new.id, 'Posted a notice: ' || new.title, '{}');
  return new;
end $$;
create trigger announcements_notify_ai after insert on public.announcements for each row execute function public.announcements_notify();

create table public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  learner_id uuid not null default auth.uid() references public.learners(id) on delete cascade,
  read_at timestamptz not null default now(),
  dismissed boolean not null default false,
  primary key (announcement_id, learner_id)
);

-- triggers that stamp updated_at on tables without a bespoke guard
create trigger vocab_annotations_updated before update on public.vocab_annotations for each row execute function public.set_updated_at();
