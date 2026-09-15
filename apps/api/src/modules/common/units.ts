export type Unit = 'g' | 'ml' | 'un';

export const normalizeQuantity = (quantity: number, unit: Unit, target: Unit) => quantity;
