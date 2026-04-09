import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';

const paymentMethodSchema = z.enum(['PIX', 'DINHEIRO', 'CARTAO', 'VOUCHER']);
const ruleModeSchema = z.enum(['NONE', 'PERCENT', 'FIXED_ADD', 'FIXED_SUBTRACT']);
const accountTypeSchema = z.enum(['BANK', 'CASH', 'CARD_RECEIVABLE', 'IFOOD_RECEIVABLE', 'OTHER']);
const expenseCategorySchema = z.enum([
  'INSUMOS',
  'EMBALAGENS',
  'ALUGUEL',
  'ENERGIA',
  'FUNCIONARIO',
  'ENTREGA',
  'TAXAS',
  'MARKETING',
  'OUTROS'
]);
const originCostRuleSchema = z.object({
  origin: z.enum(['balcao', 'rua', 'porta-a-porta', 'ifood', 'outros']),
  costPercent: z.number().min(0).max(100)
});

const dateRangeQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  tag: z.string().optional(),
  search: z.string().optional()
});

const accountSchema = z.object({
  name: z.string().min(2),
  accountType: accountTypeSchema.default('BANK'),
  institution: z.string().optional(),
  balanceDate: z.string().min(1),
  balanceAmount: z.number(),
  notes: z.string().optional()
});

const closingQuerySchema = z.object({
  date: z.string().min(1)
});

const dailyClosingSchema = z.object({
  date: z.string().min(1),
  checkedBalance: z.number(),
  notes: z.string().optional()
});

const reconciledSchema = z.object({
  reconciled: z.boolean()
});

const methodRuleSchema = z.object({
  method: paymentMethodSchema,
  mode: ruleModeSchema,
  value: z.number().min(0)
});

const methodRulesPayloadSchema = z.object({
  rules: z.array(methodRuleSchema)
});

const originCostRulesPayloadSchema = z.object({
  rules: z.array(originCostRuleSchema)
});

const tagsSchema = z.array(z.string().trim().min(1).max(40)).max(12);

const manualSaleProductSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  unitPrice: z.number().min(0),
  quantity: z.number().positive()
});

const manualSaleSchema = z.object({
  accountId: z.string().uuid().optional(),
  occurredAt: z.string().min(1),
  description: z.string().min(2),
  paymentMethod: paymentMethodSchema,
  amount: z.number().positive(),
  products: z.array(manualSaleProductSchema).default([]),
  tags: tagsSchema.optional(),
  notes: z.string().optional()
});

const manualSaleSplitLineSchema = z.object({
  paymentMethod: paymentMethodSchema,
  amount: z.number().positive()
});

const manualSaleCreateSchema = z.object({
  accountId: z.string().uuid().optional(),
  occurredAt: z.string().min(1),
  description: z.string().min(2),
  tags: tagsSchema.optional(),
  notes: z.string().optional(),
  paymentMethod: paymentMethodSchema.optional(),
  amount: z.number().positive().optional(),
  products: z.array(manualSaleProductSchema).default([]),
  lines: z.array(manualSaleSplitLineSchema).min(1).optional()
}).superRefine((value, context) => {
  if (!value.lines?.length && (!value.paymentMethod || !value.amount)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Informe paymentMethod e amount ou envie ao menos uma linha em lines'
    });
  }
});

const expenseSchema = z.object({
  accountId: z.string().uuid().optional(),
  occurredAt: z.string().min(1),
  description: z.string().min(2),
  paymentMethod: paymentMethodSchema,
  amount: z.number().positive(),
  category: expenseCategorySchema.default('OUTROS'),
  recurring: z.boolean().default(false),
  notes: z.string().optional()
});

const toDateOnly = (value: Date) => value.toISOString().slice(0, 10);

const defaultRange = () => {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: toDateOnly(from), to: toDateOnly(to) };
};

const parseDateRange = (query?: unknown) => {
  const parsed = dateRangeQuerySchema.parse(query ?? {});
  const fallback = defaultRange();
  const from = parsed.from ?? fallback.from;
  const to = parsed.to ?? fallback.to;
  return {
    from,
    to,
    tag: parsed.tag?.trim() || undefined,
    search: parsed.search?.trim() || undefined,
    fromIso: new Date(`${from}T00:00:00.000Z`).toISOString(),
    toIso: new Date(`${to}T23:59:59.999Z`).toISOString()
  };
};

const eachDate = (from: string, to: string) => {
  const days: string[] = [];
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return days;
  const cursor = new Date(start);
  while (cursor <= end && days.length <= 370) {
    days.push(toDateOnly(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
};

type MethodRule = {
  method: z.infer<typeof paymentMethodSchema>;
  mode: z.infer<typeof ruleModeSchema>;
  value: number;
};

const saleOrigins = ['balcao', 'rua', 'porta-a-porta', 'ifood', 'outros'] as const;
type SaleOrigin = (typeof saleOrigins)[number];
const expenseCategories = [
  'INSUMOS',
  'EMBALAGENS',
  'ALUGUEL',
  'ENERGIA',
  'FUNCIONARIO',
  'ENTREGA',
  'TAXAS',
  'MARKETING',
  'OUTROS'
] as const;

const getSaleOrigin = (tags: unknown): SaleOrigin => {
  const values = Array.isArray(tags) ? tags.map((tag) => String(tag)) : [];
  return values.find((tag): tag is SaleOrigin => saleOrigins.includes(tag as SaleOrigin)) ?? 'outros';
};

const defaultOriginCostRules = () =>
  saleOrigins.map((origin) => ({
    origin,
    costPercent: origin === 'ifood' ? 50 : origin === 'rua' || origin === 'porta-a-porta' ? 45 : 40
  }));

const isMissingSupabaseTableError = (error: unknown) => {
  const maybeError = error as { code?: string; message?: string } | null;
  const message = maybeError?.message?.toLowerCase() ?? '';
  return (
    maybeError?.code === 'PGRST205' ||
    maybeError?.code === '42P01' ||
    message.includes('schema cache') ||
    message.includes('does not exist')
  );
};

const calcLiquidByRule = (gross: number, rule?: MethodRule) => {
  if (!rule || rule.mode === 'NONE') return gross;
  if (rule.mode === 'PERCENT') return Math.max(gross * (1 - rule.value / 100), 0);
  if (rule.mode === 'FIXED_ADD') return gross + rule.value;
  return Math.max(gross - rule.value, 0);
};

const calcOrderTotal = (row: any) => {
  const products = Array.isArray(row.products) ? row.products : [];
  const additions = Array.isArray(row.additions) ? row.additions : [];
  const productsTotal = products.reduce(
    (sum: number, item: any) => sum + Number(item?.unitPrice ?? 0) * Number(item?.quantity ?? 0),
    0
  );
  const additionsTotal = additions.reduce((sum: number, item: any) => {
    if (item?.mode === 'FIXED') return sum + Number(item?.value ?? 0);
    return sum + (productsTotal * Number(item?.value ?? 0)) / 100;
  }, 0);
  const discountMode = row.discount_mode ?? 'FIXED';
  const discountValue = Number(row.discount_value ?? 0);
  const discountTotal = discountMode === 'PERCENT'
    ? ((productsTotal + additionsTotal) * discountValue) / 100
    : discountValue;
  return productsTotal + additionsTotal - discountTotal + Number(row.shipping_value ?? 0);
};

const calcOrderEstimatedProductCost = (row: any) => {
  const products = Array.isArray(row.products) ? row.products : [];
  return products.reduce(
    (sum: number, item: any) => sum + Number(item?.estimatedTotalCost ?? 0),
    0
  );
};

const toMethodKey = (value: unknown): MethodRule['method'] =>
  paymentMethodSchema.parse(String(value));

const normalizeTags = (tags?: string[]) =>
  Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))).slice(0, 12);

export const financeRoutes = async (app: FastifyInstance) => {
  const financeGuard = { preHandler: [app.authenticate, app.requireModule('financeiro')] };

	  const mapAccount = (row: any) => ({
	    id: row.id,
	    name: row.name,
	    accountType: row.account_type ?? 'BANK',
	    institution: row.institution ?? '',
	    balanceDate: row.balance_date,
	    balanceAmount: Number(row.balance_amount ?? 0),
    notes: row.notes ?? '',
    createdAt: row.created_at
  });

  const mapSale = (row: any, rulesMap: Map<string, MethodRule>) => {
    const amount = Number(row.amount ?? 0);
    const rule = rulesMap.get(String(row.payment_method));
    return {
      id: row.id,
      accountId: row.account_id ?? undefined,
      occurredAt: row.occurred_at,
      description: row.description,
      paymentMethod: row.payment_method as z.infer<typeof paymentMethodSchema>,
	      amount,
	      netAmount: calcLiquidByRule(amount, rule),
	      tags: Array.isArray(row.tags) ? row.tags : [],
	      products: Array.isArray(row.products) ? row.products : [],
	      reconciled: row.reconciled ?? false,
	      notes: row.notes ?? '',
	      createdAt: row.created_at
	    };
  };

  const mapExpense = (row: any, rulesMap: Map<string, MethodRule>) => {
    const amount = Number(row.amount ?? 0);
    const rule = rulesMap.get(String(row.payment_method));
    return {
	      id: row.id,
	      accountId: row.account_id ?? undefined,
	      occurredAt: row.occurred_at,
	      description: row.description,
	      category: row.category ?? 'OUTROS',
	      paymentMethod: row.payment_method as z.infer<typeof paymentMethodSchema>,
	      amount,
	      netAmount: calcLiquidByRule(amount, rule),
	      reconciled: row.reconciled ?? false,
	      recurring: row.recurring ?? false,
	      notes: row.notes ?? '',
	      createdAt: row.created_at
	    };
	  };

	  const mapClosing = (row: any) => row ? ({
	    id: row.id,
	    date: row.closing_date,
	    checkedBalance: Number(row.checked_balance ?? 0),
	    notes: row.notes ?? '',
	    createdAt: row.created_at,
	    updatedAt: row.updated_at
	  }) : null;

	  const getRules = async (companyId: string): Promise<MethodRule[]> => {
    const { data, error } = await supabaseAdmin
      .from('financial_method_rules')
      .select('method, mode, value')
      .eq('company_id', companyId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    const rules = (data ?? []).map((item) => ({
      method: item.method as MethodRule['method'],
      mode: item.mode as MethodRule['mode'],
      value: Number(item.value ?? 0)
    }));

    if (rules.length > 0) return rules;

    const defaults: MethodRule[] = ['PIX', 'DINHEIRO', 'CARTAO', 'VOUCHER'].map((method) => ({
      method: method as MethodRule['method'],
      mode: 'NONE',
      value: 0
    }));

    await supabaseAdmin.from('financial_method_rules').insert(
      defaults.map((rule) => ({
        company_id: companyId,
        method: rule.method,
        mode: rule.mode,
        value: rule.value
      }))
    );
	    return defaults;
	  };

	  const getOriginCostRules = async (companyId: string) => {
	    const { data, error } = await supabaseAdmin
	      .from('financial_origin_cost_rules')
	      .select('origin, cost_percent')
	      .eq('company_id', companyId)
	      .order('origin', { ascending: true });

	    if (error) {
	      if (isMissingSupabaseTableError(error)) return defaultOriginCostRules();
	      throw error;
	    }
	    if ((data ?? []).length > 0) {
	      const existing = new Map((data ?? []).map((item) => [String(item.origin), Number(item.cost_percent ?? 0)]));
	      return defaultOriginCostRules().map((rule) => ({
	        origin: rule.origin,
	        costPercent: existing.get(rule.origin) ?? rule.costPercent
	      }));
	    }

	    const defaults = defaultOriginCostRules();
	    const { error: insertError } = await supabaseAdmin.from('financial_origin_cost_rules').insert(
	      defaults.map((rule) => ({
	        company_id: companyId,
	        origin: rule.origin,
	        cost_percent: rule.costPercent
	      }))
	    );
	    if (insertError && !isMissingSupabaseTableError(insertError)) throw insertError;
	    return defaults;
	  };

  app.get('/finance/accounts', financeGuard, async (request) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const { data, error } = await supabaseAdmin
      .from('financial_accounts')
      .select('*')
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapAccount);
  });

  app.post('/finance/accounts', financeGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const body = accountSchema.parse(request.body);
    const { data, error } = await supabaseAdmin
      .from('financial_accounts')
	      .insert({
	        company_id: auth.companyId,
	        name: body.name,
	        account_type: body.accountType,
	        institution: body.institution ?? null,
	        balance_date: body.balanceDate,
	        balance_amount: body.balanceAmount,
        notes: body.notes ?? null
      })
      .select('*')
      .single();
    if (error) return reply.status(400).send({ message: 'Erro ao criar conta', detail: error.message });
    return reply.status(201).send(mapAccount(data));
  });

  app.put('/finance/accounts/:id', financeGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const params = request.params as { id: string };
    const body = accountSchema.parse(request.body);
    const { data, error } = await supabaseAdmin
      .from('financial_accounts')
	      .update({
	        name: body.name,
	        account_type: body.accountType,
	        institution: body.institution ?? null,
	        balance_date: body.balanceDate,
	        balance_amount: body.balanceAmount,
        notes: body.notes ?? null
      })
      .eq('id', params.id)
      .eq('company_id', auth.companyId)
      .select('*')
      .single();
    if (error) return reply.status(400).send({ message: 'Erro ao atualizar conta', detail: error.message });
    return reply.send(mapAccount(data));
  });

	  app.delete('/finance/accounts/:id', financeGuard, async (request, reply) => {
	    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
	    const params = request.params as { id: string };
    const { error } = await supabaseAdmin
      .from('financial_accounts')
      .delete()
      .eq('id', params.id)
      .eq('company_id', auth.companyId);
	    if (error) return reply.status(400).send({ message: 'Erro ao remover conta', detail: error.message });
	    return reply.status(204).send();
	  });

	  app.get('/finance/daily-closing', financeGuard, async (request) => {
	    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
	    const query = closingQuerySchema.parse(request.query ?? {});
	    const { data, error } = await supabaseAdmin
	      .from('financial_daily_closings')
	      .select('*')
	      .eq('company_id', auth.companyId)
	      .eq('closing_date', query.date)
	      .maybeSingle();
	    if (error) throw error;
	    return mapClosing(data);
	  });

	  app.put('/finance/daily-closing', financeGuard, async (request, reply) => {
	    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
	    const body = dailyClosingSchema.parse(request.body);
	    const { data, error } = await supabaseAdmin
	      .from('financial_daily_closings')
	      .upsert({
	        company_id: auth.companyId,
	        closing_date: body.date,
	        checked_balance: body.checkedBalance,
	        notes: body.notes ?? null,
	        updated_at: new Date().toISOString()
	      }, { onConflict: 'company_id,closing_date' })
	      .select('*')
	      .single();
	    if (error) return reply.status(400).send({ message: 'Erro ao salvar fechamento', detail: error.message });
	    return reply.send(mapClosing(data));
	  });

	  app.get('/finance/method-rules', financeGuard, async (request) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const rules = await getRules(auth.companyId);
    return { rules };
  });

	  app.put('/finance/method-rules', financeGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const body = methodRulesPayloadSchema.parse(request.body);
    const methods = new Set(body.rules.map((item) => item.method));
    for (const requiredMethod of ['PIX', 'DINHEIRO', 'CARTAO', 'VOUCHER']) {
      if (!methods.has(requiredMethod as MethodRule['method'])) {
        body.rules.push({ method: requiredMethod as MethodRule['method'], mode: 'NONE', value: 0 });
      }
    }
    const payload = body.rules.map((rule) => ({
      company_id: auth.companyId,
      method: rule.method,
      mode: rule.mode,
      value: rule.value
    }));
    const { error } = await supabaseAdmin
      .from('financial_method_rules')
      .upsert(payload, { onConflict: 'company_id,method' });
	    if (error) return reply.status(400).send({ message: 'Erro ao salvar regras', detail: error.message });
	    return reply.send({ rules: body.rules });
	  });

	  app.get('/finance/origin-cost-rules', financeGuard, async (request) => {
	    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
	    const rules = await getOriginCostRules(auth.companyId);
	    return { rules };
	  });

	  app.put('/finance/origin-cost-rules', financeGuard, async (request, reply) => {
	    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
	    const body = originCostRulesPayloadSchema.parse(request.body);
	    const incoming = new Map(body.rules.map((item) => [item.origin, item.costPercent]));
	    const rules = defaultOriginCostRules().map((rule) => ({
	      origin: rule.origin,
	      costPercent: incoming.get(rule.origin) ?? rule.costPercent
	    }));
	    const payload = rules.map((rule) => ({
	      company_id: auth.companyId,
	      origin: rule.origin,
	      cost_percent: rule.costPercent
	    }));
	    const { error } = await supabaseAdmin
	      .from('financial_origin_cost_rules')
	      .upsert(payload, { onConflict: 'company_id,origin' });
	    if (error) {
	      const message = isMissingSupabaseTableError(error)
	        ? 'Tabela financial_origin_cost_rules nao existe no Supabase. Rode o SQL atualizado em docs/SUPABASE_FINANCE.sql.'
	        : 'Erro ao salvar custos por origem';
	      return reply.status(400).send({ message, detail: error.message });
	    }
	    return reply.send({ rules });
	  });

	  app.get('/finance/manual-sales', financeGuard, async (request) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
	    const range = parseDateRange(request.query);
	    const rules = await getRules(auth.companyId);
	    const rulesMap = new Map(rules.map((item) => [item.method, item]));
    let query = supabaseAdmin
      .from('financial_manual_sales')
      .select('*')
      .eq('company_id', auth.companyId)
      .gte('occurred_at', range.fromIso)
      .lte('occurred_at', range.toIso);
    if (range.tag) query = query.contains('tags', [range.tag]);
    if (range.search) query = query.ilike('description', `%${range.search}%`);
    const { data, error } = await query.order('occurred_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => mapSale(row, rulesMap));
  });

  app.get('/finance/manual-sales/tags', financeGuard, async (request) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const { data, error } = await supabaseAdmin
      .from('financial_manual_sales')
      .select('tags')
      .eq('company_id', auth.companyId);
    if (error) throw error;
    const tags = new Set<string>();
    for (const row of data ?? []) {
      for (const tag of Array.isArray(row.tags) ? row.tags : []) {
        const clean = String(tag).trim();
        if (clean) tags.add(clean);
      }
    }
    return { tags: Array.from(tags).sort((a, b) => a.localeCompare(b, 'pt-BR')) };
  });

  app.post('/finance/manual-sales', financeGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const body = manualSaleCreateSchema.parse(request.body);
    const tags = normalizeTags(body.tags);
    const lines = body.lines?.length
      ? body.lines
      : [{ paymentMethod: body.paymentMethod as z.infer<typeof paymentMethodSchema>, amount: body.amount as number }];
	    const payload = lines.map((line, index) => ({
	      company_id: auth.companyId,
	      account_id: body.accountId ?? null,
	      occurred_at: body.occurredAt,
	      description: body.description,
	      payment_method: line.paymentMethod,
	      amount: line.amount,
	      products: index === 0 ? body.products : [],
	      tags,
	      notes: body.notes ?? null
	    }));
    const { data, error } = await supabaseAdmin
      .from('financial_manual_sales')
      .insert(payload)
      .select('*');
    if (error) return reply.status(400).send({ message: 'Erro ao criar venda manual', detail: error.message });
    const rules = await getRules(auth.companyId);
    const rulesMap = new Map(rules.map((item) => [item.method, item]));
    const items = (data ?? []).map((row) => mapSale(row, rulesMap));
    return reply.status(201).send(lines.length > 1 ? { items, createdCount: items.length } : items[0]);
  });

  app.put('/finance/manual-sales/:id', financeGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const params = request.params as { id: string };
    const body = manualSaleSchema.parse(request.body);
    const { data, error } = await supabaseAdmin
      .from('financial_manual_sales')
      .update({
        account_id: body.accountId ?? null,
        occurred_at: body.occurredAt,
        description: body.description,
	        payment_method: body.paymentMethod,
	        amount: body.amount,
	        products: body.products,
	        tags: normalizeTags(body.tags),
        notes: body.notes ?? null
      })
      .eq('id', params.id)
      .eq('company_id', auth.companyId)
      .select('*')
      .single();
    if (error) return reply.status(400).send({ message: 'Erro ao atualizar venda manual', detail: error.message });
    const rules = await getRules(auth.companyId);
    const rulesMap = new Map(rules.map((item) => [item.method, item]));
    return reply.send(mapSale(data, rulesMap));
  });

	  app.delete('/finance/manual-sales/:id', financeGuard, async (request, reply) => {
	    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
	    const params = request.params as { id: string };
    const { error } = await supabaseAdmin
      .from('financial_manual_sales')
      .delete()
      .eq('id', params.id)
      .eq('company_id', auth.companyId);
	    if (error) return reply.status(400).send({ message: 'Erro ao remover venda manual', detail: error.message });
	    return reply.status(204).send();
	  });

	  app.put('/finance/manual-sales/:id/reconciled', financeGuard, async (request, reply) => {
	    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
	    const params = request.params as { id: string };
	    const body = reconciledSchema.parse(request.body);
	    const { data, error } = await supabaseAdmin
	      .from('financial_manual_sales')
	      .update({ reconciled: body.reconciled, updated_at: new Date().toISOString() })
	      .eq('id', params.id)
	      .eq('company_id', auth.companyId)
	      .select('*')
	      .single();
	    if (error) return reply.status(400).send({ message: 'Erro ao conferir venda', detail: error.message });
	    const rules = await getRules(auth.companyId);
	    const rulesMap = new Map(rules.map((item) => [item.method, item]));
	    return reply.send(mapSale(data, rulesMap));
	  });

  app.get('/finance/expenses', financeGuard, async (request) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
	    const range = parseDateRange(request.query);
	    const rules = await getRules(auth.companyId);
	    const rulesMap = new Map(rules.map((item) => [item.method, item]));
    const { data, error } = await supabaseAdmin
      .from('financial_expenses')
      .select('*')
      .eq('company_id', auth.companyId)
      .gte('occurred_at', range.fromIso)
      .lte('occurred_at', range.toIso)
      .order('occurred_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => mapExpense(row, rulesMap));
  });

  app.post('/finance/expenses', financeGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const body = expenseSchema.parse(request.body);
    const { data, error } = await supabaseAdmin
      .from('financial_expenses')
      .insert({
        company_id: auth.companyId,
        account_id: body.accountId ?? null,
	        occurred_at: body.occurredAt,
	        description: body.description,
	        category: body.category,
	        payment_method: body.paymentMethod,
	        amount: body.amount,
	        recurring: body.recurring,
	        notes: body.notes ?? null
      })
      .select('*')
      .single();
    if (error) return reply.status(400).send({ message: 'Erro ao criar despesa', detail: error.message });
    const rules = await getRules(auth.companyId);
    const rulesMap = new Map(rules.map((item) => [item.method, item]));
    return reply.status(201).send(mapExpense(data, rulesMap));
  });

  app.put('/finance/expenses/:id', financeGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const params = request.params as { id: string };
    const body = expenseSchema.parse(request.body);
    const { data, error } = await supabaseAdmin
      .from('financial_expenses')
      .update({
        account_id: body.accountId ?? null,
	        occurred_at: body.occurredAt,
	        description: body.description,
	        category: body.category,
	        payment_method: body.paymentMethod,
	        amount: body.amount,
	        recurring: body.recurring,
	        notes: body.notes ?? null
      })
      .eq('id', params.id)
      .eq('company_id', auth.companyId)
      .select('*')
      .single();
    if (error) return reply.status(400).send({ message: 'Erro ao atualizar despesa', detail: error.message });
    const rules = await getRules(auth.companyId);
    const rulesMap = new Map(rules.map((item) => [item.method, item]));
    return reply.send(mapExpense(data, rulesMap));
  });

	  app.delete('/finance/expenses/:id', financeGuard, async (request, reply) => {
	    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
	    const params = request.params as { id: string };
    const { error } = await supabaseAdmin
      .from('financial_expenses')
      .delete()
      .eq('id', params.id)
      .eq('company_id', auth.companyId);
	    if (error) return reply.status(400).send({ message: 'Erro ao remover despesa', detail: error.message });
	    return reply.status(204).send();
	  });

	  app.put('/finance/expenses/:id/reconciled', financeGuard, async (request, reply) => {
	    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
	    const params = request.params as { id: string };
	    const body = reconciledSchema.parse(request.body);
	    const { data, error } = await supabaseAdmin
	      .from('financial_expenses')
	      .update({ reconciled: body.reconciled, updated_at: new Date().toISOString() })
	      .eq('id', params.id)
	      .eq('company_id', auth.companyId)
	      .select('*')
	      .single();
	    if (error) return reply.status(400).send({ message: 'Erro ao conferir despesa', detail: error.message });
	    const rules = await getRules(auth.companyId);
	    const rulesMap = new Map(rules.map((item) => [item.method, item]));
	    return reply.send(mapExpense(data, rulesMap));
	  });

	  app.get('/finance/dashboard', financeGuard, async (request) => {
	    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
	    const range = parseDateRange(request.query);
	    const rules = await getRules(auth.companyId);
	    const originCostRules = await getOriginCostRules(auth.companyId);
	    const rulesMap = new Map(rules.map((item) => [item.method, item]));
	    const originCostMap = new Map(originCostRules.map((item) => [item.origin, item.costPercent]));

		    const [{ data: accounts }, { data: sales }, { data: expenses }, { data: orders }, { data: closing }] = await Promise.all([
	      supabaseAdmin
	        .from('financial_accounts')
	        .select('id, name, account_type, balance_amount')
	        .eq('company_id', auth.companyId),
      supabaseAdmin
        .from('financial_manual_sales')
        .select('*')
        .eq('company_id', auth.companyId)
        .gte('occurred_at', range.fromIso)
        .lte('occurred_at', range.toIso),
      supabaseAdmin
        .from('financial_expenses')
        .select('*')
        .eq('company_id', auth.companyId)
        .gte('occurred_at', range.fromIso)
        .lte('occurred_at', range.toIso),
      supabaseAdmin
        .from('orders')
        .select('order_datetime, status, type, products, additions, discount_mode, discount_value, shipping_value')
        .eq('company_id', auth.companyId)
        .in('status', ['CONFIRMADO', 'CONCLUIDO'])
	        .eq('type', 'PEDIDO')
	        .gte('order_datetime', range.fromIso)
	        .lte('order_datetime', range.toIso),
	      supabaseAdmin
	        .from('financial_daily_closings')
	        .select('*')
	        .eq('company_id', auth.companyId)
	        .eq('closing_date', range.to)
	        .maybeSingle()
	    ]);

	    const accountsBalance = (accounts ?? []).reduce((sum, item) => sum + Number(item.balance_amount ?? 0), 0);
	    const accountsByType = new Map(
	      ['BANK', 'CASH', 'CARD_RECEIVABLE', 'IFOOD_RECEIVABLE', 'OTHER'].map((type) => [
	        type,
	        { accountType: type, balanceAmount: 0, count: 0 }
	      ])
	    );
	    for (const account of accounts ?? []) {
	      const type = String(account.account_type ?? 'BANK');
	      const entry = accountsByType.get(type) ?? accountsByType.get('OTHER');
	      if (!entry) continue;
	      entry.balanceAmount += Number(account.balance_amount ?? 0);
	      entry.count += 1;
	    }
    const manualSalesGross = (sales ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const manualSalesNet = (sales ?? []).reduce((sum, row) => {
      const amount = Number(row.amount ?? 0);
      const rule = rulesMap.get(toMethodKey(row.payment_method));
      return sum + calcLiquidByRule(amount, rule);
    }, 0);
    const manualSalesFees = Math.max(manualSalesGross - manualSalesNet, 0);

		    const salesByOrigin = new Map<SaleOrigin, { origin: SaleOrigin; gross: number; net: number; estimatedCost: number; estimatedProfit: number; count: number }>(
		      saleOrigins.map((origin) => [origin, { origin, gross: 0, net: 0, estimatedCost: 0, estimatedProfit: 0, count: 0 }])
		    );
	    let manualSalesEstimatedCost = 0;
    const salesByMethod = new Map<MethodRule['method'], { method: MethodRule['method']; gross: number; net: number; fees: number; count: number }>(
      ['PIX', 'DINHEIRO', 'CARTAO', 'VOUCHER'].map((method) => [
        method as MethodRule['method'],
        { method: method as MethodRule['method'], gross: 0, net: 0, fees: 0, count: 0 }
      ])
    );

    for (const row of sales ?? []) {
      const amount = Number(row.amount ?? 0);
      const method = toMethodKey(row.payment_method);
      const rule = rulesMap.get(method);
      const net = calcLiquidByRule(amount, rule);
	      const origin = getSaleOrigin(row.tags);
	      const estimatedCost = net * ((originCostMap.get(origin) ?? 0) / 100);
	      manualSalesEstimatedCost += estimatedCost;
	      const originEntry = salesByOrigin.get(origin);
	      if (originEntry) {
	        originEntry.gross += amount;
	        originEntry.net += net;
	        originEntry.estimatedCost += estimatedCost;
	        originEntry.estimatedProfit += net - estimatedCost;
	        originEntry.count += 1;
	      }
      const methodEntry = salesByMethod.get(method);
      if (methodEntry) {
        methodEntry.gross += amount;
        methodEntry.net += net;
        methodEntry.fees += Math.max(amount - net, 0);
        methodEntry.count += 1;
      }
    }

	    const expensesGross = (expenses ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
	    const expensesNet = (expenses ?? []).reduce((sum, row) => {
	      const amount = Number(row.amount ?? 0);
	      const rule = rulesMap.get(toMethodKey(row.payment_method));
	      return sum + calcLiquidByRule(amount, rule);
	    }, 0);
	    const recurringExpensesNet = (expenses ?? []).reduce((sum, row) => {
	      if (!row.recurring) return sum;
	      const amount = Number(row.amount ?? 0);
	      const rule = rulesMap.get(toMethodKey(row.payment_method));
	      return sum + calcLiquidByRule(amount, rule);
	    }, 0);
	    const expensesByCategory = new Map(
	      expenseCategories.map((category) => [category, { category, amount: 0, count: 0 }])
	    );
	    for (const row of expenses ?? []) {
	      const category = expenseCategories.includes(String(row.category) as (typeof expenseCategories)[number])
	        ? String(row.category)
	        : 'OUTROS';
	      const entry = expensesByCategory.get(category as (typeof expenseCategories)[number]);
	      if (!entry) continue;
	      const amount = Number(row.amount ?? 0);
	      const rule = rulesMap.get(toMethodKey(row.payment_method));
	      entry.amount += calcLiquidByRule(amount, rule);
	      entry.count += 1;
	    }

		    const ordersTotal = (orders ?? []).reduce((sum, row) => sum + calcOrderTotal(row), 0);
		    const ordersEstimatedCost = (orders ?? []).reduce((sum, row) => sum + calcOrderEstimatedProductCost(row), 0);
		    const ordersEstimatedProfit = ordersTotal - ordersEstimatedCost;
		    const manualSalesEstimatedProfit = manualSalesNet - manualSalesEstimatedCost;
		    const totalEntries = manualSalesNet + ordersTotal;
		    const projectedBalance = accountsBalance + totalEntries - expensesNet;
		    const estimatedGrossProfit = ordersEstimatedProfit + manualSalesEstimatedProfit;
		    const estimatedNetProfit = estimatedGrossProfit - expensesNet;
	    const dailyClosing = mapClosing(closing);
	    const checkedBalance = dailyClosing?.checkedBalance;
	    const balanceDifference = typeof checkedBalance === 'number' ? checkedBalance - projectedBalance : null;

    const byDay = new Map(
      eachDate(range.from, range.to).map((date) => [
        date,
        { date, orders: 0, manualSales: 0, expenses: 0, net: 0 }
      ])
    );

    for (const row of orders ?? []) {
      const date = String(row.order_datetime).slice(0, 10);
      const entry = byDay.get(date);
      if (!entry) continue;
      entry.orders += calcOrderTotal(row);
      entry.net = entry.orders + entry.manualSales - entry.expenses;
    }

    for (const row of sales ?? []) {
      const date = String(row.occurred_at).slice(0, 10);
      const entry = byDay.get(date);
      if (!entry) continue;
      const amount = Number(row.amount ?? 0);
      const rule = rulesMap.get(toMethodKey(row.payment_method));
      entry.manualSales += calcLiquidByRule(amount, rule);
      entry.net = entry.orders + entry.manualSales - entry.expenses;
    }

    for (const row of expenses ?? []) {
      const date = String(row.occurred_at).slice(0, 10);
      const entry = byDay.get(date);
      if (!entry) continue;
      const amount = Number(row.amount ?? 0);
      const rule = rulesMap.get(toMethodKey(row.payment_method));
      entry.expenses += calcLiquidByRule(amount, rule);
      entry.net = entry.orders + entry.manualSales - entry.expenses;
    }

    return {
      range: { from: range.from, to: range.to },
      totals: {
        accountsBalance,
        ordersTotal,
        ordersCount: (orders ?? []).length,
	        manualSalesGross,
	        manualSalesNet,
	        manualSalesFees,
	        manualSalesEstimatedCost,
	        manualSalesEstimatedProfit,
	        ordersEstimatedCost,
	        ordersEstimatedProfit,
	        expensesGross,
	        expensesNet,
	        recurringExpensesNet,
	        totalEntries,
	        netResult: totalEntries - expensesNet,
	        estimatedGrossProfit,
	        estimatedNetProfit,
	        projectedBalance,
	        checkedBalance,
	        balanceDifference
	      },
	      chart: Array.from(byDay.values()),
	      salesByOrigin: Array.from(salesByOrigin.values()),
	      salesByMethod: Array.from(salesByMethod.values()),
	      expensesByCategory: Array.from(expensesByCategory.values()),
	      methodRules: rules,
	      originCostRules,
	      dailyClosing,
	      accountsByType: Array.from(accountsByType.values()),
	      accounts: (accounts ?? []).map((item) => ({
	        id: item.id,
	        name: item.name,
	        accountType: item.account_type ?? 'BANK',
	        balanceAmount: Number(item.balance_amount ?? 0)
	      }))
    };
  });
};
