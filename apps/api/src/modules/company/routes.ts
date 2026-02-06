import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';

const salesChannelSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2),
  feePercent: z.number().min(0),
  paymentFeePercent: z.number().min(0),
  feeFixed: z.number().min(0),
  active: z.boolean()
});

const settingsSchema = z.object({
  overheadMethod: z.enum(['PERCENT_DIRECT', 'PER_UNIT']),
  overheadPercent: z.number().min(0),
  overheadPerUnit: z.number().min(0),
  laborCostPerHour: z.number().min(0),
  fixedCostPerHour: z.number().min(0),
  taxesPercent: z.number().min(0),
  defaultProfitPercent: z.number().min(0),
  salesChannels: z.array(salesChannelSchema)
});

export const companyRoutes = async (app: FastifyInstance) => {
  app.get('/company/settings', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;

    const { data: settings } = await supabaseAdmin
      .from('company_settings')
      .select('*')
      .eq('company_id', auth.companyId)
      .single();

    if (!settings) return reply.status(404).send({ message: 'Empresa nao encontrada' });

    const { data: channels } = await supabaseAdmin
      .from('sales_channels')
      .select('*')
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: true });

    return {
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

  app.put('/company/settings', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string; role: string } }).auth;
    if (auth.role !== 'admin') return reply.status(403).send({ message: 'Apenas admin' });

    const data = settingsSchema.parse(request.body);

    const { error: settingsError } = await supabaseAdmin
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

    if (settingsError) return reply.status(400).send({ message: 'Erro ao salvar configuracoes' });

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

    return reply.send(data);
  });
};
