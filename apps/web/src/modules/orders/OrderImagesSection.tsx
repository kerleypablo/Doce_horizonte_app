import { useRef } from 'react';
import type { OrderItem } from './order-types.ts';

export const OrderImagesSection = ({ images, onSelect, onRemove }: {
  images: OrderItem['images'];
  onSelect: (files: FileList | null) => void;
  onRemove: (index: number) => void;
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="panel form-box">
      <h4>Imagens de referencia</h4>
      <input ref={inputRef} className="order-image-input-hidden" type="file" accept="image/*" multiple onChange={(event) => { onSelect(event.target.files); event.target.value = ''; }} />
      <div className="order-image-picker-row">
        <button type="button" className="ghost" onClick={() => inputRef.current?.click()}>Selecionar imagens</button>
        <span className="order-image-picker-text">{images.length ? `${images.length} imagem(ns) selecionada(s)` : 'Nenhuma imagem selecionada'}</span>
      </div>
      <div className="image-grid">
        {images.map((image, index) => (
          <div key={`${image.name}-${index}`} className="image-card">
            <img src={image.dataUrl} alt={image.name} />
            <span>{image.name}</span>
            <button type="button" className="icon-button tiny" aria-label={`Remover ${image.name}`} onClick={() => onRemove(index)}><span className="material-symbols-outlined" aria-hidden="true">delete_outline</span></button>
          </div>
        ))}
      </div>
    </div>
  );
};
