-- Foundation only: no MCP write operation is enabled by this migration.
-- Only the trusted API's service_role may access these tables.
create table public.mcp_write_previews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  auth_user_id uuid not null references auth.users(id),
  operation text not null check (length(operation) between 1 and 80),
  idempotency_key uuid not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  payload_digest bytea not null check (octet_length(payload_digest) = 32),
  state text not null default 'prepared' check (state in ('prepared', 'applied', 'expired', 'rejected')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  applied_at timestamptz,
  result jsonb,
  constraint mcp_preview_expiry check (expires_at > created_at),
  constraint mcp_preview_applied check ((state = 'applied') = (applied_at is not null)),
  constraint mcp_preview_identity unique (id, company_id, auth_user_id),
  constraint mcp_preview_idempotency unique (company_id, auth_user_id, idempotency_key)
);
create index mcp_write_previews_expiry_idx on public.mcp_write_previews (expires_at) where state = 'prepared';

create table public.mcp_write_audit (
  id bigint generated always as identity primary key,
  preview_id uuid not null,
  company_id uuid not null references public.companies(id),
  auth_user_id uuid not null references auth.users(id),
  operation text not null,
  outcome text not null check (outcome in ('applied', 'conflict', 'rejected')),
  created_at timestamptz not null default now(),
  constraint mcp_audit_preview_identity foreign key (preview_id, company_id, auth_user_id)
    references public.mcp_write_previews (id, company_id, auth_user_id)
);
create index mcp_write_audit_company_time_idx on public.mcp_write_audit (company_id, created_at desc);

alter table public.mcp_write_previews enable row level security;
alter table public.mcp_write_audit enable row level security;
revoke all on public.mcp_write_previews, public.mcp_write_audit from public, anon, authenticated;
revoke all on sequence public.mcp_write_audit_id_seq from public, anon, authenticated;
grant select, insert, update on public.mcp_write_previews to service_role;
grant select, insert on public.mcp_write_audit to service_role;
grant usage, select on sequence public.mcp_write_audit_id_seq to service_role;
