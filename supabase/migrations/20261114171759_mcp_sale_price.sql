-- Experimental; only the trusted backend may call this function.
create or replace function public.mcp_apply_sale_price(p_preview_id uuid, p_company_id uuid, p_auth_user_id uuid, p_digest bytea)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_preview public.mcp_write_previews%rowtype;
  v_product public.products%rowtype;
  v_item jsonb;
  v_allowed boolean;
  v_result jsonb;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'MCP writes require read committed isolation';
  end if;
  lock table public.app_users, public.company_subscriptions, public.plan_modules, public.user_module_overrides in share mode;
  select * into v_preview from public.mcp_write_previews where id=p_preview_id and company_id=p_company_id and auth_user_id=p_auth_user_id for update;
  if not found or v_preview.operation <> 'sale_price' or v_preview.payload_digest <> p_digest then return jsonb_build_object('status','not_found'); end if;
  select exists(select 1 from public.app_users u where u.auth_user_id=p_auth_user_id and u.company_id=p_company_id and not coalesce(u.access_blocked,false))
    and exists(select 1 from public.company_subscriptions s where s.company_id=p_company_id and s.status='active' and coalesce(
      (select o.enabled from public.user_module_overrides o where o.company_id=p_company_id and o.auth_user_id=p_auth_user_id and o.module_key='cadastros'),
      exists(select 1 from public.plan_modules pm where pm.plan_id=s.plan_id and pm.module_key='cadastros'))) into v_allowed;
  if not v_allowed then return jsonb_build_object('status','forbidden'); end if;
  -- O acesso MCP tambem deve estar habilitado no momento da gravacao.
  if not exists (
    select 1 from public.company_subscriptions s
    where s.company_id = p_company_id and s.status = 'active'
      and coalesce((select o.enabled from public.user_module_overrides o
                    where o.company_id = p_company_id and o.auth_user_id = p_auth_user_id and o.module_key = 'mcp'),
                   exists(select 1 from public.plan_modules pm where pm.plan_id = s.plan_id and pm.module_key = 'mcp'))
  ) then return jsonb_build_object('status', 'forbidden'); end if;
  if v_preview.state='applied' then return v_preview.result; end if;
  if v_preview.state <> 'prepared' then return jsonb_build_object('status',v_preview.state); end if;
  v_item := v_preview.snapshot->'product';
  select * into v_product from public.products where id=(v_item->>'id')::uuid and company_id=p_company_id for update;
  if v_preview.expires_at <= clock_timestamp() then
    update public.mcp_write_previews set state='expired' where id=p_preview_id;
    insert into public.mcp_write_audit(preview_id,company_id,auth_user_id,operation,outcome) values(p_preview_id,p_company_id,p_auth_user_id,'sale_price','rejected');
    return jsonb_build_object('status','expired');
  end if;
  if not found or v_product.name is distinct from v_item->>'name'
    or v_product.units_count is distinct from (v_item->>'unitsCount')::numeric
    or v_product.unit_price is distinct from (v_item->>'currentUnitPrice')::numeric
    or v_product.sale_price is distinct from (v_item->>'currentSalePrice')::numeric then
    update public.mcp_write_previews set state='rejected' where id=p_preview_id;
    insert into public.mcp_write_audit(preview_id,company_id,auth_user_id,operation,outcome) values(p_preview_id,p_company_id,p_auth_user_id,'sale_price','conflict');
    return jsonb_build_object('status','conflict');
  end if;
  update public.products set unit_price=(v_item->>'newUnitPrice')::numeric,
    sale_price=(v_item->>'newUnitPrice')::numeric * units_count where id=v_product.id and company_id=p_company_id;
  v_result := jsonb_build_object('status','applied','previewId',p_preview_id,'productId',v_product.id);
  update public.mcp_write_previews set state='applied',applied_at=clock_timestamp(),result=v_result where id=p_preview_id;
  insert into public.mcp_write_audit(preview_id,company_id,auth_user_id,operation,outcome) values(p_preview_id,p_company_id,p_auth_user_id,'sale_price','applied');
  return v_result;
end;
$$;
revoke all on function public.mcp_apply_sale_price(uuid,uuid,uuid,bytea) from public,anon,authenticated;
grant execute on function public.mcp_apply_sale_price(uuid,uuid,uuid,bytea) to service_role;
