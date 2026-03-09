-- Infra de modulos e planos (executar apos supabase_schema.sql)
create extension if not exists "pgcrypto";

create table if not exists module_catalog (
  key text primary key,
  name text not null,
  premium boolean not null default false,
  description text not null default '',
  active boolean not null default true,
  created_at timestamp with time zone not null default now()
);

create table if not exists plan_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamp with time zone not null default now()
);

create table if not exists plan_modules (
  plan_id uuid not null references plan_catalog(id) on delete cascade,
  module_key text not null references module_catalog(key) on delete cascade,
  created_at timestamp with time zone not null default now(),
  primary key (plan_id, module_key)
);

create table if not exists company_subscriptions (
  company_id uuid primary key references companies(id) on delete cascade,
  plan_id uuid not null references plan_catalog(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'paused', 'canceled')),
  started_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists user_module_overrides (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  auth_user_id uuid not null,
  module_key text not null references module_catalog(key) on delete cascade,
  enabled boolean not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (company_id, auth_user_id, module_key)
);

create index if not exists user_module_overrides_lookup_idx
  on user_module_overrides (company_id, auth_user_id);

insert into module_catalog (key, name, premium, description, active)
values
  ('cadastros', 'Cadastros e Producao', false, 'Insumos, receitas, produtos e clientes', true),
  ('pedidos', 'Pedidos', false, 'Gestao de pedidos e orcamentos', true),
  ('empresa', 'Configuracoes da Empresa', false, 'Configuracoes e equipe', true),
  ('financeiro', 'Financeiro', true, 'Fluxo de caixa, contas e relatorios', true)
on conflict (key) do update
set
  name = excluded.name,
  premium = excluded.premium,
  description = excluded.description,
  active = excluded.active;

insert into plan_catalog (code, name, active)
values ('base', 'Plano Base', true)
on conflict (code) do update
set
  name = excluded.name,
  active = excluded.active;

insert into plan_modules (plan_id, module_key)
select p.id, m.key
from plan_catalog p
join module_catalog m on m.key in ('cadastros', 'pedidos', 'empresa')
where p.code = 'base'
on conflict (plan_id, module_key) do nothing;

insert into company_subscriptions (company_id, plan_id, status)
select c.id, p.id, 'active'
from companies c
cross join plan_catalog p
where p.code = 'base'
  and not exists (
    select 1
    from company_subscriptions s
    where s.company_id = c.id
  );
