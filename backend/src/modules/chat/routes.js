import { requireAuth } from '../../core/http/auth.js';

export async function registerChatRoutes(fastify) {
  fastify.get('/api/conversations', { preHandler: requireAuth }, async (request) => {
    return {
      conversations: await fastify.chatService.listConversations(request.currentUser.id),
    };
  });

  fastify.post('/api/conversations/direct', { preHandler: requireAuth }, async (request) => {
    return {
      conversation: await fastify.chatService.createDirectConversation(
        request.currentUser.id,
        request.body.peerUserId,
      ),
    };
  });

  fastify.post('/api/conversations/group', { preHandler: requireAuth }, async (request) => {
    return {
      conversation: await fastify.chatService.createGroupConversation(
        request.currentUser.id,
        request.body,
      ),
    };
  });

  fastify.get('/api/conversations/:conversationId/messages', { preHandler: requireAuth }, async (request) => {
    return {
      messages: await fastify.chatService.listMessages(
        request.currentUser.id,
        request.params.conversationId,
        request.query,
      ),
    };
  });

  fastify.post('/api/conversations/:conversationId/messages', { preHandler: requireAuth }, async (request) => {
    const result = await fastify.chatService.sendMessage(
      request.currentUser.id,
      request.params.conversationId,
      request.body,
    );

    try {
      fastify.realtimeHub.broadcastUsers(result.conversation.memberIds, {
        type: 'message.created',
        payload: result.message,
      });
    } catch {
      // The message is already persisted; realtime fanout should not break send.
    }

    return result;
  });

  fastify.post('/api/conversations/:conversationId/read', { preHandler: requireAuth }, async (request) => {
    const receipt = await fastify.chatService.markRead(
      request.currentUser.id,
      request.params.conversationId,
      request.body?.messageId,
    );

    try {
      const members = await fastify.chatService.getConversationMembers(request.params.conversationId);
      fastify.realtimeHub.broadcastUsers(members, {
        type: 'read.updated',
        payload: receipt,
      });
    } catch {
      // Read receipts are best effort when realtime transport is unstable.
    }

    return receipt;
  });
}
