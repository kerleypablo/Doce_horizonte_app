import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';

const orderProductSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  unitPrice: z.number().min(0),
  quantity: z.number().positive(),
  notes: z.string().optional()
});

const orderAdjustmentSchema = z.object({
  label: z.string().min(1),
  mode: z.enum(['PERCENT', 'FIXED']),
  value: z.number().min(0)
});

const orderPaymentSchema = z.object({
  date: z.string().min(1),
  amount: z.number().positive(),
  note: z.string().optional()
});

const orderImageSchema = z.object({
  name: z.string().min(1),
  dataUrl: z.string().min(1)
});

const orderSchema = z.object({
  type: z.enum(['PEDIDO', 'ORCAMENTO']),
  orderDateTime: z.string().min(1),
  customerId: z.string().optional(),
  customerSnapshot: z
    .object({
      name: z.string().min(1),
      phone: z.string().min(8),
      personType: z.enum(['PF', 'PJ']).optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      number: z.string().optional(),
      city: z.string().optional(),
      neighborhood: z.string().optional(),
      zipCode: z.string().optional()
    })
    .optional(),
  deliveryType: z.enum(['ENTREGA', 'RETIRADA']),
  deliveryDate: z.string().optional(),
  status: z.enum(['AGUARDANDO_RETORNO', 'CONCLUIDO', 'CONFIRMADO', 'CANCELADO']),
  products: z.array(orderProductSchema).default([]),
  additions: z.array(orderAdjustmentSchema).default([]),
  discountMode: z.enum(['PERCENT', 'FIXED']).default('FIXED'),
  discountValue: z.number().min(0).default(0),
  shippingValue: z.number().min(0).default(0),
  notesDelivery: z.string().optional(),
  notesGeneral: z.string().optional(),
  notesPayment: z.string().optional(),
  pix: z.string().optional(),
  terms: z.string().optional(),
  payments: z.array(orderPaymentSchema).default([]),
  images: z.array(orderImageSchema).default([]),
  alerts: z.array(z.object({ label: z.string().min(1), enabled: z.boolean().default(false) })).default([])
});

const startOfDayUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
};

const endOfDayUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
};

const formatOrderNumber = (seq: number) => {
  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}-${String(seq).padStart(2, '0')}`;
};

const parseSeqFromNumber = (value?: string | null) => {
  if (!value) return 0;
  const parts = value.split('-');
  const last = parts[parts.length - 1];
  const seq = Number(last);
  return Number.isFinite(seq) ? seq : 0;
};

export const orderRoutes = async (app: FastifyInstance) => {
  const mapOrder = (row: any) => ({
    id: row.id,
    number: row.number,
    type: row.type,
    orderDateTime: row.order_datetime,
    customerId: row.customer_id ?? undefined,
    customerSnapshot: row.customer_snapshot ?? undefined,
    deliveryType: row.delivery_type,
    deliveryDate: row.delivery_date ?? undefined,
    status: row.status,
    products: row.products ?? [],
    additions: row.additions ?? [],
    discountMode: row.discount_mode ?? 'FIXED',
    discountValue: Number(row.discount_value ?? 0),
    shippingValue: Number(row.shipping_value ?? 0),
    notesDelivery: row.notes_delivery ?? undefined,
    notesGeneral: row.notes_general ?? undefined,
    notesPayment: row.notes_payment ?? undefined,
    pix: row.pix ?? undefined,
    terms: row.terms ?? undefined,
    payments: row.payments ?? [],
    images: row.images ?? [],
    alerts: row.alerts ?? []
  });

  app.get('/orders', { preHandler: app.authenticate }, async (request) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const { data } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: false });

    return (data ?? []).map(mapOrder);
  });

  app.post('/orders', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const data = orderSchema.parse(request.body);

    const { data: latestToday } = await supabaseAdmin
      .from('orders')
      .select('number')
      .eq('company_id', auth.companyId)
      .gte('created_at', startOfDayUtc().toISOString())
      .lte('created_at', endOfDayUtc().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    let nextSeq = parseSeqFromNumber(latestToday?.[0]?.number) + 1;
    let lastError: any = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const number = formatOrderNumber(nextSeq + attempt);
      const { data: created, error } = await supabaseAdmin
        .from('orders')
        .insert({
          company_id: auth.companyId,
          number,
          type: data.type,
          order_datetime: data.orderDateTime,
          customer_id: data.customerId ?? null,
          customer_snapshot: data.customerSnapshot ?? null,
          delivery_type: data.deliveryType,
          delivery_date: data.deliveryDate ?? null,
          status: data.status,
          products: data.products,
          additions: data.additions,
          discount_mode: data.discountMode,
          discount_value: data.discountValue,
          shipping_value: data.shippingValue,
          notes_delivery: data.notesDelivery,
          notes_general: data.notesGeneral,
          notes_payment: data.notesPayment,
          pix: data.pix,
          terms: data.terms,
          payments: data.payments,
          images: data.images,
          alerts: data.alerts
        })
        .select('*')
        .single();

      if (!error) return reply.status(201).send(mapOrder(created));
      lastError = error;
      if (error.code !== '23505') break;
    }

    return reply.status(400).send({ message: lastError?.message ?? 'Erro ao criar pedido' });
  });

  app.put('/orders/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const id = request.params as { id: string };
    const data = orderSchema.parse(request.body);

    const { data: updated, error } = await supabaseAdmin
      .from('orders')
      .update({
        type: data.type,
        order_datetime: data.orderDateTime,
        customer_id: data.customerId ?? null,
        customer_snapshot: data.customerSnapshot ?? null,
        delivery_type: data.deliveryType,
        delivery_date: data.deliveryDate ?? null,
        status: data.status,
        products: data.products,
        additions: data.additions,
        discount_mode: data.discountMode,
        discount_value: data.discountValue,
        shipping_value: data.shippingValue,
        notes_delivery: data.notesDelivery,
        notes_general: data.notesGeneral,
        notes_payment: data.notesPayment,
        pix: data.pix,
        terms: data.terms,
        payments: data.payments,
        images: data.images,
        alerts: data.alerts
      })
      .eq('id', id.id)
      .eq('company_id', auth.companyId)
      .select('*')
      .single();

    if (error) return reply.status(404).send({ message: 'Pedido nao encontrado' });
    return reply.send(mapOrder(updated));
  });
};
