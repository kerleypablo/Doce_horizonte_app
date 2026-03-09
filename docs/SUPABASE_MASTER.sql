-- 1) Permitir role master no app_users
alter table app_users drop constraint if exists app_users_role_check;
alter table app_users
  add constraint app_users_role_check
  check (role in ('master', 'admin', 'common'));

-- 2) Promover usuario por email para master
update app_users au
set role = 'master'
from auth.users u
where au.auth_user_id = u.id
  and lower(u.email) = lower('kerley.kls@gmail.com');

-- 3) (Opcional) conferir resultado
-- select au.auth_user_id, u.email, au.role, au.company_id
-- from app_users au
-- join auth.users u on u.id = au.auth_user_id
-- where lower(u.email) = lower('kerley.kls@gmail.com');
