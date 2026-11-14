import { z } from 'zod';

export const purchasePreviewSchema = z.object({
  items: z.array(z.object({
    inputId: z.string().uuid(),
    packagePrice: z.number().finite().positive().max(100000000).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, 'Use ate duas casas decimais'),
    packageSize: z.number().finite().positive().max(100000000),
    unit: z.enum(['g', 'ml', 'un'])
  }).strict()).min(1).max(20)
}).strict().superRefine(({ items }, ctx) => {
  if (new Set(items.map(item => item.inputId)).size !== items.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Insumo duplicado no lote' });
});

type PurchaseItem = z.infer<typeof purchasePreviewSchema>['items'][number];
type Row = { id: string; name: string; brand: string | null; unit: string; package_size: number; package_price: number };
export function buildPurchasePreview(items: PurchaseItem[], rows: Row[]) {
  const byId = new Map(rows.map(row => [row.id, row]));
  return { applicable: false, message: 'Previa informativa; confirmacao e escrita ainda nao estao disponiveis.', items: items.map(item => {
    const current = byId.get(item.inputId);
    if (!current) return { inputId: item.inputId, status: 'nao_encontrado' };
    const mismatches = [current.unit !== item.unit ? 'unidade' : null, Number(current.package_size) !== item.packageSize ? 'tamanho_embalagem' : null].filter(Boolean);
    return { inputId: item.inputId, name: current.name, brand: current.brand, status: mismatches.length ? 'divergencia' : 'identificado', divergences: mismatches,
      current: { unit: current.unit, packageSize: Number(current.package_size), packagePrice: Number(current.package_price) }, proposed: { unit: item.unit, packageSize: item.packageSize, packagePrice: item.packagePrice } };
  }) };
}
