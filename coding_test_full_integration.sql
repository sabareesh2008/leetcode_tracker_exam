-- ============================================================
-- FULL CODING TEST INTEGRATION
-- Run ONCE in Supabase SQL Editor after earlier coding-test SQL.
-- Safe to re-run.
-- ============================================================

begin;

alter table public.coding_attempts
  add column if not exists passed_cases integer not null default 0,
  add column if not exists total_cases integer not null default 0,
  add column if not exists result_status text,
  add column if not exists time_taken_seconds integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'coding_attempts_result_status_check'
  ) then
    alter table public.coding_attempts
      add constraint coding_attempts_result_status_check
      check (
        result_status is null
        or result_status in ('passed', 'failed')
      );
  end if;
end $$;

-- One student can have only ONE attempt per coding test.
create unique index if not exists coding_attempts_one_attempt_per_student
on public.coding_attempts(test_id, register_number);

create index if not exists idx_coding_attempts_register
on public.coding_attempts(register_number);

create index if not exists idx_coding_attempts_test
on public.coding_attempts(test_id);

create index if not exists idx_coding_attempts_result
on public.coding_attempts(result_status);

create or replace function public.verify_coding_student(
  p_register_number text
)
returns table(
  register_number text,
  student_name text
)
language sql
security definer
set search_path = public
as $$
  select
    s.register_number::text,
    s.student_name::text
  from public.students s
  where btrim(s.register_number::text)
      = btrim(p_register_number)
  limit 1;
$$;

revoke all
on function public.verify_coding_student(text)
from public;

grant execute
on function public.verify_coding_student(text)
to anon, authenticated;

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

select 'FULL CODING TEST INTEGRATION READY' as status;
