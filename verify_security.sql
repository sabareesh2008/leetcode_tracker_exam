-- ============================================================
-- OPTIONAL SECURITY VERIFICATION
-- Run after your existing admin/public security setup.
-- It does not change data.
-- ============================================================

select
  u.email,
  r.role,
  r.user_id
from public.user_roles r
join auth.users u
  on u.id = r.user_id
order by r.role, u.email;

select
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and tablename in ('students', 'user_roles')
order by tablename, policyname;
