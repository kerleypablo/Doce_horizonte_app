# Endpoints

## Auth
- `POST /auth/login`
  - body: `{ email, password }`
  - response: `{ token, role }`
- `POST /auth/register` (admin)
  - body: `{ email, password, role }`
- `GET /auth/me`
- `GET /auth/modules`

## Empresa
- `GET /company/settings`
- `PUT /company/settings`
- `GET /company/plans`
- `PUT /company/subscription`
- `PUT /company/users/:authUserId/module-access`

## Backoffice (master)
- `GET /backoffice/dashboard`
- `PUT /backoffice/companies/:companyId/subscription`
- `PUT /backoffice/users/:authUserId/role`
- `PUT /backoffice/users/:authUserId/access`
- `PUT /backoffice/users/:authUserId/modules`

## Financeiro
- `GET /finance/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /finance/accounts`
- `POST /finance/accounts`
- `PUT /finance/accounts/:id`
- `DELETE /finance/accounts/:id`
- `GET /finance/method-rules`
- `PUT /finance/method-rules`
- `GET /finance/manual-sales?from=YYYY-MM-DD&to=YYYY-MM-DD&tag=tagOpcional&search=textoOpcional`
- `GET /finance/manual-sales/tags`
- `POST /finance/manual-sales`
- `PUT /finance/manual-sales/:id`
- `DELETE /finance/manual-sales/:id`
- `GET /finance/expenses?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `POST /finance/expenses`
- `PUT /finance/expenses/:id`
- `DELETE /finance/expenses/:id`

## Insumos
- `GET /inputs`
- `POST /inputs`
- `PUT /inputs/:id`
- `DELETE /inputs/:id`

## Receitas
- `GET /recipes`
- `POST /recipes`
- `GET /recipes/:id`

## Produtos
- `GET /products`
- `POST /products`

## Precificacao
- `POST /pricing/preview`
  - body: `{ recipeId, targetProfitPercent, channelId }`
- `POST /pricing/profit`
  - body: `{ recipeId, salePrice, channelId }`
