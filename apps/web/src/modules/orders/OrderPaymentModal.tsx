import { MoneyInput } from '../shared/MoneyInput.tsx';

export const OrderPaymentModal = ({
  editing,
  date,
  amount,
  note,
  onDateChange,
  onAmountChange,
  onNoteChange,
  onCancel,
  onSave
}: {
  editing: boolean;
  date: string;
  amount: number;
  note: string;
  onDateChange: (value: string) => void;
  onAmountChange: (value: number) => void;
  onNoteChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) => {
  const canSave = Boolean(date) && Number.isFinite(amount) && amount > 0;
  return (
  <div className="modal-backdrop" role="dialog" aria-modal="true">
    <div className="modal">
      <div className="modal-header">
        <div className="modal-icon"><span className="material-symbols-outlined" aria-hidden="true">payments</span></div>
        <div><h4>{editing ? 'Editar pagamento' : 'Adicionar pagamento'}</h4><p>Defina os dados do pagamento do pedido.</p></div>
      </div>
      <div className="form">
        <label>Data<input type="date" value={date} onChange={(event) => onDateChange(event.target.value)} /></label>
        <label>Valor<MoneyInput value={amount} onChange={onAmountChange} /></label>
        <label>Observacao<input value={note} onChange={(event) => onNoteChange(event.target.value)} /></label>
      </div>
      <div className="modal-actions values-modal-actions">
        <button type="button" className="ghost" onClick={onCancel}>Cancelar</button>
        <button type="button" onClick={onSave} disabled={!canSave}>Salvar</button>
      </div>
    </div>
  </div>
  );
};
