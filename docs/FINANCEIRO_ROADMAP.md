# Modulo Financeiro - Visao e Roadmap

## Objetivo
Criar um modulo financeiro completo, ativavel por modulo de acesso, para controlar caixa real da operacao e apoiar tomada de decisao.

O foco e:
- consolidar saldo de bancos + entradas + saidas;
- registrar vendas manuais (balcao) separadas de pedidos;
- aplicar regras de liquido por metodo de pagamento;
- permitir fechamento mensal com ajuste e conciliacao;
- oferecer relatorios para gestao.

---

## Regras de produto (como deve funcionar)

### 1) Acesso por modulo
- O modulo financeiro so aparece para usuarios com permissao `financeiro`.
- Usuario sem permissao nao ve menu nem acessa rotas do modulo.

### 2) Dashboard financeiro
- Tela inicial com resumo visual:
  - saldo base de contas;
  - total de pedidos;
  - total de vendas manuais;
  - total de despesas;
  - resultado liquido;
  - saldo projetado.
- Range de periodo no topo (selecao de data).
- Carrossel com cards de informacoes principais.
- Graficos de fluxo diario e resultado.

### 3) Contas bancarias
- Cadastro de uma ou mais contas.
- Campos: nome, banco/instituicao, data de saldo, saldo informado, observacoes.
- Saldo informado e base para projecao de caixa.

### 4) Regras por metodo de pagamento
- Metodos: PIX, DINHEIRO, CARTAO, VOUCHER.
- Para cada metodo, configurar regra:
  - `NONE` (sem ajuste),
  - `PERCENT` (percentual),
  - `FIXED_ADD` (somar fixo),
  - `FIXED_SUBTRACT` (subtrair fixo).
- Regras entram no calculo do valor liquido.

### 5) Vendas manuais (balcao)
- Cadastro manual de venda nao vinda de pedido.
- Pode cadastrar varias formas de recebimento no mesmo lancamento (ex.: parte PIX + parte CARTAO), salvando em registros separados.
- Suporta tags reutilizaveis.
- Filtro por data, busca e tag.

### 6) Despesas
- Cadastro de saidas com metodo de pagamento.
- Campos: descricao, categoria, valor, data/hora, conta (opcional), observacoes.
- Afeta resultado liquido e saldo projetado.

### 7) Padrao de telas
- Lista em rota principal.
- Botao "Novo" na lista.
- Formulario em rota separada (`/novo`).
- Edicao em rota separada (`/editar/:id`).

---

## Fases do projeto

## Fase 1 - Base operacional (status: em andamento/entregue em grande parte)
### Escopo
- Infra de modulo financeiro (acesso e menu).
- Tabelas base:
  - `financial_accounts`
  - `financial_method_rules`
  - `financial_manual_sales`
  - `financial_expenses`
- APIs CRUD:
  - contas
  - regras de metodo
  - vendas manuais
  - despesas
- API dashboard consolidando pedidos + vendas manuais + despesas.
- Front com dashboard, graficos e cadastros.
- Tags em vendas manuais e filtro por tag/busca.
- Layout mobile e organizacao de rotas lista/novo/editar.

### Tasks Fase 1 (checklist)
- [x] Criar tabelas e indices iniciais do financeiro.
- [x] Criar endpoints basicos de contas/regras/vendas/despesas.
- [x] Criar dashboard com totais e series por dia.
- [x] Aplicar regras de metodo no valor liquido.
- [x] Implementar rotas front para financeiro.
- [x] Separar telas em lista/novo/editar.
- [x] Implementar tags reutilizaveis em vendas manuais.
- [ ] Refinar UX visual final do dashboard (iterativo).

---

## Fase 2 - Fechamento mensal e conciliacao (proxima fase)
### Escopo
- Fechamento mensal por competencia.
- Consolidacao oficial do mes:
  - pedidos,
  - vendas manuais,
  - despesas,
  - taxas/regras.
- Resultado previsto x realizado.
- Ajustes manuais com trilha de auditoria.

### Entidades previstas
- `financial_month_closings`
- `financial_month_closing_items`
- `financial_reconciliation_adjustments`

### Tasks Fase 2
- [ ] Definir modelo de fechamento mensal e status (`OPEN`, `CLOSED`, `REOPENED`).
- [ ] Criar SQL de tabelas e migracao.
- [ ] Criar endpoint para gerar pre-fechamento do mes.
- [ ] Criar endpoint para confirmar fechamento.
- [ ] Criar endpoint para reabrir fechamento.
- [ ] Criar endpoint para lancar ajuste manual (com motivo e usuario).
- [ ] Criar tela de fechamento mensal no front.
- [ ] Criar tela de conciliacao por conta (saldo inicial, movimentos, saldo final).
- [ ] Travar edicoes retroativas quando mes estiver fechado (regra de negocio).

---

## Fase 3 - Pessoas, categorias e centro de custo
### Escopo
- Cadastro de funcionario (vinculo com usuario quando existir).
- Definicao de salario/custo mensal.
- Categorias padronizadas de receitas/despesas.
- Centro de custo para analise gerencial.

### Tasks Fase 3
- [ ] Criar tabelas de funcionarios e custos fixos.
- [ ] Vincular funcionario a usuario opcionalmente.
- [ ] Incluir custo de pessoal no fechamento mensal.
- [ ] Criar cadastro de categorias e subcategorias.
- [ ] Ajustar lancamentos para exigir/usar categoria.
- [ ] Criar filtros e visoes por categoria e centro de custo.

---

## Fase 4 - Relatorios e governanca
### Escopo
- Relatorios consolidados e exportacao.
- Auditoria de alteracoes sensiveis.
- Melhorias de performance e observabilidade.

### Tasks Fase 4
- [ ] Relatorio mensal consolidado (DRE simples operacional).
- [ ] Relatorio por metodo de pagamento.
- [ ] Relatorio por categoria e periodo.
- [ ] Exportacao CSV e PDF.
- [ ] Auditoria de alteracoes (quem alterou, quando, antes/depois).
- [ ] Melhorar cache e consultas para volumes maiores.
- [ ] Criar indicadores de saude do modulo (integridade de dados).

---

## Ordem recomendada de execucao
1. Finalizar pendencias visuais da Fase 1.
2. Entrar na Fase 2 (fechamento mensal), pois destrava o valor de negocio principal.
3. Evoluir para Fase 3 (funcionarios/categorias).
4. Encerrar com Fase 4 (relatorios e governanca).

---

## Decisoes importantes ja tomadas
- Financeiro e modulo separado por permissao.
- Vendas manuais sao diferentes de pedidos.
- Metodos de pagamento podem ter regra de liquido.
- Lancamento de venda manual pode ter multiplas formas de recebimento.
- Tags devem ser reutilizaveis e pesquisaveis.
- UX padrao: lista -> novo -> editar em rotas separadas.

---

## Proximo passo sugerido
Iniciar **Fase 2.1**:
- SQL de fechamento mensal + APIs basicas de `pre-fechamento` e `fechar mes`.
