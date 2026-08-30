import { SelectField } from '../shared/SelectField.tsx';
import type { CustomerItem, OrderItem, OrderStatus } from './order-types.ts';
import { formatPhoneBR } from './order-formatters.ts';

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
};

export const OrderCustomerSection = ({ order, customer, onOpenCustomer, onChange }: {
  order: Pick<OrderItem, 'type' | 'orderDateTime' | 'deliveryType' | 'deliveryDate' | 'deliveryAddress' | 'status'>;
  customer?: CustomerItem;
  onOpenCustomer: () => void;
  onChange: (field: 'type' | 'deliveryType' | 'deliveryDate' | 'deliveryAddress' | 'status', value: string) => void;
}) => (
  <>
    <div className="panel form-box"><div className="order-box-head"><h4>Pedido</h4><span className="order-date-label">{formatDateTime(order.orderDateTime)}</span></div><label>Tipo<SelectField value={order.type} onChange={(value) => onChange('type', value)} options={[{ value: 'PEDIDO', label: 'Pedido' }, { value: 'ORCAMENTO', label: 'Orcamento' }]} /></label></div>
    <div className="panel form-box"><h4>Cliente</h4><div className="values-toolbar"><button type="button" className="ghost" onClick={onOpenCustomer}>{customer ? 'Trocar cliente' : '+ Selecionar cliente'}</button></div>{customer ? <div className="values-config-row"><div><strong>{customer.name}</strong><span className="muted">{formatPhoneBR(customer.phone)}</span></div></div> : <p className="muted">Nenhum cliente selecionado.</p>}</div>
    <div className="panel form-box"><h4>Entrega</h4><div className="grid-2"><label>Entrega ou retirada<SelectField value={order.deliveryType} onChange={(value) => onChange('deliveryType', value)} options={[{ value: 'ENTREGA', label: 'Entrega' }, { value: 'RETIRADA', label: 'Retirada' }]} /></label><label>Data de entrega<input type="date" value={order.deliveryDate ?? ''} onChange={(event) => onChange('deliveryDate', event.target.value)} /></label></div>{order.deliveryType === 'ENTREGA' ? <label>Endereco de entrega<textarea value={order.deliveryAddress ?? ''} onChange={(event) => onChange('deliveryAddress', event.target.value)} rows={3} placeholder="Digite o endereco completo da entrega" /></label> : null}</div>
    <div className="panel form-box"><h4>Status</h4><SelectField value={order.status} onChange={(value) => onChange('status', value as OrderStatus)} options={[{ value: 'AGUARDANDO_RETORNO', label: 'Aguardando retorno' }, { value: 'CONFIRMADO', label: 'Confirmado' }, { value: 'CONCLUIDO', label: 'Concluido' }, { value: 'CANCELADO', label: 'Cancelado' }]} /></div>
  </>
);
