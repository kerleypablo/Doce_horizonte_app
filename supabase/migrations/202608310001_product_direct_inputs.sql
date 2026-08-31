alter table public.products
  add column if not exists direct_inputs jsonb not null default '[]';
