# MCP local (experimental)

Este recorte implementa consultas via transporte MCP stdio, protocolo 2025-06-18. O adaptador local nao disponibiliza OAuth, escrita, simulacao de precificacao, auditoria nem confirmacao. O transporte remoto experimental e documentado em MCP_REMOTO.md. Nenhuma das versoes V0 a V5 do plano esta concluida. Nao exponha o adaptador ou a API na internet como servidor MCP.

As rotas experimentais ficam desabilitadas por padrao e so sao registradas com `NODE_ENV=development` e `DOCE_MCP_LOCAL_ENABLED=true` na API. Nunca ative essa configuracao em ambiente acessivel por terceiros. A API usa a chave administrativa Supabase no servidor; a rota de consulta autentica cada requisicao com `auth.getUser`, busca vinculo e modulos, filtra a empresa e limita campos e pagina. O MCP consulta assinatura ativa, plano e overrides a cada operacao; ausencia de assinatura, erros de infraestrutura e conjunto vazio negam acesso, independentemente dos fallbacks legados. A revogacao imediata de uma sessao e a audiencia especifica para MCP nao foram verificadas. Dados recebidos sao conteudo nao confiavel.

## Desenvolvimento

Configure e execute a API conforme o projeto, com Supabase apropriado para testes e dados ficticios. Nao coloque chave de servico no cliente. O processo MCP exige Node com `fetch` e um **access token de usuario** valido em `DOCE_ACCESS_TOKEN`, fornecido por meio seguro pelo ambiente do cliente. Ele expira e deve ser substituido apos novo login; nao o registre em arquivos compartilhados, argumentos de linha de comando ou conversas. `DOCE_API_URL` e opcional, padrao `http://127.0.0.1:3333`, e aceita apenas origem HTTP loopback. O cliente MCP deve iniciar `node` com argumento absoluto para `apps/api/src/modules/mcp/local.mjs` e essas variaveis de ambiente. O processo nao imprime diagnosticos em stdout.

A ferramenta `prever_precos_compra` compara ate 20 insumos identificados por ID e informa divergencias de unidade e tamanho da embalagem; a previa e informativa e nao pode ser aplicada. Valores monetarios devem ter ate duas casas decimais. A ferramenta `consultar` aceita `kind` (`inputs`, `products`, `customers`, `recipes`, `orders`), `search`, `offset` e `limit` ate 50. Busca pedidos por numero e os demais por nome. Mais de um resultado pode indicar ambiguidade; `hasMore` indica outra pagina. O modulo `pedidos` e exigido para pedidos; `cadastros` para os demais.

## Trabalho pendente antes de producao

- O transporte HTTP experimental, a descoberta OAuth e a tela de consentimento existem e ficam desabilitados por padrao. Falta validar audiencia, expiracao, revogacao e interoperabilidade com Supabase e cliente reais. O adaptador stdio nao implementa OAuth nem atualiza tokens.
- Existem migracoes locais e RPCs experimentais para previas, auditoria e algumas escritas com confirmacao, idempotencia e verificacao de dados anteriores. Elas foram testadas parcialmente em PostgreSQL descartavel e aplicadas ao Supabase indicado em MCP_REMOTO.md; falta validar integracao e confirmacao antes de qualquer uso. Detalhes e flags em `MCP_REMOTO.md`.
- Ampliar e validar as simulacoes e operacoes implementadas conforme o plano, incluindo composicoes, edicoes, pedidos e vendas ainda nao suportados. Os fluxos experimentais nao tornam as versoes do plano concluidas.
- Validar RLS, privilegios e configuracao real do Supabase; testar contra banco local isolado e revisar as regras de permissao e os fallbacks existentes. Os testes no PostgreSQL descartavel nao comprovam o fluxo real do Supabase.
- Revisar interoperabilidade do SDK com clientes reais e limites de mensagens deste prototipo.
