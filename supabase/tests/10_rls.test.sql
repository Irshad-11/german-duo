-- Security + business-rule tests for the database. Each failed assertion raises an exception (psql aborts, non-zero exit).
\set ON_ERROR_STOP on
\set IR '11111111-1111-1111-1111-111111111111'
\set LA '22222222-2222-2222-2222-222222222222'

create schema t;
create function t.fail(q text, lbl text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then return; end;
  raise exception 'FAIL (expected an error): %', lbl;
end $$;
create function t.affected(q text, n int, lbl text) returns void language plpgsql as $$
declare c int;
begin
  execute q; get diagnostics c = row_count;
  if c <> n then raise exception 'FAIL: % (affected % rows, expected %)', lbl, c, n; end if;
end $$;
create function t.rows(q text, n int, lbl text) returns void language plpgsql as $$
declare c int;
begin
  execute 'select count(*) from (' || q || ') s' into c;
  if c <> n then raise exception 'FAIL: % (got % rows, expected %)', lbl, c, n; end if;
end $$;
create function t.eq(a anyelement, b anyelement, lbl text) returns void language plpgsql as $$
begin if a is distinct from b then raise exception 'FAIL: % (% <> %)', lbl, a, b; end if; end $$;
grant usage on schema t to anon, authenticated;
grant execute on all functions in schema t to anon, authenticated;

-- ---------- provisioning (as superuser / service role) ----------
insert into auth.users (id, email) values (:'IR', 'ir@example.test'), (:'LA', 'la@example.test');
insert into public.learners (id, code, display_name, accent) values (:'IR', 'IR', 'Learner IR', 'cobalt'), (:'LA', 'LA', 'Learner LA', 'teal');
insert into public.plans (title, start_date, target_end_date) values ('First year', current_date, current_date + 365);



-- ---------- anon sees nothing ----------
begin; set local role anon;
select t.fail('select * from public.goals', 'anon cannot read goals');
select t.fail('select * from public.notes', 'anon cannot read notes');
select t.fail('select * from public.learners', 'anon cannot read learners');
commit;

-- ---------- credentials unreachable for learners ----------
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'IR', true);
select t.rows('select * from public.learners', 2, 'both learners can see the two profiles');
select t.fail($q$update public.learners set code = 'XX' where id = '11111111-1111-1111-1111-111111111111'$q$, 'code is not updatable');
select t.affected($q$update public.learners set theme_pref = 'dark' where id = '11111111-1111-1111-1111-111111111111'$q$, 1, 'own theme is updatable');
select t.affected($q$update public.learners set theme_pref = 'dark' where id = '22222222-2222-2222-2222-222222222222'$q$, 0, 'cannot change the other learner profile');
select t.fail($q$insert into public.learners (id, code, display_name) values (gen_random_uuid(), 'ZZ', 'x')$q$, 'learners cannot self-register');
commit;

-- ---------- notes privacy ----------
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'IR', true);
insert into public.notes (id, visibility, kind, body) values ('aaaaaaaa-0000-0000-0000-000000000001', 'private', 'note', 'IR secret');
insert into public.notes (id, visibility, kind, body) values ('aaaaaaaa-0000-0000-0000-000000000002', 'shared', 'note', 'IR shared');
insert into public.notes (id, visibility, kind, title, body, question_state) values ('aaaaaaaa-0000-0000-0000-000000000003', 'shared', 'question', 'Dativ?', 'Why dem?', 'open');
select t.fail($q$insert into public.notes (owner_id, body) values ('22222222-2222-2222-2222-222222222222', 'forged')$q$, 'cannot create notes as the other learner');
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'LA', true);
select t.rows($q$select * from public.notes where id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$, 0, 'private note invisible even when id is known');
select t.affected($q$update public.notes set body = 'pwned' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$, 0, 'cannot update private note');
select t.affected($q$delete from public.notes where id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$, 0, 'cannot delete private note');
select t.fail($q$insert into public.note_replies (note_id, body) values ('aaaaaaaa-0000-0000-0000-000000000001', 'sneaky')$q$, 'cannot reply to a private note');
select t.rows($q$select * from public.notes where id = 'aaaaaaaa-0000-0000-0000-000000000002'$q$, 1, 'shared note visible');
select t.affected($q$update public.notes set body = 'edited' where id = 'aaaaaaaa-0000-0000-0000-000000000002'$q$, 0, 'cannot edit body of the other learner shared note');
select t.affected($q$update public.notes set question_state = 'answered' where id = 'aaaaaaaa-0000-0000-0000-000000000003'$q$, 1, 'other learner can resolve a shared question');
select t.fail($q$update public.notes set question_state = 'open', body = 'changed' where id = 'aaaaaaaa-0000-0000-0000-000000000003'$q$, 'question state change cannot smuggle body edits');
insert into public.note_replies (note_id, body) values ('aaaaaaaa-0000-0000-0000-000000000003', 'Because Dativ.');
select t.rows('select * from public.notifications', 1, 'LA was notified about the new question');
commit;

-- ---------- goals, ownership, postponement ----------
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'IR', true);
insert into public.goals (id, scope, owner_id, title, week_start, deadline) values ('bbbbbbbb-0000-0000-0000-000000000001', 'personal', :'IR', 'IR week 1', date_trunc('week', current_date)::date, date_trunc('week', current_date)::date + 6);
insert into public.goals (id, scope, owner_id, title, week_start, deadline, postpone_policy) values ('bbbbbbbb-0000-0000-0000-000000000002', 'personal', :'IR', 'IR flexible', date_trunc('week', current_date)::date, date_trunc('week', current_date)::date + 6, 'owner');
insert into public.goals (id, scope, owner_id, title, week_start, deadline) values ('bbbbbbbb-0000-0000-0000-000000000003', 'shared', null, 'Together', date_trunc('week', current_date)::date, date_trunc('week', current_date)::date + 6);
select t.fail($q$update public.goals set deadline = deadline + 7 where id = 'bbbbbbbb-0000-0000-0000-000000000001'$q$, 'direct deadline edits are blocked');
select t.fail($q$insert into public.goals (scope, owner_id, title, week_start, deadline) values ('personal', '22222222-2222-2222-2222-222222222222', 'forged', current_date, current_date)$q$, 'cannot create a goal owned by the other learner');
select t.fail($q$update public.goals set owner_id = '22222222-2222-2222-2222-222222222222' where id = 'bbbbbbbb-0000-0000-0000-000000000001'$q$, 'cannot reassign owner');
select t.fail($q$insert into public.goals (scope, owner_id, title, week_start, deadline) values ('personal', '11111111-1111-1111-1111-111111111111', 'bad week', current_date + 1 - extract(isodow from current_date + 1)::int + 2, current_date + 20)$q$, 'week_start must be a Monday');
select t.fail($q$update public.goals set postpone_policy = 'owner' where id = 'bbbbbbbb-0000-0000-0000-000000000001'$q$, 'mutual goal cannot be switched to self-rescheduling');
select public.request_postponement('bbbbbbbb-0000-0000-0000-000000000001', date_trunc('week', current_date)::date + 13, 'Sick this week');
select t.rows($q$select * from public.postponement_requests where status = 'pending'$q$, 1, 'pending request exists');
select t.fail($q$select public.request_postponement('bbbbbbbb-0000-0000-0000-000000000001', current_date + 30, 'second request while pending')$q$, 'only one pending request per goal');
select t.fail($q$select public.decide_postponement((select id from public.postponement_requests limit 1), true, 'self approve')$q$, 'requester cannot approve own request');
select t.fail($q$insert into public.postponement_requests (goal_id, requester_id, reason, original_deadline, proposed_deadline, status) values ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'forged', current_date, current_date + 3, 'approved')$q$, 'cannot insert postponement rows directly');
select t.fail($q$update public.postponement_requests set status = 'approved'$q$, 'cannot update postponement rows directly');
select t.fail($q$select public.postpone_goal_owner('bbbbbbbb-0000-0000-0000-000000000001', current_date + 40, 'skip approval')$q$, 'mutual goal cannot bypass approval');
select public.postpone_goal_owner('bbbbbbbb-0000-0000-0000-000000000002', date_trunc('week', current_date)::date + 10, 'Travel');
select t.rows('select * from public.goal_deadline_history', 1, 'owner postponement is recorded');
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'LA', true);
select t.rows('select * from public.goals', 3, 'LA sees all goals (shared dashboard)');
select t.affected($q$update public.goals set title = 'hijack' where id = 'bbbbbbbb-0000-0000-0000-000000000001'$q$, 0, 'LA cannot edit IR personal goal');
select t.affected($q$delete from public.goals where id = 'bbbbbbbb-0000-0000-0000-000000000001'$q$, 0, 'LA cannot delete IR personal goal');
select t.affected($q$update public.goals set title = 'Together (edited)' where id = 'bbbbbbbb-0000-0000-0000-000000000003'$q$, 1, 'either learner can edit shared goals');
select t.fail($q$select public.postpone_goal_owner('bbbbbbbb-0000-0000-0000-000000000002', current_date + 60, 'not mine')$q$, 'LA cannot postpone IR goal directly');
select t.fail($q$select public.request_postponement('bbbbbbbb-0000-0000-0000-000000000001', current_date + 60, 'not mine')$q$, 'LA cannot request postponement of IR personal goal');
select public.decide_postponement((select id from public.postponement_requests where status = 'pending' limit 1), true, 'ok');
select t.eq((select deadline from public.goals where id = 'bbbbbbbb-0000-0000-0000-000000000001'), date_trunc('week', current_date)::date + 13, 'approval moved the deadline');
select t.eq((select original_deadline from public.goals where id = 'bbbbbbbb-0000-0000-0000-000000000001'), date_trunc('week', current_date)::date + 6, 'original deadline preserved');
select t.fail($q$select public.decide_postponement((select id from public.postponement_requests where status = 'approved' limit 1), false, 'again')$q$, 'a decided request cannot be decided twice');
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'IR', true);
select t.rows($q$select * from public.notifications where kind = 'postponement'$q$, 1, 'IR was notified of the decision');
select t.fail($q$insert into public.notifications (recipient_id, kind, title) values ('11111111-1111-1111-1111-111111111111', 'x', 'forged')$q$, 'notifications cannot be forged');
commit;

-- ---------- resources on goals, completion protection, correction ----------
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'IR', true);
insert into public.goal_resources (id, goal_id, title, start_page, end_page, page_count, source_folder) values ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Menschen A1-1', 10, 19, 106, 'A1/Books');
select t.fail($q$insert into public.goal_resources (goal_id, title, start_page, end_page, page_count) values ('bbbbbbbb-0000-0000-0000-000000000001', 'bad', 5, 200, 106)$q$, 'page range beyond page count rejected');
select t.fail($q$insert into public.goal_resources (goal_id, title, start_page, end_page) values ('bbbbbbbb-0000-0000-0000-000000000001', 'bad', 9, 3)$q$, 'inverted page range rejected');
select t.fail($q$update public.goal_resources set pages_done = 11 where id = 'cccccccc-0000-0000-0000-000000000001'$q$, 'pages_done cannot exceed the assigned range');
update public.goal_resources set status = 'reading', current_page = 12, pages_done = 3 where id = 'cccccccc-0000-0000-0000-000000000001';
insert into public.study_sessions (id, goal_resource_id, goal_id, label, minutes, source) values ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Menschen A1-1', 25, 'manual');
insert into public.study_sessions (goal_resource_id, minutes) values ('cccccccc-0000-0000-0000-000000000001', 10);
select t.eq((select total_minutes from public.goal_resources where id = 'cccccccc-0000-0000-0000-000000000001'), 35, 'minutes roll up onto the assignment');
select t.fail($q$update public.study_sessions set minutes = 999 where id = 'dddddddd-0000-0000-0000-000000000001'$q$, 'recorded minutes cannot be edited');
update public.study_sessions set voided_at = now(), void_reason = 'logged twice' where id = 'dddddddd-0000-0000-0000-000000000001';
select t.eq((select total_minutes from public.goal_resources where id = 'cccccccc-0000-0000-0000-000000000001'), 10, 'voiding a session recalculates minutes');
update public.goal_resources set status = 'completed', pages_done = 10 where id = 'cccccccc-0000-0000-0000-000000000001';
select t.fail($q$update public.goal_resources set status = 'reading' where id = 'cccccccc-0000-0000-0000-000000000001'$q$, 'completed cannot be silently reverted');
select t.fail($q$select public.correct_resource_status('cccccccc-0000-0000-0000-000000000001', 'reading', '')$q$, 'correction needs a reason');
select public.correct_resource_status('cccccccc-0000-0000-0000-000000000001', 'reading', 'Marked complete by mistake');
select t.rows($q$select * from public.resource_status_history where kind = 'correction'$q$, 1, 'correction is in history');
select t.eq((select count(*)::int from public.resource_status_history where goal_resource_id = 'cccccccc-0000-0000-0000-000000000001'), 3, 'history keeps every transition');
update public.goal_resources set status = 'needs_help', help_note = 'Dativ is confusing' where id = 'cccccccc-0000-0000-0000-000000000001';
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'LA', true);
select t.rows($q$select * from public.notifications where kind = 'help'$q$, 1, 'LA was notified of the help request');
select t.fail($q$insert into public.goal_resources (goal_id, title) values ('bbbbbbbb-0000-0000-0000-000000000001', 'smuggled')$q$, 'LA cannot add resources to IR personal goal');
select t.affected($q$update public.goal_resources set status = 'completed' where id = 'cccccccc-0000-0000-0000-000000000001'$q$, 0, 'LA cannot change IR progress');
select t.fail($q$insert into public.study_sessions (learner_id, minutes) values ('11111111-1111-1111-1111-111111111111', 30)$q$, 'LA cannot log a session as IR');
select t.fail($q$insert into public.study_sessions (goal_resource_id, minutes) values ('cccccccc-0000-0000-0000-000000000001', 30)$q$, 'LA cannot log time on IR assignment');
select t.rows('select * from public.study_sessions', 2, 'sessions are visible to both');
select t.fail('delete from public.study_sessions', 'sessions cannot be deleted');
select t.fail($q$insert into public.activity_log (kind, summary) values ('x', 'forged')$q$, 'activity log is append-only via triggers');
select t.fail($q$update public.activity_log set summary = 'edited'$q$, 'activity log cannot be edited');
select t.eq((select count(*) > 0 from public.activity_log), true, 'activity feed readable by both');
commit;

-- ---------- messages ----------
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'IR', true);
insert into public.messages (id, body) values ('eeeeeeee-0000-0000-0000-000000000001', 'Hallo!');
select t.fail($q$insert into public.messages (sender_id, body) values ('22222222-2222-2222-2222-222222222222', 'spoofed')$q$, 'cannot send as the other learner');
select t.fail($q$insert into public.messages (id, body) values ('eeeeeeee-0000-0000-0000-000000000001', 'duplicate id')$q$, 'duplicate id rejected (idempotent retry handled client-side)');
select t.fail($q$update public.messages set body = 'edited'$q$, 'messages cannot be edited');
select t.fail('delete from public.messages', 'messages cannot be deleted');
select t.eq(public.mark_messages_read(), 0, 'sender does not mark own messages read');
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'LA', true);
select t.rows('select * from public.messages where read_at is null', 1, 'unread message visible');
select t.eq(public.mark_messages_read(), 1, 'recipient marks as read');
select t.rows('select * from public.messages where read_at is null', 0, 'no unread left');
commit;

-- ---------- announcements ----------
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'IR', true);
insert into public.announcements (id, title, body, priority) values ('ffffffff-0000-0000-0000-000000000001', 'Sunday review', 'Quiz at 8pm', 'important');
update public.announcements set body = 'Quiz at 9pm' where id = 'ffffffff-0000-0000-0000-000000000001';
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'LA', true);
select t.rows('select * from public.announcements', 1, 'notice visible to both');
select t.affected($q$update public.announcements set body = 'tampered' where id = 'ffffffff-0000-0000-0000-000000000001'$q$, 0, 'cannot edit the other learner notice');
select t.affected($q$delete from public.announcements where id = 'ffffffff-0000-0000-0000-000000000001'$q$, 0, 'cannot delete the other learner notice');
insert into public.announcement_reads (announcement_id, dismissed) values ('ffffffff-0000-0000-0000-000000000001', true);
select t.fail($q$insert into public.announcement_reads (announcement_id, learner_id) values ('ffffffff-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111')$q$, 'cannot write read-state for the other learner');
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'IR', true);
select t.rows('select * from public.announcement_reads', 0, 'read state is private');
commit;

-- ---------- vocabulary ----------
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'IR', true);
insert into public.vocab_words (id, german, word_type, article, plural, meaning_en, meaning_bn) values ('99999999-0000-0000-0000-000000000001', 'Tisch', 'noun', 'der', 'Tische', 'table', 'টেবিল');
select t.eq((select gender from public.vocab_words where german = 'Tisch'), 'masculine', 'gender is derived from the article');
select t.fail($q$insert into public.vocab_words (german, word_type, article, meaning_en) values ('tisch ', 'noun', 'der', 'dup')$q$, 'duplicate words are rejected (case/space-insensitive)');
select t.fail($q$insert into public.vocab_words (german, word_type, article, meaning_en) values ('gehen', 'verb', 'der', 'to go')$q$, 'verbs cannot have an article');
insert into public.vocab_words (id, german, word_type, details, meaning_en) values ('99999999-0000-0000-0000-000000000002', 'gehen', 'verb', '{"partizip2":"gegangen","aux":"sein"}', 'to go');
insert into public.vocab_annotations (word_id, note) values ('99999999-0000-0000-0000-000000000001', 'my private mnemonic');
insert into public.vocab_review_state (word_id) values ('99999999-0000-0000-0000-000000000001');
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'LA', true);
select t.rows('select * from public.vocab_words', 2, 'shared vocabulary visible');
select t.rows('select * from public.vocab_annotations', 0, 'annotations are private');
select t.rows('select * from public.vocab_review_state', 0, 'review schedule is private');
select t.fail($q$insert into public.vocab_annotations (learner_id, word_id, note) values ('11111111-1111-1111-1111-111111111111', '99999999-0000-0000-0000-000000000001', 'x')$q$, 'cannot annotate as IR');
select t.affected($q$update public.vocab_words set meaning_en = 'table (furniture)' where id = '99999999-0000-0000-0000-000000000001'$q$, 1, 'shared words can be corrected by either learner');
select t.affected($q$delete from public.vocab_words where id = '99999999-0000-0000-0000-000000000001'$q$, 0, 'only the creator can delete a word');
insert into public.vocab_review_log (word_id, rating, new_interval) values ('99999999-0000-0000-0000-000000000001', 'good', 1);
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'IR', true);
select t.rows('select * from public.vocab_review_log', 1, 'review log visible to both for comparison');
select t.fail($q$insert into public.vocab_review_log (learner_id, word_id, rating) values ('22222222-2222-2222-2222-222222222222', '99999999-0000-0000-0000-000000000001', 'easy')$q$, 'cannot log reviews as the other learner');
commit;

-- ---------- catalog / curriculum seeds ----------
begin; set local role authenticated; select set_config('request.jwt.claim.sub', :'IR', true);
select t.rows('select * from public.resources where is_catalog', 121, 'inventory seeded: 121 files');
select t.rows('select * from public.curriculum_weeks', 52, 'curriculum seeded: 52 weeks');
select t.affected($q$delete from public.resources where is_catalog$q$, 0, 'catalog resources cannot be deleted');
select t.rows($q$select * from public.curriculum_items i join public.resources r on r.library_path = i.resource_path$q$, 132, 'all curriculum items resolve to a resource');
commit;

\echo 'ALL DATABASE SECURITY TESTS PASSED'
