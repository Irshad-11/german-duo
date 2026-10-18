-- STEP 3 of 3 — connect the two login users to the app, and create the first plan.
-- Do this AFTER creating the two users in Supabase → Authentication → Users → Add user (see README).
--   irshadrisad@gmail.com   password = IR's access key
--   irshad.wife@gmail.com   password = LA's access key
-- (If you use other emails, replace them below AND in .env VITE_LEARNER_EMAILS, same order.)
-- You can change the display names below (e.g. 'Rafi', 'Wife name'). Safe to run again.

insert into public.learners (id, code, display_name, accent)
select id, 'IR', 'IR', 'cobalt' from auth.users where lower(email) = 'irshadrisad@gmail.com'
on conflict (id) do nothing;

insert into public.learners (id, code, display_name, accent)
select id, 'LA', 'LA', 'teal' from auth.users where lower(email) = 'irshad.wife@gmail.com'
on conflict (id) do nothing;

insert into public.plans (title, description, start_date, target_end_date)
select 'First year: A1 → A2 → start of B1', 'Initial 365-day target. Extend or replace it in Settings.', current_date, current_date + 365
where not exists (select 1 from public.plans where is_active);

-- Check: should show 2 learners
select code, display_name from public.learners order by code;
