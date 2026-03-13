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

  const contacts = await socialService.listContacts(alice.user.id);
  assert.equal(contacts.length, 2);

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
