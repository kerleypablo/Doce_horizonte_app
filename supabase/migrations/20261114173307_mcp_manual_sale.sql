-- Experimental single-line manual financial sale; never linked to an order automatically.
create or replace function public.mcp_create_manual_sale(p_preview_id uuid,p_company_id uuid,p_auth_user_id uuid,p_digest bytea)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_preview public.mcp_write_previews%rowtype; v_sale jsonb; v_current jsonb; v_allowed boolean; v_id uuid; v_result jsonb;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'MCP writes require read committed isolation';
  end if;
  lock table public.app_users, public.company_subscriptions, public.plan_modules, public.user_module_overrides in share mode;
  select * into v_preview from public.mcp_write_previews where id=p_preview_id and company_id=p_company_id and auth_user_id=p_auth_user_id for update;
  if not found or v_preview.operation <> 'manual_sale' or v_preview.payload_digest <> p_digest then return jsonb_build_object('status','not_found'); end if;
  lock table public.financial_accounts in share mode;
  select exists(select 1 from public.app_users u where u.auth_user_id=p_auth_user_id and u.company_id=p_company_id and not coalesce(u.access_blocked,false))
    and exists(select 1 from public.company_subscriptions s where s.company_id=p_company_id and s.status='active' and coalesce(
      (select o.enabled from public.user_module_overrides o where o.company_id=p_company_id and o.auth_user_id=p_auth_user_id and o.module_key='financeiro'),
      exists(select 1 from public.plan_modules pm where pm.plan_id=s.plan_id and pm.module_key='financeiro'))) into v_allowed;
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
    insert into public.mcp_write_audit(preview_id,company_id,auth_user_id,operation,outcome) values(p_preview_id,p_company_id,p_auth_user_id,'manual_sale','rejected');
    return jsonb_build_object('status','expired');
  end if;
  v_sale := v_preview.snapshot->'manualSale';
  select jsonb_build_object('id',id,'name',name,'account_type',account_type,'institution',institution) into v_current from public.financial_accounts where id=(v_sale->>'accountId')::uuid and company_id=p_company_id;
  if v_current is distinct from v_preview.snapshot->'dependencies'->'account' then
    update public.mcp_write_previews set state='rejected' where id=p_preview_id;
    insert into public.mcp_write_audit(preview_id,company_id,auth_user_id,operation,outcome) values(p_preview_id,p_company_id,p_auth_user_id,'manual_sale','conflict');
    return jsonb_build_object('status','conflict');
  end if;
  insert into public.financial_manual_sales(company_id,account_id,occurred_at,description,payment_method,amount,products,tags,notes)
    values(p_company_id,(v_sale->>'accountId')::uuid,(v_sale->>'occurredAt')::timestamptz,v_sale->>'description',v_sale->>'paymentMethod',(v_sale->>'amount')::numeric,'[]'::jsonb,'{}'::text[],v_sale->>'notes') returning id into v_id;
  v_result := jsonb_build_object('status','applied','previewId',p_preview_id,'saleId',v_id);
  update public.mcp_write_previews set state='applied',applied_at=clock_timestamp(),result=v_result where id=p_preview_id;
  insert into public.mcp_write_audit(preview_id,company_id,auth_user_id,operation,outcome) values(p_preview_id,p_company_id,p_auth_user_id,'manual_sale','applied');
  return v_result;
end;
$$;
revoke all on function public.mcp_create_manual_sale(uuid,uuid,uuid,bytea) from public,anon,authenticated;
grant execute on function public.mcp_create_manual_sale(uuid,uuid,uuid,bytea) to service_role;
