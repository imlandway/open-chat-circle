import { AppError } from './errors.js';

export async function resolveRequestUser(request, reply) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : request.query.token;

  if (!token) {
    throw new AppError(401, 'Missing session token.');
  }

  const payload = request.server.sessionService.verifyToken(token);
  const user = await request.server.authService.getUserById(payload.userId);

  if (!user || user.status !== 'active') {
    throw new AppError(401, 'Session is no longer valid.');
  }

  request.currentUser = user;
  request.sessionToken = token;

  return user;
}

export async function requireAuth(request, reply) {
  await resolveRequestUser(request, reply);
}

export async function requireAdmin(request, reply) {
  const user = await resolveRequestUser(request, reply);
  if (!user.isAdmin) {
    throw new AppError(403, 'Admin access required.');
  }
}
