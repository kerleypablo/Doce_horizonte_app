import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin, supabaseAnon, getAppUserByAuthId } from '../../db/supabase.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(3)
});

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['admin', 'common']).default('common')
});

export const authRoutes = async (app: FastifyInstance) => {
  app.post('/auth/login', async (request, reply) => {
    const data = loginSchema.parse(request.body);
    const { data: authData, error } = await supabaseAnon.auth.signInWithPassword({
      email: data.email,
      password: data.password
    });

    if (error || !authData.session) {
      return reply.status(401).send({ message: 'Credenciais invalidas' });
    }

    const appUser = await getAppUserByAuthId(authData.user.id);
    if (!appUser) {
      return reply.status(403).send({ message: 'Usuario sem empresa vinculada' });
    }
    return reply.send({ token: authData.session.access_token, role: appUser.role });
  });

  app.post('/auth/signup', async (request, reply) => {
    const data = signupSchema.parse(request.body);

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true
    });

    if (createError || !created.user) {
      return reply.status(400).send({ message: 'Erro ao criar usuario' });
    }

    const { data: authData, error } = await supabaseAnon.auth.signInWithPassword({
      email: data.email,
      password: data.password
    });

    if (error || !authData.session) {
      return reply.status(400).send({ message: 'Erro ao autenticar' });
    }

    return reply.status(201).send({ token: authData.session.access_token });
  });

  app.post('/auth/register', { preHandler: app.authenticate }, async (request, reply) => {
    const data = registerSchema.parse(request.body);
    const auth = (request as typeof request & { auth: { companyId: string; role: string } }).auth;

    if (!auth || auth.role !== 'admin') {
      return reply.status(403).send({ message: 'Apenas admin' });
    }

    const { data: userData, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true
    });

    if (error || !userData.user) {
      return reply.status(400).send({ message: 'Erro ao criar usuario' });
    }

    await supabaseAdmin.from('app_users').insert({
      auth_user_id: userData.user.id,
      company_id: auth.companyId,
      role: data.role
    });

    return reply.status(201).send({ ok: true });
  });

  app.get('/auth/me', { preHandler: app.authenticate }, async (request) => {
    const auth = (request as typeof request & { auth: { userId: string; role: string; companyId: string } }).auth;
    return { id: auth.userId, role: auth.role, companyId: auth.companyId };
  });
};
