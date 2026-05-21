import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';
import { apiFetch } from '../shared/api.ts';
import { MoneyInput } from '../shared/MoneyInput.tsx';
import { SelectField } from '../shared/SelectField.tsx';
import { invalidateQueryCache } from '../shared/queryCache.ts';
import { FinanceAccessBlocked, FinanceHeader } from './FinanceShared.tsx';
import { financeDashboardKey, financeRulesKey, methodLabels, modeLabels } from './constants.ts';
import { useFinanceRules } from './hooks.ts';
import type { MethodRule, PaymentMethod, RuleMode } from './types.ts';

export const FinanceRulesPage = () => {
  const { user } = useAuth();
  const rulesQuery = useFinanceRules(user?.token);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<MethodRule[]>([]);

  useEffect(() => {
    if (rulesQuery.data?.rules) setRules(rulesQuery.data.rules);
  }, [rulesQuery.data]);

  if (!user?.modules?.includes('financeiro')) return <FinanceAccessBlocked />;

  const updateRule = (method: PaymentMethod, patch: Partial<MethodRule>) => {
    setRules((current) => current.map((item) => (item.method === method ? { ...item, ...patch } : item)));
  };

  const saveRules = async () => {
    setSaving(true);
    try {
      await apiFetch('/finance/method-rules', {
        method: 'PUT',
        token: user?.token,
        body: JSON.stringify({ rules })
      });
      invalidateQueryCache(financeRulesKey);
      invalidateQueryCache(financeDashboardKey);
      await rulesQuery.refetch();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="panel">
        <FinanceHeader title="Taxas por metodo" backTo="/app/financeiro" />
        <p className="muted">
          Use essas regras para transformar venda bruta em valor liquido. Exemplo: se o cartao cobra 3%, uma venda de R$ 100 entra como R$ 97 no financeiro.
        </p>
        <div className="table">
          {(['PIX', 'DINHEIRO', 'CARTAO', 'VOUCHER'] as PaymentMethod[]).map((method) => {
            const rule = rules.find((item) => item.method === method) ?? { method, mode: 'NONE' as RuleMode, value: 0 };
            return (
              <div key={method} className="table-row">
                <label>
                  Metodo de pagamento
                  <input value={methodLabels[method]} readOnly />
                </label>
                <label>
                  Regra
                  <SelectField
                    value={rule.mode}
                    onChange={(value) => updateRule(method, { mode: value as RuleMode })}
                    options={(Object.keys(modeLabels) as RuleMode[]).map((mode) => ({
                      value: mode,
                      label: modeLabels[mode]
                    }))}
                  />
                </label>
                <label>
                  Valor
                  {rule.mode === 'PERCENT' ? (
                    <input
                      type="number"
                      value={rule.value === 0 ? '' : rule.value}
                      min={0}
                      onChange={(event) => updateRule(method, { value: Number(event.target.value || 0) })}
                    />
                  ) : (
                    <MoneyInput value={rule.value} onChange={(value) => updateRule(method, { value })} />
                  )}
                </label>
              </div>
            );
          })}
        </div>
        <div className="actions">
          <button type="button" onClick={saveRules} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar taxas'}
          </button>
        </div>
      </div>
    </div>
  );
};
