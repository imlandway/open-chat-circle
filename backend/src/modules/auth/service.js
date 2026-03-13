import { randomUUID } from 'node:crypto';
import { assert, AppError } from '../../core/http/errors.js';
import { hashPassword, verifyPassword } from '../../core/security/password.js';

const USERS = 'users';
const INVITES = 'invites';

function sanitizeNickname(nickname) {
  return nickname
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '')
    .slice(0, 12);
}

export class AuthService {
  constructor(store, sessionService) {
    this.store = store;
    this.sessionService = sessionService;
  }

  async listUsers() {
    return this.store.read(USERS);
  }

  async getUserById(userId) {
    const users = await this.store.read(USERS);
    return users.find((user) => user.id === userId);
  }

  async ensureSeedAdmin() {
    const users = await this.store.read(USERS);
    const defaultPassword = process.env.SEED_ADMIN_PASSWORD ?? 'chatcircle123';
    const existingAdmin = users.find((user) => user.isAdmin);

    if (existingAdmin) {
      if (!verifyPassword(defaultPassword, existingAdmin.passwordHash)) {
        existingAdmin.passwordHash = hashPassword(defaultPassword);
        await this.store.write(USERS, users);
      }
      return;
    }

    users.push({
      id: 'user_admin',
      account: 'captain',
      nickname: 'Captain',
      avatarUrl: '',
      passwordHash: hashPassword(defaultPassword),
      status: 'active',
      createdAt: new Date().toISOString(),
      isAdmin: true,
    });
    await this.store.write(USERS, users);
  }

  async registerWithInvite({ inviteCode, nickname, password }) {
    assert(inviteCode?.trim(), 400, 'Invite code is required.');
    assert(nickname?.trim(), 400, 'Nickname is required.');
    assert(password?.length >= 8, 400, 'Password must be at least 8 characters.');

    const invites = await this.store.read(INVITES);
    const invite = invites.find((item) => item.code === inviteCode.trim());

    assert(invite, 404, 'Invite code not found.');
    assert(invite.status === 'active', 400, 'Invite code is inactive.');
    assert(invite.usedCount < invite.maxUses, 400, 'Invite code usage limit reached.');
    assert(new Date(invite.expiresAt).getTime() > Date.now(), 400, 'Invite code expired.');

    const users = await this.store.read(USERS);
    const accountBase = sanitizeNickname(nickname) || 'friend';
    let account = `${accountBase}${Math.floor(Math.random() * 9000 + 1000)}`;
    while (users.some((user) => user.account === account)) {
      account = `${accountBase}${Math.floor(Math.random() * 9000 + 1000)}`;
    }

    const user = {
      id: `user_${randomUUID()}`,
      account,
      nickname: nickname.trim(),
      avatarUrl: '',
      passwordHash: hashPassword(password),
      status: 'active',
      createdAt: new Date().toISOString(),
      isAdmin: false,
    };

    users.push(user);
    invite.usedCount += 1;
    await this.store.write(USERS, users);
    await this.store.write(INVITES, invites);

    return this.createSessionPayload(user);
  }

  async loginWithPassword({ account, password }) {
    assert(account?.trim(), 400, 'Account is required.');
    assert(password?.trim(), 400, 'Password is required.');

    const users = await this.store.read(USERS);
    const user = users.find((item) => item.account === account.trim());

    assert(user, 404, 'Account not found.');
    assert(user.status === 'active', 403, 'This account is banned.');

    if (!verifyPassword(password, user.passwordHash)) {
      throw new AppError(401, 'Incorrect password.');
    }

    return this.createSessionPayload(user);
  }

  createSessionPayload(user) {
    return {
      sessionToken: this.sessionService.issueToken(user),
      user: this.toSafeUser(user),
    };
  }

  toSafeUser(user) {
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
}
