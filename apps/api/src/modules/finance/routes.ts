import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';

const paymentMethodSchema = z.enum(['PIX', 'DINHEIRO', 'CARTAO', 'VOUCHER']);
const ruleModeSchema = z.enum(['NONE', 'PERCENT', 'FIXED_ADD', 'FIXED_SUBTRACT']);

const dateRangeQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  tag: z.string().optional(),
  search: z.string().optional()
});

const accountSchema = z.object({
  name: z.string().min(2),
  institution: z.string().optional(),
  balanceDate: z.string().min(1),
  balanceAmount: z.number(),
  notes: z.string().optional()
});

const methodRuleSchema = z.object({
  method: paymentMethodSchema,
  mode: ruleModeSchema,
  value: z.number().min(0)
});

const methodRulesPayloadSchema = z.object({
  rules: z.array(methodRuleSchema)
});

const tagsSchema = z.array(z.string().trim().min(1).max(40)).max(12);

const manualSaleSchema = z.object({
  accountId: z.string().uuid().optional(),
  occurredAt: z.string().min(1),
  description: z.string().min(2),
  paymentMethod: paymentMethodSchema,
  amount: z.number().positive(),
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
  category: z.string().optional(),
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

const toMethodKey = (value: unknown): MethodRule['method'] =>
  paymentMethodSchema.parse(String(value));

const normalizeTags = (tags?: string[]) =>
  Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))).slice(0, 12);

export const financeRoutes = async (app: FastifyInstance) => {
  const financeGuard = { preHandler: [app.authenticate, app.requireModule('financeiro')] };

  const mapAccount = (row: any) => ({
    id: row.id,
    name: row.name,
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
      category: row.category ?? '',
      paymentMethod: row.payment_method as z.infer<typeof paymentMethodSchema>,
      amount,
      netAmount: calcLiquidByRule(amount, rule),
      notes: row.notes ?? '',
      createdAt: row.created_at
    };
  };

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
    const payload = lines.map((line) => ({
      company_id: auth.companyId,
      account_id: body.accountId ?? null,
      occurred_at: body.occurredAt,
      description: body.description,
      payment_method: line.paymentMethod,
      amount: line.amount,
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
        category: body.category ?? null,
        payment_method: body.paymentMethod,
        amount: body.amount,
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
        category: body.category ?? null,
        payment_method: body.paymentMethod,
        amount: body.amount,
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

  app.get('/finance/dashboard', financeGuard, async (request) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const range = parseDateRange(request.query);
    const rules = await getRules(auth.companyId);
    const rulesMap = new Map(rules.map((item) => [item.method, item]));

    const [{ data: accounts }, { data: sales }, { data: expenses }, { data: orders }] = await Promise.all([
      supabaseAdmin
        .from('financial_accounts')
        .select('id, name, balance_amount')
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
        .lte('order_datetime', range.toIso)
    ]);

    const accountsBalance = (accounts ?? []).reduce((sum, item) => sum + Number(item.balance_amount ?? 0), 0);
    const manualSalesGross = (sales ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const manualSalesNet = (sales ?? []).reduce((sum, row) => {
      const amount = Number(row.amount ?? 0);
      const rule = rulesMap.get(toMethodKey(row.payment_method));
      return sum + calcLiquidByRule(amount, rule);
    }, 0);

    const expensesGross = (expenses ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const expensesNet = (expenses ?? []).reduce((sum, row) => {
      const amount = Number(row.amount ?? 0);
      const rule = rulesMap.get(toMethodKey(row.payment_method));
      return sum + calcLiquidByRule(amount, rule);
    }, 0);

    const ordersTotal = (orders ?? []).reduce((sum, row) => sum + calcOrderTotal(row), 0);
    const totalEntries = manualSalesNet + ordersTotal;
    const projectedBalance = accountsBalance + totalEntries - expensesNet;

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
        expensesGross,
        expensesNet,
        totalEntries,
        netResult: totalEntries - expensesNet,
        projectedBalance
      },
      chart: Array.from(byDay.values()),
      methodRules: rules,
      accounts: (accounts ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        balanceAmount: Number(item.balance_amount ?? 0)
      }))
    };
  });
};
