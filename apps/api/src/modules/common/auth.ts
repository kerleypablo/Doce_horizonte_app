import type { FastifyInstance, FastifyRequest } from 'fastify';
import { supabaseAdmin, getAppUserByAuthId, getEnabledModulesForAccess } from '../../db/supabase.js';
import type { AppModuleKey } from './modules.js';

export type AuthContext = {
  userId: string;
  companyId: string;
  role: 'master' | 'admin' | 'common';
  modules: AppModuleKey[];
};

const httpError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

export const registerAuth = (app: FastifyInstance) => {
  app.decorate('authenticateSupabase', async (request: FastifyRequest) => {
    const header = request.headers.authorization;
    if (!header) throw httpError(401, 'Token ausente');

    const token = header.replace('Bearer ', '');
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) throw httpError(401, 'Token invalido');

    (request as FastifyRequest & { authUserId: string }).authUserId = data.user.id;
  });

  app.decorate('authenticate', async (request: FastifyRequest) => {
    await app.authenticateSupabase(request);
    const authUserId = (request as FastifyRequest & { authUserId: string }).authUserId;

    const appUser = await getAppUserByAuthId(authUserId);
    if (!appUser) {
      throw httpError(403, 'Usuario sem empresa vinculada');
    }
    if (appUser.access_blocked) {
      throw httpError(403, 'Acesso bloqueado. Fale com o administrador.');
    }
    (request as FastifyRequest & { auth: AuthContext }).auth = {
      userId: appUser.auth_user_id,
      companyId: appUser.company_id,
      role: appUser.role,
      modules: await getEnabledModulesForAccess({
        companyId: appUser.company_id,
        authUserId: appUser.auth_user_id
      })
    };
  });

  app.decorate('authorize', (role: AuthContext['role']) => async (request: FastifyRequest) => {
    const auth = (request as FastifyRequest & { auth?: AuthContext }).auth;
    if (!auth || auth.role !== role) {
      throw httpError(403, 'Sem permissao');
    }
  });

  app.decorate('requireModule', (moduleKey: AppModuleKey) => async (request: FastifyRequest) => {
    let auth = (request as FastifyRequest & { auth?: AuthContext }).auth;
    if (!auth) {
      await app.authenticate(request);
      auth = (request as FastifyRequest & { auth?: AuthContext }).auth;
    }
    if (!auth || !auth.modules.includes(moduleKey)) {
      throw httpError(403, `Modulo ${moduleKey} nao habilitado para este usuario`);
    }
  });
};

declare module 'fastify' {
  interface FastifyInstance {
    authenticateSupabase: (request: FastifyRequest) => Promise<void>;
    authenticate: (request: FastifyRequest) => Promise<void>;
    authorize: (role: AuthContext['role']) => (request: FastifyRequest) => Promise<void>;
    requireModule: (moduleKey: AppModuleKey) => (request: FastifyRequest) => Promise<void>;
  }
}
