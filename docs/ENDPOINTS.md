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
