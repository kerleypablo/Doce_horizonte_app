-- Fase 1 do modulo Financeiro
create extension if not exists "pgcrypto";

create table if not exists financial_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  account_type text not null default 'BANK' check (account_type in ('BANK', 'CASH', 'CARD_RECEIVABLE', 'IFOOD_RECEIVABLE', 'OTHER')),
  institution text,
  balance_date date not null,
  balance_amount numeric not null default 0,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists financial_method_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  method text not null check (method in ('PIX', 'DINHEIRO', 'CARTAO', 'VOUCHER')),
  mode text not null check (mode in ('NONE', 'PERCENT', 'FIXED_ADD', 'FIXED_SUBTRACT')),
  value numeric not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (company_id, method)
);

create table if not exists financial_manual_sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  account_id uuid references financial_accounts(id) on delete set null,
  occurred_at timestamp with time zone not null,
  description text not null,
  payment_method text not null check (payment_method in ('PIX', 'DINHEIRO', 'CARTAO', 'VOUCHER')),
  amount numeric not null check (amount > 0),
  products jsonb not null default '[]',
  tags text[] not null default '{}',
  reconciled boolean not null default false,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists financial_expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  account_id uuid references financial_accounts(id) on delete set null,
  occurred_at timestamp with time zone not null,
  description text not null,
  category text,
  payment_method text not null check (payment_method in ('PIX', 'DINHEIRO', 'CARTAO', 'VOUCHER')),
  amount numeric not null check (amount > 0),
  reconciled boolean not null default false,
  recurring boolean not null default false,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists financial_daily_closings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  closing_date date not null,
  checked_balance numeric not null default 0,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (company_id, closing_date)
);

create table if not exists financial_origin_cost_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  origin text not null check (origin in ('balcao', 'rua', 'porta-a-porta', 'ifood', 'outros')),
  cost_percent numeric not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (company_id, origin)
);

alter table financial_accounts add column if not exists account_type text not null default 'BANK';
alter table financial_manual_sales add column if not exists tags text[] not null default '{}';
alter table financial_manual_sales add column if not exists products jsonb not null default '[]';
alter table financial_manual_sales add column if not exists reconciled boolean not null default false;
alter table financial_expenses add column if not exists reconciled boolean not null default false;
alter table financial_expenses add column if not exists recurring boolean not null default false;
alter table financial_expenses alter column category set default 'OUTROS';
update financial_expenses set category = 'OUTROS' where category is null or category = '';

create index if not exists financial_accounts_company_idx on financial_accounts(company_id);
create index if not exists financial_accounts_company_type_idx on financial_accounts(company_id, account_type);
create index if not exists financial_manual_sales_company_date_idx on financial_manual_sales(company_id, occurred_at);
create index if not exists financial_manual_sales_tags_gin_idx on financial_manual_sales using gin(tags);
create index if not exists financial_expenses_company_date_idx on financial_expenses(company_id, occurred_at);
create index if not exists financial_expenses_company_category_idx on financial_expenses(company_id, category);
create index if not exists financial_daily_closings_company_date_idx on financial_daily_closings(company_id, closing_date);
create index if not exists financial_origin_cost_rules_company_idx on financial_origin_cost_rules(company_id);

insert into financial_method_rules (company_id, method, mode, value)
select c.id, m.method, 'NONE', 0
from companies c
cross join (values ('PIX'), ('DINHEIRO'), ('CARTAO'), ('VOUCHER')) as m(method)
on conflict (company_id, method) do nothing;

insert into financial_origin_cost_rules (company_id, origin, cost_percent)
select c.id, r.origin, r.cost_percent
from companies c
cross join (values
  ('balcao', 40),
  ('rua', 45),
  ('porta-a-porta', 45),
  ('ifood', 50),
  ('outros', 40)
) as r(origin, cost_percent)
on conflict (company_id, origin) do nothing;
