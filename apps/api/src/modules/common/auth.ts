import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Role } from '../../db/mock.js';

export const registerAuth = (app: FastifyInstance) => {
  app.decorate('authenticate', async (request: FastifyRequest) => {
    await request.jwtVerify();
  });

  app.decorate('authorize', (role: Role) => async (request: FastifyRequest) => {
    const user = request.user as { role: Role } | undefined;
    if (!user || user.role !== role) {
      throw app.httpErrors.forbidden('Sem permissao');
    }
  });
};

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
    authorize: (role: Role) => (request: FastifyRequest) => Promise<void>;
  }
}
