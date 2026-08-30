import type { OrderItem } from './order-types.ts';

const readAsDataUrl = (file: File) => new Promise<OrderItem['images'][number]>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve({ name: file.name, dataUrl: String(reader.result) });
  reader.onerror = () => reject(reader.error ?? new Error(`Erro ao ler ${file.name}`));
  reader.readAsDataURL(file);
});

export const readOrderImages = async (files: FileList | null) =>
  files?.length ? Promise.all(Array.from(files).map(readAsDataUrl)) : [];
