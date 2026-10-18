-- =====================================================================
-- Row Level Security. Every table in `public` has RLS enabled.
-- Model: exactly two learners (rows in public.learners). "Shared" data is readable by both;
-- private data is restricted to its owner; privileged mutations go through SECURITY DEFINER RPCs.
-- =====================================================================
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---- default privileges: nothing for anon; authenticated gets table access that RLS then narrows
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public, anon;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
-- append-only / server-written tables: clients may only read
revoke insert, update, delete on public.activity_log, public.audit_log, public.goal_deadline_history,
  public.resource_status_history, public.postponement_requests, public.vocab_review_log from authenticated;
grant insert on public.vocab_review_log to authenticated;
revoke insert, delete on public.notifications from authenticated;
revoke update on public.notifications from authenticated; grant update (read_at) on public.notifications to authenticated;
revoke update on public.learners from authenticated; grant update (display_name, theme_pref) on public.learners to authenticated;
revoke insert, delete on public.learners from authenticated;
revoke delete on public.study_sessions from authenticated;
revoke delete on public.messages from authenticated;
revoke update on public.messages from authenticated;

-- helper + RPC execute grants
grant execute on function public.is_learner(), public.other_learner_id(), public.can_edit_goal(uuid),
  public.can_edit_goal_resource(uuid), public.can_see_note(uuid) to authenticated;
grant execute on function public.request_postponement(uuid, date, text), public.decide_postponement(uuid, boolean, text),
  public.cancel_postponement(uuid), public.postpone_goal_owner(uuid, date, text),
  public.correct_resource_status(uuid, public.resource_status, text), public.mark_messages_read() to authenticated;
grant all on all tables in schema public to service_role;

-- ---- learners
create policy learners_select on public.learners for select to authenticated using (public.is_learner());
create policy learners_update_self on public.learners for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---- notifications (own only)
create policy notifications_select on public.notifications for select to authenticated using (recipient_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

-- ---- read-only shared logs
create policy activity_select on public.activity_log for select to authenticated using (public.is_learner());
create policy audit_select on public.audit_log for select to authenticated using (public.is_learner());
create policy deadline_history_select on public.goal_deadline_history for select to authenticated using (public.is_learner());
create policy status_history_select on public.resource_status_history for select to authenticated using (public.is_learner());
create policy postponement_select on public.postponement_requests for select to authenticated using (public.is_learner());

-- ---- plan / library / curriculum (shared, both learners may edit)
create policy plans_all on public.plans for all to authenticated using (public.is_learner()) with check (public.is_learner());
create policy resources_select on public.resources for select to authenticated using (public.is_learner());
create policy resources_insert on public.resources for insert to authenticated with check (public.is_learner());
create policy resources_update on public.resources for update to authenticated using (public.is_learner()) with check (public.is_learner());
create policy resources_delete on public.resources for delete to authenticated using (public.is_learner() and not is_catalog);
create policy cur_weeks_all on public.curriculum_weeks for all to authenticated using (public.is_learner()) with check (public.is_learner());
create policy cur_items_all on public.curriculum_items for all to authenticated using (public.is_learner()) with check (public.is_learner());

-- ---- goals: everyone sees all; only owner (or either learner for shared goals) mutates
create policy goals_select on public.goals for select to authenticated using (public.is_learner());
create policy goals_insert on public.goals for insert to authenticated
  with check (public.is_learner() and created_by = (select auth.uid())
              and ((scope = 'personal' and owner_id = (select auth.uid())) or (scope = 'shared' and owner_id is null)));
create policy goals_update on public.goals for update to authenticated
  using (public.can_edit_goal(id)) with check (public.can_edit_goal(id));
create policy goals_delete on public.goals for delete to authenticated using (public.can_edit_goal(id));

create policy goal_res_select on public.goal_resources for select to authenticated using (public.is_learner());
create policy goal_res_insert on public.goal_resources for insert to authenticated with check (public.can_edit_goal(goal_id));
create policy goal_res_update on public.goal_resources for update to authenticated
  using (public.can_edit_goal(goal_id)) with check (public.can_edit_goal(goal_id));
create policy goal_res_delete on public.goal_resources for delete to authenticated using (public.can_edit_goal(goal_id));

-- ---- study sessions: shared visibility, own authorship
create policy sessions_select on public.study_sessions for select to authenticated using (public.is_learner());
create policy sessions_insert on public.study_sessions for insert to authenticated
  with check (learner_id = (select auth.uid()) and public.is_learner()
              and (goal_resource_id is null or public.can_edit_goal_resource(goal_resource_id)));
create policy sessions_update on public.study_sessions for update to authenticated
  using (learner_id = (select auth.uid())) with check (learner_id = (select auth.uid()));

-- ---- vocabulary
create policy vocab_select on public.vocab_words for select to authenticated using (public.is_learner());
create policy vocab_insert on public.vocab_words for insert to authenticated with check (public.is_learner() and created_by = (select auth.uid()));
create policy vocab_update on public.vocab_words for update to authenticated using (public.is_learner()) with check (public.is_learner());
create policy vocab_delete on public.vocab_words for delete to authenticated using (created_by = (select auth.uid()));
create policy vocab_fav_all on public.vocab_favorites for all to authenticated
  using (learner_id = (select auth.uid())) with check (learner_id = (select auth.uid()));
create policy vocab_ann_all on public.vocab_annotations for all to authenticated
  using (learner_id = (select auth.uid())) with check (learner_id = (select auth.uid()));
create policy vocab_state_all on public.vocab_review_state for all to authenticated
  using (learner_id = (select auth.uid())) with check (learner_id = (select auth.uid()));
create policy vocab_log_select on public.vocab_review_log for select to authenticated using (public.is_learner());
create policy vocab_log_insert on public.vocab_review_log for insert to authenticated with check (learner_id = (select auth.uid()));

-- ---- notes: private stays private
create policy notes_select on public.notes for select to authenticated
  using (public.is_learner() and (visibility = 'shared' or owner_id = (select auth.uid())));
create policy notes_insert on public.notes for insert to authenticated
  with check (public.is_learner() and owner_id = (select auth.uid()));
create policy notes_update on public.notes for update to authenticated
  using (owner_id = (select auth.uid()) or (visibility = 'shared' and kind = 'question' and public.is_learner()))
  with check (owner_id = (select auth.uid()) or (visibility = 'shared' and kind = 'question' and public.is_learner()));
create policy notes_delete on public.notes for delete to authenticated using (owner_id = (select auth.uid()));
create policy replies_select on public.note_replies for select to authenticated using (public.can_see_note(note_id));
create policy replies_insert on public.note_replies for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_see_note(note_id));
create policy replies_delete on public.note_replies for delete to authenticated using (author_id = (select auth.uid()));

-- ---- messages (history is kept; read receipts via mark_messages_read())
create policy messages_select on public.messages for select to authenticated using (public.is_learner());
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.is_learner());

-- ---- announcements
create policy ann_select on public.announcements for select to authenticated using (public.is_learner());
create policy ann_insert on public.announcements for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_learner());
create policy ann_update on public.announcements for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy ann_delete on public.announcements for delete to authenticated using (author_id = (select auth.uid()));
create policy ann_reads_all on public.announcement_reads for all to authenticated
  using (learner_id = (select auth.uid())) with check (learner_id = (select auth.uid()));
