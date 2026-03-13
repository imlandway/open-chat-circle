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

  const sent = await chatService.sendMessage(alice.user.id, direct.id, {
    type: 'text',
    text: 'hello from open api',
  });
  assert.equal(sent.message.text, 'hello from open api');

  const messages = await chatService.listMessages(bob.user.id, direct.id);
  assert.equal(messages.length, 1);

  const receipt = await chatService.markRead(bob.user.id, direct.id, sent.message.id);
  assert.equal(receipt.lastReadMessageId, sent.message.id);

  const bobConversations = await chatService.listConversations(bob.user.id);
  assert.equal(bobConversations[0].unreadCount, 0);

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
