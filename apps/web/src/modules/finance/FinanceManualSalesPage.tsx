import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { apiFetch } from '../shared/api.ts';
import { ConfirmDialog } from '../shared/ConfirmDialog.tsx';
import { MoneyInput } from '../shared/MoneyInput.tsx';
import { SelectField } from '../shared/SelectField.tsx';
import { TagInput } from '../shared/TagInput.tsx';
import { ListToolbar } from '../shared/ListToolbar.tsx';
import { invalidateQueryCache } from '../shared/queryCache.ts';
import { FinanceAccessBlocked, FinanceHeader } from './FinanceShared.tsx';
import {
  financeDashboardKey,
  financeManualSalesKey,
  methodLabels,
  manualSaleOriginKeys,
  saleOriginLabels
} from './constants.ts';
import {
  useFinanceProducts,
  useFinanceRange,
  useManualSales,
  useManualSalesTags
} from './hooks.ts';
import { createEmptyManualSaleForm, createManualSaleLine, formatCurrency, isSaleOrigin, stripOriginTags } from './utils.ts';
import type { ManualSaleProduct, PaymentMethod, SaleOrigin } from './types.ts';

export const FinanceManualSalesPage = () => {
  const pageSize = 10;
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const params = useParams<{ saleId?: string }>();
  const isCreateView = pathname.endsWith('/novo');
  const editingRouteId = pathname.includes('/editar/') ? params.saleId ?? null : null;
  const { from, to, setFrom, setTo } = useFinanceRange();
  const [filterTag, setFilterTag] = useState('');
  const [filterMethod, setFilterMethod] = useState<'ALL' | PaymentMethod>('ALL');
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const salesQuery = useManualSales(user?.token, from, to, filterTag || undefined, searchText || undefined);
  const tagsQuery = useManualSalesTags(user?.token);
  const productsQuery = useFinanceProducts(user?.token);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(editingRouteId);
  const [showForm, setShowForm] = useState(Boolean(isCreateView || editingRouteId));
  const [deletingSale, setDeletingSale] = useState<{ id: string; description: string } | null>(null);
  const [form, setForm] = useState(createEmptyManualSaleForm);

  if (!user?.modules?.includes('financeiro')) return <FinanceAccessBlocked />;

  useEffect(() => {
    if (!isCreateView) return;
    setEditingId(null);
    setShowForm(true);
    setForm(createEmptyManualSaleForm());
  }, [isCreateView]);

  useEffect(() => {
    if (!editingRouteId) {
      if (!isCreateView) {
        setEditingId(null);
        setShowForm(false);
      }
      return;
    }
    const current = (salesQuery.data ?? []).find((item) => item.id === editingRouteId);
    if (!current || editingId === current.id) return;
    setEditingId(current.id);
    setShowForm(true);
    const currentTags = current.tags ?? [];
    const currentOrigin = currentTags.find(isSaleOrigin) ?? 'balcao';
    setForm({
      occurredAt: current.occurredAt.slice(0, 16),
      description: current.description,
      origin: currentOrigin,
      tags: stripOriginTags(currentTags),
      lines: [createManualSaleLine(current.paymentMethod, current.amount)],
      products: current.products ?? [],
      notes: current.notes ?? ''
    });
  }, [editingRouteId, editingId, isCreateView, salesQuery.data]);

  const tagOptions = tagsQuery.data?.tags ?? [];
  const reusableTagOptions = tagOptions.filter((tag) => !isSaleOrigin(tag));
  const grossTotal = form.lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const filteredSales = useMemo(() => (
    (salesQuery.data ?? []).filter((item) => filterMethod === 'ALL' || item.paymentMethod === filterMethod)
  ), [filterMethod, salesQuery.data]);
  const filteredNetTotal = useMemo(
    () => filteredSales.reduce((sum, item) => sum + Number(item.netAmount ?? 0), 0),
    [filteredSales]
  );
  const filteredGrossTotal = useMemo(
    () => filteredSales.reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
    [filteredSales]
  );
  const totalPages = Math.max(1, Math.ceil(filteredSales.length / pageSize));
  const paginatedSales = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredSales.slice(start, start + pageSize);
  }, [filteredSales, page]);

  useEffect(() => {
    setPage(1);
  }, [filterMethod, filterTag, searchText, from, to]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const resetForm = () => {
    setEditingId(null);
    setForm(createEmptyManualSaleForm());
    setShowForm(false);
  };

  const addLine = () => {
    setForm((current) => ({
      ...current,
      lines: [...current.lines, createManualSaleLine()]
    }));
  };

  const updateLine = (lineId: string, patch: { paymentMethod?: PaymentMethod; amount?: number }) => {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line))
    }));
  };

  const removeLine = (lineId: string) => {
    setForm((current) => {
      if (current.lines.length === 1) return current;
      return { ...current, lines: current.lines.filter((line) => line.id !== lineId) };
    });
  };

  const addSaleProduct = (productId: string) => {
    const product = (productsQuery.data ?? []).find((item) => item.id === productId);
    if (!product) return;
    setForm((current) => {
      if (current.products.some((item) => item.productId === product.id)) return current;
      return {
        ...current,
        products: [
          ...current.products,
          {
            productId: product.id,
            name: product.name,
            unitPrice: product.unitPrice || product.salePrice || 0,
            quantity: 1
          }
        ]
      };
    });
  };

  const updateSaleProduct = (index: number, patch: Partial<ManualSaleProduct>) => {
    setForm((current) => ({
      ...current,
      products: current.products.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    }));
  };

  const removeSaleProduct = (index: number) => {
    setForm((current) => ({
      ...current,
      products: current.products.filter((_, itemIndex) => itemIndex !== index)
    }));
  };

  const confirmDeleteSale = async () => {
    if (!deletingSale) return;
    await apiFetch(`/finance/manual-sales/${deletingSale.id}`, {
      method: 'DELETE',
      token: user?.token
    });
    invalidateQueryCache(financeManualSalesKey);
    invalidateQueryCache(`${financeManualSalesKey}:tags`);
    invalidateQueryCache(financeDashboardKey);
    await salesQuery.refetch();
    await tagsQuery.refetch();
    setDeletingSale(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const validLines = form.lines.filter((line) => Number(line.amount) > 0);
      if (!validLines.length) {
        setSaving(false);
        return;
      }
      const basePayload = {
        occurredAt: new Date(form.occurredAt).toISOString(),
        description: form.description,
        tags: Array.from(new Set([form.origin, ...stripOriginTags(form.tags)])),
        products: form.products,
        notes: form.notes
      };
      await apiFetch(editingId ? `/finance/manual-sales/${editingId}` : '/finance/manual-sales', {
        method: editingId ? 'PUT' : 'POST',
        token: user?.token,
        body: JSON.stringify(
          editingId
            ? {
                ...basePayload,
                paymentMethod: validLines[0].paymentMethod,
                amount: validLines[0].amount
              }
            : {
                ...basePayload,
                lines: validLines
              }
        )
      });
      invalidateQueryCache(financeManualSalesKey);
      invalidateQueryCache(`${financeManualSalesKey}:tags`);
      invalidateQueryCache(financeDashboardKey);
      await salesQuery.refetch();
      await tagsQuery.refetch();
      resetForm();
      navigate('/app/financeiro/vendas-manuais');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      {showForm ? (
        <div className="panel">
          <FinanceHeader title={editingId ? 'Editar venda avulsa' : 'Nova venda avulsa'} backTo="/app/financeiro/vendas-manuais" />
          <form className="form" onSubmit={submit}>
            <div className="grid-2">
              <label>
                Data/hora
                <input type="datetime-local" value={form.occurredAt} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} />
              </label>
            </div>
            <div className="grid-3">
              <label>
                Origem
                <SelectField
                  value={form.origin}
                  onChange={(value) => setForm({ ...form, origin: value as SaleOrigin })}
                  options={manualSaleOriginKeys.map((key) => ({ value: key, label: saleOriginLabels[key] }))}
                />
              </label>
              <label>Descricao<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></label>
              <label>
                Marcadores
                <TagInput value={form.tags} onChange={(value) => setForm({ ...form, tags: stripOriginTags(value) })} placeholder="Ex: evento, feira, loja parceira" />
              </label>
              <div className="finance-tag-reuse">
                {reusableTagOptions.slice(0, 12).map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    className="ghost"
                    onClick={() => setForm((current) => ({ ...current, tags: current.tags.includes(tag) ? current.tags : [...current.tags, tag] }))}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
            <div className="finance-lines-block">
              <div className="finance-lines-head">
                <div>
                  <strong>Formas de recebimento</strong>
                  <span className="muted">Lance o total vendido por forma de pagamento.</span>
                </div>
                {!editingId ? (
                  <button type="button" className="finance-inline-icon-button" onClick={addLine} aria-label="Adicionar forma de pagamento">
                    <span className="material-symbols-outlined" aria-hidden="true">add</span>
                  </button>
                ) : null}
              </div>
              <div className="finance-lines-list">
                {form.lines.map((line) => (
                  <div className="finance-line-row finance-payment-row" key={line.id}>
                    <SelectField
                      value={line.paymentMethod}
                      onChange={(value) => updateLine(line.id, { paymentMethod: value as PaymentMethod })}
                      options={(Object.keys(methodLabels) as PaymentMethod[]).map((key) => ({ value: key, label: methodLabels[key] }))}
                    />
                    <div className="finance-payment-value-group">
                      <MoneyInput value={line.amount} onChange={(value) => updateLine(line.id, { amount: value })} />
                      {!editingId ? (
                        <button type="button" className="icon-button" aria-label="Remover forma" onClick={() => removeLine(line.id)}>
                          <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              <div className="finance-lines-total">
                <span>Total bruto</span>
                <strong>{formatCurrency(grossTotal)}</strong>
              </div>
            </div>
            <div className="finance-lines-block">
              <div className="finance-lines-head">
                <strong>Produtos vendidos</strong>
                <span className="muted">Opcional. Use quando quiser detalhar a venda de balcao.</span>
              </div>
              <SelectField
                value=""
                onChange={addSaleProduct}
                options={(productsQuery.data ?? [])
                  .filter((product) => !form.products.some((item) => item.productId === product.id))
                  .map((product) => ({ value: product.id, label: product.name }))}
                placeholder="Adicionar produto"
              />
              <div className="finance-lines-list">
                {form.products.map((item, index) => (
                  <div className="finance-line-row" key={item.productId}>
                    <span>{item.name}</span>
                    <input
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={item.quantity}
                      onChange={(event) => updateSaleProduct(index, { quantity: Number(event.target.value || 0) })}
                    />
                    <button type="button" className="icon-button" aria-label="Remover produto" onClick={() => removeSaleProduct(index)}>
                      <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <label>Observacoes<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            <div className="actions">
              <button type="button" className="ghost" onClick={() => navigate('/app/financeiro/vendas-manuais')}>Cancelar</button>
              <button type="submit" disabled={saving}>{saving ? 'Salvando...' : editingId ? 'Salvar venda' : 'Cadastrar venda'}</button>
            </div>
          </form>
        </div>
      ) : null}

      {!isCreateView && !editingRouteId ? (
        <div className="panel">
          <FinanceHeader title="Vendas avulsas" backTo="/app/financeiro" />
          <ListToolbar
            title=""
            searchValue={searchText}
            onSearch={setSearchText}
            actionLabel="Nova venda"
            onAction={() => navigate('/app/financeiro/vendas-manuais/novo')}
          />
          <div className="finance-filter-row">
            <div className="finance-filter-date-group">
              <label className="finance-filter-field finance-filter-field-date">
                <span>De</span>
                <input type="date" className="finance-date-input" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="finance-filter-field finance-filter-field-date">
                <span>Ate</span>
                <input type="date" className="finance-date-input" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
            <label className="finance-filter-field">
              <span>Buscar</span>
              <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Descricao da venda" />
            </label>
            <label className="finance-filter-field">
              <span>Origem ou marcador</span>
              <SelectField
                value={filterTag}
                onChange={(value) => setFilterTag(value)}
                options={tagOptions.map((tag) => ({
                  value: tag,
                  label: isSaleOrigin(tag) ? saleOriginLabels[tag] : `#${tag}`
                }))}
                placeholder="Todas"
              />
            </label>
            <label className="finance-filter-field">
              <span>Pagamento</span>
              <SelectField
                value={filterMethod}
                onChange={(value) => setFilterMethod(value as 'ALL' | PaymentMethod)}
                options={[
                  { value: 'ALL', label: 'Todos' },
                  ...((Object.keys(methodLabels) as PaymentMethod[]).map((key) => ({ value: key, label: methodLabels[key] })))
                ]}
              />
            </label>
          </div>
          <div className="finance-filter-summary">
            <div>
              <span>Total bruto filtrado</span>
              <strong>{formatCurrency(filteredGrossTotal)}</strong>
            </div>
            <div>
              <span>Total liquido filtrado</span>
              <strong>{formatCurrency(filteredNetTotal)}</strong>
            </div>
            <div>
              <span>Vendas encontradas</span>
              <strong>{filteredSales.length}</strong>
            </div>
          </div>
          <div className="table">
            {paginatedSales.map((item) => (
              <div key={item.id} className="list-row">
                <div>
                  <strong>{item.description}</strong>
                  <span className="muted">
                    {new Date(item.occurredAt).toLocaleString('pt-BR')} • {methodLabels[item.paymentMethod]} • {formatCurrency(item.netAmount)}
                  </span>
                  {item.tags?.length ? (
                    <span className="finance-list-tags">
                      {item.tags.map((tag) => (isSaleOrigin(tag) ? saleOriginLabels[tag] : `#${tag}`)).join('  ')}
                    </span>
                  ) : null}
                  {item.products?.length ? (
                    <span className="finance-list-tags">
                      {item.products.map((product) => `${product.name} x${product.quantity}`).join('  ')}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => navigate(`/app/financeiro/vendas-manuais/editar/${item.id}`)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Excluir venda"
                  onClick={() => setDeletingSale({ id: item.id, description: item.description })}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                </button>
              </div>
            ))}
            {filteredSales.length === 0 ? (
              <div className="list-row">
                <div>
                  <strong>Nenhuma venda encontrada</strong>
                  <span className="muted">Ajuste os filtros para ver outros resultados.</span>
                </div>
              </div>
            ) : null}
          </div>
          {filteredSales.length > pageSize ? (
            <div className="finance-pagination">
              <button type="button" className="ghost" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
                Anterior
              </button>
              <span>Pagina {page} de {totalPages}</span>
              <button type="button" className="ghost" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>
                Proxima
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(deletingSale)}
        title="Excluir venda"
        message={deletingSale ? `Deseja excluir a venda "${deletingSale.description}"?` : ''}
        confirmLabel="Excluir"
        onConfirm={confirmDeleteSale}
        onCancel={() => setDeletingSale(null)}
      />
    </div>
  );
};
