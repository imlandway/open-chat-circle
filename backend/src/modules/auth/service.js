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

function normalizeAccount(account) {
  return String(account ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '');
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

  async getUserByAccount(account) {
    const normalizedAccount = normalizeAccount(account);
    const users = await this.store.read(USERS);
    return users.find((user) => user.account === normalizedAccount);
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

  async ensureAssistantUser({ account, nickname, assistantKind = 'assistant' }) {
    const normalizedAccount = normalizeAccount(account);
    assert(normalizedAccount, 500, 'Assistant account is invalid.');

    const users = await this.store.read(USERS);
    const existingAssistant = users.find((user) => (
      user.isAssistant
      && (
        user.assistantKind === assistantKind
        || user.account === normalizedAccount
      )
    ));
    const conflictingUser = users.find(
      (user) => user.account === normalizedAccount && !user.isAssistant,
    );

    assert(!conflictingUser, 500, `Assistant account "${normalizedAccount}" is already taken.`);

    if (existingAssistant) {
      existingAssistant.account = normalizedAccount;
      existingAssistant.nickname = nickname?.trim() || existingAssistant.nickname || 'AI 助手';
      existingAssistant.status = 'active';
      existingAssistant.isAssistant = true;
      existingAssistant.assistantKind = assistantKind;
      await this.store.write(USERS, users);
      return existingAssistant;
    }

    const assistantUser = {
      id: `user_assistant_${assistantKind}`,
      account: normalizedAccount,
      nickname: nickname?.trim() || 'AI 助手',
      avatarUrl: '',
      passwordHash: hashPassword(`assistant-${randomUUID()}`),
      status: 'active',
      createdAt: new Date().toISOString(),
      isAdmin: false,
      isAssistant: true,
      assistantKind,
    };

    users.push(assistantUser);
    await this.store.write(USERS, users);
    return assistantUser;
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
    const normalizedAccount = normalizeAccount(account);
    const user = users.find((item) => item.account === normalizedAccount);

    assert(user, 404, 'Account not found.');
    assert(user.status === 'active', 403, 'This account is banned.');

    if (!verifyPassword(password, user.passwordHash)) {
      throw new AppError(401, 'Incorrect password.');
    }

    return this.createSessionPayload(user);
  }

  async changePassword(userId, { currentPassword, newPassword }) {
    assert(currentPassword?.trim(), 400, 'Current password is required.');
    assert(newPassword?.length >= 8, 400, 'New password must be at least 8 characters.');

    const users = await this.store.read(USERS);
    const user = users.find((item) => item.id === userId);

    assert(user, 404, 'User not found.');
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      throw new AppError(401, 'Current password is incorrect.');
    }

    user.passwordHash = hashPassword(newPassword);
    await this.store.write(USERS, users);

    return {
      success: true,
      user: this.toSafeUser(user),
    };
  }

  async resetPassword(actor, targetUserId, { newPassword }) {
    assert(actor?.isAdmin, 403, 'Only admins can reset passwords.');
    assert(targetUserId, 400, 'Target user is required.');
    assert(newPassword?.length >= 8, 400, 'New password must be at least 8 characters.');

    const users = await this.store.read(USERS);
    const target = users.find((item) => item.id === targetUserId);

    assert(target, 404, 'Target user not found.');
    target.passwordHash = hashPassword(newPassword);
    await this.store.write(USERS, users);

    return {
      success: true,
      user: this.toSafeUser(target),
    };
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
      isAssistant: Boolean(user.isAssistant),
      assistantKind: user.assistantKind || '',
    };
  }
}
