import type { FastifyInstance } from 'fastify';
import type { AuthContext } from '../common/auth.js';
import { searchRecords, previewPurchase } from './service.js';
export const mcpRoutes = async (app: FastifyInstance) => {
  app.post('/mcp-local/purchase-preview', { preHandler: [app.authenticate] }, async request =>
    previewPurchase((request as typeof request & { auth: AuthContext }).auth, request.body));
  app.get('/mcp-local/search', { preHandler: [app.authenticate] }, async request =>
    searchRecords((request as typeof request & { auth: AuthContext }).auth, request.query));
};
