import { requireAuth } from '../../core/http/auth.js';

async function decorateConversation(fastify, conversation) {
  return fastify.aiService.decorateConversation(conversation);
}

async function decorateConversations(fastify, conversations) {
  return fastify.aiService.decorateConversations(conversations);
}

export async function registerChatRoutes(fastify) {
  fastify.get('/api/conversations', { preHandler: requireAuth }, async (request) => {
    return {
      conversations: await decorateConversations(
        fastify,
        await fastify.chatService.listConversations(request.currentUser.id),
      ),
    };
  });

  fastify.get('/api/conversations/:conversationId', { preHandler: requireAuth }, async (request) => {
    return {
      conversation: await decorateConversation(
        fastify,
        await fastify.chatService.getConversationDetail(
          request.currentUser.id,
          request.params.conversationId,
        ),
      ),
    };
  });

  fastify.patch('/api/conversations/:conversationId', { preHandler: requireAuth }, async (request) => {
    const conversation = await fastify.chatService.updateGroupConversation(
      request.currentUser.id,
      request.params.conversationId,
      request.body ?? {},
    );
    const decoratedConversation = await decorateConversation(fastify, conversation);

    try {
      fastify.realtimeHub.broadcastUsers(conversation.memberIds, {
        type: 'conversation.updated',
        payload: decoratedConversation,
      });
    } catch {
      // Group updates are best effort when realtime transport is unstable.
    }

    return { conversation: decoratedConversation };
  });

  fastify.post('/api/conversations/direct', { preHandler: requireAuth }, async (request) => {
    return {
      conversation: await decorateConversation(
        fastify,
        await fastify.chatService.createDirectConversation(
          request.currentUser.id,
          request.body.peerUserId,
        ),
      ),
    };
  });

  fastify.post('/api/conversations/group', { preHandler: requireAuth }, async (request) => {
    return {
      conversation: await decorateConversation(
        fastify,
        await fastify.chatService.createGroupConversation(
          request.currentUser.id,
          request.body,
        ),
      ),
    };
  });

  fastify.post('/api/conversations/:conversationId/members', { preHandler: requireAuth }, async (request) => {
    const conversation = await fastify.chatService.addGroupMembers(
      request.currentUser.id,
      request.params.conversationId,
      request.body?.memberIds,
    );
    const decoratedConversation = await decorateConversation(fastify, conversation);

    try {
      fastify.realtimeHub.broadcastUsers(conversation.memberIds, {
        type: 'conversation.updated',
        payload: decoratedConversation,
      });
    } catch {
      // Group updates are best effort when realtime transport is unstable.
    }

    return { conversation: decoratedConversation };
  });

  fastify.delete('/api/conversations/:conversationId/members/:memberId', { preHandler: requireAuth }, async (request) => {
    const previousMembers = await fastify.chatService.getConversationMembers(request.params.conversationId);
    const conversation = await fastify.chatService.removeGroupMember(
      request.currentUser.id,
      request.params.conversationId,
      request.params.memberId,
    );
    const decoratedConversation = await decorateConversation(fastify, conversation);

    try {
      fastify.realtimeHub.broadcastUsers([...new Set([...previousMembers, ...conversation.memberIds])], {
        type: 'conversation.updated',
        payload: decoratedConversation,
      });
    } catch {
      // Group updates are best effort when realtime transport is unstable.
    }

    return { conversation: decoratedConversation };
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
    const decoratedConversation = await decorateConversation(fastify, result.conversation);

    try {
      fastify.realtimeHub.broadcastUsers(result.conversation.memberIds, {
        type: 'message.created',
        payload: result.message,
      });
    } catch {
      // The message is already persisted; realtime fanout should not break send.
    }

    if (
      request.currentUser.isAdmin
      && await fastify.aiService.isAssistantConversationId(request.params.conversationId)
      && result.message.senderId !== (await fastify.aiService.getAssistantUser()).id
    ) {
      fastify.aiService.enqueueConversationRun({
        actorUserId: request.currentUser.id,
        conversationId: request.params.conversationId,
        triggerMessageId: result.message.id,
      }).catch((error) => {
        console.error('Failed to enqueue assistant run.', error);
      });
    }

    return {
      ...result,
      conversation: decoratedConversation,
    };
  });

  fastify.post('/api/conversations/:conversationId/messages/:messageId/recall', { preHandler: requireAuth }, async (request) => {
    const result = await fastify.chatService.recallMessage(
      request.currentUser.id,
      request.params.conversationId,
      request.params.messageId,
    );
    const decoratedConversation = await decorateConversation(fastify, result.conversation);

    try {
      fastify.realtimeHub.broadcastUsers(result.conversation.memberIds, {
        type: 'message.updated',
        payload: result.message,
      });
      fastify.realtimeHub.broadcastUsers(result.conversation.memberIds, {
        type: 'conversation.updated',
        payload: decoratedConversation,
      });
    } catch {
      // Recall fanout is best effort when realtime transport is unstable.
    }

    return {
      ...result,
      conversation: decoratedConversation,
    };
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
