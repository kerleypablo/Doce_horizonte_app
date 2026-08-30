import type { ProductItem } from './order-types.ts';

const currency = (value: number) => `R$ ${value.toFixed(2)}`;
const ProductRow = ({ product, checked, onToggle }: { product: ProductItem; checked: boolean; onToggle: (checked: boolean) => void }) => <label className="product-picker-row"><div className="product-picker-main"><strong>{product.name}</strong><span className="muted">{currency(product.unitPrice || product.salePrice || 0)}</span></div><input className="pretty-checkbox" type="checkbox" checked={checked} onChange={(event) => onToggle(event.target.checked)} /></label>;

export const OrderProductPicker = ({ selectedProducts, unselectedProducts, selectedIds, search, onSearch, onToggle, onCancel, onSave }: { selectedProducts: ProductItem[]; unselectedProducts: ProductItem[]; selectedIds: string[]; search: string; onSearch: (value: string) => void; onToggle: (id: string, checked: boolean) => void; onCancel: () => void; onSave: () => void }) => (
  <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal product-picker-modal">
    <div className="product-picker-head"><h4>Selecionar produtos</h4><div className="product-picker-head-right"><strong className="product-picker-count">{selectedIds.length} selecionado(s)</strong><button type="button" className="icon-button small" onClick={onCancel} aria-label="Fechar"><span className="material-symbols-outlined" aria-hidden="true">close</span></button></div></div>
    <input className="product-picker-search" type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar produto..." />
    <div className="product-picker-list">
      {selectedProducts.map((product) => <ProductRow key={product.id} product={product} checked={selectedIds.includes(product.id)} onToggle={(checked) => onToggle(product.id, checked)} />)}
      {selectedProducts.length && unselectedProducts.length ? <div className="product-picker-divider" aria-hidden="true" /> : null}
      {unselectedProducts.map((product) => <ProductRow key={product.id} product={product} checked={selectedIds.includes(product.id)} onToggle={(checked) => onToggle(product.id, checked)} />)}
    </div>
    <div className="modal-actions"><button type="button" className="ghost" onClick={onCancel}>Cancelar</button><button type="button" onClick={onSave}>Salvar selecao</button></div>
  </div></div>
);
