-- ============================================================
-- CODING TEST STABLE REPAIR
-- Run ONCE in Supabase SQL Editor.
-- Safe to run after the original coding_test_setup.sql.
-- ============================================================

begin;

-- Ensure required uniqueness exists.
create unique index if not exists coding_questions_test_question_number_uq
on public.coding_questions(test_id, question_number);

create unique index if not exists coding_submissions_attempt_question_uq
on public.coding_submissions(attempt_id, question_id);

create unique index if not exists coding_attempts_test_register_uq
on public.coding_attempts(test_id, register_number);

-- Student verification RPC.
-- It exposes ONLY register number, name and section for one exact match.
create or replace function public.verify_coding_student(
  p_register_number text
)
returns table(
  register_number text,
  student_name text,
  section text
)
language sql
security definer
set search_path = public
as $$
  select
    s.register_number::text,
    s.student_name::text,
    s.section::text
  from public.students s
  where btrim(s.register_number::text) = btrim(p_register_number)
  limit 1;
$$;

revoke all on function public.verify_coding_student(text) from public;
grant execute on function public.verify_coding_student(text) to anon, authenticated;

-- Public test reading.
drop policy if exists "read published coding tests" on public.coding_tests;
create policy "read published coding tests"
on public.coding_tests
for select
to anon, authenticated
using (
  status = 'published'
  or auth.role() = 'authenticated'
);

drop policy if exists "read coding questions" on public.coding_questions;
create policy "read coding questions"
on public.coding_questions
for select
to anon, authenticated
using (true);

-- Browser can read PUBLIC cases only.
-- Hidden cases are fetched by the trusted Java runner with service_role.
drop policy if exists "read visible coding cases" on public.coding_test_cases;
create policy "read visible coding cases"
on public.coding_test_cases
for select
to anon, authenticated
using (
  is_hidden = false
  or auth.role() = 'authenticated'
);

-- Admin CRUD.
drop policy if exists "admin manage coding tests" on public.coding_tests;
create policy "admin manage coding tests"
on public.coding_tests
for all
to authenticated
using (true)
with check (true);

drop policy if exists "admin manage coding questions" on public.coding_questions;
create policy "admin manage coding questions"
on public.coding_questions
for all
to authenticated
using (true)
with check (true);

drop policy if exists "admin manage coding cases" on public.coding_test_cases;
create policy "admin manage coding cases"
on public.coding_test_cases
for all
to authenticated
using (true)
with check (true);

-- Student attempt/draft policies for the current register-number prototype.
drop policy if exists "anon create attempts" on public.coding_attempts;
create policy "anon create attempts"
on public.coding_attempts
for insert
to anon
with check (true);

drop policy if exists "anon read attempts" on public.coding_attempts;
create policy "anon read attempts"
on public.coding_attempts
for select
to anon
using (true);

drop policy if exists "anon update attempts" on public.coding_attempts;
create policy "anon update attempts"
on public.coding_attempts
for update
to anon
using (true)
with check (true);

drop policy if exists "anon submissions" on public.coding_submissions;
create policy "anon submissions"
on public.coding_submissions
for all
to anon
using (true)
with check (true);

drop policy if exists "anon violations" on public.coding_violations;
create policy "anon violations"
on public.coding_violations
for insert
to anon
with check (true);

commit;

-- Verification
select
  'verify_coding_student ready' as status;
