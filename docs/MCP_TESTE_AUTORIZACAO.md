# Reteste de autorizacao concorrente do MCP

Execute somente em Postgres descartavel e isolado, com dados ficticios. Estas instrucoes nao autorizam mudancas remotas. O teste usa tres sessoes `psql` independentes, uma previa valida e ainda nao aplicada para cada tentativa, e `READ COMMITTED`. Confirme antes que as seis migracoes de funcoes atualizadas foram carregadas no banco de teste; elas modificam funcoes existentes e nao devem ser reaplicadas em ambiente compartilhado ou de producao.

As RPCs agora adquirem `SHARE` nas tabelas `app_users`, `company_subscriptions`, `plan_modules` e `user_module_overrides`, nessa ordem, antes de bloquear a previa e antes de verificar permissoes. Esses bloqueios impedem inclusive insercao de um override que ainda nao existe. Uma mudanca de permissao que ja detem bloqueio de escrita faz a RPC esperar; apos o commit da mudanca, a RPC deve ler a permissao atual. Quando a RPC adquire primeiro seus bloqueios, uma mudanca concorrente espera ate a RPC terminar: nesse caso a operacao MCP precede logicamente a revogacao. A funcao rejeita transacoes fora de `READ COMMITTED` para nao usar um snapshot antigo ao fazer a verificacao.

## Reproducao: recurso bloqueado antes da RPC

Crie uma previa de compra valida, com `:preview`, `:company`, `:user`, `:input` e `:digest` definidos em cada sessao. `:digest` deve ser o valor `bytea` armazenado na previa. Nao imprima tokens. Em A, bloqueie o insumo e mantenha a transacao aberta:

```sql
BEGIN;
SELECT id FROM public.inputs WHERE id = :'input' AND company_id = :'company' FOR UPDATE;
```

Em B, execute em paralelo e deixe a chamada aguardando o bloqueio de A:

```sql
BEGIN ISOLATION LEVEL READ COMMITTED;
SELECT public.mcp_apply_purchase_prices(:'preview', :'company', :'user', :'digest'::bytea);
```

Em C, tente bloquear o usuario enquanto B espera. O `UPDATE` deve expirar por `lock_timeout`, sem confirmar a revogacao:

```sql
BEGIN;
SET LOCAL lock_timeout = '1s';
UPDATE public.app_users SET access_blocked = true WHERE auth_user_id = :'user' AND company_id = :'company';
-- Esperado: erro lock timeout; depois execute ROLLBACK.
```

Finalize A e B; confira que C nao confirmou alteracao de permissao antes da conclusao de B. Essa ordem substitui a reproducao anterior, em que C conseguia confirmar e B ainda aplicava. Uma resposta `applied` de B nessa ordem e aceitavel apenas porque a revogacao foi bloqueada e ainda nao havia sido confirmada.

Repita com uma previa de preco de venda e `mcp_apply_sale_price`, bloqueando o produto em A. Para cadastro de insumo, em A mantenha aberto `UPDATE public.inputs SET name = name WHERE id = :'input' AND company_id = :'company'`; em B use `mcp_create_input`. Para cadastro de produto, pedido e venda manual, bloqueie com um `UPDATE ... SET name = name` nao confirmado, respectivamente, em `products`, `products` e `financial_accounts`, e chame `mcp_create_product`, `mcp_create_order` ou `mcp_create_manual_sale` com sua propria previa valida. Cada RPC deve impedir o commit da revogacao enquanto estiver esperando o recurso.

## Revogacao confirmada antes da verificacao

Com uma previa nova, em C inicie transacao e altere `access_blocked` para `true`, sem confirmar. Inicie a RPC em B; ela deve aguardar o bloqueio de autorizacao. Confirme C. B deve retornar `forbidden`, sem mudar o recurso, sem criar registro e sem marcar a previa como aplicada. Confira recurso, previa e auditoria; nao considere apenas o status HTTP.

Repita a mesma ordem com assinatura `paused` ou `canceled`, exclusao de `company_subscriptions`, exclusao da linha relevante em `plan_modules`, insercao de override `enabled=false` quando nao existe, atualizacao de override e exclusao de override `enabled=true` quando o plano nao concede o modulo. Use o modulo `cadastros`, `pedidos` ou `financeiro` correspondente a cada RPC. Verifique que alteracoes concorrentes ficam bloqueadas se a RPC ja tiver os locks e que, quando confirmadas primeiro, a RPC retorna `forbidden`. Use fixtures novos para cada teste e restaure os dados ficticios entre cenarios.

Finalmente, invoque cada RPC dentro de `BEGIN ISOLATION LEVEL REPEATABLE READ`; deve falhar antes de qualquer alteracao. Execute testes de rollback, idempotencia, timeout de bloqueio e possiveis deadlocks entre RPCs e rotas legadas. Os locks sao globais por tabela, afetam todas as empresas e podem causar espera ou deadlocks com transacoes legadas que adquiram locks em ordem diferente; Postgres pode abortar uma das transacoes. Nao habilite os fluxos ate revisar estes impactos, o resultado dos testes e o tratamento de falhas.
