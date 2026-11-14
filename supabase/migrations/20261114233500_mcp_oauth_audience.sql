-- Allow only explicitly trusted OAuth clients to receive MCP-bound tokens.
-- Merely applying this migration does not enable the Supabase Auth hook.
create table public.mcp_oauth_trusted_clients (
  client_id uuid primary key references auth.oauth_clients(id) on delete cascade,
  resource text not null check (resource = 'https://doce-horizonte-app.onrender.com/mcp'),
  enabled boolean not null default false
);
alter table public.mcp_oauth_trusted_clients enable row level security;
revoke all on public.mcp_oauth_trusted_clients from public, anon, authenticated;
grant select on public.mcp_oauth_trusted_clients to supabase_auth_admin;
create policy mcp_oauth_trusted_clients_auth_hook on public.mcp_oauth_trusted_clients
  for select to supabase_auth_admin using (true);

create function public.mcp_oauth_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  claims jsonb := event -> 'claims';
  client_resource text;
begin
  -- Ordinary app logins have no OAuth client_id and remain unchanged.
  if jsonb_typeof(claims) = 'object' and claims ->> 'client_id' is not null then
    select c.resource into client_resource
      from public.mcp_oauth_trusted_clients c
      where c.client_id::text = claims ->> 'client_id' and c.enabled;
    if client_resource is not null then
      claims := jsonb_set(claims, '{aud}', to_jsonb(client_resource), true);
    end if;
  end if;
  return jsonb_build_object('claims', claims);
end;
$$;
revoke all on function public.mcp_oauth_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.mcp_oauth_access_token_hook(jsonb) to supabase_auth_admin;
