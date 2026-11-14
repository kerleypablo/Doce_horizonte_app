-- Experimental, disabled by application configuration. Apply only in an isolated test database.
create or replace function public.mcp_create_input(
  p_preview_id uuid, p_company_id uuid, p_auth_user_id uuid, p_digest bytea
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_preview public.mcp_write_previews%rowtype;
  v_data jsonb;
  v_allowed boolean;
  v_id uuid;
  v_result jsonb;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'MCP writes require read committed isolation';
  end if;
  lock table public.app_users, public.company_subscriptions, public.plan_modules, public.user_module_overrides in share mode;
  select * into v_preview from public.mcp_write_previews
    where id = p_preview_id and company_id = p_company_id and auth_user_id = p_auth_user_id for update;
  if not found or v_preview.operation <> 'create_input' or v_preview.payload_digest <> p_digest then
    return jsonb_build_object('status', 'not_found');
  end if;
  select exists(select 1 from public.app_users u where u.auth_user_id = p_auth_user_id and u.company_id = p_company_id and not coalesce(u.access_blocked, false))
    and exists(select 1 from public.company_subscriptions s where s.company_id = p_company_id and s.status = 'active'
      and coalesce((select o.enabled from public.user_module_overrides o where o.company_id = p_company_id and o.auth_user_id = p_auth_user_id and o.module_key = 'cadastros'),
        exists(select 1 from public.plan_modules pm where pm.plan_id = s.plan_id and pm.module_key = 'cadastros')))
    into v_allowed;
  if not v_allowed then return jsonb_build_object('status', 'forbidden'); end if;
  -- O acesso MCP tambem deve estar habilitado no momento da gravacao.
  if not exists (
    select 1 from public.company_subscriptions s
    where s.company_id = p_company_id and s.status = 'active'
      and coalesce((select o.enabled from public.user_module_overrides o
                    where o.company_id = p_company_id and o.auth_user_id = p_auth_user_id and o.module_key = 'mcp'),
                   exists(select 1 from public.plan_modules pm where pm.plan_id = s.plan_id and pm.module_key = 'mcp'))
  ) then return jsonb_build_object('status', 'forbidden'); end if;
  if v_preview.state = 'applied' then return v_preview.result; end if;
  if v_preview.state <> 'prepared' then return jsonb_build_object('status', v_preview.state); end if;
  if v_preview.expires_at <= clock_timestamp() then
    update public.mcp_write_previews set state = 'expired' where id = p_preview_id;
    insert into public.mcp_write_audit(preview_id,company_id,auth_user_id,operation,outcome) values(p_preview_id,p_company_id,p_auth_user_id,'create_input','rejected');
    return jsonb_build_object('status','expired');
  end if;
  v_data := v_preview.payload->'data';
  -- The current schema has no tenant/name unique key. Serialize concurrent inserts and renames
  -- while checking exact case-insensitive duplicates; avoid concurrent write skew.
  lock table public.inputs in share row exclusive mode;
  if v_preview.expires_at <= clock_timestamp() then
    update public.mcp_write_previews set state = 'expired' where id = p_preview_id;
    insert into public.mcp_write_audit(preview_id,company_id,auth_user_id,operation,outcome) values(p_preview_id,p_company_id,p_auth_user_id,'create_input','rejected');
    return jsonb_build_object('status','expired');
  end if;
  if exists(select 1 from public.inputs where company_id = p_company_id and lower(trim(name)) = lower(trim(v_data->>'name'))) then
    update public.mcp_write_previews set state = 'rejected' where id = p_preview_id;
    insert into public.mcp_write_audit(preview_id,company_id,auth_user_id,operation,outcome) values(p_preview_id,p_company_id,p_auth_user_id,'create_input','conflict');
    return jsonb_build_object('status','conflict');
  end if;
  insert into public.inputs(company_id,name,brand,category,unit,package_size,package_price,tags,notes)
    values(p_company_id,trim(v_data->>'name'),v_data->>'brand',v_data->>'category',v_data->>'unit',
      (v_data->>'packageSize')::numeric,(v_data->>'packagePrice')::numeric,
      array(select jsonb_array_elements_text(v_data->'tags')),v_data->>'notes') returning id into v_id;
  v_result := jsonb_build_object('status','applied','previewId',p_preview_id,'inputId',v_id);
  update public.mcp_write_previews set state='applied',applied_at=clock_timestamp(),result=v_result where id=p_preview_id;
  insert into public.mcp_write_audit(preview_id,company_id,auth_user_id,operation,outcome) values(p_preview_id,p_company_id,p_auth_user_id,'create_input','applied');
  return v_result;
end;
$$;
revoke all on function public.mcp_create_input(uuid,uuid,uuid,bytea) from public,anon,authenticated;
grant execute on function public.mcp_create_input(uuid,uuid,uuid,bytea) to service_role;
