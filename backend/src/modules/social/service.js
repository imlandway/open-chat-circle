import { randomUUID } from 'node:crypto';
import { assert } from '../../core/http/errors.js';

const USERS = 'users';
const INVITES = 'invites';

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

  async updateProfile(userId, { nickname, avatarUrl }) {
    const users = await this.store.read(USERS);
    const user = users.find((item) => item.id === userId);

    assert(user, 404, 'User not found.');
    assert(nickname?.trim(), 400, 'Nickname is required.');

    user.nickname = nickname.trim();
    user.avatarUrl = avatarUrl?.trim() ?? '';

    await this.store.write(USERS, users);

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
