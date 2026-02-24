import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';

const customerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(8),
  personType: z.enum(['PF', 'PJ']).optional().default('PF'),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  number: z.string().optional(),
  city: z.string().optional(),
  neighborhood: z.string().optional(),
  zipCode: z.string().optional(),
  notes: z.string().optional()
});

export const customerRoutes = async (app: FastifyInstance) => {
  const mapCustomer = (row: any) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    personType: (row.person_type ?? 'PF') as 'PF' | 'PJ',
    email: row.email ?? undefined,
    address: row.address ?? undefined,
    number: row.number ?? undefined,
    city: row.city ?? undefined,
    neighborhood: row.neighborhood ?? undefined,
    zipCode: row.zip_code ?? undefined,
    notes: row.notes ?? undefined
  });

  app.get('/customers', { preHandler: app.authenticate }, async (request) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const { data } = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: false });

    return (data ?? []).map(mapCustomer);
  });

  app.post('/customers', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const data = customerSchema.parse(request.body);

    const { data: created, error } = await supabaseAdmin
      .from('customers')
      .insert({
        company_id: auth.companyId,
        name: data.name,
        phone: data.phone,
        person_type: data.personType,
        email: data.email || null,
        address: data.address,
        number: data.number,
        city: data.city,
        neighborhood: data.neighborhood,
        zip_code: data.zipCode,
        notes: data.notes
      })
      .select('*')
      .single();

    if (error) return reply.status(400).send({ message: 'Erro ao criar cliente' });
    return reply.status(201).send(mapCustomer(created));
  });

  app.put('/customers/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const data = customerSchema.parse(request.body);
    const id = request.params as { id: string };

    const { data: updated, error } = await supabaseAdmin
      .from('customers')
      .update({
        name: data.name,
        phone: data.phone,
        person_type: data.personType,
        email: data.email || null,
        address: data.address,
        number: data.number,
        city: data.city,
        neighborhood: data.neighborhood,
        zip_code: data.zipCode,
        notes: data.notes
      })
      .eq('id', id.id)
      .eq('company_id', auth.companyId)
      .select('*')
      .single();

    if (error) return reply.status(404).send({ message: 'Nao encontrado' });
    return reply.send(mapCustomer(updated));
  });
};
