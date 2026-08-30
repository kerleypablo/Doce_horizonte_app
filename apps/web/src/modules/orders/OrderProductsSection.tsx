import type { OrderItem } from './order-types.ts';

export const OrderProductsSection = ({
  products,
  onAdd,
  onEdit,
  onRemove,
  onQuantityChange,
  onQuantityBlur
}: {
  products: OrderItem['products'];
  onAdd: () => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
  onQuantityChange: (index: number, value: string) => void;
  onQuantityBlur: (index: number) => void;
}) => (
  <div className="panel form-box">
    <h4>Produtos</h4>
    <div className="ingredients">
      {products.map((item, index) => (
        <div key={`${item.productId}-${index}`} className="order-product-row">
          <span className="order-product-label">{item.name || 'Produto sem nome'}</span>
          <label className="add-item-qty-field">
            <span>Quantidade</span>
            <input
              className="order-product-qty"
              type="number"
              min={1}
              value={item.quantity > 0 ? item.quantity : ''}
              onChange={(event) => onQuantityChange(index, event.target.value)}
              onBlur={() => onQuantityBlur(index)}
            />
          </label>
          <div className="order-product-actions">
            <button type="button" className="icon-button tiny" aria-label="Editar item do pedido" onClick={() => onEdit(index)}><span className="material-symbols-outlined" aria-hidden="true">edit</span></button>
            <button type="button" className="icon-button tiny" aria-label="Remover" onClick={() => onRemove(index)}><span className="material-symbols-outlined" aria-hidden="true">delete_outline</span></button>
          </div>
        </div>
      ))}
      <button type="button" className="ghost" onClick={onAdd}>+ Adicionar produto</button>
    </div>
  </div>
);
