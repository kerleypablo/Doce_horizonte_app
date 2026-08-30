import { MoneyInput } from '../shared/MoneyInput.tsx';
import { SelectField } from '../shared/SelectField.tsx';
import type { ValueConfigType } from './order-types.ts';

export const OrderValueModal = ({ type, label, mode, amount, onLabelChange, onModeChange, onAmountChange, onCancel, onSave }: { type: ValueConfigType; label: string; mode: 'PERCENT' | 'FIXED'; amount: number; onLabelChange: (value: string) => void; onModeChange: (value: 'PERCENT' | 'FIXED') => void; onAmountChange: (value: number) => void; onCancel: () => void; onSave: () => void }) => {
  const fixed = mode === 'FIXED' || type === 'SHIPPING';
  const canSave = amount >= 0 && (type !== 'ADDITION' || Boolean(label.trim()));
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal">
    <div className="modal-header"><div className="modal-icon"><span className="material-symbols-outlined" aria-hidden="true">calculate</span></div><div><h4>{type === 'ADDITION' ? 'Adicionar valor' : type === 'DISCOUNT' ? 'Configurar desconto' : 'Configurar frete'}</h4><p>Defina o tipo e o valor que sera aplicado no pedido.</p></div></div>
    <div className="form">
      {type === 'ADDITION' ? <label>Nome<input value={label} onChange={(event) => onLabelChange(event.target.value)} /></label> : <label>Tipo<input value={type === 'DISCOUNT' ? 'Desconto' : 'Frete'} disabled /></label>}
      <label>Modo<SelectField value={type === 'SHIPPING' ? 'FIXED' : mode} onChange={(value) => onModeChange(value as 'PERCENT' | 'FIXED')} disabled={type === 'SHIPPING'} options={[{ value: 'FIXED', label: 'R$' }, { value: 'PERCENT', label: '%' }]} /></label>
      <label>Valor{fixed ? <MoneyInput value={amount} onChange={onAmountChange} /> : <input type="number" min={0} value={amount || ''} onChange={(event) => onAmountChange(Number(event.target.value || 0))} />}</label>
    </div>
    <div className="modal-actions values-modal-actions"><button type="button" className="ghost" onClick={onCancel}>Cancelar</button><button type="button" onClick={onSave} disabled={!canSave}>Salvar</button></div>
  </div></div>;
};
