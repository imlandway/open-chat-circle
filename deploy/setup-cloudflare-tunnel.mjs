import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const statePath = resolve('deploy/.cloudflare-tunnel.json');
const envOutputPath = resolve('deploy/.env.production');

const required = [
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_ZONE_ID',
  'CHAT_APP_PUBLIC_HOSTNAME',
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(
    `Missing required environment variables: ${missing.join(', ')}\n` +
      'Example:\n' +
      '  set CLOUDFLARE_API_TOKEN=...\n' +
      '  set CLOUDFLARE_ACCOUNT_ID=...\n' +
      '  set CLOUDFLARE_ZONE_ID=...\n' +
      '  set CHAT_APP_PUBLIC_HOSTNAME=chat.example.com\n' +
      '  node deploy/setup-cloudflare-tunnel.mjs',
  );
  process.exit(1);
}

const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const zoneId = process.env.CLOUDFLARE_ZONE_ID;
const publicHostname = process.env.CHAT_APP_PUBLIC_HOSTNAME;
const tunnelName = process.env.CLOUDFLARE_TUNNEL_NAME ?? 'open-chat-circle-production';
const tunnelService = process.env.CLOUDFLARE_TUNNEL_SERVICE ?? 'http://backend:8787';

function authHeaders() {
  return {
    Authorization: `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  };
}

async function cfFetch(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init.headers ?? {}),
    },
  });

  const json = await response.json();
  if (!response.ok || json.success === false) {
    throw new Error(`Cloudflare API failed for ${path}: ${JSON.stringify(json.errors ?? json)}`);
  }

  return json.result;
}

function loadState() {
  if (!existsSync(statePath)) {
    return null;
  }
  return JSON.parse(readFileSync(statePath, 'utf8'));
}

function saveState(state) {
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

async function ensureTunnel() {
  const existingState = loadState();
  if (existingState?.tunnelId) {
    const tokenResult = await cfFetch(
      `/accounts/${accountId}/cfd_tunnel/${existingState.tunnelId}/token`,
    );
    return {
      tunnelId: existingState.tunnelId,
      tunnelToken: tokenResult.token,
      created: false,
    };
  }

  const result = await cfFetch(`/accounts/${accountId}/cfd_tunnel`, {
    method: 'POST',
    body: JSON.stringify({
      name: tunnelName,
      config_src: 'cloudflare',
    }),
  });

  return {
    tunnelId: result.id,
    tunnelToken: result.token,
    created: true,
  };
}

async function configureTunnel(tunnelId) {
  await cfFetch(`/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, {
    method: 'PUT',
    body: JSON.stringify({
      config: {
        ingress: [
          {
            hostname: publicHostname,
            service: tunnelService,
            originRequest: {},
          },
          {
            service: 'http_status:404',
          },
        ],
      },
    }),
  });
}

async function upsertDns(tunnelId) {
  const existing = await cfFetch(
    `/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(publicHostname)}`,
    { method: 'GET' },
  );

  const payload = {
    type: 'CNAME',
    proxied: true,
    name: publicHostname,
    content: `${tunnelId}.cfargotunnel.com`,
    ttl: 1,
  };

  if (Array.isArray(existing) && existing.length > 0) {
    await cfFetch(`/zones/${zoneId}/dns_records/${existing[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return 'updated';
  }

  await cfFetch(`/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return 'created';
}

function writeProductionEnv({ tunnelToken }) {
  const content = [
    `POSTGRES_PASSWORD=${process.env.POSTGRES_PASSWORD ?? 'replace-with-a-strong-password'}`,
    `SESSION_SECRET=${process.env.SESSION_SECRET ?? 'replace-with-a-long-random-secret'}`,
    `SEED_ADMIN_PASSWORD=${process.env.SEED_ADMIN_PASSWORD ?? 'replace-with-a-strong-admin-password'}`,
    `CLOUDFLARE_TUNNEL_TOKEN=${tunnelToken}`,
    `CHAT_APP_PUBLIC_HOSTNAME=${publicHostname}`,
    '',
  ].join('\n');

  writeFileSync(envOutputPath, content);
}

const tunnel = await ensureTunnel();
await configureTunnel(tunnel.tunnelId);
const dnsAction = await upsertDns(tunnel.tunnelId);

saveState({
  tunnelId: tunnel.tunnelId,
  tunnelName,
  publicHostname,
  configuredAt: new Date().toISOString(),
});

writeProductionEnv({ tunnelToken: tunnel.tunnelToken });

console.log('');
console.log(`Tunnel ${tunnel.created ? 'created' : 'reused'}: ${tunnel.tunnelId}`);
console.log(`DNS ${dnsAction}: ${publicHostname}`);
console.log(`Production env written to: ${envOutputPath}`);
console.log('');
console.log('Next step:');
console.log('  cd deploy');
console.log('  docker compose -f docker-compose.production.yml --env-file .env.production up -d --build');
