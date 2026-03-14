import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../core/http/errors.js';
import { requireAdmin } from '../../core/http/auth.js';

function getAgentTokenFromRequest(request) {
  return request.headers['x-agent-token'] || request.query?.token;
}

async function requireAgentAuth(request) {
  const token = getAgentTokenFromRequest(request);
  if (!request.server.aiService.isAgentTokenValid(token)) {
    throw new AppError(401, 'Invalid agent token.');
  }
}

function resolvePublicBaseUrl(request, configuredBaseUrl) {
  if (
    configuredBaseUrl
    && configuredBaseUrl.trim()
    && !configuredBaseUrl.includes('localhost')
  ) {
    return configuredBaseUrl.replace(/\/$/, '');
  }

  const forwardedProto = request.headers['x-forwarded-proto'];
  const forwardedHost = request.headers['x-forwarded-host'];
  const host = forwardedHost || request.headers.host;
  const protocol = forwardedProto || 'http';

  if (!host) {
    return '';
  }

  return `${protocol}://${host}`;
}

export async function registerAiRoutes(fastify) {
  fastify.post('/api/ai/conversation', { preHandler: requireAdmin }, async (request) => {
    return {
      conversation: await fastify.aiService.ensureAssistantConversation(request.currentUser),
    };
  });

  fastify.get('/ws/agent', { websocket: true }, async (connection, request) => {
    const token = getAgentTokenFromRequest(request);
    if (!fastify.aiService.isAgentTokenValid(token)) {
      connection.socket.close(4001, 'Invalid agent token');
      return;
    }

    const session = await fastify.aiService.openAgentSession(connection.socket);
    connection.socket.send(JSON.stringify({
      type: 'agent.ready',
      payload: {
        sessionId: session.id,
      },
    }));

    connection.socket.on('message', async (raw) => {
      try {
        await fastify.aiService.handleAgentSocketMessage(session.id, raw.toString());
      } catch (error) {
        try {
          connection.socket.send(JSON.stringify({
            type: 'agent.error',
            payload: {
              message: error.message || 'Failed to process agent event.',
            },
          }));
        } catch {
          // Ignore late websocket write failures.
        }
      }
    });

    const close = () => {
      fastify.aiService.closeAgentSession(session.id).catch(() => undefined);
    };

    connection.socket.on('close', close);
    connection.socket.on('error', close);
  });

  fastify.post('/api/agent/jobs/:jobId/result', { preHandler: requireAgentAuth }, async (request) => {
    return fastify.aiService.completeAgentJob(request.params.jobId, request.body ?? {});
  });

  fastify.post('/api/agent/uploads/images', { preHandler: requireAgentAuth }, async (request) => {
    const file = await request.file();
    if (!file) {
      return fastify.code(400).send({ message: 'Missing image file.' });
    }

    const extension = extname(file.filename || '') || '.png';
    const safeName = `${Date.now()}-${randomUUID()}${extension}`;
    const targetPath = join(fastify.config.uploadDir, safeName);

    await mkdir(fastify.config.uploadDir, { recursive: true });
    const buffer = await file.toBuffer();
    await writeFile(targetPath, buffer);
    const baseUrl = resolvePublicBaseUrl(request, fastify.config.apiBaseUrl);
    const uploadPath = `/uploads/${safeName}`;

    return {
      url: baseUrl ? `${baseUrl}${uploadPath}` : uploadPath,
      name: file.filename,
      size: buffer.length,
      mimeType: file.mimetype,
    };
  });
}
