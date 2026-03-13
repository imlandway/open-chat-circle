import { createHmac } from 'node:crypto';
import { AppError } from '../http/errors.js';

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decode(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

export class SessionService {
  constructor(secret) {
    this.secret = secret;
  }

  signToken(payload) {
    const body = encode(payload);
    const signature = createHmac('sha256', this.secret).update(body).digest('base64url');
    return `${body}.${signature}`;
  }

  issueToken(user) {
    return this.signToken({
      userId: user.id,
      account: user.account,
      issuedAt: new Date().toISOString(),
    });
  }

  verifyToken(token) {
    const [body, signature] = token.split('.');
    if (!body || !signature) {
      throw new AppError(401, 'Malformed session token.');
    }

    const expected = createHmac('sha256', this.secret).update(body).digest('base64url');
    if (signature !== expected) {
      throw new AppError(401, 'Invalid session token.');
    }

    return decode(body);
  }
}
