import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { BASE_ACTIVE_MODULES, isModuleKey, type AppModuleKey } from '../modules/common/modules.js';

const supabaseUrl = process.env.SUPABASE_URL ?? '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Supabase env vars are missing. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

export const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false }
});

export type AppUser = {
  id: string;
  auth_user_id: string;
  company_id: string;
  role: 'master' | 'admin' | 'common';
  access_blocked?: boolean;
};

const isModulesInfraMissing = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: string }).code ?? '') : '';
  const message = 'message' in error ? String((error as { message?: string }).message ?? '') : '';
  return code === '42P01' || code === 'PGRST205' || message.toLowerCase().includes('does not exist');
};

export const getAppUserByAuthId = async (authUserId: string) => {
  const { data, error } = await supabaseAdmin
    .from('app_users')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data as AppUser;
};

export const getCompanySettings = async (companyId: string) => {
  const { data, error } = await supabaseAdmin
    .from('company_settings')
    .select('*')
    .eq('company_id', companyId)
    .single();

  if (error) throw error;
  return data;
};

export const getSalesChannels = async (companyId: string) => {
  const { data, error } = await supabaseAdmin
    .from('sales_channels')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
};

export const getEnabledModulesForAccess = async (params: {
  companyId: string;
  authUserId: string;
}): Promise<AppModuleKey[]> => {
  const fallback = [...BASE_ACTIVE_MODULES];

  const { data: subscription, error: subscriptionError } = await supabaseAdmin
    .from('company_subscriptions')
    .select('plan_id, status')
    .eq('company_id', params.companyId)
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

  const enabledSet = new Set<AppModuleKey>(
    (planModules ?? [])
      .map((item) => String(item.module_key))
      .filter(isModuleKey)
  );

  const { data: userOverrides, error: userOverridesError } = await supabaseAdmin
    .from('user_module_overrides')
    .select('module_key, enabled')
    .eq('company_id', params.companyId)
    .eq('auth_user_id', params.authUserId);

  if (userOverridesError) {
    if (isModulesInfraMissing(userOverridesError)) {
      return [...enabledSet].length > 0 ? [...enabledSet] : fallback;
    }
    throw userOverridesError;
  }

  for (const item of userOverrides ?? []) {
    const moduleKey = String(item.module_key);
    if (!isModuleKey(moduleKey)) continue;
    if (item.enabled) enabledSet.add(moduleKey);
    else enabledSet.delete(moduleKey);
  }

  return [...enabledSet].length > 0 ? [...enabledSet] : fallback;
};
