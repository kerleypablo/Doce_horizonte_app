import type { OrderItem } from './order-types.ts';

type NotesField = 'notesDelivery' | 'notesGeneral' | 'notesPayment' | 'pix' | 'terms';

export const OrderNotesSection = ({ order, onChange }: {
  order: Pick<OrderItem, NotesField>;
  onChange: (field: NotesField, value: string) => void;
}) => (
  <div className="panel form-box">
    <h4>Observacoes</h4>
    <label>Obs entrega/retirada<textarea value={order.notesDelivery ?? ''} onChange={(event) => onChange('notesDelivery', event.target.value)} rows={3} /></label>
    <label>Obs gerais<textarea value={order.notesGeneral ?? ''} onChange={(event) => onChange('notesGeneral', event.target.value)} rows={3} /></label>
    <label>Obs pagamento<textarea value={order.notesPayment ?? ''} onChange={(event) => onChange('notesPayment', event.target.value)} rows={3} /></label>
    <label>PIX<textarea value={order.pix ?? ''} onChange={(event) => onChange('pix', event.target.value)} rows={2} /></label>
    <label>Termos<textarea value={order.terms ?? ''} onChange={(event) => onChange('terms', event.target.value)} rows={3} /></label>
  </div>
);
