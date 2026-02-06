import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';

const inputSchema = z.object({
  name: z.string().min(2),
  brand: z.string().optional(),
  category: z.enum(['embalagem', 'producao', 'outros']),
  unit: z.enum(['kg', 'g', 'l', 'ml', 'un']),
  packageSize: z.number().positive(),
  packagePrice: z.number().positive(),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional()
});

export const inputRoutes = async (app: FastifyInstance) => {
  const mapInput = (row: any) => ({
    id: row.id,
    name: row.name,
    brand: row.brand ?? undefined,
    category: row.category,
    unit: row.unit,
    packageSize: Number(row.package_size),
    packagePrice: Number(row.package_price),
    tags: row.tags ?? [],
    notes: row.notes ?? undefined
  });

  app.get('/inputs', { preHandler: app.authenticate }, async (request) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const { data } = await supabaseAdmin
      .from('inputs')
      .select('*')
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: false });
    return (data ?? []).map(mapInput);
  });

  app.post('/inputs', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const data = inputSchema.parse(request.body);

    const { data: created, error } = await supabaseAdmin
      .from('inputs')
      .insert({
        company_id: auth.companyId,
        name: data.name,
        brand: data.brand,
        category: data.category,
        unit: data.unit,
        package_size: data.packageSize,
        package_price: data.packagePrice,
        tags: data.tags,
        notes: data.notes
      })
      .select('*')
      .single();

    if (error) return reply.status(400).send({ message: 'Erro ao criar insumo' });
    return reply.status(201).send(mapInput(created));
  });

  app.put('/inputs/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const data = inputSchema.parse(request.body);
    const id = request.params as { id: string };

    const { data: updated, error } = await supabaseAdmin
      .from('inputs')
      .update({
        name: data.name,
        brand: data.brand,
        category: data.category,
        unit: data.unit,
        package_size: data.packageSize,
        package_price: data.packagePrice,
        tags: data.tags,
        notes: data.notes
      })
      .eq('id', id.id)
      .eq('company_id', auth.companyId)
      .select('*')
      .single();

    if (error) return reply.status(404).send({ message: 'Nao encontrado' });
    return reply.send(mapInput(updated));
  });

  app.delete('/inputs/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const id = request.params as { id: string };

    const { error } = await supabaseAdmin
      .from('inputs')
      .delete()
      .eq('id', id.id)
      .eq('company_id', auth.companyId);

    if (error) return reply.status(404).send({ message: 'Nao encontrado' });
    return reply.status(204).send();
  });
};
