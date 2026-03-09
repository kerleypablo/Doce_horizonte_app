export const MODULE_KEYS = ['cadastros', 'pedidos', 'empresa', 'financeiro'] as const;

export type AppModuleKey = (typeof MODULE_KEYS)[number];

export type ModuleDefinition = {
  key: AppModuleKey;
  name: string;
  premium: boolean;
  description: string;
};

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  {
    key: 'cadastros',
    name: 'Cadastros e Producao',
    premium: false,
    description: 'Insumos, receitas, produtos e clientes'
  },
  {
    key: 'pedidos',
    name: 'Pedidos',
    premium: false,
    description: 'Gestao de pedidos e orcamentos'
  },
  {
    key: 'empresa',
    name: 'Configuracoes da Empresa',
    premium: false,
    description: 'Configuracoes, equipe e preferencias'
  },
  {
    key: 'financeiro',
    name: 'Financeiro',
    premium: true,
    description: 'Fluxo de caixa, contas e relatorios financeiros'
  }
];

export const BASE_ACTIVE_MODULES: AppModuleKey[] = ['cadastros', 'pedidos', 'empresa'];

export const isModuleKey = (value: string): value is AppModuleKey =>
  MODULE_KEYS.includes(value as AppModuleKey);
