import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';
import { apiFetch } from '../shared/api.ts';
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

type Settings = {
  companyName: string;
  companyCode?: string;
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

type CompanyUser = {
  authUserId: string;
  email: string;
  name: string;
  avatarUrl: string;
  role: 'admin' | 'common';
  createdAt?: string;
};

const themeOptions: Array<{ value: Settings['appTheme']; label: string }> = [
  { value: 'caramelo', label: 'Caramelo' },
  { value: 'oceano', label: 'Oceano' },
  { value: 'floresta', label: 'Floresta' }
];

export const SettingsPage = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [roleSavingUserId, setRoleSavingUserId] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<CompanyUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const settingsQuery = useCachedQuery(
    queryKeys.companySettings,
    () => apiFetch<Settings>('/company/settings', { token: user?.token }),
    { staleTime: 5 * 60_000, enabled: Boolean(user?.token) }
  );
  const usersQuery = useCachedQuery(
    queryKeys.companyUsers,
    () => apiFetch<CompanyUser[]>('/company/users', { token: user?.token }),
    { staleTime: 60_000, enabled: Boolean(user?.token && user?.role === 'admin') }
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
      document.documentElement.setAttribute('data-theme', settings.appTheme);
      document.documentElement.setAttribute('data-dark', settings.darkMode ? 'true' : 'false');
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

  if (user?.role !== 'admin') {
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
        <h3>Configuracoes gerais</h3>
        <div className="form">
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
          <label>
            Logo da empresa
            <input type="file" accept="image/*" onChange={(e) => handleLogoUpload(e.target.files)} />
          </label>
          {settings.logoDataUrl ? (
            <div className="settings-logo-preview">
              <img src={settings.logoDataUrl} alt="Logo da empresa" />
            </div>
          ) : null}
        </div>
      </div>

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
                    disabled={roleSavingUserId === companyUser.authUserId}
                  />
                </label>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setUserToDelete(companyUser)}
                  disabled={roleSavingUserId === companyUser.authUserId}
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
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
