import { supabaseAdmin } from '../../db/supabase.js';

export class CompanyOwnershipError extends Error {
  statusCode = 400;
  constructor(resourceName: string) {
    super(`${resourceName} nao pertence a empresa atual.`);
  }
}

const uniqueIds = (ids: Array<string | undefined | null>) => [...new Set(ids.filter((id): id is string => Boolean(id)))];

export const assertCompanyOwns = async (params: {
  companyId: string;
  table: 'inputs' | 'recipes' | 'products' | 'sales_channels' | 'customers' | 'financial_accounts';
  ids: Array<string | undefined | null>;
  resourceName: string;
}) => {
  const ids = uniqueIds(params.ids);
  if (!ids.length) return;
  const { data, error } = await supabaseAdmin
    .from(params.table)
    .select('id')
    .eq('company_id', params.companyId)
    .in('id', ids);
  if (error) throw error;
  if ((data?.length ?? 0) !== ids.length) throw new CompanyOwnershipError(params.resourceName);
};

export const assertProductCompositionOwnership = async (companyId: string, data: {
  extraRecipes: { recipeId: string }[];
  extraProducts: { productId: string }[];
  packagingInputs: { inputId: string }[];
  channelId?: string;
}) => {
  await Promise.all([
    assertCompanyOwns({ companyId, table: 'recipes', ids: data.extraRecipes.map((item) => item.recipeId), resourceName: 'Uma das receitas' }),
    assertCompanyOwns({ companyId, table: 'products', ids: data.extraProducts.map((item) => item.productId), resourceName: 'Um dos produtos componentes' }),
    assertCompanyOwns({ companyId, table: 'inputs', ids: data.packagingInputs.map((item) => item.inputId), resourceName: 'Uma das embalagens' }),
    assertCompanyOwns({ companyId, table: 'sales_channels', ids: [data.channelId], resourceName: 'O canal de venda' })
  ]);
};
