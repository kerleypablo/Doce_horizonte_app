-- Experimental restricted order creation; no payments, inventory or financial entries.
create or replace function public.mcp_create_order(p_preview_id uuid,p_company_id uuid,p_auth_user_id uuid,p_digest bytea)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare
  v_preview public.mcp_write_previews%rowtype; v_order jsonb; v_deps jsonb; v_item jsonb; v_current jsonb;
  v_allowed boolean; v_number text; v_prefix text; v_seq integer; v_id uuid; v_result jsonb; v_try integer;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'MCP writes require read committed isolation';
  end if;
  lock table public.app_users, public.company_subscriptions, public.plan_modules, public.user_module_overrides in share mode;
  select * into v_preview from public.mcp_write_previews where id=p_preview_id and company_id=p_company_id and auth_user_id=p_auth_user_id for update;
  if not found or v_preview.operation <> 'create_order' or v_preview.payload_digest <> p_digest then return jsonb_build_object('status','not_found'); end if;
  -- Coarse locks deliberately trade throughput for a stable authorization and cost snapshot.
  lock table public.company_settings, public.customers, public.products, public.sales_channels in share mode;
  select exists(select 1 from public.app_users u where u.auth_user_id=p_auth_user_id and u.company_id=p_company_id and not coalesce(u.access_blocked,false))
    and exists(select 1 from public.company_subscriptions s where s.company_id=p_company_id and s.status='active' and coalesce(
      (select o.enabled from public.user_module_overrides o where o.company_id=p_company_id and o.auth_user_id=p_auth_user_id and o.module_key='pedidos'),
      exists(select 1 from public.plan_modules pm where pm.plan_id=s.plan_id and pm.module_key='pedidos'))) into v_allowed;
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
    insert into public.mcp_write_audit(preview_id,company_id,auth_user_id,operation,outcome) values(p_preview_id,p_company_id,p_auth_user_id,'create_order','rejected');
    return jsonb_build_object('status','expired');
  end if;
  v_order := v_preview.snapshot->'order'; v_deps := v_preview.snapshot->'dependencies';
  select jsonb_build_object('id',id,'name',name,'phone',phone) into v_current from public.customers where id=(v_deps->'customer'->>'id')::uuid and company_id=p_company_id;
  if v_current is distinct from v_deps->'customer' then v_allowed := false; end if;
  select jsonb_build_object('overhead_method',overhead_method,'overhead_percent',overhead_percent,'overhead_per_unit',overhead_per_unit,'labor_cost_per_hour',labor_cost_per_hour,'fixed_cost_per_hour',fixed_cost_per_hour,'taxes_percent',taxes_percent,'default_profit_percent',default_profit_percent) into v_current from public.company_settings where company_id=p_company_id;
  if v_current is distinct from v_deps->'settings' then v_allowed := false; end if;
  for v_item in select * from jsonb_array_elements(v_deps->'channels') loop
    select jsonb_build_object('id',id,'active',active,'fee_percent',fee_percent,'payment_fee_percent',payment_fee_percent,'fee_fixed',fee_fixed) into v_current from public.sales_channels where id=(v_item->>'id')::uuid and company_id=p_company_id;
    if v_current is distinct from v_item then v_allowed := false; end if;
  end loop;
  for v_item in select * from jsonb_array_elements(v_deps->'products') loop
    select jsonb_build_object('id',id,'name',name,'unit_price',unit_price,'sale_price',sale_price,'units_count',units_count,'prep_time_minutes',prep_time_minutes,'target_profit_percent',target_profit_percent,'extra_percent',extra_percent,'channel_id',channel_id,'recipe_id',recipe_id,'extra_recipes',extra_recipes,'extra_products',extra_products,'direct_inputs',direct_inputs,'packaging_inputs',packaging_inputs) into v_current from public.products where id=(v_item->>'id')::uuid and company_id=p_company_id;
    if v_current is distinct from v_item then v_allowed := false; end if;
  end loop;
  if not v_allowed then
    update public.mcp_write_previews set state='rejected' where id=p_preview_id;
    insert into public.mcp_write_audit(preview_id,company_id,auth_user_id,operation,outcome) values(p_preview_id,p_company_id,p_auth_user_id,'create_order','conflict');
    return jsonb_build_object('status','conflict');
  end if;
  v_prefix := to_char(clock_timestamp() at time zone 'America/Sao_Paulo','YYYYMMDD');
  for v_try in 1..10 loop
    select coalesce(max(substring(number from '-([0-9]+)$')::integer),0)+1 into v_seq from public.orders where company_id=p_company_id and number ~ ('^' || v_prefix || '-[0-9]+$');
    v_number := v_prefix || '-' || lpad(v_seq::text,2,'0');
    begin
      insert into public.orders(company_id,number,type,order_datetime,customer_id,customer_snapshot,delivery_type,delivery_date,status,products,additions,discount_mode,discount_value,shipping_value,payments,images,alerts)
      values(p_company_id,v_number,v_order->>'type',(v_order->>'orderDateTime')::timestamptz,(v_order->'customer'->>'id')::uuid,(v_order->'customer') || jsonb_build_object('deliveryAddress',v_order->>'deliveryAddress'),v_order->>'deliveryType',nullif(v_order->>'deliveryDate','')::date,'AGUARDANDO_RETORNO',v_order->'products','[]'::jsonb,v_order->>'discountMode',(v_order->>'discountValue')::numeric,(v_order->>'shippingValue')::numeric,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb) returning id into v_id;
      exit;
    exception when unique_violation then if v_try=10 then raise; end if;
    end;
  end loop;
  v_result := jsonb_build_object('status','applied','previewId',p_preview_id,'orderId',v_id,'number',v_number);
  update public.mcp_write_previews set state='applied',applied_at=clock_timestamp(),result=v_result where id=p_preview_id;
  insert into public.mcp_write_audit(preview_id,company_id,auth_user_id,operation,outcome) values(p_preview_id,p_company_id,p_auth_user_id,'create_order','applied');
  return v_result;
end;
$$;
revoke all on function public.mcp_create_order(uuid,uuid,uuid,bytea) from public,anon,authenticated;
grant execute on function public.mcp_create_order(uuid,uuid,uuid,bytea) to service_role;
