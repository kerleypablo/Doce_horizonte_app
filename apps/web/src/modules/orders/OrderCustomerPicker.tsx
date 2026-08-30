import type { CustomerItem } from './order-types.ts';
import { formatPhoneBR } from './order-formatters.ts';

export const OrderCustomerPicker = ({ customers, selectedId, search, onSearch, onSelect, onNew, onClose }: { customers: CustomerItem[]; selectedId: string; search: string; onSearch: (value: string) => void; onSelect: (id: string) => void; onNew: () => void; onClose: () => void }) => (
  <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal product-picker-modal">
    <div className="product-picker-head"><h4>Selecionar cliente</h4><div className="product-picker-head-right"><button type="button" className="icon-button small" onClick={onClose} aria-label="Fechar"><span className="material-symbols-outlined" aria-hidden="true">close</span></button></div></div>
    <div className="product-picker-search-row customer-picker-search-row"><input className="product-picker-search" type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar cliente..." /><button type="button" className="icon-button" aria-label="Novo cliente" onClick={onNew}><span className="material-symbols-outlined" aria-hidden="true">person_add</span></button></div>
    <div className="product-picker-list">{customers.map((customer) => { const selected = customer.id === selectedId; return <button key={customer.id} type="button" className={selected ? 'product-picker-row customer-picker-row active' : 'product-picker-row customer-picker-row'} onClick={() => onSelect(customer.id)}><div className="product-picker-main"><strong>{customer.name}</strong><span className="muted">{formatPhoneBR(customer.phone)}</span></div><span className="material-symbols-outlined" aria-hidden="true">{selected ? 'check_circle' : 'radio_button_unchecked'}</span></button>; })}</div>
    <div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Cancelar</button></div>
  </div></div>
);
