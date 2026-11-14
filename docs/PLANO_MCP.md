# Plano: assistente MCP do Doce Horizonte

## Objetivo
Permitir que uma pessoa autenticada consulte e opere o Doce Horizonte por conversas, com ações limitadas à sua empresa e às suas permissões. O servidor MCP oferece ferramentas de domínio; cálculos e regras existentes continuam sendo a fonte de verdade. ChatGPT e outros clientes compatíveis são consumidores possíveis, sujeitos à compatibilidade real de autenticação e ferramentas de escrita.

## Princípios
- Autenticação individual por OAuth com Supabase Auth, consentimento e possibilidade de revogação; não pedir senha no chat nem expor credenciais privilegiadas.
- Validar token, empresa, usuário, módulos e permissões no servidor para cada ação; não confiar em identificadores fornecidos pelo modelo. Verificar o isolamento de empresas em toda consulta e mutação, inclusive relações indiretas.
- Reutilizar serviços de domínio e validações existentes. Inspecionar a implementação atual, que pode diferir da documentação, antes de escolher o local do servidor e a integração de dados.
- Ferramentas explícitas e tipadas, com parâmetros validados, resultados mínimos, tratamento de erros e limites de lote. Dados externos são conteúdo não confiável, não instruções.
- Operações de escrita devem ter prévia estruturada, resolução de ambiguidades e confirmação explícita para os dados exatos; proteger contra repetição, concorrência e alterações desde a prévia. Registrar auditoria sem segredos nem dados desnecessários.
- Não alterar preços de venda automaticamente quando o custo de um insumo mudar. Explicar separadamente custo, sugestão e preço vigente.
- Não usar dados reais, migrações remotas ou deploy para testes sem necessidade e ambiente apropriado. Não fazer commit nem push durante desenvolvimento ou teste.

## Versões e tarefas

### V0 — Fundamentos e acesso
- [ ] Mapear arquitetura real, autenticação, regras de empresas/módulos, insumos, preços, pedidos e testes existentes; registrar decisões e limitações.
- [ ] Implementar servidor MCP remoto compatível com o protocolo e cliente escolhido, incluindo descoberta e fluxo OAuth quando viável; oferecer execução local para desenvolvimento.
- [ ] Validar identidade e autorização por operação, com isolamento de empresa e proteção contra acesso indevido. Verificar os fluxos de login, expiração e revogação sem contornar políticas.
- [ ] Definir schemas, respostas de erro, limites, logs e auditoria; documentar configuração, variáveis e execução local sem incluir segredos.
- [ ] Cobrir autenticação, autorização, isolamento e entrada inválida com testes significativos.

### V1 — Consultas e compras
- [ ] Consultar insumos e produtos por nome, com paginação ou limites e indicação de resultados ambíguos.
- [ ] Preparar atualização em lote de preços de compra: identificar cadastro, preço, quantidade, embalagem e unidade; indicar itens não encontrados e divergências.
- [ ] Confirmar e aplicar somente a prévia autorizada, preservando integridade, evitando duplicações e detectando dados alterados; apresentar resultado por item.
- [ ] Testar unidades, valores monetários, ambiguidades, isolamento, conflitos e repetição.

### V2 — Cadastros
- [ ] Preparar e confirmar cadastro de insumos e produtos, validando campos obrigatórios e avisando sobre possíveis duplicatas.
- [ ] Permitir edição controlada dos campos suportados pelas regras atuais, com prévia e auditoria.
- [ ] Testar validações, duplicidade e permissões.

### V3 — Precificação
- [ ] Consultar custos e produzir simulações usando o cálculo oficial existente, com unidades, taxas e dados faltantes explícitos.
- [ ] Oferecer prévia de alteração do preço de venda e aplicação somente após confirmação, quando suportado pelas permissões.
- [ ] Testar resultados contra casos representativos do cálculo existente e verificar que simulação não grava dados.

### V4 — Pedidos e vendas
- [ ] Consultar clientes, produtos e pedidos respeitando permissões e limites.
- [ ] Preparar pedido ou venda com itens, quantidades, preços, descontos, entrega e pagamento conforme recursos existentes; perguntar dados obrigatórios e ambiguidades.
- [ ] Confirmar e registrar com totais calculados pelas regras oficiais, idempotência e resultado verificável; não marcar pagamento, baixa de estoque ou outras consequências sem suporte e intenção explícita.
- [ ] Testar totais, concorrência, duplicação, isolamento e efeitos colaterais.

### V5 — Operação e evolução
- [ ] Documentar conexão ao cliente compatível, consentimento, revogação, recuperação de erros e operação local.
- [ ] Avaliar relatórios, histórico e monitoramento sem expor dados sensíveis; documentar limites, custos e riscos conhecidos.
- [ ] Revisão independente de arquitetura, segurança e aderência; corrigir achados e executar testes locais em conversa separada.

## Critérios de conclusão
Cada versão exige implementação verificável, testes proporcionais, documentação e revisão. Uma versão não deve ser considerada pronta quando depender de configuração externa, credenciais ou funcionalidade ainda não validada: registrar explicitamente o que falta. Após o desenvolvimento, uma conversa separada deve rodar o projeto e testar os fluxos locais, pedindo ao usuário apenas as ações realmente necessárias. Preparar o estado para commit e push somente após revisão e testes; não executar publicação automaticamente.
