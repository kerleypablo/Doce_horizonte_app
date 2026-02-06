export type Unit = 'kg' | 'g' | 'l' | 'ml' | 'un';

const weightMap: Record<Unit, number> = {
  kg: 1000,
  g: 1,
  l: 1000,
  ml: 1,
  un: 1
};

export const normalizeQuantity = (quantity: number, unit: Unit, target: Unit) => {
  if (unit === 'un' || target === 'un') return quantity;

  const isWeight = unit === 'kg' || unit === 'g';
  const isVolume = unit === 'l' || unit === 'ml';
  const targetIsWeight = target === 'kg' || target === 'g';
  const targetIsVolume = target === 'l' || target === 'ml';

  if (isWeight && targetIsWeight) {
    return (quantity * weightMap[unit]) / weightMap[target];
  }

  if (isVolume && targetIsVolume) {
    return (quantity * weightMap[unit]) / weightMap[target];
  }

  return quantity;
};
