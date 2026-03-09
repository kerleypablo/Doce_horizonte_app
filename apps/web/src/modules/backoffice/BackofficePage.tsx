import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';
import { apiFetch } from '../shared/api.ts';
import { SelectField } from '../shared/SelectField.tsx';
import { LoadingOverlay } from '../shared/LoadingOverlay.tsx';
import { invalidateQueryCache, useCachedQuery } from '../shared/queryCache.ts';
import { queryKeys } from '../shared/queryKeys.ts';

type AppModuleKey = 'cadastros' | 'pedidos' | 'empresa' | 'financeiro';

type DashboardCompany = {
  id: string;
  name: string;
  createdAt: string;
  subscription: {
    status: 'active' | 'paused' | 'canceled';
    updatedAt: string | null;
    planId: string | null;
    planCode: string | null;
    planName: string | null;
  };
  usersCount: number;
  blockedUsersCount: number;
};

type DashboardUser = {
  authUserId: string;
  companyId: string;
  companyName: string;
  role: 'master' | 'admin' | 'common';
  accessBlocked: boolean;
  email: string;
  name: string;
  avatarUrl: string;
  enabledModules: AppModuleKey[];
};

type ModuleDefinition = {
  key: AppModuleKey;
  name: string;
  premium: boolean;
  description: string;
};

type PlanDefinition = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  modules: AppModuleKey[];
};

type BackofficeDashboard = {
  modules: ModuleDefinition[];
  plans: PlanDefinition[];
  companies: DashboardCompany[];
  users: DashboardUser[];
};

export const BackofficePage = () => {
  const { user } = useAuth();
  const [companyId, setCompanyId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedModules, setSelectedModules] = useState<AppModuleKey[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingUser, setSavingUser] = useState(false);

  const dashboardQuery = useCachedQuery(
    queryKeys.companyPlans,
    () => apiFetch<BackofficeDashboard>('/backoffice/dashboard', { token: user?.token }),
    { staleTime: 60_000, enabled: Boolean(user?.token && user?.role === 'master') }
  );

  const companies = dashboardQuery.data?.companies ?? [];
  const plans = dashboardQuery.data?.plans ?? [];
  const modules = dashboardQuery.data?.modules ?? [];
  const users = dashboardQuery.data?.users ?? [];
  const usersOfCompany = users.filter((item) => item.companyId === companyId);

  const selectedCompany = useMemo(
    () => companies.find((item) => item.id === companyId) ?? null,
    [companies, companyId]
  );
  const selectedUser = useMemo(
    () => usersOfCompany.find((item) => item.authUserId === selectedUserId) ?? null,
    [usersOfCompany, selectedUserId]
  );

  useEffect(() => {
    if (!companies.length) {
      setCompanyId('');
      return;
    }
    setCompanyId((current) => (current && companies.some((item) => item.id === current) ? current : companies[0].id));
  }, [companies]);

  useEffect(() => {
    if (!selectedCompany) {
      setSelectedPlanId('');
      return;
    }
    setSelectedPlanId(selectedCompany.subscription.planId ?? plans[0]?.id ?? '');
  }, [selectedCompany, plans]);

  useEffect(() => {
    if (!usersOfCompany.length) {
      setSelectedUserId('');
      return;
    }
    setSelectedUserId((current) =>
      current && usersOfCompany.some((item) => item.authUserId === current) ? current : usersOfCompany[0].authUserId
    );
  }, [usersOfCompany]);

  useEffect(() => {
    setSelectedModules(selectedUser?.enabledModules ?? []);
  }, [selectedUser]);

  const refreshDashboard = async () => {
    invalidateQueryCache(queryKeys.companyPlans);
    await dashboardQuery.refetch();
  };

  const handleSavePlan = async () => {
    if (!companyId || !selectedPlanId) return;
    setSavingPlan(true);
    setSubmitError(null);
    try {
      await apiFetch(`/backoffice/companies/${companyId}/subscription`, {
        method: 'PUT',
        token: user?.token,
        body: JSON.stringify({ planId: selectedPlanId, status: 'active' })
      });
      await refreshDashboard();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Erro ao salvar plano');
    } finally {
      setSavingPlan(false);
    }
  };

  const handleSaveRole = async (role: 'admin' | 'common') => {
    if (!companyId || !selectedUserId) return;
    setSavingUser(true);
    setSubmitError(null);
    try {
      await apiFetch(`/backoffice/users/${selectedUserId}/role`, {
        method: 'PUT',
        token: user?.token,
        body: JSON.stringify({ companyId, role })
      });
      await refreshDashboard();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Erro ao salvar permissao');
    } finally {
      setSavingUser(false);
    }
  };

  const handleToggleBlocked = async (blocked: boolean) => {
    if (!companyId || !selectedUserId) return;
    setSavingUser(true);
    setSubmitError(null);
    try {
      await apiFetch(`/backoffice/users/${selectedUserId}/access`, {
        method: 'PUT',
        token: user?.token,
        body: JSON.stringify({ companyId, blocked })
      });
      await refreshDashboard();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Erro ao atualizar bloqueio');
    } finally {
      setSavingUser(false);
    }
  };

  const toggleModule = (key: AppModuleKey, enabled: boolean) => {
    setSelectedModules((current) => {
      const next = new Set(current);
      if (enabled) next.add(key);
      else next.delete(key);
      return [...next];
    });
  };

  const handleSaveModules = async () => {
    if (!companyId || !selectedUserId) return;
    setSavingUser(true);
    setSubmitError(null);
    try {
      await apiFetch(`/backoffice/users/${selectedUserId}/modules`, {
        method: 'PUT',
        token: user?.token,
        body: JSON.stringify({ companyId, enabledModules: selectedModules })
      });
      await refreshDashboard();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Erro ao salvar modulos');
    } finally {
      setSavingUser(false);
    }
  };

  if (user?.role !== 'master') {
    return (
      <div className="panel">
        <h3>Acesso restrito</h3>
        <p>Somente master pode acessar o backoffice.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="panel">
        <h3>Backoffice</h3>
        <p className="muted">Visao global de empresas, usuarios e acessos.</p>
        <label>
          Empresa
          <SelectField
            value={companyId}
            onChange={(value) => setCompanyId(value)}
            options={companies.map((item) => ({
              value: item.id,
              label: `${item.name} (${item.usersCount} usuarios)`
            }))}
          />
        </label>
        {selectedCompany ? (
          <div className="summary">
            <div><span>Plano atual</span><strong>{selectedCompany.subscription.planName ?? '-'}</strong></div>
            <div><span>Status</span><strong>{selectedCompany.subscription.status}</strong></div>
            <div><span>Usuarios bloqueados</span><strong>{selectedCompany.blockedUsersCount}</strong></div>
          </div>
        ) : null}
      </div>

      <div className="panel">
        <h3>Plano da empresa</h3>
        <div className="form">
          <label>
            Plano
            <SelectField
              value={selectedPlanId}
              onChange={(value) => setSelectedPlanId(value)}
              options={plans.map((plan) => ({ value: plan.id, label: `${plan.name} (${plan.code})` }))}
            />
          </label>
          <div className="actions">
            <button type="button" className="ghost" onClick={handleSavePlan} disabled={savingPlan || !selectedPlanId}>
              {savingPlan ? 'Salvando plano...' : 'Salvar plano'}
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Usuario</h3>
        <label>
          Usuario da empresa
          <SelectField
            value={selectedUserId}
            onChange={(value) => setSelectedUserId(value)}
            options={usersOfCompany.map((item) => ({
              value: item.authUserId,
              label: `${item.name || item.email || item.authUserId} (${item.role})`
            }))}
          />
        </label>

        {selectedUser ? (
          <>
            <div className="grid-2">
              <label>
                Role
                <SelectField
                  value={selectedUser.role === 'common' ? 'common' : 'admin'}
                  onChange={(value) => handleSaveRole(value as 'admin' | 'common')}
                  options={[
                    { value: 'admin', label: 'Admin' },
                    { value: 'common', label: 'Comum' }
                  ]}
                  disabled={selectedUser.role === 'master'}
                />
              </label>
              <label className="settings-switch">
                <span>Bloqueado</span>
                <input
                  type="checkbox"
                  checked={selectedUser.accessBlocked}
                  onChange={(event) => handleToggleBlocked(event.target.checked)}
                />
              </label>
            </div>

            <h3>Modulos desse usuario</h3>
            <div className="form">
              {modules.map((module) => (
                <label key={module.key} className="settings-switch">
                  <span>{module.name}</span>
                  <input
                    type="checkbox"
                    checked={selectedModules.includes(module.key)}
                    onChange={(event) => toggleModule(module.key, event.target.checked)}
                  />
                </label>
              ))}
            </div>
            <div className="actions">
              <button type="button" className="ghost" onClick={handleSaveModules} disabled={savingUser || !selectedUserId}>
                {savingUser ? 'Salvando modulos...' : 'Salvar modulos'}
              </button>
            </div>
          </>
        ) : (
          <p>Nenhum usuario nesta empresa.</p>
        )}
      </div>

      {submitError ? <div className="panel"><p className="error">{submitError}</p></div> : null}
      <LoadingOverlay open={savingPlan || savingUser || dashboardQuery.loading} label="Processando..." />
    </div>
  );
};
