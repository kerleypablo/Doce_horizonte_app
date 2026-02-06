import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

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
  role: 'admin' | 'common';
};

export const getAppUserByAuthId = async (authUserId: string) => {
  const { data, error } = await supabaseAdmin
    .from('app_users')
    .select('id, auth_user_id, company_id, role')
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
