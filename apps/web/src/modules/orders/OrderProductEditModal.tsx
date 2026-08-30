import { MoneyInput } from '../shared/MoneyInput.tsx';

export const OrderProductEditModal = ({ name, unitPrice, onNameChange, onPriceChange, onCancel, onSave }: { name: string; unitPrice: number; onNameChange: (value: string) => void; onPriceChange: (value: number) => void; onCancel: () => void; onSave: () => void }) => (
  <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal">
    <div className="modal-header"><div><h4>Editar item do pedido</h4><p>Essa alteracao vale apenas para este pedido.</p></div></div>
    <div className="form"><label>Nome no pedido<input value={name} onChange={(event) => onNameChange(event.target.value)} /></label><label>Valor unitario no pedido<MoneyInput value={unitPrice} onChange={onPriceChange} /></label></div>
    <div className="modal-actions"><button type="button" className="ghost" onClick={onCancel}>Cancelar</button><button type="button" onClick={onSave} disabled={!name.trim() || unitPrice < 0}>Salvar item</button></div>
  </div></div>
);
