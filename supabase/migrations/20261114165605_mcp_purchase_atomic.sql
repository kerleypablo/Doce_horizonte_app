-- Invoked only by the trusted backend after authenticated human confirmation.
-- Runs as a single Postgres transaction; no SECURITY DEFINER privilege escalation.
create or replace function public.mcp_apply_purchase_prices(
  p_preview_id uuid, p_company_id uuid, p_auth_user_id uuid, p_digest bytea
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_preview public.mcp_write_previews%rowtype;
  v_item jsonb;
  v_input public.inputs%rowtype;
  v_result jsonb;
  v_allowed boolean;
begin
  -- All MCP write RPCs lock authorization tables first, in the same order.
  -- SHARE blocks INSERT/UPDATE/DELETE, including overrides that do not yet exist.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'MCP writes require read committed isolation';
  end if;
  lock table public.app_users, public.company_subscriptions, public.plan_modules, public.user_module_overrides in share mode;
  select * into v_preview from public.mcp_write_previews
   where id = p_preview_id and company_id = p_company_id and auth_user_id = p_auth_user_id
   for update;
  if not found or v_preview.operation <> 'purchase_prices' or v_preview.payload_digest <> p_digest then
    return jsonb_build_object('status', 'not_found');
  end if;
  select exists(select 1 from public.app_users u where u.auth_user_id = p_auth_user_id
      and u.company_id = p_company_id and not coalesce(u.access_blocked, false))
    and exists(select 1 from public.company_subscriptions s where s.company_id = p_company_id and s.status = 'active'
      and coalesce((select o.enabled from public.user_module_overrides o where o.company_id = p_company_id
        and o.auth_user_id = p_auth_user_id and o.module_key = 'cadastros'),
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
    insert into public.mcp_write_audit(preview_id, company_id, auth_user_id, operation, outcome)
      values (p_preview_id, p_company_id, p_auth_user_id, 'purchase_prices', 'rejected');
    return jsonb_build_object('status', 'expired');
  end if;
  -- Deterministic lock order prevents deadlocks between overlapping batches.
  perform id from public.inputs where company_id = p_company_id and id in
    (select (x->>'inputId')::uuid from jsonb_array_elements(v_preview.snapshot->'items') x)
    order by id for update;
  for v_item in select * from jsonb_array_elements(v_preview.snapshot->'items') loop
    select * into v_input from public.inputs where company_id = p_company_id and id = (v_item->>'inputId')::uuid;
    if not found or v_input.name is distinct from v_item->>'name'
      or v_input.brand is distinct from v_item->>'brand'
      or v_input.unit is distinct from v_item->'current'->>'unit'
      or v_input.package_size is distinct from (v_item->'current'->>'packageSize')::numeric
      or v_input.package_price is distinct from (v_item->'current'->>'packagePrice')::numeric then
      update public.mcp_write_previews set state = 'rejected' where id = p_preview_id;
      insert into public.mcp_write_audit(preview_id, company_id, auth_user_id, operation, outcome)
        values (p_preview_id, p_company_id, p_auth_user_id, 'purchase_prices', 'conflict');
      return jsonb_build_object('status', 'conflict');
    end if;
  end loop;
  if v_preview.expires_at <= clock_timestamp() then
    update public.mcp_write_previews set state = 'expired' where id = p_preview_id;
    insert into public.mcp_write_audit(preview_id, company_id, auth_user_id, operation, outcome)
      values (p_preview_id, p_company_id, p_auth_user_id, 'purchase_prices', 'rejected');
    return jsonb_build_object('status', 'expired');
  end if;
  for v_item in select * from jsonb_array_elements(v_preview.snapshot->'items') loop
    update public.inputs set package_price = (v_item->'proposed'->>'packagePrice')::numeric
      where id = (v_item->>'inputId')::uuid and company_id = p_company_id;
  end loop;
  v_result := jsonb_build_object('status', 'applied', 'previewId', p_preview_id,
    'items', (select jsonb_agg(jsonb_build_object('inputId', x->>'inputId', 'packagePrice', x->'proposed'->'packagePrice')) from jsonb_array_elements(v_preview.snapshot->'items') x));
  update public.mcp_write_previews set state = 'applied', applied_at = clock_timestamp(), result = v_result where id = p_preview_id;
  insert into public.mcp_write_audit(preview_id, company_id, auth_user_id, operation, outcome)
    values (p_preview_id, p_company_id, p_auth_user_id, 'purchase_prices', 'applied');
  return v_result;
end;
$$;
revoke all on function public.mcp_apply_purchase_prices(uuid,uuid,uuid,bytea) from public, anon, authenticated;
grant execute on function public.mcp_apply_purchase_prices(uuid,uuid,uuid,bytea) to service_role;
