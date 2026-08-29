-- O backend e a unica camada de acesso aos dados operacionais.
-- Mantem RLS como defesa em profundidade e impede o uso direto do Data API.

alter table public.companies enable row level security;
alter table public.app_users enable row level security;
alter table public.company_settings enable row level security;
alter table public.sales_channels enable row level security;
alter table public.inputs enable row level security;
alter table public.recipes enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.financial_method_rules enable row level security;
alter table public.financial_manual_sales enable row level security;
alter table public.financial_expenses enable row level security;
alter table public.financial_daily_closings enable row level security;
alter table public.financial_reconciliation_adjustments enable row level security;
alter table public.financial_origin_cost_rules enable row level security;
alter table public.company_pagbank_edi_configs enable row level security;
alter table public.financial_external_import_items enable row level security;
alter table public.module_catalog enable row level security;
alter table public.plan_catalog enable row level security;
alter table public.plan_modules enable row level security;
alter table public.company_subscriptions enable row level security;
alter table public.user_module_overrides enable row level security;

revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;

-- Operacoes multi-etapa usadas exclusivamente pelo backend com service_role.
create or replace function public.create_company_workspace(p_auth_user_id uuid, p_company_name text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company_id uuid;
  v_plan_id uuid;
begin
  insert into companies (name) values (trim(p_company_name)) returning id into v_company_id;
  insert into company_settings (company_id, overhead_method, overhead_percent, overhead_per_unit, labor_cost_per_hour, fixed_cost_per_hour, taxes_percent, default_profit_percent)
  values (v_company_id, 'PERCENT_DIRECT', 0, 0, 0, 0, 4, 0);
  insert into sales_channels (company_id, name, fee_percent, payment_fee_percent, fee_fixed, active)
  values
    (v_company_id, 'Loja Propria', 0, 2.5, 0, true),
    (v_company_id, 'iFood', 23, 0, 0, true);
  insert into app_users (auth_user_id, company_id, role) values (p_auth_user_id, v_company_id, 'admin');
  select id into v_plan_id from plan_catalog where code = 'base' and active = true limit 1;
  if v_plan_id is not null then
    insert into company_subscriptions (company_id, plan_id, status) values (v_company_id, v_plan_id, 'active')
    on conflict (company_id) do nothing;
  end if;
  return v_company_id;
end;
$$;

revoke all on function public.create_company_workspace(uuid, text) from public, anon, authenticated;
grant execute on function public.create_company_workspace(uuid, text) to service_role;

create or replace function public.save_company_settings(p_company_id uuid, p_payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update companies set name = coalesce(nullif(trim(p_payload->>'companyName'), ''), name) where id = p_company_id;

  insert into company_settings (
    company_id, company_phone, company_email, pix_key, logo_data_url, app_theme, dark_mode,
    default_notes_delivery, default_notes_general, default_notes_payment, productive_hours_per_month,
    overhead_method, overhead_percent, overhead_per_unit, labor_cost_items, fixed_cost_items,
    labor_cost_per_hour, fixed_cost_per_hour, taxes_percent, default_profit_percent
  ) values (
    p_company_id, coalesce(p_payload->>'companyPhone', ''), coalesce(p_payload->>'companyEmail', ''),
    coalesce(p_payload->>'pixKey', ''), coalesce(p_payload->>'logoDataUrl', ''), coalesce(p_payload->>'appTheme', 'caramelo'),
    coalesce((p_payload->>'darkMode')::boolean, false), coalesce(p_payload->>'defaultNotesDelivery', ''),
    coalesce(p_payload->>'defaultNotesGeneral', ''), coalesce(p_payload->>'defaultNotesPayment', ''),
    coalesce((p_payload->>'productiveHoursPerMonth')::numeric, 0), coalesce(p_payload->>'overheadMethod', 'PERCENT_DIRECT'),
    coalesce((p_payload->>'overheadPercent')::numeric, 0), coalesce((p_payload->>'overheadPerUnit')::numeric, 0),
    coalesce(p_payload->'laborCostItems', '[]'::jsonb), coalesce(p_payload->'fixedCostItems', '[]'::jsonb),
    coalesce((p_payload->>'laborCostPerHour')::numeric, 0), coalesce((p_payload->>'fixedCostPerHour')::numeric, 0),
    coalesce((p_payload->>'taxesPercent')::numeric, 0), coalesce((p_payload->>'defaultProfitPercent')::numeric, 0)
  ) on conflict (company_id) do update set
    company_phone = excluded.company_phone, company_email = excluded.company_email, pix_key = excluded.pix_key,
    logo_data_url = excluded.logo_data_url, app_theme = excluded.app_theme, dark_mode = excluded.dark_mode,
    default_notes_delivery = excluded.default_notes_delivery, default_notes_general = excluded.default_notes_general,
    default_notes_payment = excluded.default_notes_payment, productive_hours_per_month = excluded.productive_hours_per_month,
    overhead_method = excluded.overhead_method, overhead_percent = excluded.overhead_percent, overhead_per_unit = excluded.overhead_per_unit,
    labor_cost_items = excluded.labor_cost_items, fixed_cost_items = excluded.fixed_cost_items,
    labor_cost_per_hour = excluded.labor_cost_per_hour, fixed_cost_per_hour = excluded.fixed_cost_per_hour,
    taxes_percent = excluded.taxes_percent, default_profit_percent = excluded.default_profit_percent;

  delete from sales_channels channel
  where channel.company_id = p_company_id
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_payload->'salesChannels', '[]'::jsonb)) item
      where nullif(item->>'id', '')::uuid = channel.id
    );

  insert into sales_channels (id, company_id, name, fee_percent, payment_fee_percent, fee_fixed, active)
  select coalesce(nullif(item->>'id', '')::uuid, gen_random_uuid()), p_company_id, item->>'name',
    coalesce((item->>'feePercent')::numeric, 0), coalesce((item->>'paymentFeePercent')::numeric, 0),
    coalesce((item->>'feeFixed')::numeric, 0), coalesce((item->>'active')::boolean, true)
  from jsonb_array_elements(coalesce(p_payload->'salesChannels', '[]'::jsonb)) item
  on conflict (id) do update set
    name = excluded.name, fee_percent = excluded.fee_percent, payment_fee_percent = excluded.payment_fee_percent,
    fee_fixed = excluded.fee_fixed, active = excluded.active
  where sales_channels.company_id = p_company_id;
end;
$$;

revoke all on function public.save_company_settings(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_company_settings(uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
