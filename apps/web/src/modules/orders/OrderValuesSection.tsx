import type { OrderItem, ValueConfigType } from './order-types.ts';

const formatCurrency = (value: number) => `R$ ${value.toFixed(2)}`;
const formatValue = (mode: 'PERCENT' | 'FIXED', amount: number) =>
  mode === 'PERCENT' ? `${amount}%` : formatCurrency(amount);
const formatMode = (mode: 'PERCENT' | 'FIXED') => mode === 'PERCENT' ? '%' : 'R$';

export const OrderValuesSection = ({
  additions,
  discountMode,
  discountValue,
  shippingValue,
  menuOpen,
  onToggleMenu,
  onOpenValue,
  onRemoveAddition,
  onRemoveDiscount,
  onRemoveShipping
}: {
  additions: OrderItem['additions'];
  discountMode: OrderItem['discountMode'];
  discountValue: number;
  shippingValue: number;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onOpenValue: (type: ValueConfigType, additionIndex?: number) => void;
  onRemoveAddition: (index: number) => void;
  onRemoveDiscount: () => void;
  onRemoveShipping: () => void;
}) => (
  <div className="panel form-box">
    <h4>Valores</h4>
    <div className="values-toolbar">
      <button type="button" className="ghost" onClick={onToggleMenu}>+ Adicionar valor</button>
      {menuOpen ? (
        <div className="values-type-menu">
          <button type="button" onClick={() => onOpenValue('SHIPPING')}>Frete</button>
          <button type="button" onClick={() => onOpenValue('DISCOUNT')}>Desconto</button>
          <button type="button" onClick={() => onOpenValue('ADDITION')}>Adicionais</button>
        </div>
      ) : null}
    </div>
    <div className="values-config-list">
      {additions.map((item, index) => (
        <div key={`${item.label}-${index}`} className="values-config-row">
          <div><strong>{item.label}</strong><span className="muted">{formatValue(item.mode, item.value)}</span></div>
          <div className="values-config-actions">
            <span className="value-mode-badge">{formatMode(item.mode)}</span>
            <button type="button" className="icon-button tiny" aria-label="Editar" onClick={() => onOpenValue('ADDITION', index)}><span className="material-symbols-outlined" aria-hidden="true">edit</span></button>
            <button type="button" className="icon-button tiny" aria-label="Remover" onClick={() => onRemoveAddition(index)}><span className="material-symbols-outlined" aria-hidden="true">delete_outline</span></button>
          </div>
        </div>
      ))}
      {discountValue > 0 ? (
        <div className="values-config-row">
          <div><strong>Desconto</strong><span className="muted">{formatValue(discountMode, discountValue)}</span></div>
          <div className="values-config-actions">
            <span className="value-mode-badge">{formatMode(discountMode)}</span>
            <button type="button" className="icon-button tiny" aria-label="Editar" onClick={() => onOpenValue('DISCOUNT')}><span className="material-symbols-outlined" aria-hidden="true">edit</span></button>
            <button type="button" className="icon-button tiny" aria-label="Remover" onClick={onRemoveDiscount}><span className="material-symbols-outlined" aria-hidden="true">delete_outline</span></button>
          </div>
        </div>
      ) : null}
      {shippingValue > 0 ? (
        <div className="values-config-row">
          <div><strong>Frete</strong><span className="muted">{formatCurrency(shippingValue)}</span></div>
          <div className="values-config-actions">
            <span className="value-mode-badge">R$</span>
            <button type="button" className="icon-button tiny" aria-label="Editar" onClick={() => onOpenValue('SHIPPING')}><span className="material-symbols-outlined" aria-hidden="true">edit</span></button>
            <button type="button" className="icon-button tiny" aria-label="Remover" onClick={onRemoveShipping}><span className="material-symbols-outlined" aria-hidden="true">delete_outline</span></button>
          </div>
        </div>
      ) : null}
      {!additions.length && discountValue <= 0 && shippingValue <= 0 ? <p className="muted">Nenhum valor adicional configurado.</p> : null}
    </div>
  </div>
);
