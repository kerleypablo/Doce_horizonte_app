import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanySettings, Input, Product, Recipe } from '../../db/types.js';
import { calcProductPreview } from './product-calc.js';

const settings: CompanySettings = {
  overheadMethod: 'PERCENT_DIRECT',
  overheadPercent: 0,
  overheadPerUnit: 0,
  laborCostPerHour: 0,
  fixedCostPerHour: 0,
  taxesPercent: 0,
  defaultProfitPercent: 0,
  salesChannels: []
};

const preview = (overrides: Partial<Parameters<typeof calcProductPreview>[0]> = {}) => calcProductPreview({
  unitsCount: 1,
  prepTimeMinutes: 0,
  targetProfitPercent: 0,
  extraPercent: 0,
  extraRecipes: [],
  extraProducts: [],
  packagingInputs: [],
  settings,
  inputs: [],
  recipes: [],
  products: [],
  feePercent: 0,
  paymentFeePercent: 0,
  feeFixed: 0,
  ...overrides
});

test('embalagem usa preco por unidade do pacote vezes quantidade usada', () => {
  const box: Input = {
    id: 'box', companyId: 'company', name: 'Caixa', category: 'embalagem',
    unit: 'un', packageSize: 100, packagePrice: 50, tags: []
  };
  const result = preview({
    inputs: [box],
    packagingInputs: [{ inputId: 'box', quantity: 3, unit: 'un' }]
  });
  assert.equal(result.directCost, 1.5);
});

test('produto componente usa custo por unidade e nao custo do lote inteiro', () => {
  const input: Input = {
    id: 'input', companyId: 'company', name: 'Massa', category: 'producao',
    unit: 'un', packageSize: 10, packagePrice: 20, tags: []
  };
  const recipe: Recipe = {
    id: 'recipe', companyId: 'company', name: 'Receita', prepTimeMinutes: 0,
    yield: 10, yieldUnit: 'un', ingredients: [{ inputId: 'input', quantity: 10, unit: 'un' }],
    subRecipes: [], tags: []
  };
  const child: Product = {
    id: 'child', companyId: 'company', name: 'Componente', prepTimeMinutes: 0,
    unitsCount: 10, targetProfitPercent: 0, extraPercent: 0, unitPrice: 0, salePrice: 0,
    extraRecipes: [{ recipeId: 'recipe', quantity: 10 }], extraProducts: [], packagingInputs: []
  };
  const result = preview({
    inputs: [input], recipes: [recipe], products: [child],
    extraProducts: [{ productId: 'child', quantity: 2 }]
  });
  assert.equal(result.directCost, 4);
});

test('tempo da receita compoe o custo do produto proporcionalmente ao rendimento', () => {
  const recipe: Recipe = {
    id: 'recipe', companyId: 'company', name: 'Receita', prepTimeMinutes: 60,
    yield: 5, yieldUnit: 'un', ingredients: [], subRecipes: [], tags: []
  };
  const result = preview({
    settings: { ...settings, laborCostPerHour: 10, fixedCostPerHour: 5 },
    recipes: [recipe], extraRecipes: [{ recipeId: 'recipe', quantity: 2 }]
  });
  assert.equal(result.directCost, 6);
});

test('margem desejada e calculada sobre o preco de venda', () => {
  const input: Input = {
    id: 'input', companyId: 'company', name: 'Insumo', category: 'producao',
    unit: 'un', packageSize: 1, packagePrice: 100, tags: []
  };
  const result = preview({
    unitsCount: 1,
    targetProfitPercent: 30,
    settings: { ...settings, taxesPercent: 10 },
    inputs: [input], packagingInputs: [{ inputId: 'input', quantity: 1, unit: 'un' }]
  });
  assert.equal(result.totalPrice, 166.67);
  assert.equal(result.profitPercent, 30);
});

test('taxa fixa por item nao e diluida pelo tamanho do lote', () => {
  const result = preview({ unitsCount: 4, feeFixed: 2 });
  assert.equal(result.totalCost, 8);
  assert.equal(result.unitCost, 2);
});
