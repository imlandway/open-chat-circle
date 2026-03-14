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
  aiProvider: process.env.AI_PROVIDER ?? (process.env.DEEPSEEK_API_KEY ? 'deepseek' : 'openai'),
  aiExecutionMode: process.env.AI_EXECUTION_MODE ?? 'server_ai',
  aiRelayCwd: process.env.AI_RELAY_CWD ?? '',
  aiApiKey: process.env.AI_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY ?? '',
  aiBaseUrl: process.env.AI_BASE_URL ?? '',
  aiModel: process.env.AI_MODEL ?? process.env.OPENAI_MODEL ?? '',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  openaiModel: process.env.OPENAI_MODEL ?? 'gpt-5',
  aiAgentToken: process.env.AI_AGENT_TOKEN ?? '',
  aiAssistantAccount: process.env.AI_ASSISTANT_ACCOUNT ?? 'codex',
  aiAssistantNickname: process.env.AI_ASSISTANT_NICKNAME ?? 'AI 助手',
  codexAssistantAccount: process.env.CODEX_ASSISTANT_ACCOUNT ?? process.env.AI_ASSISTANT_ACCOUNT ?? 'codex',
  codexAssistantNickname: process.env.CODEX_ASSISTANT_NICKNAME ?? 'Codex',
  deepseekAssistantAccount: process.env.DEEPSEEK_ASSISTANT_ACCOUNT ?? 'deepseek',
  deepseekAssistantNickname: process.env.DEEPSEEK_ASSISTANT_NICKNAME ?? 'DeepSeek',
  dataDir: join(rootDir, 'data'),
  uploadDir: join(rootDir, 'data', 'uploads'),
  webDir: join(rootDir, '..', 'web'),
};
