import { requireAdmin, requireAuth } from '../../core/http/auth.js';

export async function registerSocialRoutes(fastify) {
  fastify.get('/api/contacts', { preHandler: requireAuth }, async (request) => {
    return {
      contacts: await fastify.socialService.listContacts(request.currentUser.id),
    };
  });

  fastify.get('/api/users/discover', { preHandler: requireAuth }, async (request) => {
    return {
      users: await fastify.socialService.listDiscoverableUsers(
        request.currentUser.id,
        request.query?.q,
      ),
    };
  });

  fastify.post('/api/friends', { preHandler: requireAuth }, async (request) => {
    return fastify.socialService.addFriend(request.currentUser.id, request.body ?? {});
  });

  fastify.get('/api/admin/users', { preHandler: requireAdmin }, async (request) => {
    return {
      users: await fastify.socialService.listUsersForAdmin(request.currentUser),
    };
  });

  fastify.get('/api/invites', { preHandler: requireAdmin }, async (request) => {
    return {
      invites: await fastify.socialService.listInvites(request.currentUser),
    };
  });

  fastify.post('/api/invites', { preHandler: requireAdmin }, async (request) => {
    return {
      invite: await fastify.socialService.createInvite(request.currentUser, request.body),
    };
  });

  fastify.patch('/api/users/me', { preHandler: requireAuth }, async (request) => {
    return {
      user: await fastify.socialService.updateProfile(request.currentUser.id, request.body),
    };
  });

  fastify.post('/api/admin/users/:userId/reset-password', { preHandler: requireAdmin }, async (request) => {
    return fastify.authService.resetPassword(request.currentUser, request.params.userId, request.body);
  });

  fastify.post('/api/admin/users/:userId/ban', { preHandler: requireAdmin }, async (request) => {
    return fastify.socialService.banUser(request.currentUser, request.params.userId);
  });
}
