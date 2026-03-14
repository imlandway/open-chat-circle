import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore } from '../src/store/jsonStore.js';
import { AuthService } from '../src/modules/auth/service.js';
import { SessionService } from '../src/core/security/session.js';
import { SocialService } from '../src/modules/social/service.js';
import { ChatService } from '../src/modules/chat/service.js';
import { AiService } from '../src/modules/ai/service.js';
import { buildApp } from '../src/app.js';

test('register -> create direct conversation -> send message -> mark read', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'open-chat-circle-'));
  const store = new JsonStore(dataDir);
  const sessionService = new SessionService('test-secret');
  const authService = new AuthService(store, sessionService);
  const socialService = new SocialService(store);
  const chatService = new ChatService(store);

  await authService.ensureSeedAdmin();
  await store.write('invites', [
    {
      id: 'invite_test',
      code: 'TEST-OPEN',
      createdBy: 'user_admin',
      maxUses: 10,
      usedCount: 0,
      expiresAt: '2027-01-01T00:00:00.000Z',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ]);

  const alice = await authService.registerWithInvite({
    inviteCode: 'TEST-OPEN',
    nickname: 'Alice',
    password: 'password123',
  });
  const bob = await authService.registerWithInvite({
    inviteCode: 'TEST-OPEN',
    nickname: 'Bob',
    password: 'password123',
  });

  const addFriendResult = await socialService.addFriend(alice.user.id, {
    userId: bob.user.id,
  });
  assert.equal(addFriendResult.success, true);

  const contacts = await socialService.listContacts(alice.user.id);
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].id, bob.user.id);

  const direct = await chatService.createDirectConversation(alice.user.id, bob.user.id);
  assert.equal(direct.type, 'direct');
  assert.equal(direct.name, 'Bob');

  const sent = await chatService.sendMessage(alice.user.id, direct.id, {
    type: 'text',
    text: 'hello from open api',
  });
  assert.equal(sent.message.text, 'hello from open api');

  const messages = await chatService.listMessages(bob.user.id, direct.id);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].sender.nickname, 'Alice');
  assert.equal(messages[0].readByCount, 0);

  const receipt = await chatService.markRead(bob.user.id, direct.id, sent.message.id);
  assert.equal(receipt.lastReadMessageId, sent.message.id);

  const aliceMessages = await chatService.listMessages(alice.user.id, direct.id);
  assert.equal(aliceMessages[0].readByCount, 1);

  const bobConversations = await chatService.listConversations(bob.user.id);
  assert.equal(bobConversations[0].name, 'Alice');
  assert.equal(bobConversations[0].unreadCount, 0);

  await rm(dataDir, { recursive: true, force: true });
});

test('read state only moves forward when older read receipts arrive late', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'open-chat-circle-'));
  const store = new JsonStore(dataDir);
  const sessionService = new SessionService('test-secret');
  const authService = new AuthService(store, sessionService);
  const socialService = new SocialService(store);
  const chatService = new ChatService(store);

  await authService.ensureSeedAdmin();
  await store.write('invites', [
    {
      id: 'invite_test',
      code: 'TEST-OPEN',
      createdBy: 'user_admin',
      maxUses: 10,
      usedCount: 0,
      expiresAt: '2027-01-01T00:00:00.000Z',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ]);

  const alice = await authService.registerWithInvite({
    inviteCode: 'TEST-OPEN',
    nickname: 'Alice',
    password: 'password123',
  });
  const bob = await authService.registerWithInvite({
    inviteCode: 'TEST-OPEN',
    nickname: 'Bob',
    password: 'password123',
  });

  await socialService.addFriend(alice.user.id, { userId: bob.user.id });

  const direct = await chatService.createDirectConversation(alice.user.id, bob.user.id);
  const first = await chatService.sendMessage(alice.user.id, direct.id, {
    type: 'text',
    text: 'first',
  });
  const second = await chatService.sendMessage(alice.user.id, direct.id, {
    type: 'text',
    text: 'second',
  });

  const latestReceipt = await chatService.markRead(bob.user.id, direct.id, second.message.id);
  const staleReceipt = await chatService.markRead(bob.user.id, direct.id, first.message.id);

  assert.equal(latestReceipt.lastReadMessageId, second.message.id);
  assert.equal(staleReceipt.lastReadMessageId, second.message.id);

  const aliceMessages = await chatService.listMessages(alice.user.id, direct.id);
  assert.equal(aliceMessages[0].readByCount, 1);
  assert.equal(aliceMessages[1].readByCount, 1);

  const bobConversations = await chatService.listConversations(bob.user.id);
  assert.equal(bobConversations[0].unreadCount, 0);

  await rm(dataDir, { recursive: true, force: true });
});

test('users can add friends, reply, recall messages, and manage group members', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'open-chat-circle-'));
  const store = new JsonStore(dataDir);
  const sessionService = new SessionService('test-secret');
  const authService = new AuthService(store, sessionService);
  const socialService = new SocialService(store);
  const chatService = new ChatService(store);

  await authService.ensureSeedAdmin();
  await store.write('invites', [
    {
      id: 'invite_test',
      code: 'TEST-OPEN',
      createdBy: 'user_admin',
      maxUses: 10,
      usedCount: 0,
      expiresAt: '2027-01-01T00:00:00.000Z',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ]);

  const alice = await authService.registerWithInvite({
    inviteCode: 'TEST-OPEN',
    nickname: 'Alice',
    password: 'password123',
  });
  const bob = await authService.registerWithInvite({
    inviteCode: 'TEST-OPEN',
    nickname: 'Bob',
    password: 'password123',
  });
  const carol = await authService.registerWithInvite({
    inviteCode: 'TEST-OPEN',
    nickname: 'Carol',
    password: 'password123',
  });

  await socialService.addFriend(alice.user.id, { userId: bob.user.id });
  await socialService.addFriend(alice.user.id, { userId: carol.user.id });

  const discoverableForAlice = await socialService.listDiscoverableUsers(alice.user.id);
  assert.equal(discoverableForAlice.length, 1);
  assert.equal(discoverableForAlice[0].account, 'captain');

  const group = await chatService.createGroupConversation(alice.user.id, {
    name: 'Test Group',
    memberIds: [bob.user.id, carol.user.id],
  });
  assert.equal(group.canManageMembers, true);

  const firstMessage = await chatService.sendMessage(alice.user.id, group.id, {
    type: 'text',
    text: 'hello group',
  });
  const reply = await chatService.sendMessage(bob.user.id, group.id, {
    type: 'text',
    text: 'roger that',
    replyToMessageId: firstMessage.message.id,
  });
  assert.equal(reply.message.replyTo.id, firstMessage.message.id);
  assert.equal(reply.message.replyTo.sender.nickname, 'Alice');

  const recalled = await chatService.recallMessage(alice.user.id, group.id, firstMessage.message.id);
  assert.equal(recalled.message.isRecalled, true);

  const afterRecall = await chatService.listMessages(carol.user.id, group.id);
  assert.equal(afterRecall[0].isRecalled, true);
  assert.equal(afterRecall[1].replyTo.id, firstMessage.message.id);
  assert.equal(afterRecall[1].replyTo.isRecalled, true);

  const admin = await authService.getUserById('user_admin');
  await assert.rejects(
    () => chatService.addGroupMembers(alice.user.id, group.id, [admin.id]),
    /Only friends or assistant accounts can be added to this group/,
  );
  await socialService.addFriend(alice.user.id, { userId: admin.id });
  const expanded = await chatService.addGroupMembers(alice.user.id, group.id, [admin.id]);
  assert.equal(expanded.members.some((member) => member.id === admin.id), true);
  await assert.rejects(
    () => chatService.addGroupMembers(alice.user.id, group.id, [carol.user.id]),
    /Selected users are already in this group/,
  );

  const trimmed = await chatService.removeGroupMember(alice.user.id, group.id, bob.user.id);
  assert.equal(trimmed.members.some((member) => member.id === bob.user.id), false);

  const renamed = await chatService.updateGroupConversation(alice.user.id, group.id, {
    name: 'Renamed Group',
    avatarUrl: 'https://cdn.example.com/group-avatar.png',
  });
  assert.equal(renamed.name, 'Renamed Group');
  assert.equal(renamed.avatarUrl, 'https://cdn.example.com/group-avatar.png');

  await assert.rejects(
    () => chatService.updateGroupConversation(carol.user.id, group.id, {
      name: 'Carol Group',
    }),
    /Only the group owner can update group info/,
  );

  await rm(dataDir, { recursive: true, force: true });
});

test('chat service skips malformed conversations when building summaries', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'open-chat-circle-'));
  const store = new JsonStore(dataDir);
  const sessionService = new SessionService('test-secret');
  const authService = new AuthService(store, sessionService);
  const chatService = new ChatService(store);

  await authService.ensureSeedAdmin();
  await store.write('invites', [
    {
      id: 'invite_test',
      code: 'TEST-OPEN',
      createdBy: 'user_admin',
      maxUses: 10,
      usedCount: 0,
      expiresAt: '2027-01-01T00:00:00.000Z',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ]);

  const alice = await authService.registerWithInvite({
    inviteCode: 'TEST-OPEN',
    nickname: 'Alice',
    password: 'password123',
  });
  const bob = await authService.registerWithInvite({
    inviteCode: 'TEST-OPEN',
    nickname: 'Bob',
    password: 'password123',
  });

  await store.write('conversations', [
    {
      id: 'broken_conversation',
      type: 'direct',
      name: 'Broken',
      createdBy: alice.user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);

  const direct = await chatService.createDirectConversation(alice.user.id, bob.user.id);
  const sent = await chatService.sendMessage(alice.user.id, direct.id, {
    type: 'text',
    text: 'still works',
  });

  assert.equal(sent.message.text, 'still works');
  const summaries = await chatService.listConversations(alice.user.id);
  assert.equal(summaries.some((conversation) => conversation.id === direct.id), true);

  await rm(dataDir, { recursive: true, force: true });
});

test('web app entry is served from /app/', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'GET',
    url: '/app/',
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Open Chat Circle/);

  await app.close();
});

test('users can update profile and password while admins can list users and reset passwords', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'open-chat-circle-'));
  const store = new JsonStore(dataDir);
  const sessionService = new SessionService('test-secret');
  const authService = new AuthService(store, sessionService);
  const socialService = new SocialService(store);

  await authService.ensureSeedAdmin();
  await store.write('invites', [
    {
      id: 'invite_test',
      code: 'TEST-OPEN',
      createdBy: 'user_admin',
      maxUses: 10,
      usedCount: 0,
      expiresAt: '2027-01-01T00:00:00.000Z',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ]);

  const aliceSession = await authService.registerWithInvite({
    inviteCode: 'TEST-OPEN',
    nickname: 'Alice',
    password: 'password123',
  });

  const updatedUser = await socialService.updateProfile(aliceSession.user.id, {
    nickname: 'Alice New',
    account: 'alice_new',
    avatarUrl: '/uploads/alice.png',
  });

  assert.equal(updatedUser.nickname, 'Alice New');
  assert.equal(updatedUser.account, 'alice_new');
  assert.equal(updatedUser.avatarUrl, '/uploads/alice.png');

  const changed = await authService.changePassword(aliceSession.user.id, {
    currentPassword: 'password123',
    newPassword: 'newpassword123',
  });
  assert.equal(changed.success, true);

  const relogin = await authService.loginWithPassword({
    account: 'alice_new',
    password: 'newpassword123',
  });
  assert.equal(relogin.user.account, 'alice_new');

  const admin = await authService.getUserById('user_admin');
  const users = await socialService.listUsersForAdmin(admin);
  assert.equal(users.some((user) => user.account === 'alice_new'), true);

  const resetResult = await authService.resetPassword(admin, aliceSession.user.id, {
    newPassword: 'resetpass123',
  });
  assert.equal(resetResult.success, true);

  const resetLogin = await authService.loginWithPassword({
    account: 'alice_new',
    password: 'resetpass123',
  });
  assert.equal(resetLogin.user.nickname, 'Alice New');

  await rm(dataDir, { recursive: true, force: true });
});

test('admin can create an assistant conversation and get an offline-agent reply', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'open-chat-circle-'));
  const store = new JsonStore(dataDir);
  const sessionService = new SessionService('test-secret');
  const authService = new AuthService(store, sessionService);
  const chatService = new ChatService(store);
  const aiService = new AiService({
    store,
    authService,
    chatService,
    realtimeHub: {
      broadcastUsers() {},
    },
    config: {
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-test',
      aiAssistantAccount: 'codex',
      aiAssistantNickname: 'AI 助手',
      aiAgentToken: 'agent-token',
    },
    openaiClient: {
      async createResponse(payload) {
        if (!payload.previous_response_id) {
          return {
            id: 'resp_1',
            output: [
              {
                type: 'function_call',
                name: 'shell_run',
                call_id: 'call_1',
                arguments: JSON.stringify({ command: 'Get-Location' }),
              },
            ],
          };
        }

        return {
          id: 'resp_2',
          output_text: '本地 agent 未连接，暂时无法操作这台电脑。',
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: '本地 agent 未连接，暂时无法操作这台电脑。',
                },
              ],
            },
          ],
        };
      },
    },
  });

  await authService.ensureSeedAdmin();
  const admin = await authService.getUserById('user_admin');
  const conversation = await aiService.ensureAssistantConversation(admin);
  assert.equal(conversation.isAssistant, true);
  assert.equal(conversation.agentOnline, false);

  const sent = await chatService.sendMessage(admin.id, conversation.id, {
    type: 'text',
    text: '帮我运行一下测试',
  });
  await aiService.enqueueConversationRun({
    actorUserId: admin.id,
    conversationId: conversation.id,
    triggerMessageId: sent.message.id,
  });
  await aiService.waitForConversationIdle(conversation.id);

  const messages = await chatService.listMessages(admin.id, conversation.id);
  const assistantReply = messages.at(-1);
  assert.equal(assistantReply.sender.isAssistant, true);
  assert.match(assistantReply.text, /本地 agent 未连接/);

  await rm(dataDir, { recursive: true, force: true });
});

test('assistant runs stay serialized per conversation', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'open-chat-circle-'));
  const store = new JsonStore(dataDir);
  const sessionService = new SessionService('test-secret');
  const authService = new AuthService(store, sessionService);
  const chatService = new ChatService(store);
  let responseCount = 0;

  const aiService = new AiService({
    store,
    authService,
    chatService,
    realtimeHub: {
      broadcastUsers() {},
    },
    config: {
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-test',
      aiAssistantAccount: 'codex',
      aiAssistantNickname: 'AI 助手',
      aiAgentToken: 'agent-token',
    },
    openaiClient: {
      async createResponse() {
        responseCount += 1;
        return {
          id: `resp_${responseCount}`,
          output_text: `reply ${responseCount}`,
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: `reply ${responseCount}`,
                },
              ],
            },
          ],
        };
      },
    },
  });

  await authService.ensureSeedAdmin();
  const admin = await authService.getUserById('user_admin');
  const conversation = await aiService.ensureAssistantConversation(admin);

  const first = await chatService.sendMessage(admin.id, conversation.id, {
    type: 'text',
    text: 'first request',
  });
  const second = await chatService.sendMessage(admin.id, conversation.id, {
    type: 'text',
    text: 'second request',
  });

  await Promise.all([
    aiService.enqueueConversationRun({
      actorUserId: admin.id,
      conversationId: conversation.id,
      triggerMessageId: first.message.id,
    }),
    aiService.enqueueConversationRun({
      actorUserId: admin.id,
      conversationId: conversation.id,
      triggerMessageId: second.message.id,
    }),
  ]);
  await aiService.waitForConversationIdle(conversation.id);

  const messages = await chatService.listMessages(admin.id, conversation.id);
  const assistantReplies = messages.filter((message) => message.sender?.isAssistant);
  assert.deepEqual(
    assistantReplies.map((message) => message.text),
    ['reply 1', 'reply 2'],
  );

  await rm(dataDir, { recursive: true, force: true });
});

test('assistant prompt prefers direct execution and final replies are normalized', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'open-chat-circle-'));
  const store = new JsonStore(dataDir);
  const sessionService = new SessionService('test-secret');
  const authService = new AuthService(store, sessionService);
  const chatService = new ChatService(store);
  let firstPayload = null;

  const aiService = new AiService({
    store,
    authService,
    chatService,
    realtimeHub: {
      broadcastUsers() {},
    },
    config: {
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-test',
      aiAssistantAccount: 'codex',
      aiAssistantNickname: 'AI 助手',
      aiAgentToken: 'agent-token',
    },
    openaiClient: {
      async createResponse(payload) {
        firstPayload = payload;
        return {
          id: 'resp_direct',
          output_text: 'done\n\n\nnext',
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: 'done\n\n\nnext',
                },
              ],
            },
          ],
        };
      },
    },
  });

  await authService.ensureSeedAdmin();
  const admin = await authService.getUserById('user_admin');
  const conversation = await aiService.ensureAssistantConversation(admin);
  const sent = await chatService.sendMessage(admin.id, conversation.id, {
    type: 'text',
    text: 'say hi',
  });
  await aiService.enqueueConversationRun({
    actorUserId: admin.id,
    conversationId: conversation.id,
    triggerMessageId: sent.message.id,
  });
  await aiService.waitForConversationIdle(conversation.id);

  const systemPrompt = firstPayload.input[0].content[0].text;
  assert.match(systemPrompt, /Default to action, not discussion/);
  assert.match(systemPrompt, /Do not write filler/);

  const messages = await chatService.listMessages(admin.id, conversation.id);
  assert.equal(messages.at(-1).text, 'done\n\nnext');

  await rm(dataDir, { recursive: true, force: true });
});

test('assistant provider failures become short user-facing errors', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'open-chat-circle-'));
  const store = new JsonStore(dataDir);
  const sessionService = new SessionService('test-secret');
  const authService = new AuthService(store, sessionService);
  const chatService = new ChatService(store);

  const aiService = new AiService({
    store,
    authService,
    chatService,
    realtimeHub: {
      broadcastUsers() {},
    },
    config: {
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-test',
      aiAssistantAccount: 'codex',
      aiAssistantNickname: 'AI 助手',
      aiAgentToken: 'agent-token',
    },
    openaiClient: {
      async createResponse() {
        throw new Error('Request timed out while waiting for provider');
      },
    },
  });

  await authService.ensureSeedAdmin();
  const admin = await authService.getUserById('user_admin');
  const conversation = await aiService.ensureAssistantConversation(admin);
  const sent = await chatService.sendMessage(admin.id, conversation.id, {
    type: 'text',
    text: 'run it',
  });
  await aiService.enqueueConversationRun({
    actorUserId: admin.id,
    conversationId: conversation.id,
    triggerMessageId: sent.message.id,
  });
  await aiService.waitForConversationIdle(conversation.id);

  const messages = await chatService.listMessages(admin.id, conversation.id);
  assert.equal(messages.at(-1).text, '执行失败：执行超时。');

  await rm(dataDir, { recursive: true, force: true });
});

test('assistant can relay a task to local codex mode without calling provider AI', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'open-chat-circle-'));
  const store = new JsonStore(dataDir);
  const sessionService = new SessionService('test-secret');
  const authService = new AuthService(store, sessionService);
  const chatService = new ChatService(store);

  const aiService = new AiService({
    store,
    authService,
    chatService,
    realtimeHub: {
      broadcastUsers() {},
    },
    config: {
      aiExecutionMode: 'local_codex',
      openaiApiKey: '',
      openaiModel: 'gpt-test',
      aiAssistantAccount: 'codex',
      aiAssistantNickname: 'AI 助手',
      aiAgentToken: 'agent-token',
      aiRelayCwd: 'C:\\Users\\asus\\Desktop\\聊天app',
    },
    openaiClient: {
      async createResponse() {
        throw new Error('provider should not be called in local_codex mode');
      },
    },
  });

  let capturedJob = null;
  aiService.requestAgentJob = async (payload) => {
    capturedJob = payload;
    return {
      type: 'text',
      text: 'Codex relay result',
      error: '',
    };
  };

  await authService.ensureSeedAdmin();
  const admin = await authService.getUserById('user_admin');
  const conversation = await aiService.ensureAssistantConversation(admin);
  const sent = await chatService.sendMessage(admin.id, conversation.id, {
    type: 'text',
    text: '列出当前项目根目录文件',
  });
  await aiService.enqueueConversationRun({
    actorUserId: admin.id,
    conversationId: conversation.id,
    triggerMessageId: sent.message.id,
  });
  await aiService.waitForConversationIdle(conversation.id);

  assert.equal(capturedJob.toolName, 'codex_run');
  assert.equal(capturedJob.requiresApproval, false);
  assert.equal(capturedJob.argumentsPayload.instruction, '列出当前项目根目录文件');
  assert.equal(capturedJob.argumentsPayload.cwd, 'C:\\Users\\asus\\Desktop\\聊天app');

  const messages = await chatService.listMessages(admin.id, conversation.id);
  assert.equal(messages.at(-1).text, 'Codex relay result');

  await rm(dataDir, { recursive: true, force: true });
});

test('assistant agent jobs no longer require local approval', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'open-chat-circle-'));
  const store = new JsonStore(dataDir);
  const sessionService = new SessionService('test-secret');
  const authService = new AuthService(store, sessionService);
  const chatService = new ChatService(store);
  const aiService = new AiService({
    store,
    authService,
    chatService,
    realtimeHub: {
      broadcastUsers() {},
    },
    config: {
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-test',
      aiAssistantAccount: 'codex',
      aiAssistantNickname: 'AI 助手',
      aiAgentToken: 'agent-token',
    },
  });

  let capturedJob = null;
  aiService.requestAgentJob = async (payload) => {
    capturedJob = payload;
    return {
      type: 'text',
      text: 'ok',
    };
  };

  await aiService.executeToolCall(
    { id: 'run_1', conversationId: 'conversation_1' },
    {
      name: 'shell_run',
      callId: 'call_1',
      arguments: JSON.stringify({
        command: 'Get-ChildItem',
      }),
    },
  );

  assert.equal(capturedJob.toolName, 'shell_run');
  assert.equal(capturedJob.requiresApproval, false);

  await aiService.executeToolCall(
    { id: 'run_1', conversationId: 'conversation_1' },
    {
      name: 'shell_run',
      callId: 'call_2',
      arguments: JSON.stringify({
        command: 'Remove-Item .\\temp.txt',
      }),
    },
  );

  assert.equal(capturedJob.requiresApproval, false);

  await rm(dataDir, { recursive: true, force: true });
});

test('assistant account can be added to groups without friendship and group context includes speaker names', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'open-chat-circle-'));
  const store = new JsonStore(dataDir);
  const sessionService = new SessionService('test-secret');
  const authService = new AuthService(store, sessionService);
  const socialService = new SocialService(store);
  const chatService = new ChatService(store);
  const aiService = new AiService({
    store,
    authService,
    chatService,
    realtimeHub: {
      broadcastUsers() {},
    },
    config: {
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-test',
      aiAssistantAccount: 'codex',
      aiAssistantNickname: 'AI 助手',
      aiAgentToken: 'agent-token',
    },
  });

  await authService.ensureSeedAdmin();
  await store.write('invites', [
    {
      id: 'invite_test',
      code: 'TEST-OPEN',
      createdBy: 'user_admin',
      maxUses: 10,
      usedCount: 0,
      expiresAt: '2027-01-01T00:00:00.000Z',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ]);

  const admin = await authService.getUserById('user_admin');
  const bob = await authService.registerWithInvite({
    inviteCode: 'TEST-OPEN',
    nickname: 'Bob',
    password: 'password123',
  });
  const carol = await authService.registerWithInvite({
    inviteCode: 'TEST-OPEN',
    nickname: 'Carol',
    password: 'password123',
  });
  const assistant = await authService.ensureAssistantUser({
    account: 'codex',
    nickname: 'AI 助手',
  });

  await socialService.addFriend(admin.id, { userId: bob.user.id });
  await socialService.addFriend(admin.id, { userId: carol.user.id });

  const group = await chatService.createGroupConversation(admin.id, {
    name: 'AI Group',
    memberIds: [bob.user.id, carol.user.id],
  });

  const expanded = await chatService.addGroupMembers(admin.id, group.id, [assistant.id]);
  assert.equal(expanded.members.some((member) => member.id === assistant.id), true);
  assert.equal(await aiService.isAssistantConversationId(group.id), true);

  const sent = await chatService.sendMessage(bob.user.id, group.id, {
    type: 'text',
    text: 'hello assistant',
  });

  const context = await aiService.buildRunContext({
    requestedBy: admin.id,
    conversationId: group.id,
    triggerMessageId: sent.message.id,
  });

  assert.equal(context.at(-1).role, 'user');
  assert.match(context.at(-1).text, /^Bob: hello assistant$/);

  await rm(dataDir, { recursive: true, force: true });
});
