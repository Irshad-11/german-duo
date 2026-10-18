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
