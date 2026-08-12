-- ============================================================
-- LEETCODE TRACKER: ADMIN CRUD AUTO-REFRESH UPGRADE
--
-- Run this ONCE in Supabase -> SQL Editor.
--
-- Purpose:
-- INSERT, UPDATE and DELETE on public.students will all call
-- the existing "super-action" Edge Function, which triggers
-- the GitHub Action / tracker.py refresh.
-- ============================================================

create extension if not exists pg_net;

create or replace function public.trigger_leetcode_update()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  payload jsonb;
  target_id bigint;
  target_register text;
  target_name text;
  target_username text;
begin

  if TG_OP = 'DELETE' then
    target_id := OLD.id;
    target_register := OLD.register_number;
    target_name := OLD.student_name;
    target_username := OLD.leetcode_username;
  else
    target_id := NEW.id;
    target_register := NEW.register_number;
    target_name := NEW.student_name;
    target_username := NEW.leetcode_username;
  end if;

  payload := jsonb_build_object(
    'event', TG_OP,
    'student_id', target_id,
    'register_number', target_register,
    'student_name', target_name,
    'leetcode_username', target_username
  );

  perform net.http_post(
    url := 'https://ynoikeairkdqfcdwmfms.supabase.co/functions/v1/super-action',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := payload
  );

  if TG_OP = 'DELETE' then
    return OLD;
  end if;

  return NEW;
end;
$$;

drop trigger if exists student_added_trigger
on public.students;

drop trigger if exists student_profile_sync_trigger
on public.students;

create trigger student_profile_sync_trigger
after insert or update or delete
on public.students
for each row
execute function public.trigger_leetcode_update();

-- Verify trigger was created:
select
  trigger_name,
  event_manipulation
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'students'
order by trigger_name, event_manipulation;
