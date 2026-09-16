import type { OrderItem } from './order-types.ts';

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
}).format(Number.isFinite(value) ? value : 0);

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
          <div className="order-product-label">
            <strong>{item.name || 'Produto sem nome'}</strong>
            <small className="order-product-meta">{formatCurrency(item.unitPrice)} un. · Total {formatCurrency(item.unitPrice * item.quantity)}</small>
          </div>
          <label className="add-item-qty-field">
            <span>Qtd.</span>
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
