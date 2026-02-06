import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '../../db/mock.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(3)
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(3),
  role: z.enum(['admin', 'common']).default('common')
});

export const authRoutes = async (app: FastifyInstance) => {
  app.post('/auth/login', async (request, reply) => {
    const data = loginSchema.parse(request.body);
    const user = db.users.find((u) => u.email === data.email && u.passwordHash === data.password);

    if (!user) {
      return reply.status(401).send({ message: 'Credenciais invalidas' });
    }

    const token = app.jwt.sign({ sub: user.id, role: user.role, companyId: user.companyId });
    return reply.send({ token, role: user.role });
  });

  app.post('/auth/register', { preHandler: app.authenticate }, async (request, reply) => {
    const data = registerSchema.parse(request.body);
    const requester = request.user as { role: 'admin' | 'common'; companyId: string } | undefined;

    if (!requester || requester.role !== 'admin') {
      return reply.status(403).send({ message: 'Apenas admin' });
    }

    if (db.users.some((u) => u.email === data.email)) {
      return reply.status(409).send({ message: 'Email ja existe' });
    }

    db.users.push({
      id: crypto.randomUUID(),
      email: data.email,
      passwordHash: data.password,
      role: data.role,
      companyId: requester.companyId
    });

    return reply.status(201).send({ ok: true });
  });

  app.get('/auth/me', { preHandler: app.authenticate }, async (request) => {
    const user = request.user as { sub: string; role: string; companyId: string } | undefined;
    return { id: user?.sub, role: user?.role, companyId: user?.companyId };
  });
};
