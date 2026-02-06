# Supabase Setup

## 1. Criar schema
Cole e execute o conteudo de `docs/supabase_schema.sql` no SQL Editor do Supabase.

## 2. Criar empresa e canais iniciais
Exemplo de dados iniciais (ajuste o nome):

```sql
insert into companies (name) values ('Doce Horizonte') returning id;

-- use o company_id retornado
insert into company_settings (
  company_id,
  overhead_method,
  overhead_percent,
  overhead_per_unit,
  labor_cost_per_hour,
  fixed_cost_per_hour,
  taxes_percent,
  default_profit_percent
) values (
  '<COMPANY_ID>',
  'PERCENT_DIRECT',
  12,
  0,
  0,
  0,
  4,
  30
);

insert into sales_channels (company_id, name, fee_percent, payment_fee_percent, fee_fixed, active)
values
  ('<COMPANY_ID>', 'Loja Propria', 0, 2.5, 0, true),
  ('<COMPANY_ID>', 'iFood', 23, 0, 0, true);
```

## 3. Criar usuario admin no Supabase Auth
- No painel do Supabase, va em Auth > Users e crie um usuario com email/senha.
- Pegue o `id` do usuario criado (auth.users.id).
- Insira na tabela `app_users`:

```sql
insert into app_users (auth_user_id, company_id, role)
values ('<AUTH_USER_ID>', '<COMPANY_ID>', 'admin');
```

## 4. Variaveis de ambiente
Crie um `.env` na raiz:

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
PORT=3333
```

## 5. Rodar API
```
npm run dev:api
```
