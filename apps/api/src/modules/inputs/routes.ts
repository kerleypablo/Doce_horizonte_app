import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '../../db/mock.js';

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
  app.get('/inputs', { preHandler: app.authenticate }, async (request) => {
    const user = request.user as { companyId: string };
    return db.inputs.filter((input) => input.companyId === user.companyId);
  });

  app.post('/inputs', { preHandler: app.authenticate }, async (request, reply) => {
    const user = request.user as { companyId: string };
    const data = inputSchema.parse(request.body);

    const input = {
      id: crypto.randomUUID(),
      companyId: user.companyId,
      ...data
    };

    db.inputs.push(input);
    return reply.status(201).send(input);
  });

  app.put('/inputs/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const user = request.user as { companyId: string };
    const data = inputSchema.parse(request.body);
    const id = request.params as { id: string };
    const idx = db.inputs.findIndex((input) => input.id === id.id && input.companyId === user.companyId);

    if (idx === -1) return reply.status(404).send({ message: 'Nao encontrado' });

    db.inputs[idx] = { ...db.inputs[idx], ...data };
    return reply.send(db.inputs[idx]);
  });

  app.delete('/inputs/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const user = request.user as { companyId: string };
    const id = request.params as { id: string };
    const idx = db.inputs.findIndex((input) => input.id === id.id && input.companyId === user.companyId);

    if (idx === -1) return reply.status(404).send({ message: 'Nao encontrado' });

    db.inputs.splice(idx, 1);
    return reply.status(204).send();
  });
};
