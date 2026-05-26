import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../shared/api.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import { SelectField } from '../shared/SelectField.tsx';
import { MoneyInput } from '../shared/MoneyInput.tsx';
import { ConfirmDialog } from '../shared/ConfirmDialog.tsx';
import { LoadingOverlay } from '../shared/LoadingOverlay.tsx';
import { invalidateQueryCache, useCachedQuery } from '../shared/queryCache.ts';
import { queryKeys } from '../shared/queryKeys.ts';

type SalesChannel = {
  id?: string;
  name: string;
  feePercent: number;
  paymentFeePercent: number;
  feeFixed: number;
  active: boolean;
};

type CostItem = {
  id?: string;
  name: string;
  monthlyAmount: number;
  active: boolean;
};

type Settings = {
  companyName: string;
  companyCode?: string;
  companyPhone: string;
  companyEmail: string;
  pixKey: string;
  logoDataUrl: string;
  appTheme: 'caramelo' | 'oceano' | 'floresta' | 'branco_pop';
  darkMode: boolean;
  defaultNotesDelivery: string;
  defaultNotesGeneral: string;
  defaultNotesPayment: string;
  productiveHoursPerMonth: number;
  overheadMethod: 'PERCENT_DIRECT' | 'PER_UNIT';
  overheadPercent: number;
  overheadPerUnit: number;
  laborCostItems: CostItem[];
  fixedCostItems: CostItem[];
  laborCostPerHour: number;
  fixedCostPerHour: number;
  taxesPercent: number;
  salesChannels: SalesChannel[];
};

type CompanyUser = {
  authUserId: string;
  email: string;
  name: string;
  avatarUrl: string;
  role: 'master' | 'admin' | 'common';
  createdAt?: string;
};

const companyTabs: Array<{ key: 'empresa' | 'custos' | 'canais'; label: string; icon: string }> = [
  { key: 'empresa', label: 'Empresa', icon: 'domain' },
  { key: 'custos', label: 'Custos', icon: 'calculate' },
  { key: 'canais', label: 'Canais', icon: 'storefront' }
];

export const CompanySettingsPage = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tab, setTab] = useState<'empresa' | 'custos' | 'canais'>('empresa');
  const [showAdvancedRateio, setShowAdvancedRateio] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [roleSavingUserId, setRoleSavingUserId] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<CompanyUser | null>(null);
  const settingsQuery = useCachedQuery(
    queryKeys.companySettings,
    () => apiFetch<Settings>('/company/settings', { token: user?.token }),
    { staleTime: 5 * 60_000, enabled: Boolean(user?.token) }
  );
  const usersQuery = useCachedQuery(
    queryKeys.companyUsers,
    () => apiFetch<CompanyUser[]>('/company/users', { token: user?.token }),
    { staleTime: 60_000, enabled: Boolean(user?.token && (user?.role === 'admin' || user?.role === 'master')) }
  );

  const currentAuthUserId = useMemo(() => {
    if (!user?.token) return '';
    try {
      const payloadPart = user.token.split('.')[1];
      if (!payloadPart) return '';
      const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(normalized)) as { sub?: string };
      return payload.sub ?? '';
    } catch {
      return '';
    }
  }, [user?.token]);

  useEffect(() => {
    if (settingsQuery.data) {
      setSettings({
        ...settingsQuery.data,
        productiveHoursPerMonth: Number(settingsQuery.data.productiveHoursPerMonth ?? 0),
        laborCostItems: settingsQuery.data.laborCostItems ?? [],
        fixedCostItems: settingsQuery.data.fixedCostItems ?? [],
        laborCostPerHour: Number(settingsQuery.data.laborCostPerHour ?? 0),
        fixedCostPerHour: Number(settingsQuery.data.fixedCostPerHour ?? 0)
      });
    }
  }, [settingsQuery.data]);

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

  const buildCostItem = (fallbackName: string): CostItem => ({
    id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: fallbackName,
    monthlyAmount: 0,
    active: true
  });

  const updateCostItem = (kind: 'laborCostItems' | 'fixedCostItems', index: number, field: keyof CostItem, value: string | number | boolean) => {
    if (!settings) return;
    const next = [...settings[kind]];
    next[index] = { ...next[index], [field]: value };
    setSettings({ ...settings, [kind]: next });
  };

  const addCostItem = (kind: 'laborCostItems' | 'fixedCostItems', fallbackName: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      [kind]: [...settings[kind], buildCostItem(fallbackName)]
    });
  };

  const removeCostItem = (kind: 'laborCostItems' | 'fixedCostItems', index: number) => {
    if (!settings) return;
    setSettings({
      ...settings,
      [kind]: settings[kind].filter((_, itemIndex) => itemIndex !== index)
    });
  };

  const handleLogoUpload = async (files: FileList | null) => {
    if (!files?.length || !settings) return;
    const file = files[0];
    const sourceDataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.readAsDataURL(file);
    });

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Nao foi possivel processar a imagem.'));
      img.src = sourceDataUrl;
    });

    const maxSize = 420;
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(image, 0, 0, width, height);

    const logoDataUrl = canvas.toDataURL('image/png');
    setSettings({ ...settings, logoDataUrl });
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setSubmitError(null);
    try {
      await apiFetch('/company/settings', {
        method: 'PUT',
        token: user?.token,
        body: JSON.stringify(settings)
      });
      invalidateQueryCache(queryKeys.companySettings);
      await settingsQuery.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar configuracoes';
      setSubmitError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (authUserId: string, role: 'admin' | 'common') => {
    setRoleSavingUserId(authUserId);
    setSubmitError(null);
    try {
      await apiFetch(`/company/users/${authUserId}/role`, {
        method: 'PUT',
        token: user?.token,
        body: JSON.stringify({ role })
      });
      invalidateQueryCache(queryKeys.companyUsers);
      await usersQuery.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao atualizar permissao';
      setSubmitError(message);
    } finally {
      setRoleSavingUserId(null);
    }
  };

  const handleDeleteAccess = async () => {
    if (!userToDelete) return;
    setRoleSavingUserId(userToDelete.authUserId);
    setSubmitError(null);
    try {
      await apiFetch(`/company/users/${userToDelete.authUserId}`, {
        method: 'DELETE',
        token: user?.token
      });
      setUserToDelete(null);
      invalidateQueryCache(queryKeys.companyUsers);
      await usersQuery.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao remover acesso';
      setSubmitError(message);
    } finally {
      setRoleSavingUserId(null);
    }
  };

  if (user?.role !== 'admin' && user?.role !== 'master') {
    return (
      <div className="panel">
        <h3>Somente administradores</h3>
        <p>Seu perfil nao tem acesso para configurar a empresa.</p>
      </div>
    );
  }

  if (settingsQuery.loading && !settings) return <div className="panel">Carregando...</div>;
  if (!settings) return <div className="panel">Carregando...</div>;

  const itemizedMonthlyLaborTotal = settings.laborCostItems.reduce((sum, item) => sum + (item.active ? item.monthlyAmount : 0), 0);
  const itemizedMonthlyFixedTotal = settings.fixedCostItems.reduce((sum, item) => sum + (item.active ? item.monthlyAmount : 0), 0);
  const productiveHours = Number(settings.productiveHoursPerMonth || 0);
  const derivedLaborPerHour = productiveHours > 0 ? itemizedMonthlyLaborTotal / productiveHours : 0;
  const derivedFixedPerHour = productiveHours > 0 ? itemizedMonthlyFixedTotal / productiveHours : 0;
  const monthlyLaborTotal = settings.laborCostItems.length > 0
    ? itemizedMonthlyLaborTotal
    : Number(settings.laborCostPerHour ?? 0) * productiveHours;
  const monthlyFixedTotal = settings.fixedCostItems.length > 0
    ? itemizedMonthlyFixedTotal
    : Number(settings.fixedCostPerHour ?? 0) * productiveHours;
  const displayedLaborPerHour = settings.laborCostItems.length > 0 ? derivedLaborPerHour : Number(settings.laborCostPerHour ?? 0);
  const displayedFixedPerHour = settings.fixedCostItems.length > 0 ? derivedFixedPerHour : Number(settings.fixedCostPerHour ?? 0);
  const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="page company-settings-page">
      <div className="panel">
        <div className="company-settings-tabs" role="tablist" aria-label="Abas da empresa">
          {companyTabs.map((item) => (
            <button
              key={item.key}
              type="button"
              className={tab === item.key ? 'active' : ''}
              onClick={() => setTab(item.key)}
              aria-pressed={tab === item.key}
            >
              <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {tab === 'empresa' ? (
          <div className="form">
            <h3>Dados da empresa</h3>
            <label>
              Nome da empresa
              <input
                value={settings.companyName}
                onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
              />
            </label>
            <label>
              Codigo da empresa
              <input value={settings.companyCode ?? ''} readOnly />
            </label>
            <div className="grid-2">
              <label>
                Telefone da empresa
                <input
                  value={settings.companyPhone ?? ''}
                  onChange={(e) => setSettings({ ...settings, companyPhone: e.target.value })}
                />
              </label>
              <label>
                Email da empresa
                <input
                  type="email"
                  value={settings.companyEmail ?? ''}
                  onChange={(e) => setSettings({ ...settings, companyEmail: e.target.value })}
                />
              </label>
            </div>
            <label>
              Chave PIX da empresa
              <input
                value={settings.pixKey ?? ''}
                onChange={(e) => setSettings({ ...settings, pixKey: e.target.value })}
              />
            </label>
            <label>
              Logo da empresa
              <input type="file" accept="image/*" onChange={(e) => handleLogoUpload(e.target.files)} />
            </label>
            {settings.logoDataUrl ? (
              <div className="settings-logo-preview">
                <img src={settings.logoDataUrl} alt="Logo da empresa" />
              </div>
            ) : null}

            <h3>Usuarios da empresa</h3>
            {usersQuery.loading && !usersQuery.data ? <p>Carregando usuarios...</p> : null}
            {!usersQuery.loading && (usersQuery.data?.length ?? 0) === 0 ? <p>Nenhum usuario vinculado.</p> : null}
            <div className="company-users-list">
              {(usersQuery.data ?? []).map((companyUser) => (
                <div key={companyUser.authUserId} className="company-user-row">
                  <div className="company-user-main">
                    {companyUser.avatarUrl ? (
                      <img src={companyUser.avatarUrl} alt={companyUser.name || companyUser.email || 'Usuario'} />
                    ) : (
                      <span className="material-symbols-outlined" aria-hidden="true">person</span>
                    )}
                    <span>{companyUser.name || companyUser.email || 'Sem nome'}</span>
                  </div>
                  <div className="company-user-actions">
                    <label className="settings-switch compact">
                      <span>Admin</span>
                      <input
                        type="checkbox"
                        checked={companyUser.role === 'admin'}
                        onChange={(event) => handleRoleChange(companyUser.authUserId, event.target.checked ? 'admin' : 'common')}
                        disabled={roleSavingUserId === companyUser.authUserId || companyUser.authUserId === currentAuthUserId}
                      />
                    </label>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setUserToDelete(companyUser)}
                      disabled={roleSavingUserId === companyUser.authUserId || companyUser.authUserId === currentAuthUserId}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>

          </div>
        ) : null}

        {tab === 'custos' ? (
          <div className="form">
            <h3>Custos e taxas</h3>
            <div className="company-settings-cost-card">
              <div className="company-settings-cost-head">
                <div>
                  <h4>Horas produtivas do mes</h4>
                  <p>Use a quantidade media de horas realmente dedicadas a produzir. O sistema divide os custos mensais por essas horas.</p>
                </div>
              </div>
              <label>
                Horas produtivas por mes
                <input
                  type="number"
                  value={settings.productiveHoursPerMonth === 0 ? '' : settings.productiveHoursPerMonth}
                  onChange={(e) => setSettings({ ...settings, productiveHoursPerMonth: Number(e.target.value || 0) })}
                  min={0}
                />
              </label>
            </div>

            <div className="company-settings-cost-card">
              <div className="company-settings-cost-head">
                <div>
                  <h4>Equipe e mao de obra</h4>
                  <p>Cadastre salarios, pro-labore ou qualquer custo mensal de quem produz. O sistema soma tudo e converte para custo por hora.</p>
                </div>
                <button type="button" className="ghost" onClick={() => addCostItem('laborCostItems', 'Novo custo de equipe')}>
                  + Adicionar custo de equipe
                </button>
              </div>
              <div className="company-settings-cost-list">
                {settings.laborCostItems.map((item, index) => (
                  <div key={item.id ?? `${item.name}-${index}`} className="company-settings-cost-row">
                    <label>
                      Nome
                      <input
                        value={item.name}
                        onChange={(e) => updateCostItem('laborCostItems', index, 'name', e.target.value)}
                        placeholder="Ex.: Funcionario confeitaria"
                      />
                    </label>
                    <label>
                      Valor mensal
                      <MoneyInput
                        value={item.monthlyAmount}
                        onChange={(value) => updateCostItem('laborCostItems', index, 'monthlyAmount', value)}
                      />
                    </label>
                    <label className="settings-switch compact company-settings-cost-toggle">
                      <span>Ativo</span>
                      <input
                        type="checkbox"
                        checked={item.active}
                        onChange={(e) => updateCostItem('laborCostItems', index, 'active', e.target.checked)}
                      />
                    </label>
                    <button type="button" className="ghost danger" onClick={() => removeCostItem('laborCostItems', index)}>
                      Remover
                    </button>
                  </div>
                ))}
                {settings.laborCostItems.length === 0 ? <p className="muted">Nenhum custo de equipe cadastrado.</p> : null}
              </div>
              <div className="company-settings-cost-summary">
                <div>
                  <span>Total mensal de equipe</span>
                  <strong>{formatCurrency(monthlyLaborTotal)}</strong>
                </div>
                <div>
                  <span>Custo por hora calculado</span>
                  <strong>{formatCurrency(displayedLaborPerHour)}</strong>
                </div>
              </div>
            </div>

            <div className="company-settings-cost-card">
              <div className="company-settings-cost-head">
                <div>
                  <h4>Estrutura e custos fixos</h4>
                  <p>Cadastre aluguel, condominio, energia, gas, internet e outros custos mensais de estrutura. O sistema soma tudo e divide pelas horas produtivas.</p>
                </div>
                <button type="button" className="ghost" onClick={() => addCostItem('fixedCostItems', 'Novo custo fixo')}>
                  + Adicionar custo fixo
                </button>
              </div>
              <div className="company-settings-cost-list">
                {settings.fixedCostItems.map((item, index) => (
                  <div key={item.id ?? `${item.name}-${index}`} className="company-settings-cost-row">
                    <label>
                      Nome
                      <input
                        value={item.name}
                        onChange={(e) => updateCostItem('fixedCostItems', index, 'name', e.target.value)}
                        placeholder="Ex.: Aluguel"
                      />
                    </label>
                    <label>
                      Valor mensal
                      <MoneyInput
                        value={item.monthlyAmount}
                        onChange={(value) => updateCostItem('fixedCostItems', index, 'monthlyAmount', value)}
                      />
                    </label>
                    <label className="settings-switch compact company-settings-cost-toggle">
                      <span>Ativo</span>
                      <input
                        type="checkbox"
                        checked={item.active}
                        onChange={(e) => updateCostItem('fixedCostItems', index, 'active', e.target.checked)}
                      />
                    </label>
                    <button type="button" className="ghost danger" onClick={() => removeCostItem('fixedCostItems', index)}>
                      Remover
                    </button>
                  </div>
                ))}
                {settings.fixedCostItems.length === 0 ? <p className="muted">Nenhum custo fixo cadastrado.</p> : null}
              </div>
              <div className="company-settings-cost-summary">
                <div>
                  <span>Total mensal de estrutura</span>
                  <strong>{formatCurrency(monthlyFixedTotal)}</strong>
                </div>
                <div>
                  <span>Custo por hora calculado</span>
                  <strong>{formatCurrency(displayedFixedPerHour)}</strong>
                </div>
              </div>
            </div>

            <div className="grid-2">
              <label>
                Impostos (%)
                <input
                  type="number"
                  value={settings.taxesPercent === 0 ? '' : settings.taxesPercent}
                  onChange={(e) => setSettings({ ...settings, taxesPercent: Number(e.target.value || 0) })}
                  min={0}
                />
              </label>
              <label>
                Custo hora de mao de obra calculado (R$)
                <MoneyInput value={displayedLaborPerHour} onChange={() => undefined} disabled />
              </label>
            </div>
            <div className="grid-2">
              <label>
                Custo fixo por hora calculado (R$)
                <MoneyInput value={displayedFixedPerHour} onChange={() => undefined} disabled />
              </label>
              <label>
                Total mensal considerado
                <MoneyInput value={monthlyLaborTotal + monthlyFixedTotal} onChange={() => undefined} disabled />
              </label>
            </div>
            <div className="company-settings-cost-card subtle">
              <div className="company-settings-cost-head">
                <div>
                  <h4>Rateio extra opcional</h4>
                  <p>Use apenas se quiser acrescentar uma gordura extra alem dos custos mensais acima. Se nao precisar, deixe zerado.</p>
                </div>
                <button type="button" className="ghost" onClick={() => setShowAdvancedRateio((current) => !current)}>
                  {showAdvancedRateio ? 'Ocultar' : 'Mostrar'} rateio extra
                </button>
              </div>
              {showAdvancedRateio ? (
                <>
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
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === 'canais' ? (
          <div className="form">
            <h3>Canais de venda</h3>
            <div className="table sales-channels-table">
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
            <button type="button" className="ghost" onClick={addChannel}>
              + Adicionar canal
            </button>
          </div>
        ) : null}

        <div className="actions">
          <button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar configuracoes'}
          </button>
        </div>
      </div>

      {submitError ? <div className="panel"><p className="error">{submitError}</p></div> : null}
      <ConfirmDialog
        open={Boolean(userToDelete)}
        title="Remover acesso"
        message={`Deseja remover o acesso de ${userToDelete?.name || userToDelete?.email || 'este usuario'}?`}
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        onCancel={() => setUserToDelete(null)}
        onConfirm={handleDeleteAccess}
      />
      <LoadingOverlay open={saving} label="Salvando configuracoes..." />
    </div>
  );
};
