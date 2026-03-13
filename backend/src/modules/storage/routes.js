import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { requireAuth } from '../../core/http/auth.js';

function resolvePublicBaseUrl(request, configuredBaseUrl) {
  if (
    configuredBaseUrl &&
    configuredBaseUrl.trim() &&
    !configuredBaseUrl.includes('localhost')
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

export async function registerStorageRoutes(fastify) {
  fastify.post('/api/uploads/images', { preHandler: requireAuth }, async (request) => {
    const file = await request.file();
    if (!file) {
      return fastify.code(400).send({ message: 'Missing image file.' });
    }

    const extension = extname(file.filename || '') || '.jpg';
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
