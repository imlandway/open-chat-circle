import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { requireAuth } from '../../core/http/auth.js';

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

    return {
      url: `${fastify.config.apiBaseUrl}/uploads/${safeName}`,
      name: file.filename,
      size: buffer.length,
      mimeType: file.mimetype,
    };
  });
}
