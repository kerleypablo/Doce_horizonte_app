# Arquitetura

## Visao geral
- Monorepo com dois apps: `apps/api` (backend) e `apps/web` (frontend).
- Backend em Fastify com rotas separadas por modulo (auth, company, inputs, recipes, products, pricing).
- Frontend em React com modulos por dominio (auth, insumos, receitas, produtos, empresa).

## Backend
- `src/app.ts` registra plugins e rotas.
- `src/db/mock.ts` contem o banco em memoria e o seed inicial.
- Cada modulo tem `routes.ts` com rotas REST simples.
- Calculo de precificacao isolado em `src/modules/pricing/calc.ts`.

## Frontend
- `src/modules` organiza as telas por dominio.
- `src/modules/shared` concentra o layout e o cliente HTTP.
- Layout responsivo com sidebar no desktop e bottom-nav no mobile.

## Evolucao para Supabase
- Substituir `src/db/mock.ts` por repositorios conectados ao Supabase.
- Manter contratos de DTO e rotas, trocando apenas a camada de persistencia.
