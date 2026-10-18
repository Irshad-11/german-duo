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
