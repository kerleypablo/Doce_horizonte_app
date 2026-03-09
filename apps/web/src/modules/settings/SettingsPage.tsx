import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';
import { apiFetch } from '../shared/api.ts';
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

type Settings = {
  companyName: string;
  companyCode?: string;
  companyPhone: string;
  companyEmail: string;
  pixKey: string;
  logoDataUrl: string;
  appTheme: 'caramelo' | 'oceano' | 'floresta';
  darkMode: boolean;
  defaultNotesDelivery: string;
  defaultNotesGeneral: string;
  defaultNotesPayment: string;
  overheadMethod: 'PERCENT_DIRECT' | 'PER_UNIT';
  overheadPercent: number;
  overheadPerUnit: number;
  laborCostPerHour: number;
  fixedCostPerHour: number;
  taxesPercent: number;
  defaultProfitPercent: number;
  salesChannels: SalesChannel[];
};

const themeOptions: Array<{ value: Settings['appTheme']; label: string }> = [
  { value: 'caramelo', label: 'Caramelo' },
  { value: 'oceano', label: 'Oceano' },
  { value: 'floresta', label: 'Floresta' }
];

export const SettingsPage = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const settingsQuery = useCachedQuery(
    queryKeys.companySettings,
    () => apiFetch<Settings>('/company/settings', { token: user?.token }),
    { staleTime: 5 * 60_000, enabled: Boolean(user?.token) }
  );

  useEffect(() => {
    if (settingsQuery.data) {
      setSettings(settingsQuery.data);
    }
  }, [settingsQuery.data]);

  useEffect(() => {
    if (!settings) return;
    document.documentElement.setAttribute('data-theme', settings.appTheme);
    document.documentElement.setAttribute('data-dark', settings.darkMode ? 'true' : 'false');
  }, [settings?.appTheme, settings?.darkMode]);

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
      document.documentElement.setAttribute('data-theme', settings.appTheme);
      document.documentElement.setAttribute('data-dark', settings.darkMode ? 'true' : 'false');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar configuracoes';
      setSubmitError(message);
    } finally {
      setSaving(false);
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

  return (
    <div className="page">
      <div className="panel">
        <h3>Aparencia do app</h3>
        <div className="settings-theme-grid">
          {themeOptions.map((theme) => (
            <button
              key={theme.value}
              type="button"
              className={settings.appTheme === theme.value ? 'settings-theme-option active' : 'settings-theme-option'}
              onClick={() => setSettings({ ...settings, appTheme: theme.value })}
            >
              {theme.label}
            </button>
          ))}
        </div>
        <label className="settings-switch">
          <span>Modo escuro</span>
          <input
            type="checkbox"
            checked={settings.darkMode}
            onChange={(e) => setSettings({ ...settings, darkMode: e.target.checked })}
          />
        </label>
      </div>

      <div className="panel">
        <h3>Observacoes padrao dos pedidos</h3>
        <div className="form">
          <label>
            Obs entrega/retirada
            <textarea
              rows={3}
              value={settings.defaultNotesDelivery}
              onChange={(e) => setSettings({ ...settings, defaultNotesDelivery: e.target.value })}
            />
          </label>
          <label>
            Obs gerais
            <textarea
              rows={3}
              value={settings.defaultNotesGeneral}
              onChange={(e) => setSettings({ ...settings, defaultNotesGeneral: e.target.value })}
            />
          </label>
          <label>
            Obs pagamento
            <textarea
              rows={3}
              value={settings.defaultNotesPayment}
              onChange={(e) => setSettings({ ...settings, defaultNotesPayment: e.target.value })}
            />
          </label>
        </div>
      </div>

      <div className="actions">
        <button type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar configuracoes'}
        </button>
      </div>
      {submitError ? <div className="panel"><p className="error">{submitError}</p></div> : null}
      <LoadingOverlay open={saving} label="Salvando configuracoes..." />
    </div>
  );
};
