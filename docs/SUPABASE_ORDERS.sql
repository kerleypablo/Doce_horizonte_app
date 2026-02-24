create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  number text not null,
  type text not null check (type in ('PEDIDO', 'ORCAMENTO')),
  order_datetime timestamp with time zone not null default now(),
  customer_id uuid references customers(id) on delete set null,
  customer_snapshot jsonb,
  delivery_type text not null check (delivery_type in ('ENTREGA', 'RETIRADA')),
  delivery_date date,
  status text not null check (status in ('AGUARDANDO_RETORNO', 'CONCLUIDO', 'CONFIRMADO', 'CANCELADO')),
  products jsonb not null default '[]',
  additions jsonb not null default '[]',
  discount_mode text not null default 'FIXED' check (discount_mode in ('PERCENT', 'FIXED')),
  discount_value numeric not null default 0,
  shipping_value numeric not null default 0,
  notes_delivery text,
  notes_general text,
  notes_payment text,
  pix text,
  terms text,
  payments jsonb not null default '[]',
  images jsonb not null default '[]',
  alerts jsonb not null default '[]',
  created_at timestamp with time zone default now()
);

alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check check (status in ('AGUARDANDO_RETORNO', 'CONCLUIDO', 'CONFIRMADO', 'CANCELADO'));

create unique index if not exists orders_company_number_idx on orders(company_id, number);

alter table orders enable row level security;

create policy "Users can manage own orders" on orders
  for all using (company_id in (select company_id from app_users where auth_user_id = auth.uid()))
  with check (company_id in (select company_id from app_users where auth_user_id = auth.uid()));
