import type { FormEvent } from 'react';
import { SelectField } from '../shared/SelectField.tsx';
import type { CustomerForm } from './order-types.ts';
import { formatPhoneBR } from './order-formatters.ts';

export const OrderCustomerModal = ({ form, onChange, onCancel, onSubmit }: { form: CustomerForm; onChange: (form: CustomerForm) => void; onCancel: () => void; onSubmit: (event: FormEvent) => void }) => (
  <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal"><div className="modal-header"><div><h4>Novo cliente</h4><p>Cadastro rapido sem sair do pedido</p></div></div><form className="form" onSubmit={onSubmit}>
    <label>Nome<input value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} required /></label>
    <label>Telefone<input value={form.phone} onChange={(event) => onChange({ ...form, phone: formatPhoneBR(event.target.value) })} required /></label>
    <label>Tipo pessoa<SelectField value={form.personType} onChange={(value) => onChange({ ...form, personType: value as 'PF' | 'PJ' })} options={[{ value: 'PF', label: 'Pessoa fisica' }, { value: 'PJ', label: 'Pessoa juridica' }]} /></label>
    <div className="modal-actions"><button type="button" className="ghost" onClick={onCancel}>Cancelar</button><button type="submit">Salvar cliente</button></div>
  </form></div></div>
);
