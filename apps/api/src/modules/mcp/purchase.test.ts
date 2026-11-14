import test from 'node:test';
import assert from 'node:assert/strict';
import { purchasePreviewSchema, buildPurchasePreview } from './purchase.js';
const id = '123e4567-e89b-12d3-a456-426614174000';
const item = { inputId: id, packagePrice: 12.5, packageSize: 1000, unit: 'g' as const };
test('previa detecta divergencias e nao encontrados sem autorizar escrita', () => {
  const preview = buildPurchasePreview([item, { ...item, inputId: '123e4567-e89b-12d3-a456-426614174001' }], [{ id, name: 'Farinha', brand: null, unit: 'g', package_size: 500, package_price: 10 }]);
  assert.equal(preview.applicable, false);
  assert.equal(preview.items[0].status, 'divergencia');
  assert.deepEqual(preview.items[0].divergences, ['tamanho_embalagem']);
  assert.equal(preview.items[1].status, 'nao_encontrado');
});
test('lote rejeita duplicatas, valores fracionarios de centavos e quantidades invalidas', () => {
  assert.equal(purchasePreviewSchema.safeParse({ items: [item, item] }).success, false);
  assert.equal(purchasePreviewSchema.safeParse({ items: [{ ...item, packagePrice: 1.001 }] }).success, false);
  assert.equal(purchasePreviewSchema.safeParse({ items: [{ ...item, packageSize: 0 }] }).success, false);
});
