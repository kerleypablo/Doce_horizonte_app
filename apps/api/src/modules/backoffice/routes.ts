import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getEnabledModulesForAccess, supabaseAdmin } from '../../db/supabase.js';
import { MODULE_DEFINITIONS, MODULE_KEYS, isModuleKey, type AppModuleKey } from '../common/modules.js';

const companyParamsSchema = z.object({
  companyId: z.string().uuid()
});

const userParamsSchema = z.object({
  authUserId: z.string().uuid()
});

const roleSchema = z.object({
  companyId: z.string().uuid(),
  role: z.enum(['admin', 'common'])
});

const accessSchema = z.object({
  companyId: z.string().uuid(),
  blocked: z.boolean()
});

const modulesSchema = z.object({
  companyId: z.string().uuid(),
  enabledModules: z.array(z.enum(MODULE_KEYS)).default([])
});

const subscriptionSchema = z.object({
  planId: z.string().uuid(),
  status: z.enum(['active', 'paused', 'canceled']).default('active')
});

const isModulesInfraMissing = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: string }).code ?? '') : '';
  const message = 'message' in error ? String((error as { message?: string }).message ?? '') : '';
  return code === '42P01' || code === 'PGRST205' || message.toLowerCase().includes('does not exist');
};

const loadBaseModulesForCompany = async (companyId: string): Promise<Set<AppModuleKey>> => {
  const fallback = new Set<AppModuleKey>(['cadastros', 'pedidos', 'empresa']);

  const { data: subscription, error: subscriptionError } = await supabaseAdmin
    .from('company_subscriptions')
    .select('plan_id, status')
    .eq('company_id', companyId)
    .maybeSingle();

  if (subscriptionError) {
    if (isModulesInfraMissing(subscriptionError)) return fallback;
    throw subscriptionError;
  }

  if (!subscription || subscription.status !== 'active') return fallback;

  const { data: planModules, error: planModulesError } = await supabaseAdmin
    .from('plan_modules')
    .select('module_key')
    .eq('plan_id', subscription.plan_id);

  if (planModulesError) {
    if (isModulesInfraMissing(planModulesError)) return fallback;
    throw planModulesError;
  }

  const keys = new Set<AppModuleKey>();
  for (const item of planModules ?? []) {
    const key = String(item.module_key);
    if (isModuleKey(key)) keys.add(key);
  }
  return keys.size > 0 ? keys : fallback;
};

export const backofficeRoutes = async (app: FastifyInstance) => {
  const backofficeGuard = { preHandler: [app.authenticate, app.authorize('master')] };

  app.get('/backoffice/dashboard', backofficeGuard, async () => {
    const { data: companiesData, error: companiesError } = await supabaseAdmin
      .from('companies')
      .select('id, name, created_at')
      .order('created_at', { ascending: true });
    if (companiesError) throw companiesError;

    const { data: appUsers, error: usersError } = await supabaseAdmin
      .from('app_users')
      .select('auth_user_id, company_id, role, created_at, access_blocked')
      .order('created_at', { ascending: true });
    if (usersError) throw usersError;

    const { data: plansData, error: plansError } = await supabaseAdmin
      .from('plan_catalog')
      .select('id, code, name, active, created_at')
      .order('created_at', { ascending: true });
    if (plansError && !isModulesInfraMissing(plansError)) throw plansError;

    const plansList = plansError
      ? [{ id: 'base', code: 'base', name: 'Plano Base', active: true, created_at: null }]
      : (plansData ?? []);

    const planIds = plansList.map((plan) => String(plan.id));
    const { data: planModules, error: planModulesError } = planIds.length > 0
      ? await supabaseAdmin
          .from('plan_modules')
          .select('plan_id, module_key')
          .in('plan_id', planIds)
      : { data: [], error: null };
    if (planModulesError && !isModulesInfraMissing(planModulesError)) throw planModulesError;

    const modulesByPlan = (planModules ?? []).reduce((acc, item) => {
      const planId = String(item.plan_id);
      const key = String(item.module_key);
      if (!isModuleKey(key)) return acc;
      const current = acc.get(planId) ?? [];
      current.push(key);
      acc.set(planId, current);
      return acc;
    }, new Map<string, AppModuleKey[]>());

    const { data: subscriptions, error: subscriptionsError } = await supabaseAdmin
      .from('company_subscriptions')
      .select('company_id, plan_id, status, updated_at');
    if (subscriptionsError && !isModulesInfraMissing(subscriptionsError)) throw subscriptionsError;

    const companiesById = new Map((companiesData ?? []).map((item) => [item.id, item]));
    const subscriptionsByCompany = new Map((subscriptions ?? []).map((item) => [item.company_id, item]));

    const users = await Promise.all(
      (appUsers ?? []).map(async (item) => {
        const authResult = await supabaseAdmin.auth.admin.getUserById(item.auth_user_id);
        const authUser = authResult.data.user;
        const enabledModules = await getEnabledModulesForAccess({
          companyId: item.company_id,
          authUserId: item.auth_user_id
        });
        return {
          authUserId: item.auth_user_id,
          companyId: item.company_id,
          companyName: companiesById.get(item.company_id)?.name ?? 'Empresa',
          role: item.role as 'master' | 'admin' | 'common',
          accessBlocked: Boolean(item.access_blocked),
          createdAt: item.created_at,
          email: authUser?.email ?? '',
          name: (authUser?.user_metadata?.full_name as string | undefined) ?? '',
          avatarUrl: (authUser?.user_metadata?.avatar_url as string | undefined) ?? '',
          enabledModules
        };
      })
    );

    const usersByCompany = users.reduce((acc, item) => {
      const current = acc.get(item.companyId) ?? [];
      current.push(item);
      acc.set(item.companyId, current);
      return acc;
    }, new Map<string, typeof users>());

    const companies = (companiesData ?? []).map((company) => {
      const subscription = subscriptionsByCompany.get(company.id);
      const plan = plansList.find((item) => item.id === subscription?.plan_id) ?? null;
      const list = usersByCompany.get(company.id) ?? [];
      return {
        id: company.id,
        name: company.name,
        createdAt: company.created_at,
        subscription: {
          status: subscription?.status ?? 'active',
          updatedAt: subscription?.updated_at ?? null,
          planId: plan?.id ?? null,
          planCode: plan?.code ?? 'base',
          planName: plan?.name ?? 'Plano Base'
        },
        usersCount: list.length,
        blockedUsersCount: list.filter((user) => user.accessBlocked).length
      };
    });

    const plans = plansList.map((plan) => ({
      id: String(plan.id),
      code: String(plan.code),
      name: String(plan.name),
      active: Boolean(plan.active),
      modules: modulesByPlan.get(String(plan.id)) ?? ['cadastros', 'pedidos', 'empresa']
    }));

    return {
      modules: MODULE_DEFINITIONS,
      plans,
      companies,
      users
    };
  });

  app.put('/backoffice/companies/:companyId/subscription', backofficeGuard, async (request, reply) => {
    const params = companyParamsSchema.parse(request.params);
    const data = subscriptionSchema.parse(request.body);

    const { data: foundPlan, error: planError } = await supabaseAdmin
      .from('plan_catalog')
      .select('id, code, active')
      .eq('id', data.planId)
      .eq('active', true)
      .maybeSingle();

    if (planError) return reply.status(400).send({ message: 'Erro ao carregar plano', detail: planError.message });
    if (!foundPlan) return reply.status(404).send({ message: 'Plano nao encontrado' });

    const { error: upsertError } = await supabaseAdmin
      .from('company_subscriptions')
      .upsert({
        company_id: params.companyId,
        plan_id: foundPlan.id,
        status: data.status
      }, { onConflict: 'company_id' });

    if (upsertError) return reply.status(400).send({ message: 'Erro ao atualizar assinatura', detail: upsertError.message });
    return reply.send({ ok: true });
  });

  app.put('/backoffice/users/:authUserId/role', backofficeGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { userId: string } }).auth;
    const params = userParamsSchema.parse(request.params);
    const data = roleSchema.parse(request.body);

    if (params.authUserId === auth.userId && data.role !== 'admin') {
      return reply.status(400).send({ message: 'Voce nao pode remover seu proprio acesso de admin' });
    }

    const { data: updatedRows, error } = await supabaseAdmin
      .from('app_users')
      .update({ role: data.role })
      .eq('auth_user_id', params.authUserId)
      .eq('company_id', data.companyId)
      .select('auth_user_id');

    if (error) return reply.status(400).send({ message: 'Erro ao atualizar permissao', detail: error.message });
    if (!updatedRows || updatedRows.length === 0) return reply.status(404).send({ message: 'Usuario nao encontrado nesta empresa' });
    return reply.send({ ok: true });
  });

  app.put('/backoffice/users/:authUserId/access', backofficeGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { userId: string } }).auth;
    const params = userParamsSchema.parse(request.params);
    const data = accessSchema.parse(request.body);

    if (params.authUserId === auth.userId && data.blocked) {
      return reply.status(400).send({ message: 'Voce nao pode bloquear seu proprio acesso' });
    }

    const { data: updatedRows, error } = await supabaseAdmin
      .from('app_users')
      .update({ access_blocked: data.blocked })
      .eq('auth_user_id', params.authUserId)
      .eq('company_id', data.companyId)
      .select('auth_user_id');

    if (error) return reply.status(400).send({ message: 'Erro ao atualizar acesso', detail: error.message });
    if (!updatedRows || updatedRows.length === 0) return reply.status(404).send({ message: 'Usuario nao encontrado nesta empresa' });
    return reply.send({ ok: true });
  });

  app.put('/backoffice/users/:authUserId/modules', backofficeGuard, async (request, reply) => {
    const params = userParamsSchema.parse(request.params);
    const data = modulesSchema.parse(request.body);

    const baseModules = await loadBaseModulesForCompany(data.companyId);
    const targetModules = new Set<AppModuleKey>(data.enabledModules);
    const changedKeys = new Set<AppModuleKey>([...baseModules, ...targetModules]);

    const overridesToUpsert: Array<{
      company_id: string;
      auth_user_id: string;
      module_key: AppModuleKey;
      enabled: boolean;
    }> = [];
    const overrideKeysToDelete: AppModuleKey[] = [];

    for (const key of changedKeys) {
      const baseEnabled = baseModules.has(key);
      const targetEnabled = targetModules.has(key);
      if (baseEnabled === targetEnabled) {
        overrideKeysToDelete.push(key);
      } else {
        overridesToUpsert.push({
          company_id: data.companyId,
          auth_user_id: params.authUserId,
          module_key: key,
          enabled: targetEnabled
        });
      }
    }

    if (overrideKeysToDelete.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from('user_module_overrides')
        .delete()
        .eq('company_id', data.companyId)
        .eq('auth_user_id', params.authUserId)
        .in('module_key', overrideKeysToDelete);

      if (deleteError && !isModulesInfraMissing(deleteError)) {
        return reply.status(400).send({ message: 'Erro ao limpar overrides', detail: deleteError.message });
      }
    }

    if (overridesToUpsert.length > 0) {
      const { error: upsertError } = await supabaseAdmin
        .from('user_module_overrides')
        .upsert(overridesToUpsert, { onConflict: 'company_id,auth_user_id,module_key' });

      if (upsertError && !isModulesInfraMissing(upsertError)) {
        return reply.status(400).send({ message: 'Erro ao salvar overrides', detail: upsertError.message });
      }
    }

    return reply.send({ ok: true });
  });
};
