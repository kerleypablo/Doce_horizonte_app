import type { FastifyInstance, FastifyRequest } from 'fastify';
import { supabaseAdmin, getAppUserByAuthId } from '../../db/supabase.js';

export type AuthContext = {
  userId: string;
  companyId: string;
  role: 'admin' | 'common';
};

export const registerAuth = (app: FastifyInstance) => {
  app.decorate('authenticateSupabase', async (request: FastifyRequest) => {
    const header = request.headers.authorization;
    if (!header) throw app.httpErrors.unauthorized('Token ausente');

    const token = header.replace('Bearer ', '');
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      throw app.httpErrors.unauthorized('Token invalido');
    }

    (request as FastifyRequest & { authUserId: string }).authUserId = data.user.id;
  });

  app.decorate('authenticate', async (request: FastifyRequest) => {
    await app.authenticateSupabase(request);
    const authUserId = (request as FastifyRequest & { authUserId: string }).authUserId;

    const appUser = await getAppUserByAuthId(authUserId);
    if (!appUser) {
      throw app.httpErrors.forbidden('Usuario sem empresa vinculada');
    }
    (request as FastifyRequest & { auth: AuthContext }).auth = {
      userId: appUser.auth_user_id,
      companyId: appUser.company_id,
      role: appUser.role
    };
  });

  app.decorate('authorize', (role: AuthContext['role']) => async (request: FastifyRequest) => {
    const auth = (request as FastifyRequest & { auth?: AuthContext }).auth;
    if (!auth || auth.role !== role) {
      throw app.httpErrors.forbidden('Sem permissao');
    }
  });
};

declare module 'fastify' {
  interface FastifyInstance {
    authenticateSupabase: (request: FastifyRequest) => Promise<void>;
    authenticate: (request: FastifyRequest) => Promise<void>;
    authorize: (role: AuthContext['role']) => (request: FastifyRequest) => Promise<void>;
  }
}
