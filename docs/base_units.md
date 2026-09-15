# Unidades de insumos, receitas e produtos

Unidades aceitas: `g`, `ml` e `un` (unidade, exibida como und nos seletores).

Custo do insumo = preco do pacote / quantidade do pacote * quantidade utilizada.
Exemplo: pacote de 1000 g por R$ 20; 250 g custam R$ 5.
Porcoes de receitas usam a unidade do rendimento, inclusive nas sub-receitas.

## Banco existente

Antes de publicar esta versao, executar `normalize_base_units.sql` em uma janela sem gravacoes da aplicacao antiga. O script converte kg para g e litros para ml, multiplicando por 1000:

- tamanho dos pacotes;
- ingredientes, insumos diretos e embalagens;
- rendimento das receitas;
- porcoes dessas receitas em sub-receitas e produtos.

Precos dos pacotes e precos de venda salvos permanecem iguais. Toda a conversao ocorre em uma transacao. Reexecutar nao multiplica novamente as quantidades, pois apenas unidades antigas sao convertidas.

O script foi preparado localmente; ainda precisa ser validado e aplicado no banco de destino. O CLI Supabase nao esta instalado neste ambiente, portanto este arquivo nao foi registrado como migration.
