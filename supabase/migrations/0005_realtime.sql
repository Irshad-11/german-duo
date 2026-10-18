-- Realtime: postgres_changes events are filtered by RLS for each subscriber.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['plans','resources','curriculum_items','goals','goal_resources','study_sessions','activity_log',
      'postponement_requests','goal_deadline_history','resource_status_history','vocab_words','vocab_review_log','notes','note_replies',
      'messages','announcements','announcement_reads','notifications','vocab_favorites','vocab_annotations','vocab_review_state'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end if;
end $$;
-- DELETE events carry only the primary key unless REPLICA IDENTITY FULL; the client just re-fetches, so default is fine.
