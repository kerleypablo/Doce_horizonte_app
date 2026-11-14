import { supabaseAdmin } from '../../db/supabase.js';
import { isModuleKey, type AppModuleKey } from '../common/modules.js';

// Deliberately independent of the legacy fallback-based authorization.
export async function getMcpModules(companyId: string, userId: string): Promise<AppModuleKey[]> {
  const { data: subscription, error: subscriptionError } = await supabaseAdmin.from('company_subscriptions')
    .select('plan_id,status').eq('company_id', companyId).maybeSingle();
  if (subscriptionError) throw new Error('Autorizacao MCP indisponivel');
  if (!subscription || subscription.status !== 'active' || !subscription.plan_id) return [];
  const { data: plan, error: planError } = await supabaseAdmin.from('plan_modules')
    .select('module_key').eq('plan_id', subscription.plan_id);
  if (planError || !plan) throw new Error('Autorizacao MCP indisponivel');
  const { data: overrides, error: overrideError } = await supabaseAdmin.from('user_module_overrides')
    .select('module_key,enabled').eq('company_id', companyId).eq('auth_user_id', userId);
  if (overrideError || !overrides) throw new Error('Autorizacao MCP indisponivel');
  const modules = new Set<AppModuleKey>(plan.map(row => String(row.module_key)).filter(isModuleKey));
  for (const row of overrides) {
    const key = String(row.module_key);
    if (!isModuleKey(key)) continue;
    if (row.enabled === true) modules.add(key);
    else if (row.enabled === false) modules.delete(key);
    else throw new Error('Autorizacao MCP indisponivel');
  }
  return modules.has('mcp') ? [...modules] : [];
}
