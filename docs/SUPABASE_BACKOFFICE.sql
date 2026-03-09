-- Infra complementar para backoffice/master
alter table app_users drop constraint if exists app_users_role_check;
alter table app_users
  add constraint app_users_role_check
  check (role in ('master', 'admin', 'common'));

alter table app_users
  add column if not exists access_blocked boolean not null default false;
