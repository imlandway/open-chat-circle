import { randomUUID } from 'node:crypto';
import { assert } from '../../core/http/errors.js';

const USERS = 'users';
const FRIENDSHIPS = 'friendships';
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
    isAssistant: Boolean(user.isAssistant),
  };
}

export class SocialService {
  constructor(store) {
    this.store = store;
  }

  async listContacts(currentUserId) {
    const [users, friendships] = await Promise.all([
      this.store.read(USERS),
      this.store.read(FRIENDSHIPS),
    ]);
    const contactIds = this.getFriendIds(friendships, currentUserId);

    return users
      .filter((user) => contactIds.has(user.id) && user.status === 'active')
      .map((user) => ({
        id: user.id,
        account: user.account,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        status: user.status,
      }));
  }

  async listDiscoverableUsers(currentUserId, query = '') {
    const [users, friendships] = await Promise.all([
      this.store.read(USERS),
      this.store.read(FRIENDSHIPS),
    ]);
    const keyword = String(query || '').trim().toLowerCase();
    const friendIds = this.getFriendIds(friendships, currentUserId);

    return users
      .filter((user) => (
        user.id !== currentUserId
        && user.status === 'active'
        && !user.isAssistant
        && !friendIds.has(user.id)
      ))
      .filter((user) => {
        if (!keyword) {
          return true;
        }
        return user.account.toLowerCase().includes(keyword) || user.nickname.toLowerCase().includes(keyword);
      })
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .map((user) => ({
        id: user.id,
        account: user.account,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        status: user.status,
      }));
  }

  async addFriend(currentUserId, { account, userId }) {
    const users = await this.store.read(USERS);
    const actor = users.find((user) => user.id === currentUserId);
    assert(actor && actor.status === 'active', 404, 'Current user not found.');

    const normalizedAccount = normalizeAccount(account);
    const target = users.find((user) => (
      user.status === 'active'
      && user.id !== currentUserId
      && (
        (userId && user.id === userId)
        || (normalizedAccount && user.account === normalizedAccount)
      )
    ));
    assert(target, 404, 'Target user not found.');

    const friendships = await this.store.read(FRIENDSHIPS);
    const friendshipKey = this.buildFriendshipKey(currentUserId, target.id);
    const existing = friendships.find((item) => item.key === friendshipKey);

    if (!existing) {
      friendships.push({
        id: `friend_${randomUUID()}`,
        key: friendshipKey,
        userIds: [currentUserId, target.id].sort(),
        createdAt: new Date().toISOString(),
        createdBy: currentUserId,
      });
      await this.store.write(FRIENDSHIPS, friendships);
    }

    return {
      success: true,
      user: {
        id: target.id,
        account: target.account,
        nickname: target.nickname,
        avatarUrl: target.avatarUrl,
        status: target.status,
      },
    };
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
      .filter((user) => !user.isAssistant)
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
    assert(!target.isAssistant, 400, 'Assistant accounts cannot be banned.');
    assert(!target.isAdmin, 400, 'Admin accounts cannot be banned.');

    target.status = 'banned';
    await this.store.write(USERS, users);
    return {
      success: true,
      userId: target.id,
    };
  }

  buildFriendshipKey(leftUserId, rightUserId) {
    return [leftUserId, rightUserId].sort().join(':');
  }

  getFriendIds(friendships, currentUserId) {
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
}
