-- Fase 1 do modulo Financeiro
create extension if not exists "pgcrypto";

create table if not exists financial_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
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
  tags text[] not null default '{}',
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
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists financial_accounts_company_idx on financial_accounts(company_id);
create index if not exists financial_manual_sales_company_date_idx on financial_manual_sales(company_id, occurred_at);
create index if not exists financial_manual_sales_tags_gin_idx on financial_manual_sales using gin(tags);
create index if not exists financial_expenses_company_date_idx on financial_expenses(company_id, occurred_at);

alter table financial_manual_sales add column if not exists tags text[] not null default '{}';

insert into financial_method_rules (company_id, method, mode, value)
select c.id, m.method, 'NONE', 0
from companies c
cross join (values ('PIX'), ('DINHEIRO'), ('CARTAO'), ('VOUCHER')) as m(method)
on conflict (company_id, method) do nothing;
