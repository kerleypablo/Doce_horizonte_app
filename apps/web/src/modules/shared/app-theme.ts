export type AppTheme = 'vinho' | 'caramelo' | 'floresta' | 'oceano' | 'branco_pop';
export type SelectableAppTheme = Extract<AppTheme, 'vinho' | 'caramelo' | 'floresta'>;

export const normalizeAppTheme = (value?: string | null): SelectableAppTheme => {
  if (value === 'caramelo' || value === 'floresta' || value === 'vinho') return value;
  return 'vinho';
};

export const appThemeOptions: Array<{
  value: SelectableAppTheme;
  label: string;
  description: string;
  colors: [string, string, string];
}> = [
  {
    value: 'vinho',
    label: 'Vinho',
    description: 'Elegante e acolhedor',
    colors: ['#43062d', '#ef5350', '#fff8f8']
  },
  {
    value: 'caramelo',
    label: 'Marrom',
    description: 'Clássico e artesanal',
    colors: ['#4f2b1b', '#c7794a', '#fff9f3']
  },
  {
    value: 'floresta',
    label: 'Verde',
    description: 'Natural e equilibrado',
    colors: ['#173c2c', '#4f9a70', '#f5fbf7']
  }
];
