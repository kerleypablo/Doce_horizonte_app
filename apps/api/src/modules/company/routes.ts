import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';
import { MODULE_DEFINITIONS, MODULE_KEYS, isModuleKey, type AppModuleKey } from '../common/modules.js';
import {
  fetchPagBankTransactionalCandidates,
  pagBankSaleOrigins,
  testPagBankEdiConnection,
  type PagBankEdiConfig
} from './pagbank-edi.js';

const costItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  monthlyAmount: z.number().min(0),
  active: z.boolean()
});

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
  appTheme: z.enum(['caramelo', 'oceano', 'floresta', 'branco_pop']).optional(),
  darkMode: z.boolean().optional(),
  defaultNotesDelivery: z.string().optional(),
  defaultNotesGeneral: z.string().optional(),
  defaultNotesPayment: z.string().optional(),
  productiveHoursPerMonth: z.number().min(0).optional().default(0),
  overheadMethod: z.enum(['PERCENT_DIRECT', 'PER_UNIT']),
  overheadPercent: z.number().min(0),
  overheadPerUnit: z.number().min(0),
  laborCostItems: z.array(costItemSchema).optional().default([]),
  fixedCostItems: z.array(costItemSchema).optional().default([]),
  laborCostPerHour: z.number().min(0),
  fixedCostPerHour: z.number().min(0),
  taxesPercent: z.number().min(0),
  defaultProfitPercent: z.number().min(0).optional().default(0),
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

const pagBankEdiSettingsSchema = z.object({
  ediUser: z.string().trim().min(1),
  ediToken: z.string().trim().optional(),
  defaultOrigin: z.enum(pagBankSaleOrigins).default('balcao'),
  active: z.boolean().default(true),
  autoImportEnabled: z.boolean().default(false)
});

const pagBankEdiImportSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const isModulesInfraMissing = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: string }).code ?? '') : '';
  const message = 'message' in error ? String((error as { message?: string }).message ?? '') : '';
  return code === '42P01' || code === 'PGRST205' || message.toLowerCase().includes('does not exist');
};

const hasAdminAccess = (role: string) => role === 'admin' || role === 'master';
const isMasterAccess = (role: string) => role === 'master';
type NormalizedCostItem = {
  id?: string;
  name: string;
  monthlyAmount: number;
  active: boolean;
};
const normalizeCostItems = (value: unknown): NormalizedCostItem[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map<NormalizedCostItem | null>((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as {
        id?: unknown;
        name?: unknown;
        monthlyAmount?: unknown;
        active?: unknown;
      };
      const name = String(row.name ?? '').trim();
      const monthlyAmount = Number(row.monthlyAmount ?? 0);
      if (!name) return null;
      return {
        id: row.id ? String(row.id) : undefined,
        name,
        monthlyAmount: Number.isFinite(monthlyAmount) ? monthlyAmount : 0,
        active: row.active !== false
      };
    })
    .filter((item): item is NormalizedCostItem => item !== null);
};
const sumActiveMonthlyCost = (items: NormalizedCostItem[]) =>
  items.reduce((sum, item) => sum + (item.active ? Number(item.monthlyAmount ?? 0) : 0), 0);
const calcHourlyCost = (monthlyTotal: number, productiveHoursPerMonth: number) =>
  productiveHoursPerMonth > 0 ? monthlyTotal / productiveHoursPerMonth : 0;
const normalizeTags = (tags: string[]) => Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))).slice(0, 12);
const pagBankInfraErrorMessage = 'Infra do PagBank EDI nao encontrada no banco. Rode o SQL novo em docs/SUPABASE_PAGBANK_EDI.sql.';
const maskToken = (value: string) => {
  const clean = value.trim();
  if (!clean) return '';
  if (clean.length <= 8) return `${clean.slice(0, 2)}...${clean.slice(-2)}`;
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
};
const defaultPagBankEdiSettings = {
  configured: false,
  ediUser: '',
  hasToken: false,
  maskedToken: '',
  defaultOrigin: 'balcao' as const,
  active: false,
  autoImportEnabled: false,
  lastTestedAt: null as string | null,
  lastTestStatus: null as 'SUCCESS' | 'ERROR' | null,
  lastTestDetail: '',
  lastImportedAt: null as string | null,
  lastImportStatus: null as 'SUCCESS' | 'ERROR' | null,
  lastImportDetail: ''
};

export const companyRoutes = async (app: FastifyInstance) => {
  const empresaGuard = { preHandler: [app.authenticate, app.requireModule('empresa')] };
  const loadPagBankEdiConfigRow = async (companyId: string) => {
    const { data, error } = await supabaseAdmin
      .from('company_pagbank_edi_configs')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle();

    if (error) {
      if (isModulesInfraMissing(error)) return { data: null, missingInfra: true };
      throw error;
    }

    return { data, missingInfra: false };
  };

  const mapPagBankEdiSettings = (row: any) => {
    if (!row) return defaultPagBankEdiSettings;
    return {
      configured: true,
      ediUser: String(row.edi_user ?? ''),
      hasToken: Boolean(String(row.edi_token ?? '').trim()),
      maskedToken: maskToken(String(row.edi_token ?? '')),
      defaultOrigin: pagBankSaleOrigins.includes(String(row.default_origin ?? '') as typeof pagBankSaleOrigins[number])
        ? String(row.default_origin) as typeof pagBankSaleOrigins[number]
        : 'balcao',
      active: Boolean(row.active),
      autoImportEnabled: Boolean(row.auto_import_enabled),
      lastTestedAt: row.last_tested_at ?? null,
      lastTestStatus: row.last_test_status === 'SUCCESS' || row.last_test_status === 'ERROR'
        ? row.last_test_status
        : null,
      lastTestDetail: String(row.last_test_detail ?? ''),
      lastImportedAt: row.last_imported_at ?? null,
      lastImportStatus: row.last_import_status === 'SUCCESS' || row.last_import_status === 'ERROR'
        ? row.last_import_status
        : null,
      lastImportDetail: String(row.last_import_detail ?? '')
    };
  };

  const buildPagBankEdiConfig = (row: any): PagBankEdiConfig => ({
    ediUser: String(row.edi_user ?? ''),
    ediToken: String(row.edi_token ?? ''),
    defaultOrigin: pagBankSaleOrigins.includes(String(row.default_origin ?? '') as typeof pagBankSaleOrigins[number])
      ? String(row.default_origin) as typeof pagBankSaleOrigins[number]
      : 'balcao'
  });

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

    const productiveHoursPerMonth = Number(settings.productive_hours_per_month ?? 0);
    const laborCostItems = normalizeCostItems(settings.labor_cost_items);
    const fixedCostItems = normalizeCostItems(settings.fixed_cost_items);
    const derivedLaborCostPerHour = calcHourlyCost(sumActiveMonthlyCost(laborCostItems), productiveHoursPerMonth);
    const derivedFixedCostPerHour = calcHourlyCost(sumActiveMonthlyCost(fixedCostItems), productiveHoursPerMonth);

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
      productiveHoursPerMonth,
      overheadMethod: settings.overhead_method,
      overheadPercent: settings.overhead_percent,
      overheadPerUnit: settings.overhead_per_unit,
      laborCostItems,
      fixedCostItems,
      laborCostPerHour: laborCostItems.length > 0 ? derivedLaborCostPerHour : Number(settings.labor_cost_per_hour ?? 0),
      fixedCostPerHour: fixedCostItems.length > 0 ? derivedFixedCostPerHour : Number(settings.fixed_cost_per_hour ?? 0),
      taxesPercent: settings.taxes_percent,
      defaultProfitPercent: Number(settings.default_profit_percent ?? 0),
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
    const laborCostItems = normalizeCostItems(data.laborCostItems);
    const fixedCostItems = normalizeCostItems(data.fixedCostItems);
    const productiveHoursPerMonth = Number(data.productiveHoursPerMonth ?? 0);
    const laborCostPerHour = laborCostItems.length > 0
      ? calcHourlyCost(sumActiveMonthlyCost(laborCostItems), productiveHoursPerMonth)
      : data.laborCostPerHour;
    const fixedCostPerHour = fixedCostItems.length > 0
      ? calcHourlyCost(sumActiveMonthlyCost(fixedCostItems), productiveHoursPerMonth)
      : data.fixedCostPerHour;

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
        productive_hours_per_month: productiveHoursPerMonth,
        overhead_method: data.overheadMethod,
        overhead_percent: data.overheadPercent,
        overhead_per_unit: data.overheadPerUnit,
        labor_cost_items: laborCostItems,
        fixed_cost_items: fixedCostItems,
        labor_cost_per_hour: laborCostPerHour,
        fixed_cost_per_hour: fixedCostPerHour,
        taxes_percent: data.taxesPercent,
        default_profit_percent: data.defaultProfitPercent
      }, { onConflict: 'company_id' });

    if (settingsError) {
      const hasItemizedCosts = laborCostItems.length > 0 || fixedCostItems.length > 0;
      if (hasItemizedCosts) {
        return reply.status(400).send({
          message: 'O banco ainda nao esta preparado para salvar a lista de custos. Aplique a migracao SUPABASE_COST_ITEMS.sql.',
          detail: settingsError.message
        });
      }
      const { error: legacyError } = await supabaseAdmin
        .from('company_settings')
        .upsert({
          company_id: auth.companyId,
          productive_hours_per_month: productiveHoursPerMonth,
          overhead_method: data.overheadMethod,
          overhead_percent: data.overheadPercent,
          overhead_per_unit: data.overheadPerUnit,
          labor_cost_per_hour: laborCostPerHour,
          fixed_cost_per_hour: fixedCostPerHour,
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
      productiveHoursPerMonth,
      laborCostItems,
      fixedCostItems,
      laborCostPerHour,
      fixedCostPerHour,
      companyName: data.companyName ?? undefined
    });
  });

  app.get('/company/pagbank-edi', empresaGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string; role: string } }).auth;
    if (!hasAdminAccess(auth.role)) return reply.status(403).send({ message: 'Apenas admin' });

    const result = await loadPagBankEdiConfigRow(auth.companyId);
    if (result.missingInfra) return reply.status(400).send({ message: pagBankInfraErrorMessage });
    return reply.send(mapPagBankEdiSettings(result.data));
  });

  app.put('/company/pagbank-edi', empresaGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string; role: string; userId: string } }).auth;
    if (!hasAdminAccess(auth.role)) return reply.status(403).send({ message: 'Apenas admin' });

    const body = pagBankEdiSettingsSchema.parse(request.body);
    const current = await loadPagBankEdiConfigRow(auth.companyId);
    if (current.missingInfra) return reply.status(400).send({ message: pagBankInfraErrorMessage });

    const currentToken = String(current.data?.edi_token ?? '').trim();
    const nextToken = body.ediToken?.trim() || currentToken;
    if (!nextToken) return reply.status(400).send({ message: 'Informe o token EDI do PagBank.' });

    const { data, error } = await supabaseAdmin
      .from('company_pagbank_edi_configs')
      .upsert({
        company_id: auth.companyId,
        edi_user: body.ediUser,
        edi_token: nextToken,
        default_origin: body.defaultOrigin,
        active: body.active,
        auto_import_enabled: body.autoImportEnabled,
        updated_by_auth_user_id: auth.userId
      }, { onConflict: 'company_id' })
      .select('*')
      .single();

    if (error) return reply.status(400).send({ message: 'Erro ao salvar configuracao do PagBank.', detail: error.message });
    return reply.send(mapPagBankEdiSettings(data));
  });

  app.post('/company/pagbank-edi/test', empresaGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string; role: string } }).auth;
    if (!hasAdminAccess(auth.role)) return reply.status(403).send({ message: 'Apenas admin' });

    const result = await loadPagBankEdiConfigRow(auth.companyId);
    if (result.missingInfra) return reply.status(400).send({ message: pagBankInfraErrorMessage });
    if (!result.data) return reply.status(404).send({ message: 'Cadastre as credenciais do PagBank antes de testar.' });

    try {
      const testResult = await testPagBankEdiConnection(buildPagBankEdiConfig(result.data));
      await supabaseAdmin
        .from('company_pagbank_edi_configs')
        .update({
          last_tested_at: new Date().toISOString(),
          last_test_status: testResult.ok ? 'SUCCESS' : 'ERROR',
          last_test_detail: testResult.detail
        })
        .eq('company_id', auth.companyId);

      return reply.status(testResult.ok ? 200 : 400).send(testResult);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Falha ao testar a conexao com o PagBank.';
      await supabaseAdmin
        .from('company_pagbank_edi_configs')
        .update({
          last_tested_at: new Date().toISOString(),
          last_test_status: 'ERROR',
          last_test_detail: detail
        })
        .eq('company_id', auth.companyId);
      return reply.status(400).send({ ok: false, detail });
    }
  });

  app.post('/company/pagbank-edi/import', empresaGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string; role: string } }).auth;
    if (!hasAdminAccess(auth.role)) return reply.status(403).send({ message: 'Apenas admin' });

    const body = pagBankEdiImportSchema.parse(request.body);
    const configResult = await loadPagBankEdiConfigRow(auth.companyId);
    if (configResult.missingInfra) return reply.status(400).send({ message: pagBankInfraErrorMessage });
    if (!configResult.data) return reply.status(404).send({ message: 'Cadastre as credenciais do PagBank antes de importar.' });
    if (!configResult.data.active) return reply.status(400).send({ message: 'A integracao PagBank EDI esta desativada.' });

    try {
      const imported = await fetchPagBankTransactionalCandidates(buildPagBankEdiConfig(configResult.data), body.date);
      if (imported.validado === false) {
        await supabaseAdmin
          .from('company_pagbank_edi_configs')
          .update({
            last_imported_at: new Date().toISOString(),
            last_import_status: 'ERROR',
            last_import_detail: `O PagBank ainda nao validou integralmente os dados de ${body.date}.`
          })
          .eq('company_id', auth.companyId);

        return reply.send({
          importedCount: 0,
          duplicateCount: 0,
          skippedCount: imported.rawCount,
          warnings: ['O PagBank retornou VALIDADO=FALSE para a data solicitada.'],
          date: body.date
        });
      }

      if (imported.candidates.length === 0) {
        await supabaseAdmin
          .from('company_pagbank_edi_configs')
          .update({
            last_imported_at: new Date().toISOString(),
            last_import_status: 'SUCCESS',
            last_import_detail: `Nenhum lancamento elegivel foi encontrado no PagBank para ${body.date}.`
          })
          .eq('company_id', auth.companyId);

        return reply.send({
          importedCount: 0,
          duplicateCount: 0,
          skippedCount: imported.rawCount,
          warnings: imported.warnings,
          date: body.date
        });
      }

      const externalIds = imported.candidates.map((item) => item.externalId);
      const { data: existingImports, error: existingImportsError } = await supabaseAdmin
        .from('financial_external_import_items')
        .select('external_id')
        .eq('company_id', auth.companyId)
        .eq('provider', 'PAGBANK_EDI')
        .in('external_id', externalIds);

      if (existingImportsError) {
        if (isModulesInfraMissing(existingImportsError)) return reply.status(400).send({ message: pagBankInfraErrorMessage });
        return reply.status(400).send({ message: 'Erro ao verificar duplicidades da importacao.', detail: existingImportsError.message });
      }

      const importedIds = new Set((existingImports ?? []).map((item) => String(item.external_id)));
      const newCandidates = imported.candidates.filter((item) => !importedIds.has(item.externalId));
      const duplicateCount = imported.candidates.length - newCandidates.length;

      if (newCandidates.length === 0) {
        await supabaseAdmin
          .from('company_pagbank_edi_configs')
          .update({
            last_imported_at: new Date().toISOString(),
            last_import_status: 'SUCCESS',
            last_import_detail: `Todos os lancamentos elegiveis de ${body.date} ja haviam sido importados anteriormente.`
          })
          .eq('company_id', auth.companyId);

        return reply.send({
          importedCount: 0,
          duplicateCount,
          skippedCount: imported.rawCount - imported.candidates.length,
          warnings: imported.warnings,
          date: body.date
        });
      }

      const tags = normalizeTags(['pagbank', configResult.data.default_origin ?? 'balcao']);
      const salesPayload = newCandidates.map((item) => ({
        company_id: auth.companyId,
        account_id: null,
        occurred_at: item.occurredAt,
        description: item.description,
        payment_method: item.paymentMethod,
        amount: item.amount,
        products: [],
        tags,
        notes: `Importado do PagBank EDI. Referencia: ${item.externalId}`
      }));

      const { data: createdSales, error: createSalesError } = await supabaseAdmin
        .from('financial_manual_sales')
        .insert(salesPayload)
        .select('id');

      if (createSalesError) {
        return reply.status(400).send({ message: 'Erro ao criar vendas importadas do PagBank.', detail: createSalesError.message });
      }

      const importRefs = newCandidates.map((item, index) => ({
        company_id: auth.companyId,
        provider: 'PAGBANK_EDI',
        external_id: item.externalId,
        reference_date: body.date,
        manual_sale_id: createdSales?.[index]?.id ?? null,
        payload: item.payload
      }));

      const { error: importRefError } = await supabaseAdmin
        .from('financial_external_import_items')
        .insert(importRefs);

      if (importRefError) {
        if (isModulesInfraMissing(importRefError)) return reply.status(400).send({ message: pagBankInfraErrorMessage });
        return reply.status(400).send({ message: 'Erro ao registrar referencias da importacao PagBank.', detail: importRefError.message });
      }

      const detail = `${newCandidates.length} lancamento(s) importado(s) do PagBank para ${body.date}.`;
      await supabaseAdmin
        .from('company_pagbank_edi_configs')
        .update({
          last_imported_at: new Date().toISOString(),
          last_import_status: 'SUCCESS',
          last_import_detail: detail
        })
        .eq('company_id', auth.companyId);

      return reply.send({
        importedCount: newCandidates.length,
        duplicateCount,
        skippedCount: imported.rawCount - imported.candidates.length,
        warnings: imported.warnings,
        date: body.date
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Falha ao importar movimentacoes do PagBank.';
      await supabaseAdmin
        .from('company_pagbank_edi_configs')
        .update({
          last_imported_at: new Date().toISOString(),
          last_import_status: 'ERROR',
          last_import_detail: detail
        })
        .eq('company_id', auth.companyId);
      return reply.status(400).send({ message: 'Falha ao importar movimentacoes do PagBank.', detail });
    }
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
