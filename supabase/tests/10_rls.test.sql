\set ON_ERROR_STOP on
\set IR '11111111-1111-1111-1111-111111111111'
\set LA '22222222-2222-2222-2222-222222222222'
create schema t;
create function t.fail(q text, lbl text) returns void language plpgsql as $$ begin begin execute q; exception when others then return; end; raise exception 'FAIL (expected an error): %', lbl; end $$;
create function t.affected(q text, n int, lbl text) returns void language plpgsql as $$ declare c int; begin execute q; get diagnostics c = row_count; if c <> n then raise exception 'FAIL: % (affected %, expected %)', lbl, c, n; end if; end $$;
create function t.rows(q text, n int, lbl text) returns void language plpgsql as $$ declare c int; begin execute 'select count(*) from (' || q || ') s' into c; if c <> n then raise exception 'FAIL: % (got %, expected %)', lbl, c, n; end if; end $$;
create function t.eq(a anyelement, b anyelement, lbl text) returns void language plpgsql as $$ begin if a is distinct from b then raise exception 'FAIL: % (% <> %)', lbl, a, b; end if; end $$;
grant usage on schema t to anon, authenticated; grant execute on all functions in schema t to anon, authenticated;

insert into auth.users (id, email) values (:'IR', 'ir@example.test'), (:'LA', 'la@example.test');
insert into public.learners (id, code, display_name, accent) values (:'IR', 'IR', 'IR', 'blue'), (:'LA', 'LA', 'LA', 'orange');
insert into public.plans (title, start_date, target_end_date) values ('First year', current_date, current_date + 365);

-- anon sees nothing
begin; set local role anon;
select t.fail('select * from public.goals', 'anon cannot read goals');
select t.fail('select * from public.learners', 'anon cannot read learners');
select t.fail('select * from public.change_log', 'anon cannot read the log');
commit;

-- profile + login tracking
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'IR', true);
select t.rows('select * from public.learners', 2, 'both learners visible');
select t.fail($q$update public.learners set code = 'XX' where id = '11111111-1111-1111-1111-111111111111'$q$, 'code is not editable');
select t.affected($q$update public.learners set theme_pref = 'dark' where id = '22222222-2222-2222-2222-222222222222'$q$, 0, 'cannot edit the other profile');
select public.touch_session(true);
select t.eq((select last_login_at is not null from public.learners where id = '11111111-1111-1111-1111-111111111111'), true, 'last login recorded');
select t.eq((select last_login_at is null from public.learners where id = '22222222-2222-2222-2222-222222222222'), true, 'other login untouched');
commit;

-- shared goals: both see and edit; deadline needs the partner
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'IR', true);
insert into public.goals (id, title, start_date, deadline) values ('bbbbbbbb-0000-0000-0000-000000000001', 'Week 1', current_date, current_date + 6);
insert into public.goal_resources (id, goal_id, title, start_page, end_page, page_count, source_folder, level) values ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Menschen A1-1', 10, 19, 106, 'A1/Books', 'A1');
select t.fail($q$insert into public.goal_resources (goal_id, title, start_page, end_page, page_count) values ('bbbbbbbb-0000-0000-0000-000000000001', 'x', 5, 200, 106)$q$, 'range beyond page count rejected');
select t.fail($q$update public.goals set deadline = deadline + 7 where id = 'bbbbbbbb-0000-0000-0000-000000000001'$q$, 'direct deadline edit blocked');
select public.request_postponement('bbbbbbbb-0000-0000-0000-000000000001', current_date + 13, 'Sick');
select t.fail($q$select public.decide_postponement((select id from public.postponement_requests limit 1), true)$q$, 'requester cannot decide');
select t.fail($q$insert into public.postponement_requests (goal_id, requester_id, reason, original_deadline, proposed_deadline) values ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'forged', current_date, current_date + 2)$q$, 'no direct request writes');
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'LA', true);
select t.rows('select * from public.goals', 1, 'LA sees the same goal');
select t.affected($q$update public.goals set title = 'Week 1 (LA edit)' where id = 'bbbbbbbb-0000-0000-0000-000000000001'$q$, 1, 'either learner can edit goals');
select public.decide_postponement((select id from public.postponement_requests where status = 'pending' limit 1), true, 'ok');
select t.eq((select deadline from public.goals limit 1), current_date + 13, 'approved deadline applied');
select t.eq((select original_deadline from public.goals limit 1), current_date + 6, 'original deadline kept');
select t.fail($q$select public.decide_postponement((select id from public.postponement_requests limit 1), false)$q$, 'cannot decide twice');
commit;

-- per-person progress
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'IR', true);
insert into public.goal_progress (id, goal_resource_id, status, current_page, pages_done, note) values ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'reading', 12, 3, 'slow start');
select t.fail($q$update public.goal_progress set pages_done = 11 where id = 'dddddddd-0000-0000-0000-000000000001'$q$, 'pages_done above range rejected');
select t.fail($q$update public.goal_progress set current_page = 50 where id = 'dddddddd-0000-0000-0000-000000000001'$q$, 'current page outside range rejected');
insert into public.study_sessions (id, goal_resource_id, goal_id, label, minutes, note) values ('eeeeeeee-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Menschen A1-1', 25, 'chapter 2');
insert into public.study_sessions (goal_resource_id, minutes) values ('cccccccc-0000-0000-0000-000000000001', 10);
select t.eq((select minutes_total from public.goal_progress where id = 'dddddddd-0000-0000-0000-000000000001'), 35, 'minutes roll up per learner');
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'LA', true);
select t.rows('select * from public.goal_progress', 1, 'LA can see IR progress');
select t.affected($q$update public.goal_progress set status = 'completed' where id = 'dddddddd-0000-0000-0000-000000000001'$q$, 0, 'LA cannot change IR progress');
select t.fail($q$insert into public.goal_progress (goal_resource_id, learner_id, status) values ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'completed')$q$, 'LA cannot write IR progress row');
select t.fail($q$insert into public.study_sessions (learner_id, minutes) values ('11111111-1111-1111-1111-111111111111', 30)$q$, 'LA cannot log time as IR');
insert into public.goal_progress (goal_resource_id, status, pages_done) values ('cccccccc-0000-0000-0000-000000000001', 'opened', 0);
insert into public.study_sessions (goal_resource_id, minutes) values ('cccccccc-0000-0000-0000-000000000001', 40);
select t.eq((select minutes_total from public.goal_progress where learner_id = '22222222-2222-2222-2222-222222222222'), 40, 'LA minutes are separate');
commit;

-- change log + revert
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'IR', true);
select t.fail($q$insert into public.change_log (op, table_name) values ('INSERT', 'x')$q$, 'log cannot be forged');
select t.fail($q$update public.change_log set label = 'x'$q$, 'log cannot be edited');
select t.eq((select count(*) > 5 from public.change_log), true, 'actions are logged');
select t.eq((select count(*) from public.change_log where table_name = 'goal_progress' and op = 'UPDATE' and changes ? 'pages_done'), 0::bigint, 'no update yet');
update public.goal_progress set status = 'paused', pages_done = 5, note = 'tired' where id = 'dddddddd-0000-0000-0000-000000000001';
select t.eq((select changes -> 'status' from public.change_log where table_name = 'goal_progress' and op = 'UPDATE' order by id desc limit 1), '["reading","paused"]'::jsonb, 'field-level diff stored');
select public.revert_change((select max(id) from public.change_log where table_name = 'goal_progress' and op = 'UPDATE'));
select t.eq((select status::text from public.goal_progress where id = 'dddddddd-0000-0000-0000-000000000001'), 'reading', 'revert restored status');
select t.eq((select pages_done from public.goal_progress where id = 'dddddddd-0000-0000-0000-000000000001'), 3, 'revert restored pages');
select t.eq((select count(*) from public.change_log where revert_of is not null), 1::bigint, 'revert is itself logged');
select t.eq((select count(*) from public.change_log where reverted_at is not null), 1::bigint, 'original marked reverted');
select t.eq(public.revert_change((select max(id) from public.change_log where table_name = 'goal_progress' and op = 'UPDATE' and revert_of is null)), 0, 'reverting twice does nothing');
-- delete + restore a session
delete from public.study_sessions where id = 'eeeeeeee-0000-0000-0000-000000000001';
select t.eq((select minutes_total from public.goal_progress where id = 'dddddddd-0000-0000-0000-000000000001'), 10, 'deleting a session lowers minutes');
select public.revert_change((select max(id) from public.change_log where table_name = 'study_sessions' and op = 'DELETE'));
select t.eq((select minutes_total from public.goal_progress where id = 'dddddddd-0000-0000-0000-000000000001'), 35, 'restoring a session restores minutes');
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'LA', true);
select t.fail($q$select public.revert_change((select max(id) from public.change_log where table_name = 'goal_progress' and actor_id = '11111111-1111-1111-1111-111111111111'))$q$, 'LA cannot revert IR progress entries');
-- shared goal edit by IR can be reverted by LA
select public.revert_change((select max(id) from public.change_log where table_name = 'goals' and op = 'UPDATE' and changes ? 'title'));
select t.eq((select title from public.goals limit 1), 'Week 1', 'shared goal edit reverted by the other learner');
-- delete a whole goal then restore as a group
delete from public.goals where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select t.rows('select * from public.goal_resources', 0, 'cascade deleted resources');
select public.revert_change((select max(id) from public.change_log where table_name = 'goals' and op = 'DELETE'), true);
select t.rows('select * from public.goals', 1, 'goal restored');
select t.rows('select * from public.goal_resources', 1, 'its files restored with it');
select t.eq((select deadline from public.goals limit 1), current_date + 13, 'restored goal keeps its approved deadline');
select t.fail($q$select public.revert_change((select max(id) from public.change_log where table_name = 'postponement_requests'))$q$, 'postponements are not revertable');
commit;

-- tab seen, notes, messages, announcements, vocabulary
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'IR', true);
insert into public.tab_seen (tab) values ('chat');
insert into public.notes (id, kind, title, body, question_state) values ('aaaaaaaa-0000-0000-0000-000000000003', 'question', 'Dativ?', 'Why dem?', 'open');
insert into public.messages (id, body) values ('99999999-0000-0000-0000-000000000009', 'Hallo!');
insert into public.announcements (id, title, body, priority) values ('ffffffff-0000-0000-0000-000000000001', 'Sunday', 'Quiz', 'important');
insert into public.vocab_words (id, german, word_type, article, plural, meaning_en, meaning_bn) values ('77777777-0000-0000-0000-000000000001', 'Tisch', 'noun', 'der', 'Tische', 'table', 'টেবিল');
select t.fail($q$insert into public.vocab_words (german, word_type, article, meaning_en) values ('tisch ', 'noun', 'der', 'dup')$q$, 'duplicate words rejected');
select t.fail($q$insert into public.vocab_words (german, word_type, article, meaning_en) values ('gehen', 'verb', 'der', 'x')$q$, 'verbs have no article');
insert into public.vocab_review_state (word_id) values ('77777777-0000-0000-0000-000000000001');
select t.fail($q$insert into public.messages (sender_id, body) values ('22222222-2222-2222-2222-222222222222', 'spoof')$q$, 'cannot send as the other learner');
select t.fail($q$update public.messages set body = 'x'$q$, 'messages are not editable');
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'LA', true);
select t.rows('select * from public.tab_seen', 0, 'tab-seen is per person');
select t.rows('select * from public.notes', 1, 'notes are shared');
select t.fail($q$update public.notes set body = 'changed' where id = 'aaaaaaaa-0000-0000-0000-000000000003'$q$, 'only the author edits the text');
select t.affected($q$update public.notes set question_state = 'answered' where id = 'aaaaaaaa-0000-0000-0000-000000000003'$q$, 1, 'anyone can answer a question');
select t.eq(public.mark_messages_read(), 1, 'partner marks messages read');
select t.affected($q$update public.announcements set body = 'x' where id = 'ffffffff-0000-0000-0000-000000000001'$q$, 0, 'only the author edits notices');
select t.rows('select * from public.vocab_review_state', 1, 'review schedule visible to both');
select t.affected($q$update public.vocab_review_state set ease = 3 where word_id = '77777777-0000-0000-0000-000000000001'$q$, 0, 'but only writable by its person');
select t.affected($q$update public.vocab_words set meaning_en = 'table (furniture)' where id = '77777777-0000-0000-0000-000000000001'$q$, 1, 'shared words editable by both');
commit;

-- seeds
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'IR', true);
select t.rows('select * from public.resources where is_catalog', 121, '121 inventory files');
select t.rows('select * from public.curriculum_weeks', 52, '52 curriculum weeks');
select t.affected($q$delete from public.resources where is_catalog$q$, 0, 'catalog files cannot be deleted');
commit;
\echo 'ALL DATABASE SECURITY TESTS PASSED'
