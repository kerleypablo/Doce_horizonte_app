import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';

const schema = z.object({
  companyName: z.string().min(2)
});

const joinSchema = z.object({
  companyCode: z.string().min(4)
});

const getCompanyCodeFromId = (companyId: string) => companyId.replace(/-/g, '').slice(0, 8).toUpperCase();
const normalizeCompanyCode = (value: string) => value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

export const onboardingRoutes = async (app: FastifyInstance) => {
  app.post('/onboarding/company', { preHandler: app.authenticateSupabase }, async (request, reply) => {
    const data = schema.parse(request.body);
    const authUserId = (request as typeof request & { authUserId: string }).authUserId;

    const { data: existing } = await supabaseAdmin
      .from('app_users')
      .select('company_id')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (existing?.company_id) {
      return reply.send({ companyId: existing.company_id, alreadyLinked: true });
    }

    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .insert({ name: data.companyName })
      .select('*')
      .single();

    if (companyError || !company) {
      return reply.status(400).send({ message: 'Erro ao criar empresa', detail: companyError?.message });
    }

    const { error: settingsError } = await supabaseAdmin.from('company_settings').insert({
      company_id: company.id,
      logo_data_url: '',
      app_theme: 'caramelo',
      dark_mode: false,
      default_notes_delivery: '',
      default_notes_general: '',
      default_notes_payment: '',
      overhead_method: 'PERCENT_DIRECT',
      overhead_percent: 12,
      overhead_per_unit: 0,
      labor_cost_per_hour: 0,
      fixed_cost_per_hour: 0,
      taxes_percent: 4,
      default_profit_percent: 30
    });
    if (settingsError) {
      const { error: legacySettingsError } = await supabaseAdmin.from('company_settings').insert({
        company_id: company.id,
        overhead_method: 'PERCENT_DIRECT',
        overhead_percent: 12,
        overhead_per_unit: 0,
        labor_cost_per_hour: 0,
        fixed_cost_per_hour: 0,
        taxes_percent: 4,
        default_profit_percent: 30
      });
      if (legacySettingsError) {
        return reply.status(400).send({ message: 'Erro ao criar configuracoes', detail: legacySettingsError.message });
      }
    }

    const { error: channelsError } = await supabaseAdmin.from('sales_channels').insert([
      { company_id: company.id, name: 'Loja Propria', fee_percent: 0, payment_fee_percent: 2.5, fee_fixed: 0, active: true },
      { company_id: company.id, name: 'iFood', fee_percent: 23, payment_fee_percent: 0, fee_fixed: 0, active: true }
    ]);
    if (channelsError) {
      return reply.status(400).send({ message: 'Erro ao criar canais', detail: channelsError.message });
    }

    const { error: userError } = await supabaseAdmin.from('app_users').insert({
      auth_user_id: authUserId,
      company_id: company.id,
      role: 'admin'
    });
    if (userError) {
      return reply.status(400).send({ message: 'Erro ao vincular usuario', detail: userError.message });
    }

    return reply.send({
      companyId: company.id,
      companyCode: getCompanyCodeFromId(company.id),
      alreadyLinked: false
    });
  });

  app.post('/onboarding/join-company', { preHandler: app.authenticateSupabase }, async (request, reply) => {
    const data = joinSchema.parse(request.body);
    const authUserId = (request as typeof request & { authUserId: string }).authUserId;

    const { data: existing } = await supabaseAdmin
      .from('app_users')
      .select('company_id')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (existing?.company_id) {
      return reply.send({
        companyId: existing.company_id,
        companyCode: getCompanyCodeFromId(existing.company_id),
        alreadyLinked: true
      });
    }

    const normalizedCode = normalizeCompanyCode(data.companyCode);
    const { data: companies, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('id');

    if (companyError) {
      return reply.status(400).send({ message: 'Erro ao buscar empresa', detail: companyError.message });
    }

    const matchedCompany = (companies ?? []).find((company) => getCompanyCodeFromId(company.id) === normalizedCode);
    if (!matchedCompany) {
      return reply.status(404).send({ message: 'Codigo de empresa invalido' });
    }

    const { error: userError } = await supabaseAdmin.from('app_users').insert({
      auth_user_id: authUserId,
      company_id: matchedCompany.id,
      role: 'common'
    });

    if (userError) {
      return reply.status(400).send({ message: 'Erro ao vincular usuario', detail: userError.message });
    }

    return reply.send({
      companyId: matchedCompany.id,
      companyCode: getCompanyCodeFromId(matchedCompany.id),
      alreadyLinked: false
    });
  });
};
