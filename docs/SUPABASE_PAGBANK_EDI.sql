create extension if not exists "pgcrypto";

create table if not exists company_pagbank_edi_configs (
  company_id uuid primary key references companies(id) on delete cascade,
  edi_user text not null,
  edi_token text not null,
  default_origin text not null check (default_origin in ('balcao', 'rua', 'porta-a-porta', 'ifood', 'outros')),
  active boolean not null default true,
  auto_import_enabled boolean not null default false,
  last_tested_at timestamptz,
  last_test_status text check (last_test_status in ('SUCCESS', 'ERROR')),
  last_test_detail text,
  last_imported_at timestamptz,
  last_import_status text check (last_import_status in ('SUCCESS', 'ERROR')),
  last_import_detail text,
  updated_by_auth_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists financial_external_import_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  provider text not null,
  external_id text not null,
  reference_date date not null,
  manual_sale_id uuid references financial_manual_sales(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint financial_external_import_items_provider_check
    check (provider in ('PAGBANK_EDI')),
  constraint financial_external_import_items_unique
    unique (company_id, provider, external_id)
);

create index if not exists financial_external_import_items_company_provider_date_idx
  on financial_external_import_items(company_id, provider, reference_date desc);

create or replace function set_company_pagbank_edi_configs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_company_pagbank_edi_configs_updated_at on company_pagbank_edi_configs;

create trigger trg_company_pagbank_edi_configs_updated_at
before update on company_pagbank_edi_configs
for each row
execute function set_company_pagbank_edi_configs_updated_at();
