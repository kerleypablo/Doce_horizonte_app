import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '../../db/mock.js';

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
    const user = request.user as { companyId: string };
    const company = db.companies.find((c) => c.id === user.companyId);
    if (!company) return reply.status(404).send({ message: 'Empresa nao encontrada' });
    return company.settings;
  });

  app.put('/company/settings', { preHandler: app.authenticate }, async (request, reply) => {
    const user = request.user as { companyId: string; role: string };
    if (user.role !== 'admin') return reply.status(403).send({ message: 'Apenas admin' });

    const data = settingsSchema.parse(request.body);
    const company = db.companies.find((c) => c.id === user.companyId);
    if (!company) return reply.status(404).send({ message: 'Empresa nao encontrada' });

    company.settings = {
      ...data,
      salesChannels: data.salesChannels.map((channel) => ({
        ...channel,
        id: channel.id ?? crypto.randomUUID()
      }))
    };

    return reply.send(company.settings);
  });
};
