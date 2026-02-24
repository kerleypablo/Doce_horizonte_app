create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  phone text not null,
  person_type text not null check (person_type in ('PF', 'PJ')),
  email text,
  address text,
  number text,
  city text,
  neighborhood text,
  zip_code text,
  notes text,
  created_at timestamp with time zone default now()
);

alter table customers enable row level security;

create policy "Users can manage own customers" on customers
  for all using (company_id in (select company_id from app_users where auth_user_id = auth.uid()))
  with check (company_id in (select company_id from app_users where auth_user_id = auth.uid()));
