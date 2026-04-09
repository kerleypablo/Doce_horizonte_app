# Tasks do Financeiro

## Objetivo atual
Ter uma visao simples e util de caixa: quanto entrou, quanto saiu e quanto deve existir nas contas, sem exigir produto por produto nas vendas de balcao, rua ou iFood.

## Premissas
- Pedidos de encomenda feitos no app podem ter produtos detalhados.
- Vendas de balcao, rua, porta a porta e iFood podem ser lancadas por total do dia e forma de pagamento.
- Nesta fase, vendas manuais indicam entrada/caixa, mas nao lucro real por produto.
- Lucro real fica mais confiavel apenas quando a venda tiver produtos ou um custo estimado por origem/canal.

## Fase 1 - Caixa simples e confiavel
- [x] Centralizar atalhos do financeiro em um botao `+`.
- [x] Permitir nova venda manual sem informar produtos vendidos.
- [x] Separar origem da venda manual: balcao, rua, porta a porta, iFood e outros.
- [x] Renomear a tela "Vendas manuais" para "Vendas avulsas" ou "Vendas do dia".
- [x] Mostrar no dashboard financeiro entradas separadas por origem.
- [x] Mostrar no dashboard financeiro entradas separadas por forma de pagamento.
- [x] Melhorar o texto da tela de regras de metodo para explicar taxa de cartao/maquininha.
- [x] Criar resumo do periodo com: pedidos, vendas avulsas, despesas, taxas estimadas e saldo projetado.

## Fase 2 - Saldos e conciliacao
- [x] Separar contas por tipo: banco, caixa fisico, maquininha, iFood a receber.
- [x] Permitir informar saldo conferido no fim do dia.
- [x] Mostrar diferenca entre saldo projetado e saldo conferido.
- [x] Criar rotina de fechamento diario.
- [x] Permitir marcar lancamentos como conferidos.

## Fase 3 - Despesas melhores
- [x] Padronizar categorias de despesa: insumos, embalagens, aluguel, energia, funcionario, entrega, taxas, marketing, outros.
- [x] Criar filtro de despesas por categoria.
- [x] Mostrar despesas recorrentes do mes.
- [x] Separar compra de insumo de despesa geral quando houver controle de estoque.

## Fase 4 - Lucro estimado
- [x] Salvar snapshot de custo nos pedidos feitos pelo app.
- [x] Calcular lucro estimado dos pedidos com produtos detalhados.
- [x] Permitir custo estimado percentual por origem de venda manual.
- [x] Exemplo: vendas de rua usam custo medio de 45%, iFood usa custo medio de 50% + taxa do canal.
- [x] Mostrar "resultado de caixa" separado de "lucro estimado".

## Fase 5 - Venda detalhada futura
- [x] Permitir venda manual com produtos opcionais.
- [x] Criar tela rapida de venda de balcao.
- [ ] Baixar estoque/insumos quando a venda tiver produtos.
- [ ] Integrar vendas online/iFood quando houver origem automatica.
- [x] Comparar lucro por canal: encomenda, balcao, rua, porta a porta, iFood.

Observacao: a venda avulsa ja aceita produtos opcionais e registra o detalhe para conferencia. A baixa real de estoque ainda depende de criar controle de saldo por insumo. A integracao automatica com iFood ainda depende de API/importacao externa; por enquanto o iFood entra como origem manual.

## Indicadores recomendados
- Entradas brutas no periodo.
- Entradas liquidas apos taxas de pagamento.
- Saidas/despesas.
- Resultado de caixa.
- Saldo projetado.
- Vendas por origem.
- Vendas por metodo de pagamento.
- Pedidos confirmados/concluidos.
- Taxas estimadas pagas.
- Lucro estimado apenas onde houver custo conhecido.
