\set ON_ERROR_STOP on
\set IR '11111111-1111-1111-1111-111111111111'
\set LA '22222222-2222-2222-2222-222222222222'
-- v1.1 features. Runs after 10_rls.test.sql (reuses its helpers in schema t and its two learners).

-- the upgrade script can be run again without harm
\i supabase/migrations/0006_manual_progress_exam_assignee.sql

begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'IR', true);
insert into public.goals (id, title, start_date, deadline) values ('bbbbbbbb-1111-0000-0000-000000000001', 'v1.1 week', current_date, current_date + 6);
insert into public.goal_resources (id, goal_id, title, assignee_id) values ('cccccccc-1111-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000001', 'Only IR', :'IR');
insert into public.goal_resources (id, goal_id, title) values ('cccccccc-1111-0000-0000-000000000002', 'bbbbbbbb-1111-0000-0000-000000000001', 'Both of us');
-- exam date: set by hand, either learner, any time (deadline rules do not apply to it)
select t.affected($q$update public.goals set exam_date = current_date + 20 where id = 'bbbbbbbb-1111-0000-0000-000000000001'$q$, 1, 'exam date can be set');
select t.eq((select exam_date from public.goals where id = 'bbbbbbbb-1111-0000-0000-000000000001'), current_date + 20, 'exam date stored');
-- IR records progress on the task meant for IR
insert into public.goal_progress (id, goal_resource_id, status, manual_pct) values ('dddddddd-1111-0000-0000-000000000001', 'cccccccc-1111-0000-0000-000000000001', 'reading', 80);
select t.eq((select manual_pct from public.goal_progress where id = 'dddddddd-1111-0000-0000-000000000001')::int, 80, 'own percentage stored');
select t.fail($q$update public.goal_progress set manual_pct = 101 where id = 'dddddddd-1111-0000-0000-000000000001'$q$, 'percentage above 100 rejected');
select t.fail($q$update public.goal_progress set manual_pct = -1 where id = 'dddddddd-1111-0000-0000-000000000001'$q$, 'negative percentage rejected');
-- the badge lives only on a finished task
update public.goal_progress set status = 'reading', ready_for_questions = true where id = 'dddddddd-1111-0000-0000-000000000001';
select t.eq((select ready_for_questions from public.goal_progress where id = 'dddddddd-1111-0000-0000-000000000001'), false, 'badge refused while still reading');
update public.goal_progress set status = 'completed', ready_for_questions = true where id = 'dddddddd-1111-0000-0000-000000000001';
select t.eq((select ready_for_questions from public.goal_progress where id = 'dddddddd-1111-0000-0000-000000000001'), true, 'badge kept on a finished task');
update public.goal_progress set status = 'reading' where id = 'dddddddd-1111-0000-0000-000000000001';
select t.eq((select ready_for_questions from public.goal_progress where id = 'dddddddd-1111-0000-0000-000000000001'), false, 'badge cleared when reopened');
commit;

begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'LA', true);
select t.fail($q$insert into public.goal_progress (goal_resource_id, status) values ('cccccccc-1111-0000-0000-000000000001', 'reading')$q$, 'LA cannot record progress on a task that is only for IR');
select t.fail($q$insert into public.study_sessions (goal_resource_id, minutes) values ('cccccccc-1111-0000-0000-000000000001', 10)$q$, 'LA cannot log time on a task that is only for IR');
insert into public.goal_progress (goal_resource_id, status) values ('cccccccc-1111-0000-0000-000000000002', 'reading');
select t.rows($q$select 1 from public.goal_progress where goal_resource_id = 'cccccccc-1111-0000-0000-000000000002'$q$, 1, 'LA can record progress on a shared task');
-- either learner can change who a task is for
select t.affected($q$update public.goal_resources set assignee_id = null where id = 'cccccccc-1111-0000-0000-000000000001'$q$, 1, 'a task can be opened up to both');
insert into public.goal_progress (goal_resource_id, status) values ('cccccccc-1111-0000-0000-000000000001', 'reading');
commit;
select 'v1.1 DB tests passed';
