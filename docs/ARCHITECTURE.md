# Arquitetura

## Visao geral
- Monorepo com dois apps: `apps/api` (backend) e `apps/web` (frontend).
- Backend em Fastify com rotas separadas por modulo (auth, company, inputs, recipes, products, pricing).
- Frontend em React com modulos por dominio (auth, insumos, receitas, produtos, empresa).

## Backend
- `src/app.ts` registra plugins e rotas.
- `src/db/supabase.ts` concentra o cliente Supabase e funcoes auxiliares.
- Cada modulo tem `routes.ts` com rotas REST simples.
- Calculo de precificacao isolado em `src/modules/pricing/calc.ts` e `src/modules/pricing/product-calc.ts`.

## Frontend
- `src/modules` organiza as telas por dominio.
- `src/modules/shared` concentra o layout e o cliente HTTP.
- Layout responsivo com sidebar no desktop e bottom-nav no mobile.

## Supabase
- O backend usa `SUPABASE_SERVICE_ROLE_KEY` para persistencia.
- Auth email/senha via Supabase Auth.
