import { randomUUID } from 'node:crypto';
import { assert } from '../../core/http/errors.js';

const CONVERSATIONS = 'conversations';
const MESSAGES = 'messages';
const READ_STATES = 'readStates';
const USERS = 'users';

function sortByCreatedAt(items) {
  return [...items].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export class ChatService {
  constructor(store) {
    this.store = store;
  }

  async listConversations(userId) {
    const [conversations, messages, readStates, users] = await Promise.all([
      this.store.read(CONVERSATIONS),
      this.store.read(MESSAGES),
      this.store.read(READ_STATES),
      this.store.read(USERS),
    ]);

    return conversations
      .filter((conversation) => conversation.memberIds.includes(userId))
      .map((conversation) => {
        const threadMessages = sortByCreatedAt(
          messages.filter((message) => message.conversationId === conversation.id),
        );
        const latestMessage = threadMessages.at(-1) ?? null;
        const readState = readStates.find(
          (state) => state.conversationId === conversation.id && state.userId === userId,
        );
        const unreadCount = threadMessages.filter((message) => {
          if (message.senderId === userId) {
            return false;
          }
          if (!readState?.lastReadAt) {
            return true;
          }
          return new Date(message.createdAt).getTime() > new Date(readState.lastReadAt).getTime();
        }).length;

        return this.serializeConversation(conversation, users, latestMessage, unreadCount);
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async createDirectConversation(userId, peerUserId) {
    assert(peerUserId, 400, 'Peer user is required.');
    assert(peerUserId !== userId, 400, 'Cannot create direct conversation with yourself.');

    const [conversations, users] = await Promise.all([
      this.store.read(CONVERSATIONS),
      this.store.read(USERS),
    ]);

    const peer = users.find((user) => user.id === peerUserId && user.status === 'active');
    assert(peer, 404, 'Peer user not found.');

    const existing = conversations.find((conversation) => {
      if (conversation.type !== 'direct') {
        return false;
      }
      const pair = [...conversation.memberIds].sort().join(':');
      return pair === [userId, peerUserId].sort().join(':');
    });

    if (existing) {
      return this.getConversationSummary(existing.id, userId);
    }

    const conversation = {
      id: `conv_${randomUUID()}`,
      type: 'direct',
      name: peer.nickname,
      memberIds: [userId, peerUserId],
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    conversations.push(conversation);
    await this.store.write(CONVERSATIONS, conversations);
    return this.getConversationSummary(conversation.id, userId);
  }

  async createGroupConversation(userId, { name, memberIds }) {
    assert(name?.trim(), 400, 'Group name is required.');
    const uniqueMembers = [...new Set([userId, ...(memberIds ?? [])])];
    assert(uniqueMembers.length >= 3, 400, 'Group chat requires at least 3 members.');

    const users = await this.store.read(USERS);
    const validUsers = uniqueMembers.every((memberId) =>
      users.some((user) => user.id === memberId && user.status === 'active'),
    );
    assert(validUsers, 400, 'One or more group members are invalid.');

    const conversations = await this.store.read(CONVERSATIONS);
    const conversation = {
      id: `conv_${randomUUID()}`,
      type: 'group',
      name: name.trim(),
      memberIds: uniqueMembers,
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    conversations.push(conversation);
    await this.store.write(CONVERSATIONS, conversations);
    return this.getConversationSummary(conversation.id, userId);
  }

  async listMessages(userId, conversationId, options = {}) {
    const conversation = await this.requireConversationMember(userId, conversationId);
    const messages = await this.store.read(MESSAGES);
    const before = options.before ? new Date(options.before).getTime() : null;
    const limit = Number(options.limit ?? 50);

    return sortByCreatedAt(messages.filter((message) => {
      if (message.conversationId !== conversation.id) {
        return false;
      }
      if (!before) {
        return true;
      }
      return new Date(message.createdAt).getTime() < before;
    })).slice(-limit);
  }

  async sendMessage(userId, conversationId, payload) {
    const conversation = await this.requireConversationMember(userId, conversationId);
    assert(payload?.type === 'text' || payload?.type === 'image', 400, 'Unsupported message type.');

    if (payload.type === 'text') {
      assert(payload.text?.trim(), 400, 'Message text is required.');
    }

    if (payload.type === 'image') {
      assert(payload.imageUrl?.trim(), 400, 'Image URL is required.');
    }

    const messages = await this.store.read(MESSAGES);
    const message = {
      id: `msg_${randomUUID()}`,
      conversationId,
      senderId: userId,
      type: payload.type,
      text: payload.text?.trim() ?? '',
      imageUrl: payload.imageUrl?.trim() ?? '',
      imageName: payload.imageName?.trim() ?? '',
      createdAt: new Date().toISOString(),
    };
    messages.push(message);
    await this.store.write(MESSAGES, messages);

    const conversations = await this.store.read(CONVERSATIONS);
    const mutableConversation = conversations.find((item) => item.id === conversationId);
    mutableConversation.updatedAt = message.createdAt;
    await this.store.write(CONVERSATIONS, conversations);

    await this.markRead(userId, conversationId, message.id);

    return {
      conversation,
      message,
    };
  }

  async markRead(userId, conversationId, messageId) {
    await this.requireConversationMember(userId, conversationId);
    const messages = await this.store.read(MESSAGES);
    const message = messages.find((item) => item.id === messageId && item.conversationId === conversationId);
    assert(message, 404, 'Message not found.');

    const readStates = await this.store.read(READ_STATES);
    const existing = readStates.find(
      (state) => state.userId === userId && state.conversationId === conversationId,
    );
    const updatedAt = new Date().toISOString();

    if (existing) {
      existing.lastReadMessageId = message.id;
      existing.lastReadAt = updatedAt;
    } else {
      readStates.push({
        conversationId,
        userId,
        lastReadMessageId: message.id,
        lastReadAt: updatedAt,
      });
    }

    await this.store.write(READ_STATES, readStates);
    return {
      conversationId,
      userId,
      lastReadMessageId: message.id,
      lastReadAt: updatedAt,
    };
  }

  async getConversationMembers(conversationId) {
    const conversations = await this.store.read(CONVERSATIONS);
    const conversation = conversations.find((item) => item.id === conversationId);
    return conversation?.memberIds ?? [];
  }

  async getConversationSummary(conversationId, userId) {
    const summaries = await this.listConversations(userId);
    const summary = summaries.find((item) => item.id === conversationId);
    assert(summary, 404, 'Conversation not found.');
    return summary;
  }

  async requireConversationMember(userId, conversationId) {
    const conversations = await this.store.read(CONVERSATIONS);
    const conversation = conversations.find((item) => item.id === conversationId);
    assert(conversation, 404, 'Conversation not found.');
    assert(conversation.memberIds.includes(userId), 403, 'You are not a member of this conversation.');
    return conversation;
  }

  serializeConversation(conversation, users, latestMessage, unreadCount) {
    const peers = users.filter((user) => conversation.memberIds.includes(user.id));
    return {
      id: conversation.id,
      type: conversation.type,
      name: conversation.name,
      memberIds: conversation.memberIds,
      members: peers.map((user) => ({
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        account: user.account,
      })),
      latestMessage,
      unreadCount,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }
}
