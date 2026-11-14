-- Experimental: simple products only, explicit channel and human-reviewed price.
create or replace function public.mcp_create_product(p_preview_id uuid,p_company_id uuid,p_auth_user_id uuid,p_digest bytea)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_preview public.mcp_write_previews%rowtype; v_draft jsonb; v_deps jsonb; v_current jsonb; v_allowed boolean; v_id uuid; v_result jsonb;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'MCP writes require read committed isolation';
  end if;
  lock table public.app_users, public.company_subscriptions, public.plan_modules, public.user_module_overrides in share mode;
  select * into v_preview from public.mcp_write_previews where id=p_preview_id and company_id=p_company_id and auth_user_id=p_auth_user_id for update;
  if not found or v_preview.operation <> 'create_product' or v_preview.payload_digest <> p_digest then return jsonb_build_object('status','not_found'); end if;
  lock table public.company_settings, public.products, public.sales_channels in share row exclusive mode;
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
  if v_preview.expires_at <= clock_timestamp() then
    update public.mcp_write_previews set state='expired' where id=p_preview_id;
    insert into public.mcp_write_audit(preview_id,company_id,auth_user_id,operation,outcome) values(p_preview_id,p_company_id,p_auth_user_id,'create_product','rejected');
    return jsonb_build_object('status','expired');
  end if;
  v_draft := v_preview.snapshot->'productDraft'; v_deps := v_preview.snapshot->'dependencies';
  select jsonb_build_object('overhead_method',overhead_method,'overhead_percent',overhead_percent,'overhead_per_unit',overhead_per_unit,'labor_cost_per_hour',labor_cost_per_hour,'fixed_cost_per_hour',fixed_cost_per_hour,'taxes_percent',taxes_percent,'default_profit_percent',default_profit_percent) into v_current from public.company_settings where company_id=p_company_id;
  if v_current is distinct from v_deps->'settings' then v_allowed := false; end if;
  select jsonb_build_object('id',id,'name',name,'active',active,'fee_percent',fee_percent,'payment_fee_percent',payment_fee_percent,'fee_fixed',fee_fixed) into v_current from public.sales_channels where company_id=p_company_id and id=(v_deps->'channel'->>'id')::uuid;
  if v_current is distinct from v_deps->'channel' then v_allowed := false; end if;
  if exists(select 1 from public.products where company_id=p_company_id and lower(trim(name))=lower(trim(v_draft->>'name'))) then v_allowed := false; end if;
  if not v_allowed then
    update public.mcp_write_previews set state='rejected' where id=p_preview_id;
    insert into public.mcp_write_audit(preview_id,company_id,auth_user_id,operation,outcome) values(p_preview_id,p_company_id,p_auth_user_id,'create_product','conflict');
    return jsonb_build_object('status','conflict');
  end if;
  insert into public.products(company_id,name,recipe_id,prep_time_minutes,notes,units_count,target_profit_percent,extra_percent,unit_price,sale_price,channel_id,extra_recipes,extra_products,direct_inputs,packaging_inputs)
    values(p_company_id,trim(v_draft->>'name'),null,(v_draft->>'prepTimeMinutes')::numeric,v_draft->>'notes',(v_draft->>'unitsCount')::numeric,(v_draft->>'targetProfitPercent')::numeric,(v_draft->>'extraPercent')::numeric,(v_draft->>'unitPrice')::numeric,(v_draft->>'unitPrice')::numeric * (v_draft->>'unitsCount')::numeric,(v_draft->>'channelId')::uuid,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb) returning id into v_id;
  v_result := jsonb_build_object('status','applied','previewId',p_preview_id,'productId',v_id);
  update public.mcp_write_previews set state='applied',applied_at=clock_timestamp(),result=v_result where id=p_preview_id;
  insert into public.mcp_write_audit(preview_id,company_id,auth_user_id,operation,outcome) values(p_preview_id,p_company_id,p_auth_user_id,'create_product','applied');
  return v_result;
end;
$$;
revoke all on function public.mcp_create_product(uuid,uuid,uuid,bytea) from public,anon,authenticated;
grant execute on function public.mcp_create_product(uuid,uuid,uuid,bytea) to service_role;
