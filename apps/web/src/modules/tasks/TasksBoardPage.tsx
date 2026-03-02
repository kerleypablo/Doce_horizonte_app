import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';
import { apiFetch } from '../shared/api.ts';
import { useCachedQuery } from '../shared/queryCache.ts';

type TaskOrder = {
  id: string;
  number: string;
  status: 'AGUARDANDO_RETORNO' | 'CONCLUIDO' | 'CONFIRMADO' | 'CANCELADO';
  orderDateTime: string;
  deliveryDate?: string;
  deliveryType: 'ENTREGA' | 'RETIRADA';
  notesGeneral?: string;
  customerSnapshot?: { name?: string };
  products: { name: string; quantity: number }[];
};

type ExtraStep = {
  id: string;
  text: string;
  done: boolean;
};

type TaskOrderState = {
  productChecks: Record<string, boolean>;
  extraSteps: ExtraStep[];
};

type TaskStateMap = Record<string, TaskOrderState>;

type PeriodMode = 'week' | 'month';

const STORAGE_KEY = 'confeitaria.tasks.progress.v1';

const parseDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const normalizeDateKey = (value?: string) => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parseDateKey(parsed);
};

const toOrderDateKeys = (order: TaskOrder) => {
  const keys = new Set<string>();
  const deliveryKey = normalizeDateKey(order.deliveryDate);
  const orderKey = normalizeDateKey(order.orderDateTime);
  if (deliveryKey) keys.add(deliveryKey);
  if (orderKey) keys.add(orderKey);
  return [...keys];
};

const startOfWeek = (date: Date) => {
  const day = date.getDay();
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
};

const endOfWeek = (date: Date) => {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

const getPeriodRange = (baseDate: Date, mode: PeriodMode) => {
  if (mode === 'week') return { start: startOfWeek(baseDate), end: endOfWeek(baseDate) };
  return { start: startOfMonth(baseDate), end: endOfMonth(baseDate) };
};

const loadTaskState = (): TaskStateMap => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as TaskStateMap;
  } catch {
    return {};
  }
};

const saveTaskState = (state: TaskStateMap) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const dateLabel = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });
const dayLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });

const productKey = (index: number, item: { name: string; quantity: number }) => `p:${index}:${item.name}:${item.quantity}`;

export const TasksBoardPage = () => {
  const { user } = useAuth();
  const [mode, setMode] = useState<PeriodMode>('week');
  const [baseDate, setBaseDate] = useState(new Date());
  const [stateMap, setStateMap] = useState<TaskStateMap>(() => loadTaskState());
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [newStepText, setNewStepText] = useState('');
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const todayKey = parseDateKey(new Date());

  const range = useMemo(() => getPeriodRange(baseDate, mode), [baseDate, mode]);

  const tasksQuery = useCachedQuery(
    `tasks-board:${mode}:${parseDateKey(range.start)}`,
    () =>
      apiFetch<TaskOrder[]>(
        `/orders/summary-calendar?from=${encodeURIComponent(range.start.toISOString())}&to=${encodeURIComponent(range.end.toISOString())}`,
        { token: user?.token }
      ),
    { enabled: Boolean(user?.token), staleTime: 60_000, refetchInterval: 90_000 }
  );

  const orders = tasksQuery.data ?? [];
  const expandedOrder = orders.find((order) => order.id === expandedOrderId) ?? null;

  const dateColumns = useMemo(() => {
    const cols: Date[] = [];
    const cursor = new Date(range.start);
    while (cursor <= range.end) {
      cols.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return cols;
  }, [range.start, range.end]);

  const ordersByDate = useMemo(() => {
    const map = new Map<string, Map<string, TaskOrder>>();
    for (const order of orders) {
      const keys = toOrderDateKeys(order);
      for (const key of keys) {
        if (!map.has(key)) map.set(key, new Map());
        map.get(key)?.set(order.id, order);
      }
    }
    const normalized = new Map<string, TaskOrder[]>();
    for (const [key, value] of map.entries()) {
      normalized.set(key, [...value.values()]);
    }
    return normalized;
  }, [orders]);

  const updateOrderState = (orderId: string, updater: (current: TaskOrderState) => TaskOrderState) => {
    setStateMap((prev) => {
      const nextCurrent = updater(prev[orderId] ?? { productChecks: {}, extraSteps: [] });
      const next = { ...prev, [orderId]: nextCurrent };
      saveTaskState(next);
      return next;
    });
  };

  const getOrderState = (orderId: string): TaskOrderState => stateMap[orderId] ?? { productChecks: {}, extraSteps: [] };

  const isOrderCompleted = (order: TaskOrder) => {
    const state = getOrderState(order.id);
    const allProductsChecked = (order.products ?? []).every((item, index) => {
      const key = productKey(index, item);
      return Boolean(state.productChecks[key]);
    });
    const allExtraStepsChecked = (state.extraSteps ?? []).every((step) => step.done);
    return allProductsChecked && allExtraStepsChecked;
  };

  const isCardExpanded = (order: TaskOrder) => {
    const explicit = expandedCards[order.id];
    if (explicit !== undefined) return explicit;
    return !isOrderCompleted(order);
  };

  const toggleCardExpanded = (order: TaskOrder) => {
    setExpandedCards((prev) => ({ ...prev, [order.id]: !isCardExpanded(order) }));
  };

  const toggleProductCheck = (orderId: string, key: string) => {
    updateOrderState(orderId, (current) => ({
      ...current,
      productChecks: {
        ...current.productChecks,
        [key]: !current.productChecks[key]
      }
    }));
  };

  const toggleExtraStep = (orderId: string, stepId: string) => {
    updateOrderState(orderId, (current) => ({
      ...current,
      extraSteps: current.extraSteps.map((step) => (step.id === stepId ? { ...step, done: !step.done } : step))
    }));
  };

  const addExtraStep = (orderId: string) => {
    const text = newStepText.trim();
    if (!text) return;
    updateOrderState(orderId, (current) => ({
      ...current,
      extraSteps: [...current.extraSteps, { id: `${Date.now()}-${Math.random()}`, text, done: false }]
    }));
    setNewStepText('');
  };

  const shiftPeriod = (direction: -1 | 1) => {
    setBaseDate((prev) => {
      const next = new Date(prev);
      if (mode === 'week') {
        next.setDate(prev.getDate() + direction * 7);
      } else {
        next.setMonth(prev.getMonth() + direction);
      }
      return next;
    });
  };

  const periodTitle = mode === 'week'
    ? `${dateLabel.format(range.start)} - ${dateLabel.format(range.end)}`
    : monthLabel.format(baseDate);

  return (
    <div className="page tasks-page">
      <div className="panel tasks-toolbar">
        <div className="tasks-mode-switch">
          <button type="button" className={mode === 'week' ? 'active' : ''} onClick={() => setMode('week')}>Semana</button>
          <button type="button" className={mode === 'month' ? 'active' : ''} onClick={() => setMode('month')}>Mes</button>
        </div>
        <div className="tasks-period-nav">
          <button type="button" className="icon-button" onClick={() => shiftPeriod(-1)} aria-label="Periodo anterior">‹</button>
          <strong>{periodTitle}</strong>
          <button type="button" className="icon-button" onClick={() => shiftPeriod(1)} aria-label="Proximo periodo">›</button>
        </div>
      </div>

      <div className="panel tasks-board-panel">
        {tasksQuery.loading ? <p>Carregando pedidos...</p> : null}
        {!tasksQuery.loading && orders.length === 0 ? <p>Nenhum pedido no periodo.</p> : null}
        <div className="tasks-kanban">
          {dateColumns.map((date) => {
            const key = parseDateKey(date);
            const dayOrders = ordersByDate.get(key) ?? [];
            return (
              <div key={key} className={`tasks-column ${key === todayKey ? 'today' : ''}`}>
                <div className="tasks-column-head">
                  <strong>{dayLabel.format(date)}</strong>
                  <span>{dateLabel.format(date)}</span>
                </div>
                <div className="tasks-column-body">
                  {dayOrders.length === 0 ? <p className="muted">Sem pedidos</p> : null}
                  {dayOrders.map((order) => {
                    const orderState = stateMap[order.id] ?? { productChecks: {}, extraSteps: [] };
                    const isExpanded = isCardExpanded(order);
                    const isCompleted = isOrderCompleted(order);
                    return (
                      <div key={order.id} className="tasks-order-card">
                        <div className="tasks-order-head">
                          <div>
                            <strong>
                              {order.number}
                              {isCompleted ? (
                                <span className="material-symbols-outlined tasks-done-icon" aria-hidden="true">check_circle</span>
                              ) : null}
                            </strong>
                            <span>{order.customerSnapshot?.name ?? 'Sem cliente'} • {order.deliveryType === 'ENTREGA' ? 'Entrega' : 'Retirada'}</span>
                          </div>
                          <div className="tasks-card-actions">
                            <button type="button" className="ghost" onClick={() => toggleCardExpanded(order)}>
                              {isExpanded ? 'Retrair' : 'Expandir'}
                            </button>
                            <button type="button" className="ghost" onClick={() => setExpandedOrderId(order.id)}>Tela cheia</button>
                          </div>
                        </div>
                        {isExpanded ? (
                          <>
                            <div className="tasks-products">
                              {order.products.map((item, index) => {
                                const itemKey = productKey(index, item);
                                return (
                                  <label key={itemKey} className="tasks-check">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(orderState.productChecks[itemKey])}
                                      onChange={() => toggleProductCheck(order.id, itemKey)}
                                    />
                                    <span>{item.quantity}x {item.name}</span>
                                  </label>
                                );
                              })}
                              {orderState.extraSteps.map((step) => (
                                <label key={step.id} className="tasks-check extra">
                                  <input type="checkbox" checked={step.done} onChange={() => toggleExtraStep(order.id, step.id)} />
                                  <span>{step.text}</span>
                                </label>
                              ))}
                            </div>
                            {order.notesGeneral ? (
                              <div className="tasks-notes">
                                <span>Obs:</span>
                                <p>{order.notesGeneral}</p>
                              </div>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {expandedOrder ? (
        <div className="tasks-modal-backdrop" role="dialog" aria-modal="true">
          <div className="tasks-modal">
            <div className="tasks-modal-head">
              <div>
                <h3>{expandedOrder.number}</h3>
                <p>{expandedOrder.customerSnapshot?.name ?? 'Sem cliente'} • {expandedOrder.deliveryType === 'ENTREGA' ? 'Entrega' : 'Retirada'}</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setExpandedOrderId(null)} aria-label="Fechar">✕</button>
            </div>

            <div className="tasks-modal-content">
              <h4>Produtos</h4>
              {(expandedOrder.products ?? []).map((item, index) => {
                const key = productKey(index, item);
                const checked = Boolean((stateMap[expandedOrder.id] ?? { productChecks: {}, extraSteps: [] }).productChecks[key]);
                return (
                  <label key={key} className="tasks-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleProductCheck(expandedOrder.id, key)}
                    />
                    <span>{item.quantity}x {item.name}</span>
                  </label>
                );
              })}

              <h4>Passos adicionais</h4>
              <div className="tasks-extra-create">
                <input
                  value={newStepText}
                  onChange={(event) => setNewStepText(event.target.value)}
                  placeholder="Ex.: Separar embalagem premium"
                />
                <button type="button" onClick={() => addExtraStep(expandedOrder.id)}>Adicionar</button>
              </div>

              {((stateMap[expandedOrder.id] ?? { productChecks: {}, extraSteps: [] }).extraSteps).map((step) => (
                <label key={step.id} className="tasks-check extra">
                  <input type="checkbox" checked={step.done} onChange={() => toggleExtraStep(expandedOrder.id, step.id)} />
                  <span>{step.text}</span>
                </label>
              ))}

              <h4>Observacoes gerais</h4>
              <p>{expandedOrder.notesGeneral?.trim() ? expandedOrder.notesGeneral : 'Sem observacoes.'}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
