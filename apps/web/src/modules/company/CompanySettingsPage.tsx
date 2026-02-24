import { useEffect, useState } from 'react';
import { apiFetch } from '../shared/api.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import { SelectField } from '../shared/SelectField.tsx';
import { MoneyInput } from '../shared/MoneyInput.tsx';
import { LoadingOverlay } from '../shared/LoadingOverlay.tsx';

type SalesChannel = {
  id?: string;
  name: string;
  feePercent: number;
  paymentFeePercent: number;
  feeFixed: number;
  active: boolean;
};

type Settings = {
  overheadMethod: 'PERCENT_DIRECT' | 'PER_UNIT';
  overheadPercent: number;
  overheadPerUnit: number;
  laborCostPerHour: number;
  fixedCostPerHour: number;
  taxesPercent: number;
  defaultProfitPercent: number;
  salesChannels: SalesChannel[];
};

export const CompanySettingsPage = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const data = await apiFetch<Settings>('/company/settings', { token: user?.token });
    setSettings(data);
  };

  useEffect(() => {
    load();
  }, []);

  const updateChannel = (index: number, field: keyof SalesChannel, value: string | number | boolean) => {
    if (!settings) return;
    const next = [...settings.salesChannels];
    next[index] = { ...next[index], [field]: value };
    setSettings({ ...settings, salesChannels: next });
  };

  const addChannel = () => {
    if (!settings) return;
    setSettings({
      ...settings,
      salesChannels: [
        ...settings.salesChannels,
        { name: 'Novo canal', feePercent: 0, paymentFeePercent: 0, feeFixed: 0, active: true }
      ]
    });
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    await apiFetch('/company/settings', {
      method: 'PUT',
      token: user?.token,
      body: JSON.stringify(settings)
    });
    setSaving(false);
  };

  if (user?.role !== 'admin') {
    return (
      <div className="panel">
        <h3>Somente administradores</h3>
        <p>Seu perfil nao tem acesso para configurar a empresa.</p>
      </div>
    );
  }

  if (!settings) {
    return <div className="panel">Carregando...</div>;
  }

  return (
    <div className="page">
      <div className="panel">
        <h3>Custos e taxas</h3>
        <div className="form">
          <div className="grid-2">
            <label>
              Metodo de rateio
              <SelectField
                value={settings.overheadMethod}
                onChange={(value) => setSettings({ ...settings, overheadMethod: value as Settings['overheadMethod'] })}
                options={[
                  { value: 'PERCENT_DIRECT', label: 'Percentual do custo direto' },
                  { value: 'PER_UNIT', label: 'Valor fixo por unidade' }
                ]}
              />
            </label>
            <label>
              Percentual de rateio (%)
              <input
                type="number"
                value={settings.overheadPercent === 0 ? '' : settings.overheadPercent}
                onChange={(e) => setSettings({ ...settings, overheadPercent: Number(e.target.value || 0) })}
                min={0}
              />
            </label>
          </div>
          <div className="grid-2">
            <label>
              Rateio fixo por unidade (R$)
              <MoneyInput
                value={settings.overheadPerUnit}
                onChange={(value) => setSettings({ ...settings, overheadPerUnit: value })}
              />
            </label>
            <label>
              Impostos (%)
              <input
                type="number"
                value={settings.taxesPercent === 0 ? '' : settings.taxesPercent}
                onChange={(e) => setSettings({ ...settings, taxesPercent: Number(e.target.value || 0) })}
                min={0}
              />
            </label>
          </div>
          <div className="grid-2">
            <label>
              Custo hora de mao de obra (R$)
              <MoneyInput
                value={settings.laborCostPerHour}
                onChange={(value) => setSettings({ ...settings, laborCostPerHour: value })}
              />
            </label>
            <label>
              Custo fixo por hora (R$)
              <MoneyInput
                value={settings.fixedCostPerHour}
                onChange={(value) => setSettings({ ...settings, fixedCostPerHour: value })}
              />
            </label>
          </div>
          <div className="grid-2">
            <label>
              Margem padrao (%)
              <input
                type="number"
                value={settings.defaultProfitPercent === 0 ? '' : settings.defaultProfitPercent}
                onChange={(e) => setSettings({ ...settings, defaultProfitPercent: Number(e.target.value || 0) })}
                min={0}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Canais de venda</h3>
        <div className="table">
          <div className="table-head">
            <span>Canal</span>
            <span>Taxa canal (%)</span>
            <span>Taxa pagamento (%)</span>
            <span>Taxa fixa (R$)</span>
            <span>Ativo</span>
          </div>
          {settings.salesChannels.map((channel, index) => (
            <div key={`${channel.name}-${index}`} className="table-row">
              <label className="table-field">
                <span>Canal</span>
                <input value={channel.name} onChange={(e) => updateChannel(index, 'name', e.target.value)} />
              </label>
              <label className="table-field">
                <span>Taxa canal (%)</span>
                <input
                  type="number"
                  value={channel.feePercent === 0 ? '' : channel.feePercent}
                  onChange={(e) => updateChannel(index, 'feePercent', Number(e.target.value || 0))}
                  min={0}
                />
              </label>
              <label className="table-field">
                <span>Taxa pagamento (%)</span>
                <input
                  type="number"
                  value={channel.paymentFeePercent === 0 ? '' : channel.paymentFeePercent}
                  onChange={(e) => updateChannel(index, 'paymentFeePercent', Number(e.target.value || 0))}
                  min={0}
                />
              </label>
              <label className="table-field">
                <span>Taxa fixa (R$)</span>
                <MoneyInput
                  value={channel.feeFixed}
                  onChange={(value) => updateChannel(index, 'feeFixed', value)}
                />
              </label>
              <label className="table-field checkbox">
                <span>Ativo</span>
                <input
                  type="checkbox"
                  checked={channel.active}
                  onChange={(e) => updateChannel(index, 'active', e.target.checked)}
                />
              </label>
            </div>
          ))}
        </div>
        <div className="actions">
          <button type="button" className="ghost" onClick={addChannel}>
            + Adicionar canal
          </button>
          <button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar configuracoes'}
          </button>
        </div>
      </div>
      <LoadingOverlay open={saving} label="Salvando configuracoes..." />
    </div>
  );
};
