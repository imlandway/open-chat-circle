import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 32;

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${hash}:${salt}`;
}

export function verifyPassword(password, storedHash) {
  const [hash, salt] = storedHash.split(':');
  if (!hash || !salt) {
    return false;
  }

  const incoming = Buffer.from(scryptSync(password, salt, KEY_LENGTH).toString('hex'));
  const stored = Buffer.from(hash);

  return incoming.length === stored.length && timingSafeEqual(incoming, stored);
}
