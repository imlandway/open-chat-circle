import { requireAuth } from '../../core/http/auth.js';

export async function registerChatRoutes(fastify) {
  fastify.get('/api/conversations', { preHandler: requireAuth }, async (request) => {
    return {
      conversations: await fastify.chatService.listConversations(request.currentUser.id),
    };
  });

  fastify.get('/api/conversations/:conversationId', { preHandler: requireAuth }, async (request) => {
    return {
      conversation: await fastify.chatService.getConversationDetail(
        request.currentUser.id,
        request.params.conversationId,
      ),
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

  fastify.post('/api/conversations/:conversationId/members', { preHandler: requireAuth }, async (request) => {
    const conversation = await fastify.chatService.addGroupMembers(
      request.currentUser.id,
      request.params.conversationId,
      request.body?.memberIds,
    );

    try {
      fastify.realtimeHub.broadcastUsers(conversation.memberIds, {
        type: 'conversation.updated',
        payload: conversation,
      });
    } catch {
      // Group updates are best effort when realtime transport is unstable.
    }

    return { conversation };
  });

  fastify.delete('/api/conversations/:conversationId/members/:memberId', { preHandler: requireAuth }, async (request) => {
    const previousMembers = await fastify.chatService.getConversationMembers(request.params.conversationId);
    const conversation = await fastify.chatService.removeGroupMember(
      request.currentUser.id,
      request.params.conversationId,
      request.params.memberId,
    );

    try {
      fastify.realtimeHub.broadcastUsers([...new Set([...previousMembers, ...conversation.memberIds])], {
        type: 'conversation.updated',
        payload: conversation,
      });
    } catch {
      // Group updates are best effort when realtime transport is unstable.
    }

    return { conversation };
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

  fastify.post('/api/conversations/:conversationId/messages/:messageId/recall', { preHandler: requireAuth }, async (request) => {
    const result = await fastify.chatService.recallMessage(
      request.currentUser.id,
      request.params.conversationId,
      request.params.messageId,
    );

    try {
      fastify.realtimeHub.broadcastUsers(result.conversation.memberIds, {
        type: 'message.updated',
        payload: result.message,
      });
      fastify.realtimeHub.broadcastUsers(result.conversation.memberIds, {
        type: 'conversation.updated',
        payload: result.conversation,
      });
    } catch {
      // Recall fanout is best effort when realtime transport is unstable.
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
