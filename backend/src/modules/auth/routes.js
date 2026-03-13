import { requireAuth } from '../../core/http/auth.js';

export async function registerAuthRoutes(fastify) {
  fastify.post('/api/auth/register-with-invite', async (request) => {
    return fastify.authService.registerWithInvite(request.body);
  });

  fastify.post('/api/auth/login', async (request) => {
    return fastify.authService.loginWithPassword(request.body);
  });

  fastify.get('/api/auth/me', { preHandler: requireAuth }, async (request) => {
    return {
      user: fastify.authService.toSafeUser(request.currentUser),
    };
  });

  fastify.patch('/api/auth/password', { preHandler: requireAuth }, async (request) => {
    return fastify.authService.changePassword(request.currentUser.id, request.body);
  });
}
