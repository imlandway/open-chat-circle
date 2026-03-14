import { delimiter, resolve } from 'node:path';

function splitRoots(value) {
  return String(value || '')
    .split(new RegExp(`[${delimiter}\n]`, 'g'))
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  serverUrl: (process.env.CHAT_AGENT_SERVER_URL || 'http://127.0.0.1:8787').replace(/\/$/, ''),
  token: process.env.CHAT_AGENT_TOKEN || '',
  defaultProjectRoot: resolve(process.env.CHAT_AGENT_DEFAULT_PROJECT_ROOT || process.cwd()),
  allowedRoots: [],
  headless: String(process.env.CHAT_AGENT_HEADLESS || 'false').toLowerCase() === 'true',
  codexExecutable: process.env.CHAT_AGENT_CODEX_EXECUTABLE || 'codex',
  codexModel: process.env.CHAT_AGENT_CODEX_MODEL || 'gpt-5.4',
};

config.allowedRoots = Array.from(new Set([
  config.defaultProjectRoot,
  ...splitRoots(process.env.CHAT_AGENT_ALLOWED_ROOTS),
].map((item) => resolve(item))));
