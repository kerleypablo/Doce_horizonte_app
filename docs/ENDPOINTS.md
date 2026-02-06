# Endpoints

## Auth
- `POST /auth/login`
  - body: `{ email, password }`
  - response: `{ token, role }`
- `POST /auth/register` (admin)
  - body: `{ email, password, role }`
- `GET /auth/me`

## Empresa
- `GET /company/settings`
- `PUT /company/settings`

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
