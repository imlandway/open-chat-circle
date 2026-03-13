import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { AppError } from './core/http/errors.js';
import { resolveRequestUser } from './core/http/auth.js';
import { SessionService } from './core/security/session.js';
import { createStore } from './store/createStore.js';
import { AuthService } from './modules/auth/service.js';
import { SocialService } from './modules/social/service.js';
import { ChatService } from './modules/chat/service.js';
import { registerAuthRoutes } from './modules/auth/routes.js';
import { registerSocialRoutes } from './modules/social/routes.js';
import { registerChatRoutes } from './modules/chat/routes.js';
import { registerStorageRoutes } from './modules/storage/routes.js';

class RealtimeHub {
  constructor() {
    this.userSockets = new Map();
  }

  addSocket(userId, socket) {
    const set = this.userSockets.get(userId) ?? new Set();
    set.add(socket);
    this.userSockets.set(userId, set);

    socket.on('close', () => {
      set.delete(socket);
      if (set.size === 0) {
        this.userSockets.delete(userId);
      }
    });
  }

  broadcastUsers(userIds, event) {
    for (const userId of userIds) {
      const sockets = this.userSockets.get(userId);
      if (!sockets) {
        continue;
      }
      for (const socket of sockets) {
        if (socket.readyState === 1) {
          try {
            socket.send(JSON.stringify(event));
          } catch {
            socket.close();
            set.delete(socket);
          }
        }
      }
    }
  }
}

export async function buildApp() {
  const app = Fastify({
    logger: false,
  });

  const store = await createStore();
  const sessionService = new SessionService(config.sessionSecret);
  const authService = new AuthService(store, sessionService);
  const socialService = new SocialService(store);
  const chatService = new ChatService(store);
  const realtimeHub = new RealtimeHub();

  await authService.ensureSeedAdmin();

  app.decorate('config', config);
  app.decorate('store', store);
  app.decorate('sessionService', sessionService);
  app.decorate('authService', authService);
  app.decorate('socialService', socialService);
  app.decorate('chatService', chatService);
  app.decorate('realtimeHub', realtimeHub);

  await app.register(cors, {
    origin: config.corsOrigin === '*' ? true : config.corsOrigin,
    credentials: true,
  });
  await app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1,
    },
  });
  await app.register(websocket);
  await app.register(fastifyStatic, {
    root: config.uploadDir,
    prefix: '/uploads/',
  });
  await app.register(fastifyStatic, {
    root: config.webDir,
    prefix: '/app/',
    decorateReply: false,
  });

  app.get('/', async (_, reply) => {
    return reply.redirect('/app/');
  });

  app.get('/app', async (_, reply) => {
    return reply.redirect('/app/');
  });

  app.get('/app/', async (_, reply) => {
    return reply.sendFile('index.html', config.webDir);
  });

  app.get('/app/styles.css', async (_, reply) => {
    return reply.sendFile('styles.css', config.webDir);
  });

  app.get('/app/app.js', async (_, reply) => {
    return reply.sendFile('app.js', config.webDir);
  });

  app.get('/health', async () => ({
    status: 'ok',
    storeDriver: config.storeDriver,
    now: new Date().toISOString(),
  }));

  app.get('/ws', { websocket: true }, async (connection, request) => {
    const user = await resolveRequestUser(request, app);
    realtimeHub.addSocket(user.id, connection.socket);
    connection.socket.send(JSON.stringify({
      type: 'ws.ready',
      payload: {
        userId: user.id,
      },
    }));
  });

  await registerAuthRoutes(app);
  await registerSocialRoutes(app);
  await registerChatRoutes(app);
  await registerStorageRoutes(app);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        message: error.message,
        details: error.details,
      });
    }

    request.log.error(error);
    return reply.code(500).send({
      message: 'Internal server error.',
    });
  });

  app.addHook('onClose', async () => {
    await store.close();
  });

  return app;
}
