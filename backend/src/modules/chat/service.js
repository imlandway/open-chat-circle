import { randomUUID } from 'node:crypto';
import { assert } from '../../core/http/errors.js';

const CONVERSATIONS = 'conversations';
const FRIENDSHIPS = 'friendships';
const MESSAGES = 'messages';
const READ_STATES = 'readStates';
const USERS = 'users';

function toTimestamp(value) {
  const timestamp = new Date(value ?? 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortByCreatedAt(items) {
  return [...items].sort((a, b) => toTimestamp(a.createdAt) - toTimestamp(b.createdAt));
}

function hasValidMembers(conversation) {
  return Array.isArray(conversation?.memberIds);
}

function getFriendIds(friendships, currentUserId) {
  const friendIds = new Set();

  for (const friendship of friendships) {
    if (!Array.isArray(friendship?.userIds) || friendship.userIds.length !== 2) {
      continue;
    }
    if (!friendship.userIds.includes(currentUserId)) {
      continue;
    }

    const peerId = friendship.userIds.find((userId) => userId !== currentUserId);
    if (peerId) {
      friendIds.add(peerId);
    }
  }

  return friendIds;
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
      .filter((conversation) => hasValidMembers(conversation) && conversation.memberIds.includes(userId))
      .map((conversation) => {
        const threadMessages = this.getConversationThread(messages, conversation.id);
        const latestMessage = this.serializeLatestMessage(threadMessages, users, conversation);
        const unreadCount = this.getUnreadCount(threadMessages, readStates, conversation.id, userId);
        return this.serializeConversation(conversation, users, userId, latestMessage, unreadCount);
      })
      .sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt));
  }

  async getConversationDetail(userId, conversationId) {
    const conversation = await this.requireConversationMember(userId, conversationId);
    const [messages, readStates, users] = await Promise.all([
      this.store.read(MESSAGES),
      this.store.read(READ_STATES),
      this.store.read(USERS),
    ]);
    const threadMessages = this.getConversationThread(messages, conversation.id);
    const latestMessage = this.serializeLatestMessage(threadMessages, users, conversation);
    const unreadCount = this.getUnreadCount(threadMessages, readStates, conversation.id, userId);
    return this.serializeConversation(conversation, users, userId, latestMessage, unreadCount);
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
      if (conversation.type !== 'direct' || !hasValidMembers(conversation)) {
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
      avatarUrl: '',
      memberIds: uniqueMembers,
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    conversations.push(conversation);
    await this.store.write(CONVERSATIONS, conversations);
    return this.getConversationSummary(conversation.id, userId);
  }

  async updateGroupConversation(userId, conversationId, { name, avatarUrl }) {
    const conversation = await this.requireConversationMember(userId, conversationId);
    assert(conversation.type === 'group', 400, 'Only group chats can be updated.');
    assert(conversation.createdBy === userId, 403, 'Only the group owner can update group info.');

    const conversations = await this.store.read(CONVERSATIONS);
    const mutableConversation = conversations.find((item) => item.id === conversationId);
    assert(mutableConversation, 404, 'Conversation not found.');

    if (name !== undefined) {
      assert(String(name).trim(), 400, 'Group name is required.');
      mutableConversation.name = String(name).trim();
    }

    if (avatarUrl !== undefined) {
      mutableConversation.avatarUrl = String(avatarUrl || '').trim();
    }

    mutableConversation.updatedAt = new Date().toISOString();
    await this.store.write(CONVERSATIONS, conversations);
    return this.getConversationDetail(userId, conversationId);
  }

  async addGroupMembers(userId, conversationId, memberIds) {
    const conversation = await this.requireConversationMember(userId, conversationId);
    assert(conversation.type === 'group', 400, 'Only group chats can add members.');
    assert(conversation.createdBy === userId, 403, 'Only the group owner can add members.');

    const nextIds = [...new Set(memberIds ?? [])].filter(Boolean);
    assert(nextIds.length > 0, 400, 'At least one member is required.');

    const candidateIds = nextIds.filter((memberId) => !conversation.memberIds.includes(memberId));
    assert(candidateIds.length > 0, 400, 'Selected users are already in this group.');

    const [users, friendships] = await Promise.all([
      this.store.read(USERS),
      this.store.read(FRIENDSHIPS),
    ]);
    const validUsers = candidateIds.every((memberId) =>
      users.some((user) => user.id === memberId && user.status === 'active'),
    );
    assert(validUsers, 400, 'One or more group members are invalid.');
    const friendIds = getFriendIds(friendships, userId);
    const assistantIds = new Set(
      users
        .filter((user) => user.status === 'active' && user.isAssistant)
        .map((user) => user.id),
    );
    assert(
      candidateIds.every((memberId) => friendIds.has(memberId) || assistantIds.has(memberId)),
      403,
      'Only friends or assistant accounts can be added to this group.',
    );

    const conversations = await this.store.read(CONVERSATIONS);
    const mutableConversation = conversations.find((item) => item.id === conversationId);
    assert(mutableConversation, 404, 'Conversation not found.');

    mutableConversation.memberIds = [...new Set([...mutableConversation.memberIds, ...candidateIds])];
    mutableConversation.updatedAt = new Date().toISOString();
    await this.store.write(CONVERSATIONS, conversations);
    return this.getConversationDetail(userId, conversationId);
  }

  async removeGroupMember(userId, conversationId, targetUserId) {
    const conversation = await this.requireConversationMember(userId, conversationId);
    assert(conversation.type === 'group', 400, 'Only group chats can remove members.');
    assert(conversation.createdBy === userId, 403, 'Only the group owner can remove members.');
    assert(targetUserId, 400, 'Target user is required.');
    assert(targetUserId !== conversation.createdBy, 400, 'Group owner cannot be removed.');
    assert(conversation.memberIds.includes(targetUserId), 404, 'Target user is not in this group.');

    const conversations = await this.store.read(CONVERSATIONS);
    const mutableConversation = conversations.find((item) => item.id === conversationId);
    assert(mutableConversation, 404, 'Conversation not found.');

    mutableConversation.memberIds = mutableConversation.memberIds.filter((memberId) => memberId !== targetUserId);
    assert(mutableConversation.memberIds.length >= 2, 400, 'Group must keep at least 2 members.');
    mutableConversation.updatedAt = new Date().toISOString();
    await this.store.write(CONVERSATIONS, conversations);
    return this.getConversationDetail(userId, conversationId);
  }

  async listMessages(userId, conversationId, options = {}) {
    const conversation = await this.requireConversationMember(userId, conversationId);
    const [messages, readStates, users] = await Promise.all([
      this.store.read(MESSAGES),
      this.store.read(READ_STATES),
      this.store.read(USERS),
    ]);
    const before = options.before ? new Date(options.before).getTime() : null;
    const limit = Number(options.limit ?? 50);
    const threadMessages = this.getConversationThread(messages, conversation.id);
    const messageIndexById = new Map(threadMessages.map((message, index) => [message.id, index]));
    const readIndexByUserId = this.buildReadIndexByUserId(readStates, conversation, messageIndexById);
    const messagesById = new Map(threadMessages.map((message) => [message.id, message]));

    return threadMessages.filter((message) => {
      if (!before) {
        return true;
      }
      return toTimestamp(message.createdAt) < before;
    }).slice(-limit).map((message) => this.serializeMessage(
      message,
      users,
      conversation,
      messageIndexById,
      readIndexByUserId,
      messagesById,
    ));
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
    const users = await this.store.read(USERS);
    const sender = users.find((user) => user.id === userId && user.status === 'active');
    assert(sender, 404, 'Sender not found.');

    if (payload.type === 'image') {
      assert(sender.isAssistant, 403, 'Only assistant accounts can send image messages.');
    }

    let replyToMessageId = payload.replyToMessageId?.trim() || '';
    if (replyToMessageId) {
      const replyTarget = messages.find((item) => item.id === replyToMessageId && item.conversationId === conversationId);
      assert(replyTarget, 404, 'Reply target not found.');
      assert(!replyTarget.recalledAt, 400, 'Cannot reply to a recalled message.');
    } else {
      replyToMessageId = '';
    }

    const message = {
      id: `msg_${randomUUID()}`,
      conversationId,
      senderId: userId,
      type: payload.type,
      text: payload.text?.trim() ?? '',
      imageUrl: payload.imageUrl?.trim() ?? '',
      imageName: payload.imageName?.trim() ?? '',
      replyToMessageId,
      createdAt: new Date().toISOString(),
    };
    messages.push(message);
    await this.store.write(MESSAGES, messages);

    const conversations = await this.store.read(CONVERSATIONS);
    const mutableConversation = conversations.find((item) => item.id === conversationId);
    mutableConversation.updatedAt = message.createdAt;
    await this.store.write(CONVERSATIONS, conversations);

    await this.markRead(userId, conversationId, message.id);
    const readStates = await this.store.read(READ_STATES);
    const threadMessages = this.getConversationThread(messages, conversationId);
    const messageIndexById = new Map(threadMessages.map((item, index) => [item.id, index]));
    const readIndexByUserId = this.buildReadIndexByUserId(
      readStates,
      mutableConversation ?? conversation,
      messageIndexById,
    );
    const messagesById = new Map(threadMessages.map((item) => [item.id, item]));
    const serializedMessage = this.serializeMessage(
      message,
      users,
      mutableConversation ?? conversation,
      messageIndexById,
      readIndexByUserId,
      messagesById,
    );
    const summary = this.serializeConversation(
      mutableConversation ?? conversation,
      users,
      userId,
      this.serializeLatestMessage(threadMessages, users, mutableConversation ?? conversation),
      this.getUnreadCount(threadMessages, readStates, conversationId, userId),
    );

    return {
      conversation: summary,
      message: serializedMessage,
    };
  }

  async recallMessage(userId, conversationId, messageId) {
    const conversation = await this.requireConversationMember(userId, conversationId);
    const messages = await this.store.read(MESSAGES);
    const target = messages.find((item) => item.id === messageId && item.conversationId === conversationId);
    assert(target, 404, 'Message not found.');
    assert(target.senderId === userId, 403, 'Only the sender can recall this message.');
    assert(!target.recalledAt, 400, 'Message already recalled.');

    target.recalledAt = new Date().toISOString();
    target.text = '';
    target.imageUrl = '';
    target.imageName = '';
    await this.store.write(MESSAGES, messages);

    const [users, readStates] = await Promise.all([
      this.store.read(USERS),
      this.store.read(READ_STATES),
    ]);
    const threadMessages = this.getConversationThread(messages, conversationId);
    const messageIndexById = new Map(threadMessages.map((item, index) => [item.id, index]));
    const readIndexByUserId = this.buildReadIndexByUserId(readStates, conversation, messageIndexById);
    const messagesById = new Map(threadMessages.map((item) => [item.id, item]));
    const summary = this.serializeConversation(
      conversation,
      users,
      userId,
      this.serializeLatestMessage(threadMessages, users, conversation),
      this.getUnreadCount(threadMessages, readStates, conversationId, userId),
    );

    return {
      conversation: summary,
      message: this.serializeMessage(target, users, conversation, messageIndexById, readIndexByUserId, messagesById),
    };
  }

  async markRead(userId, conversationId, messageId) {
    const conversation = await this.requireConversationMember(userId, conversationId);
    assert(messageId, 400, 'Message ID is required.');
    const messages = await this.store.read(MESSAGES);
    const message = messages.find((item) => item.id === messageId && item.conversationId === conversationId);
    assert(message, 404, 'Message not found.');
    const threadMessages = this.getConversationThread(messages, conversationId);
    const messageIndexById = new Map(threadMessages.map((item, index) => [item.id, index]));
    const targetIndex = messageIndexById.get(message.id) ?? -1;
    assert(targetIndex >= 0, 404, 'Message not found.');

    const readStates = await this.store.read(READ_STATES);
    const existing = readStates.find(
      (state) => state.userId === userId && state.conversationId === conversationId,
    );
    const updatedAt = new Date().toISOString();
    const existingIndex = existing?.lastReadMessageId && messageIndexById.has(existing.lastReadMessageId)
      ? messageIndexById.get(existing.lastReadMessageId)
      : -1;

    if (existing && existingIndex >= targetIndex) {
      return {
        conversationId,
        userId,
        lastReadMessageId: existing.lastReadMessageId,
        lastReadAt: existing.lastReadAt,
      };
    }

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
    return hasValidMembers(conversation) ? conversation.memberIds : [];
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
    assert(hasValidMembers(conversation), 500, 'Conversation members are invalid.');
    assert(conversation.memberIds.includes(userId), 403, 'You are not a member of this conversation.');
    return conversation;
  }

  getConversationThread(messages, conversationId) {
    return sortByCreatedAt(messages.filter((message) => message.conversationId === conversationId));
  }

  buildReadIndexByUserId(readStates, conversation, messageIndexById) {
    return new Map((conversation.memberIds ?? []).map((memberId) => {
      const state = readStates.find(
        (item) => item.conversationId === conversation.id && item.userId === memberId,
      );
      return [
        memberId,
        state?.lastReadMessageId && messageIndexById.has(state.lastReadMessageId)
          ? messageIndexById.get(state.lastReadMessageId)
          : -1,
      ];
    }));
  }

  getUnreadCount(threadMessages, readStates, conversationId, userId) {
    const readState = readStates.find(
      (state) => state.conversationId === conversationId && state.userId === userId,
    );
    const messageIndexById = new Map(threadMessages.map((message, index) => [message.id, index]));
    const lastReadIndex = readState?.lastReadMessageId && messageIndexById.has(readState.lastReadMessageId)
      ? messageIndexById.get(readState.lastReadMessageId)
      : -1;

    return threadMessages.filter((message) => {
      if (message.senderId === userId) {
        return false;
      }
      return (messageIndexById.get(message.id) ?? -1) > lastReadIndex;
    }).length;
  }

  serializeLatestMessage(threadMessages, users, conversation) {
    const latestMessage = threadMessages.at(-1) ?? null;
    if (!latestMessage) {
      return null;
    }

    const messageIndexById = new Map(threadMessages.map((item, index) => [item.id, index]));
    const readIndexByUserId = new Map((conversation.memberIds ?? []).map((memberId) => [memberId, -1]));
    const messagesById = new Map(threadMessages.map((item) => [item.id, item]));
    return this.serializeMessage(
      latestMessage,
      users,
      conversation,
      messageIndexById,
      readIndexByUserId,
      messagesById,
    );
  }

  serializeConversation(conversation, users, viewerUserId, latestMessage, unreadCount) {
    const peers = users.filter((user) => conversation.memberIds.includes(user.id));
    const directPeer = conversation.type === 'direct'
      ? peers.find((user) => user.id !== viewerUserId)
      : null;
    const owner = peers.find((user) => user.id === conversation.createdBy) ?? null;

    return {
      id: conversation.id,
      type: conversation.type,
      name: directPeer?.nickname || conversation.name,
      avatarUrl: conversation.type === 'direct'
        ? (directPeer?.avatarUrl || '')
        : (conversation.avatarUrl || ''),
      isAssistant: conversation.type === 'direct' && Boolean(directPeer?.isAssistant),
      memberIds: conversation.memberIds,
      members: peers.map((user) => ({
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        account: user.account,
        isAdmin: Boolean(user.isAdmin),
        isAssistant: Boolean(user.isAssistant),
      })),
      createdBy: conversation.createdBy,
      owner: owner
        ? {
            id: owner.id,
            nickname: owner.nickname,
            avatarUrl: owner.avatarUrl,
            account: owner.account,
            isAssistant: Boolean(owner.isAssistant),
          }
        : null,
      canManageMembers: conversation.type === 'group' && conversation.createdBy === viewerUserId,
      latestMessage,
      unreadCount,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  serializeMessage(message, users, conversation, messageIndexById, readIndexByUserId, messagesById) {
    const sender = users.find((user) => user.id === message.senderId) ?? null;
    const messageIndex = messageIndexById.get(message.id) ?? -1;
    const readByUserIds = (conversation.memberIds ?? []).filter(
      (memberId) =>
        memberId !== message.senderId && (readIndexByUserId.get(memberId) ?? -1) >= messageIndex,
    );

    return {
      ...message,
      sender: sender
        ? {
            id: sender.id,
            nickname: sender.nickname,
            avatarUrl: sender.avatarUrl,
            account: sender.account,
            isAssistant: Boolean(sender.isAssistant),
          }
        : null,
      replyTo: this.serializeReplyTarget(message.replyToMessageId, users, messagesById),
      isRecalled: Boolean(message.recalledAt),
      readByUserIds,
      readByCount: readByUserIds.length,
    };
  }

  serializeReplyTarget(replyToMessageId, users, messagesById) {
    if (!replyToMessageId) {
      return null;
    }

    const target = messagesById.get(replyToMessageId);
    if (!target) {
      return null;
    }

    const sender = users.find((user) => user.id === target.senderId) ?? null;
    return {
      id: target.id,
      type: target.type,
      text: target.recalledAt ? '' : (target.text || ''),
      imageUrl: target.recalledAt ? '' : (target.imageUrl || ''),
      imageName: target.recalledAt ? '' : (target.imageName || ''),
      isRecalled: Boolean(target.recalledAt),
      sender: sender
        ? {
            id: sender.id,
            nickname: sender.nickname,
            avatarUrl: sender.avatarUrl,
            account: sender.account,
            isAssistant: Boolean(sender.isAssistant),
          }
        : null,
    };
  }
}
