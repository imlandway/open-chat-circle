import 'dotenv/config';
import { join } from 'node:path';

const rootDir = process.cwd();

export const config = {
  port: Number(process.env.PORT ?? 8787),
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:8787',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  sessionSecret: process.env.SESSION_SECRET ?? 'open-chat-circle-dev-secret',
  storeDriver: process.env.STORE_DRIVER ?? 'json',
  databaseUrl: process.env.DATABASE_URL ?? '',
  dataDir: join(rootDir, 'data'),
  uploadDir: join(rootDir, 'data', 'uploads'),
  webDir: join(rootDir, '..', 'web'),
};
