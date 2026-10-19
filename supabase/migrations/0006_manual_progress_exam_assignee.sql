-- v1.1 — manual % per task, "ready for questions" badge, exam date per week, tasks for one person only.
-- Safe to run on an existing project (every statement is idempotent) and on a fresh one.

-- 1) progress: a percentage the learner sets by hand (null = calculate from pages / amount) and a separate "ready for questions" badge
alter table public.goal_progress add column if not exists manual_pct smallint;
alter table public.goal_progress add column if not exists ready_for_questions boolean not null default false;
do $$ begin
  alter table public.goal_progress add constraint goal_progress_manual_pct_chk check (manual_pct is null or manual_pct between 0 and 100);
exception when duplicate_object then null; end $$;

-- 2) goals: the date of the exam session for that week (set by hand)
alter table public.goals add column if not exists exam_date date;

-- 3) goal_resources: null = for both learners, otherwise only for that learner
alter table public.goal_resources add column if not exists assignee_id uuid references public.learners(id) on delete set null;

-- 4) guard: nobody records progress on a task meant for the other person; the badge only lives on a finished task
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
  if tg_op = 'INSERT' and r.assignee_id is not null and new.learner_id <> r.assignee_id and coalesce(current_setting('app.reverting', true), '') <> 'on' then
    raise exception 'this task is only for the other learner' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.learner_id <> old.learner_id or new.goal_resource_id <> old.goal_resource_id then raise exception 'cannot reassign progress' using errcode = '42501'; end if;
    new.version := old.version + 1; new.updated_at := now();
    if new.status <> old.status then new.last_activity_at := now(); end if;
  end if;
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status <> 'completed') then new.completed_at := now(); end if;
  if new.status <> 'completed' then new.completed_at := null; end if;
  if new.status not in ('completed', 'ready_for_questions') then new.ready_for_questions := false; end if;
  return new;
end $$;
