-- Persistencia dos custos mensais detalhados e dos demais campos salvos junto
-- com as configuracoes da empresa.
-- Script idempotente: pode ser executado mais de uma vez no SQL Editor do Supabase.

alter table public.company_settings add column if not exists company_phone text not null default '';
alter table public.company_settings add column if not exists company_email text not null default '';
alter table public.company_settings add column if not exists pix_key text not null default '';
alter table public.company_settings add column if not exists logo_data_url text not null default '';
alter table public.company_settings add column if not exists app_theme text not null default 'caramelo';
alter table public.company_settings add column if not exists dark_mode boolean not null default false;
alter table public.company_settings add column if not exists default_notes_delivery text not null default '';
alter table public.company_settings add column if not exists default_notes_general text not null default '';
alter table public.company_settings add column if not exists default_notes_payment text not null default '';
alter table public.company_settings add column if not exists productive_hours_per_month numeric not null default 0;
alter table public.company_settings add column if not exists overhead_method text not null default 'PERCENT_DIRECT';
alter table public.company_settings add column if not exists overhead_percent numeric not null default 0;
alter table public.company_settings add column if not exists overhead_per_unit numeric not null default 0;
alter table public.company_settings add column if not exists labor_cost_items jsonb not null default '[]'::jsonb;
alter table public.company_settings add column if not exists fixed_cost_items jsonb not null default '[]'::jsonb;
alter table public.company_settings add column if not exists labor_cost_per_hour numeric not null default 0;
alter table public.company_settings add column if not exists fixed_cost_per_hour numeric not null default 0;
alter table public.company_settings add column if not exists taxes_percent numeric not null default 0;
alter table public.company_settings add column if not exists default_profit_percent numeric not null default 0;

comment on column public.company_settings.labor_cost_items is
  'Lista persistida de salarios, pro-labore e demais custos mensais de producao.';

comment on column public.company_settings.fixed_cost_items is
  'Lista persistida de aluguel, energia, gas e demais custos mensais de estrutura.';

-- Faz o PostgREST reconhecer imediatamente as colunas adicionadas.
notify pgrst, 'reload schema';
