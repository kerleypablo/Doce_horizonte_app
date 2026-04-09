# Dominio

## Entidades principais
- Empresa: configuracoes de rateio, impostos e canais de venda.
- Usuario: perfil `admin` ou `common`.
- Insumo: materia-prima/embalagem com unidade, tamanho do pacote e preco.
- Receita: lista de insumos e rendimento (quantidade final).
- Produto: precificacao baseada em receita + margem + canal.

## Canais de venda
Cada canal possui:
- `feePercent`: comissao do marketplace.
- `paymentFeePercent`: taxa de pagamento.
- `feeFixed`: taxa fixa por venda/item.

## Calculo (MVP)
1. Custo direto = soma dos insumos convertidos para a unidade base do insumo.
   - Em produtos, o custo direto soma receitas adicionadas, produtos componentes e embalagens.
   - Produtos componentes devem usar custo de composicao quando disponivel; preco de venda e apenas fallback para itens manuais.
2. Rateio indireto:
   - `PERCENT_DIRECT`: percentual do custo direto.
   - `PER_UNIT`: valor fixo por unidade.
3. Custos variaveis (%) = impostos + taxa do canal + taxa de pagamento.
4. Margem desejada sobre venda (%) = lucro alvo sobre o preco final, nao markup sobre custo.
5. Preco sugerido = (custo direto + rateio + taxa fixa) / (1 - custos variaveis % - margem desejada %).

## Resultado exibido
- custo direto
- rateio
- preco sugerido
- lucro estimado
