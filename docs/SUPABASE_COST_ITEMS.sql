-- Persistencia dos custos mensais detalhados da empresa.
-- Script idempotente: pode ser executado mais de uma vez no SQL Editor do Supabase.

alter table public.company_settings
  add column if not exists productive_hours_per_month numeric not null default 0,
  add column if not exists labor_cost_items jsonb not null default '[]'::jsonb,
  add column if not exists fixed_cost_items jsonb not null default '[]'::jsonb,
  add column if not exists labor_cost_per_hour numeric not null default 0,
  add column if not exists fixed_cost_per_hour numeric not null default 0;

comment on column public.company_settings.labor_cost_items is
  'Lista persistida de salarios, pro-labore e demais custos mensais de producao.';

comment on column public.company_settings.fixed_cost_items is
  'Lista persistida de aluguel, energia, gas e demais custos mensais de estrutura.';
