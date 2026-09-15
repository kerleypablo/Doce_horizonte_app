-- Executar antes de publicar a versao que aceita apenas g/ml/un.
-- Transacao unica: preserva precos e converte medidas e porcoes juntas.
begin;
lock table public.inputs, public.recipes, public.products in share row exclusive mode;

create temporary table legacy_recipe_units on commit drop as
select id, company_id from public.recipes where yield_unit in ('kg', 'l');

create function pg_temp.base_unit_items(items jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(
    case when item->>'unit' in ('kg', 'l') then
      item || jsonb_build_object('unit', case item->>'unit' when 'kg' then 'g' else 'ml' end,
        'quantity', (item->>'quantity')::numeric * 1000)
    else item end order by position), '[]'::jsonb)
  from jsonb_array_elements(items) with ordinality as entries(item, position)
$$;

create function pg_temp.base_recipe_portions(items jsonb, tenant uuid) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(
    case when legacy.id is not null then
      item || jsonb_build_object('quantity', (item->>'quantity')::numeric * 1000)
    else item end order by position), '[]'::jsonb)
  from jsonb_array_elements(items) with ordinality as entries(item, position)
  left join legacy_recipe_units legacy on legacy.id::text = item->>'recipeId' and legacy.company_id = tenant
$$;

update public.inputs set package_size = package_size * 1000,
  unit = case unit when 'kg' then 'g' else 'ml' end where unit in ('kg', 'l');

update public.recipes set ingredients = pg_temp.base_unit_items(ingredients),
  sub_recipes = pg_temp.base_recipe_portions(sub_recipes, company_id),
  yield = case when yield_unit in ('kg', 'l') then yield * 1000 else yield end,
  yield_unit = case yield_unit when 'kg' then 'g' when 'l' then 'ml' else yield_unit end;

update public.products set direct_inputs = pg_temp.base_unit_items(direct_inputs),
  packaging_inputs = pg_temp.base_unit_items(packaging_inputs),
  extra_recipes = pg_temp.base_recipe_portions(extra_recipes, company_id);

alter table public.inputs drop constraint if exists inputs_unit_check;
alter table public.inputs add constraint inputs_unit_check check (unit in ('g', 'ml', 'un'));
alter table public.recipes drop constraint if exists recipes_yield_unit_check;
alter table public.recipes add constraint recipes_yield_unit_check check (yield_unit in ('g', 'ml', 'un'));

drop function pg_temp.base_recipe_portions(jsonb, uuid);
drop function pg_temp.base_unit_items(jsonb);
commit;
