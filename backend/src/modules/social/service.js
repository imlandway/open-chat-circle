import { randomUUID } from 'node:crypto';
import { assert } from '../../core/http/errors.js';

const USERS = 'users';
const INVITES = 'invites';

function normalizeAccount(account) {
  return String(account ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '');
}

function toSafeUser(user) {
  return {
    id: user.id,
    account: user.account,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    status: user.status,
    createdAt: user.createdAt,
    isAdmin: Boolean(user.isAdmin),
  };
}

export class SocialService {
  constructor(store) {
    this.store = store;
  }

  async listContacts(currentUserId) {
    const users = await this.store.read(USERS);
    return users
      .filter((user) => user.id !== currentUserId && user.status === 'active')
      .map((user) => ({
        id: user.id,
        account: user.account,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        status: user.status,
      }));
  }

  async createInvite(actor, { uses, expiresAt }) {
    assert(actor.isAdmin, 403, 'Only admins can create invites.');
    assert(Number(uses) > 0, 400, 'Invite uses must be greater than 0.');
    assert(expiresAt, 400, 'Invite expiry time is required.');

    const invites = await this.store.read(INVITES);
    const invite = {
      id: `invite_${randomUUID()}`,
      code: `OC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      createdBy: actor.id,
      maxUses: Number(uses),
      usedCount: 0,
      expiresAt,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    invites.push(invite);
    await this.store.write(INVITES, invites);
    return invite;
  }

  async listInvites(actor) {
    assert(actor.isAdmin, 403, 'Only admins can view invites.');
    return this.store.read(INVITES);
  }

  async listUsersForAdmin(actor) {
    assert(actor.isAdmin, 403, 'Only admins can view users.');
    const users = await this.store.read(USERS);
    return users
      .map((user) => toSafeUser(user))
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  }

  async updateProfile(userId, { nickname, account, avatarUrl }) {
    const users = await this.store.read(USERS);
    const user = users.find((item) => item.id === userId);

    assert(user, 404, 'User not found.');
    assert(nickname?.trim(), 400, 'Nickname is required.');
    const normalizedAccount = normalizeAccount(account || user.account);
    assert(normalizedAccount.length >= 3, 400, 'Account must be at least 3 characters.');
    assert(!users.some((item) => item.id !== userId && item.account === normalizedAccount), 409, 'Account already exists.');

    user.nickname = nickname.trim();
    user.account = normalizedAccount;
    user.avatarUrl = avatarUrl?.trim() ?? '';

    await this.store.write(USERS, users);

    return toSafeUser(user);
  }

  async banUser(actor, targetUserId) {
    assert(actor.isAdmin, 403, 'Only admins can ban users.');
    assert(actor.id !== targetUserId, 400, 'Admin cannot ban themselves.');

    const users = await this.store.read(USERS);
    const target = users.find((user) => user.id === targetUserId);
    assert(target, 404, 'Target user not found.');
    assert(!target.isAdmin, 400, 'Admin accounts cannot be banned.');

    target.status = 'banned';
    await this.store.write(USERS, users);
    return {
      success: true,
      userId: target.id,
    };
  }
}
