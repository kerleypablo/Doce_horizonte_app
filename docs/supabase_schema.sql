-- Enable UUID generation
create extension if not exists "pgcrypto";

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamp with time zone default now()
);

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  company_id uuid not null references companies(id) on delete cascade,
  role text not null check (role in ('admin', 'common')),
  created_at timestamp with time zone default now()
);

create table if not exists company_settings (
  company_id uuid primary key references companies(id) on delete cascade,
  overhead_method text not null default 'PERCENT_DIRECT',
  overhead_percent numeric not null default 0,
  overhead_per_unit numeric not null default 0,
  labor_cost_per_hour numeric not null default 0,
  fixed_cost_per_hour numeric not null default 0,
  taxes_percent numeric not null default 0,
  default_profit_percent numeric not null default 0
);

create table if not exists sales_channels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  fee_percent numeric not null default 0,
  payment_fee_percent numeric not null default 0,
  fee_fixed numeric not null default 0,
  active boolean not null default true,
  created_at timestamp with time zone default now()
);

create table if not exists inputs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  brand text,
  category text not null check (category in ('embalagem', 'producao', 'outros')),
  unit text not null check (unit in ('kg', 'g', 'l', 'ml', 'un')),
  package_size numeric not null,
  package_price numeric not null,
  tags text[] not null default '{}',
  notes text,
  created_at timestamp with time zone default now()
);

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  description text,
  prep_time_minutes numeric not null default 0,
  yield numeric not null,
  yield_unit text not null check (yield_unit in ('kg', 'g', 'l', 'ml', 'un')),
  ingredients jsonb not null default '[]',
  sub_recipes jsonb not null default '[]',
  tags text[] not null default '{}',
  notes text,
  created_at timestamp with time zone default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  recipe_id uuid references recipes(id) on delete set null,
  prep_time_minutes numeric not null default 0,
  notes text,
  units_count numeric not null default 1,
  target_profit_percent numeric not null default 0,
  extra_percent numeric not null default 0,
  unit_price numeric not null default 0,
  sale_price numeric not null default 0,
  channel_id uuid references sales_channels(id) on delete set null,
  extra_recipes jsonb not null default '[]',
  extra_products jsonb not null default '[]',
  packaging_inputs jsonb not null default '[]',
  created_at timestamp with time zone default now()
);

-- RLS (optional)
alter table companies enable row level security;
alter table app_users enable row level security;
alter table company_settings enable row level security;
alter table sales_channels enable row level security;
alter table inputs enable row level security;
alter table recipes enable row level security;
alter table products enable row level security;

-- Basic policies (service role bypasses RLS)
create policy "Users can view own company" on companies
  for select using (exists (select 1 from app_users u where u.company_id = id and u.auth_user_id = auth.uid()));

create policy "Users can view own profile" on app_users
  for select using (auth_user_id = auth.uid());

create policy "Users can manage own data" on inputs
  for all using (company_id in (select company_id from app_users where auth_user_id = auth.uid()))
  with check (company_id in (select company_id from app_users where auth_user_id = auth.uid()));

create policy "Users can manage own recipes" on recipes
  for all using (company_id in (select company_id from app_users where auth_user_id = auth.uid()))
  with check (company_id in (select company_id from app_users where auth_user_id = auth.uid()));

create policy "Users can manage own products" on products
  for all using (company_id in (select company_id from app_users where auth_user_id = auth.uid()))
  with check (company_id in (select company_id from app_users where auth_user_id = auth.uid()));

create policy "Users can manage own settings" on company_settings
  for all using (company_id in (select company_id from app_users where auth_user_id = auth.uid()))
  with check (company_id in (select company_id from app_users where auth_user_id = auth.uid()));

create policy "Users can manage own channels" on sales_channels
  for all using (company_id in (select company_id from app_users where auth_user_id = auth.uid()))
  with check (company_id in (select company_id from app_users where auth_user_id = auth.uid()));
