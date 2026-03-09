import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';
import { MODULE_DEFINITIONS, MODULE_KEYS, isModuleKey, type AppModuleKey } from '../common/modules.js';

const salesChannelSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2),
  feePercent: z.number().min(0),
  paymentFeePercent: z.number().min(0),
  feeFixed: z.number().min(0),
  active: z.boolean()
});

const settingsSchema = z.object({
  companyName: z.string().min(2).optional(),
  companyPhone: z.string().optional(),
  companyEmail: z.string().optional(),
  pixKey: z.string().optional(),
  logoDataUrl: z.string().optional(),
  appTheme: z.enum(['caramelo', 'oceano', 'floresta']).optional(),
  darkMode: z.boolean().optional(),
  defaultNotesDelivery: z.string().optional(),
  defaultNotesGeneral: z.string().optional(),
  defaultNotesPayment: z.string().optional(),
  overheadMethod: z.enum(['PERCENT_DIRECT', 'PER_UNIT']),
  overheadPercent: z.number().min(0),
  overheadPerUnit: z.number().min(0),
  laborCostPerHour: z.number().min(0),
  fixedCostPerHour: z.number().min(0),
  taxesPercent: z.number().min(0),
  defaultProfitPercent: z.number().min(0),
  salesChannels: z.array(salesChannelSchema)
});

const userRoleSchema = z.object({
  role: z.enum(['admin', 'common'])
});

const userParamsSchema = z.object({
  authUserId: z.string().min(1)
});

const moduleOverrideSchema = z.object({
  enabledModules: z.array(z.enum(MODULE_KEYS)).default([])
});

const subscriptionSchema = z.object({
  planId: z.string().uuid().optional(),
  planCode: z.string().min(1).optional(),
  status: z.enum(['active', 'paused', 'canceled']).default('active')
}).refine((data) => Boolean(data.planId || data.planCode), {
  message: 'Informe planId ou planCode'
});

const isModulesInfraMissing = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: string }).code ?? '') : '';
  const message = 'message' in error ? String((error as { message?: string }).message ?? '') : '';
  return code === '42P01' || code === 'PGRST205' || message.toLowerCase().includes('does not exist');
};

const hasAdminAccess = (role: string) => role === 'admin' || role === 'master';
const isMasterAccess = (role: string) => role === 'master';

export const companyRoutes = async (app: FastifyInstance) => {
  const empresaGuard = { preHandler: [app.authenticate, app.requireModule('empresa')] };

  app.get('/company/settings', empresaGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;

    const { data: settings } = await supabaseAdmin
      .from('company_settings')
      .select('*')
      .eq('company_id', auth.companyId)
      .single();

    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('id, name')
      .eq('id', auth.companyId)
      .single();

    if (!settings) return reply.status(404).send({ message: 'Empresa nao encontrada' });

    const { data: channels } = await supabaseAdmin
      .from('sales_channels')
      .select('*')
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: true });

    return {
      companyName: company?.name ?? 'Minha empresa',
      companyCode: company?.id ? company.id.replace(/-/g, '').slice(0, 8).toUpperCase() : '',
      companyPhone: settings.company_phone ?? '',
      companyEmail: settings.company_email ?? '',
      pixKey: settings.pix_key ?? '',
      logoDataUrl: settings.logo_data_url ?? '',
      appTheme: settings.app_theme ?? 'caramelo',
      darkMode: settings.dark_mode ?? false,
      defaultNotesDelivery: settings.default_notes_delivery ?? '',
      defaultNotesGeneral: settings.default_notes_general ?? '',
      defaultNotesPayment: settings.default_notes_payment ?? '',
      overheadMethod: settings.overhead_method,
      overheadPercent: settings.overhead_percent,
      overheadPerUnit: settings.overhead_per_unit,
      laborCostPerHour: settings.labor_cost_per_hour,
      fixedCostPerHour: settings.fixed_cost_per_hour,
      taxesPercent: settings.taxes_percent,
      defaultProfitPercent: settings.default_profit_percent,
      salesChannels: (channels ?? []).map((channel) => ({
        id: channel.id,
        name: channel.name,
        feePercent: channel.fee_percent,
        paymentFeePercent: channel.payment_fee_percent,
        feeFixed: channel.fee_fixed,
        active: channel.active
      }))
    };
  });

  app.put('/company/settings', empresaGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string; role: string } }).auth;
    if (!hasAdminAccess(auth.role)) return reply.status(403).send({ message: 'Apenas admin' });

    const data = settingsSchema.parse(request.body);

    if (data.companyName) {
      const { error: companyError } = await supabaseAdmin
        .from('companies')
        .update({ name: data.companyName })
        .eq('id', auth.companyId);

      if (companyError) return reply.status(400).send({ message: 'Erro ao salvar nome da empresa' });
    }

    const { error: settingsError } = await supabaseAdmin
      .from('company_settings')
      .upsert({
        company_id: auth.companyId,
        company_phone: data.companyPhone ?? '',
        company_email: data.companyEmail ?? '',
        pix_key: data.pixKey ?? '',
        logo_data_url: data.logoDataUrl ?? '',
        app_theme: data.appTheme ?? 'caramelo',
        dark_mode: data.darkMode ?? false,
        default_notes_delivery: data.defaultNotesDelivery ?? '',
        default_notes_general: data.defaultNotesGeneral ?? '',
        default_notes_payment: data.defaultNotesPayment ?? '',
        overhead_method: data.overheadMethod,
        overhead_percent: data.overheadPercent,
        overhead_per_unit: data.overheadPerUnit,
        labor_cost_per_hour: data.laborCostPerHour,
        fixed_cost_per_hour: data.fixedCostPerHour,
        taxes_percent: data.taxesPercent,
        default_profit_percent: data.defaultProfitPercent
      }, { onConflict: 'company_id' });

    if (settingsError) {
      const { error: legacyError } = await supabaseAdmin
        .from('company_settings')
        .upsert({
          company_id: auth.companyId,
          overhead_method: data.overheadMethod,
          overhead_percent: data.overheadPercent,
          overhead_per_unit: data.overheadPerUnit,
          labor_cost_per_hour: data.laborCostPerHour,
          fixed_cost_per_hour: data.fixedCostPerHour,
          taxes_percent: data.taxesPercent,
          default_profit_percent: data.defaultProfitPercent
        }, { onConflict: 'company_id' });

      if (legacyError) return reply.status(400).send({ message: 'Erro ao salvar configuracoes' });
    }

    const existing = await supabaseAdmin
      .from('sales_channels')
      .select('id')
      .eq('company_id', auth.companyId);

    const existingIds = new Set((existing.data ?? []).map((c) => c.id));
    const incomingIds = new Set(data.salesChannels.map((c) => c.id).filter(Boolean));

    const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
    if (toDelete.length > 0) {
      await supabaseAdmin.from('sales_channels').delete().in('id', toDelete);
    }

    for (const channel of data.salesChannels) {
      await supabaseAdmin.from('sales_channels').upsert({
        id: channel.id,
        company_id: auth.companyId,
        name: channel.name,
        fee_percent: channel.feePercent,
        payment_fee_percent: channel.paymentFeePercent,
        fee_fixed: channel.feeFixed,
        active: channel.active
      });
    }

    return reply.send({
      ...data,
      companyName: data.companyName ?? undefined
    });
  });

  app.get('/company/plans', empresaGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string; role: string } }).auth;
    if (!isMasterAccess(auth.role)) return reply.status(403).send({ message: 'Apenas master' });

    const { data: modulesData, error: modulesError } = await supabaseAdmin
      .from('module_catalog')
      .select('key, name, premium, description, active')
      .order('created_at', { ascending: true });

    if (modulesError && !isModulesInfraMissing(modulesError)) {
      return reply.status(400).send({ message: 'Erro ao carregar modulos', detail: modulesError.message });
    }

    const modules = modulesError
      ? MODULE_DEFINITIONS.map((item) => ({ ...item, active: true }))
      : (modulesData ?? [])
          .map((item) => ({
            key: String(item.key),
            name: String(item.name),
            premium: Boolean(item.premium),
            description: String(item.description ?? ''),
            active: Boolean(item.active)
          }))
          .filter((item) => isModuleKey(item.key));

    const { data: plansData, error: plansError } = await supabaseAdmin
      .from('plan_catalog')
      .select('id, code, name, active, created_at')
      .order('created_at', { ascending: true });

    if (plansError && !isModulesInfraMissing(plansError)) {
      return reply.status(400).send({ message: 'Erro ao carregar planos', detail: plansError.message });
    }

    const plansList = plansError
      ? [{ id: 'base', code: 'base', name: 'Plano Base', active: true, created_at: null }]
      : (plansData ?? []);

    const planIds = plansList.map((plan) => String(plan.id));

    let modulesByPlan = new Map<string, AppModuleKey[]>();
    if (planIds.length > 0 && !plansError) {
      const { data: planModules, error: planModulesError } = await supabaseAdmin
        .from('plan_modules')
        .select('plan_id, module_key')
        .in('plan_id', planIds);

      if (planModulesError && !isModulesInfraMissing(planModulesError)) {
        return reply.status(400).send({ message: 'Erro ao carregar modulos do plano', detail: planModulesError.message });
      }

      modulesByPlan = (planModules ?? []).reduce((acc, item) => {
        const planId = String(item.plan_id);
        const moduleKey = String(item.module_key);
        if (!isModuleKey(moduleKey)) return acc;
        const current = acc.get(planId) ?? [];
        current.push(moduleKey);
        acc.set(planId, current);
        return acc;
      }, new Map<string, AppModuleKey[]>());
    } else {
      modulesByPlan.set('base', ['cadastros', 'pedidos', 'empresa']);
    }

    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from('company_subscriptions')
      .select('plan_id, status, updated_at')
      .eq('company_id', auth.companyId)
      .maybeSingle();

    if (subscriptionError && !isModulesInfraMissing(subscriptionError)) {
      return reply.status(400).send({ message: 'Erro ao carregar assinatura', detail: subscriptionError.message });
    }

    const plans = plansList.map((plan) => {
      const id = String(plan.id);
      return {
        id,
        code: String(plan.code),
        name: String(plan.name),
        active: Boolean(plan.active),
        modules: modulesByPlan.get(id) ?? []
      };
    });

    const currentPlan = plans.find((plan) => plan.id === subscription?.plan_id) ?? plans[0] ?? null;

    return reply.send({
      modules,
      plans,
      subscription: {
        planId: currentPlan?.id ?? null,
        planCode: currentPlan?.code ?? null,
        status: subscription?.status ?? 'active',
        updatedAt: subscription?.updated_at ?? null
      }
    });
  });

  app.put('/company/subscription', empresaGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string; role: string } }).auth;
    if (!isMasterAccess(auth.role)) return reply.status(403).send({ message: 'Apenas master' });

    const data = subscriptionSchema.parse(request.body);

    let planQuery = supabaseAdmin
      .from('plan_catalog')
      .select('id, code, name, active')
      .eq('active', true)
      .limit(1);

    if (data.planId) {
      planQuery = planQuery.eq('id', data.planId);
    } else if (data.planCode) {
      planQuery = planQuery.eq('code', data.planCode);
    }

    const { data: foundPlan, error: planError } = await planQuery.maybeSingle();
    if (planError) return reply.status(400).send({ message: 'Erro ao carregar plano', detail: planError.message });
    if (!foundPlan) return reply.status(404).send({ message: 'Plano nao encontrado' });

    const { error: upsertError } = await supabaseAdmin
      .from('company_subscriptions')
      .upsert({
        company_id: auth.companyId,
        plan_id: foundPlan.id,
        status: data.status
      }, { onConflict: 'company_id' });

    if (upsertError) return reply.status(400).send({ message: 'Erro ao atualizar assinatura', detail: upsertError.message });

    return reply.send({
      ok: true,
      subscription: {
        planId: foundPlan.id,
        planCode: foundPlan.code,
        status: data.status
      }
    });
  });

  app.get('/company/users', empresaGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string; role: string } }).auth;
    if (!hasAdminAccess(auth.role)) return reply.status(403).send({ message: 'Apenas admin' });

    const { data: appUsers, error } = await supabaseAdmin
      .from('app_users')
      .select('auth_user_id, role, created_at')
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: true });

    if (error) {
      return reply.status(400).send({ message: 'Erro ao carregar usuarios', detail: error.message });
    }

    const { data: overridesData, error: overridesError } = await supabaseAdmin
      .from('user_module_overrides')
      .select('auth_user_id, module_key, enabled')
      .eq('company_id', auth.companyId);

    if (overridesError && !isModulesInfraMissing(overridesError)) {
      return reply.status(400).send({ message: 'Erro ao carregar modulos por usuario', detail: overridesError.message });
    }

    const overridesByUser = (overridesData ?? []).reduce((acc, item) => {
      const authUserId = String(item.auth_user_id);
      const moduleKey = String(item.module_key);
      if (!isModuleKey(moduleKey)) return acc;
      const current = acc.get(authUserId) ?? [];
      current.push({ moduleKey, enabled: Boolean(item.enabled) });
      acc.set(authUserId, current);
      return acc;
    }, new Map<string, Array<{ moduleKey: AppModuleKey; enabled: boolean }>>());

    const users = await Promise.all(
      (appUsers ?? []).map(async (item) => {
        const authResult = await supabaseAdmin.auth.admin.getUserById(item.auth_user_id);
        const authUser = authResult.data.user;
        return {
          authUserId: item.auth_user_id,
          role: item.role,
          createdAt: item.created_at,
          email: authUser?.email ?? '',
          name: (authUser?.user_metadata?.full_name as string | undefined) ?? '',
          avatarUrl: (authUser?.user_metadata?.avatar_url as string | undefined) ?? '',
          moduleOverrides: overridesByUser.get(item.auth_user_id) ?? []
        };
      })
    );

    return reply.send(users);
  });

  app.put('/company/users/:authUserId/role', empresaGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { userId: string; companyId: string; role: string } }).auth;
    if (!hasAdminAccess(auth.role)) return reply.status(403).send({ message: 'Apenas admin' });

    const params = userParamsSchema.parse(request.params);
    const data = userRoleSchema.parse(request.body);

    if (params.authUserId === auth.userId && data.role !== 'admin') {
      return reply.status(400).send({ message: 'Voce nao pode remover seu proprio acesso de admin' });
    }

    const { data: updatedRows, error } = await supabaseAdmin
      .from('app_users')
      .update({ role: data.role })
      .eq('auth_user_id', params.authUserId)
      .eq('company_id', auth.companyId)
      .select('auth_user_id');

    if (error) {
      return reply.status(400).send({ message: 'Erro ao atualizar permissao', detail: error.message });
    }

    if (!updatedRows || updatedRows.length === 0) {
      return reply.status(404).send({ message: 'Usuario nao encontrado nesta empresa' });
    }

    return reply.send({ ok: true });
  });

  app.delete('/company/users/:authUserId', empresaGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { userId: string; companyId: string; role: string } }).auth;
    if (!hasAdminAccess(auth.role)) return reply.status(403).send({ message: 'Apenas admin' });

    const params = userParamsSchema.parse(request.params);
    if (params.authUserId === auth.userId) {
      return reply.status(400).send({ message: 'Voce nao pode remover seu proprio acesso' });
    }

    const { data: removedRows, error } = await supabaseAdmin
      .from('app_users')
      .delete()
      .eq('auth_user_id', params.authUserId)
      .eq('company_id', auth.companyId)
      .select('auth_user_id');

    if (error) {
      return reply.status(400).send({ message: 'Erro ao remover acesso', detail: error.message });
    }

    if (!removedRows || removedRows.length === 0) {
      return reply.status(404).send({ message: 'Usuario nao encontrado nesta empresa' });
    }

    return reply.status(204).send();
  });

  app.put('/company/users/:authUserId/module-access', empresaGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string; role: string } }).auth;
    if (!isMasterAccess(auth.role)) return reply.status(403).send({ message: 'Apenas master' });

    const params = userParamsSchema.parse(request.params);
    const data = moduleOverrideSchema.parse(request.body);

    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from('company_subscriptions')
      .select('plan_id, status')
      .eq('company_id', auth.companyId)
      .maybeSingle();

    if (subscriptionError && !isModulesInfraMissing(subscriptionError)) {
      return reply.status(400).send({ message: 'Erro ao carregar assinatura', detail: subscriptionError.message });
    }

    const baseModules = new Set<AppModuleKey>(['cadastros', 'pedidos', 'empresa']);

    if (subscription?.plan_id && subscription.status === 'active') {
      const { data: planModules, error: planModulesError } = await supabaseAdmin
        .from('plan_modules')
        .select('module_key')
        .eq('plan_id', subscription.plan_id);

      if (planModulesError && !isModulesInfraMissing(planModulesError)) {
        return reply.status(400).send({ message: 'Erro ao carregar modulos base do plano', detail: planModulesError.message });
      }

      if (!planModulesError) {
        baseModules.clear();
        for (const item of planModules ?? []) {
          const key = String(item.module_key);
          if (isModuleKey(key)) baseModules.add(key);
        }
      }
    }

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
          company_id: auth.companyId,
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
        .eq('company_id', auth.companyId)
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
