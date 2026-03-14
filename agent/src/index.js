import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { hostname } from 'node:os';
import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import WebSocket from 'ws';
import { config } from './config.js';
import { BrowserController } from './browser.js';
import { createToolRunner } from './tools.js';

if (!config.token) {
  console.error('CHAT_AGENT_TOKEN is required.');
  process.exit(1);
}

function toWebSocketUrl(serverUrl) {
  if (serverUrl.startsWith('https://')) {
    return `wss://${serverUrl.slice('https://'.length)}/ws/agent`;
  }
  if (serverUrl.startsWith('http://')) {
    return `ws://${serverUrl.slice('http://'.length)}/ws/agent`;
  }
  if (serverUrl.startsWith('ws://') || serverUrl.startsWith('wss://')) {
    return `${serverUrl.replace(/\/$/, '')}/ws/agent`;
  }
  return `ws://${serverUrl}/ws/agent`;
}

async function postJson(path, body) {
  const response = await fetch(`${config.serverUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-token': config.token,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw || `Request failed with ${response.status}`);
  }

  const data = await response.json();
  console.log(`HTTP POST ${path} -> ok`);
  return data;
}

async function uploadImage(filePath, fileName = basename(filePath)) {
  const fileBuffer = await readFile(filePath);
  const form = new FormData();
  form.append('file', new Blob([fileBuffer]), fileName);

  const response = await fetch(`${config.serverUrl}/api/agent/uploads/images`, {
    method: 'POST',
    headers: {
      'x-agent-token': config.token,
    },
    body: form,
  });

  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    throw new Error(data?.message || `Upload failed with ${response.status}`);
  }
  return data;
}

let approvalChain = Promise.resolve();

function approvalSummary(job) {
  return JSON.stringify({
    tool: job.toolName,
    arguments: job.arguments,
  }, null, 2);
}

async function askForApproval(job) {
  approvalChain = approvalChain.then(async () => {
    const rl = createInterface({ input: stdin, output: stdout });
    try {
      const answer = await rl.question(`Approve ${job.toolName}? [y/N]\n${approvalSummary(job)}\n> `);
      return /^y(es)?$/i.test(answer.trim());
    } finally {
      rl.close();
    }
  });

  return approvalChain;
}

async function main() {
  const browser = new BrowserController({ headless: config.headless });
  const tools = createToolRunner({
    config,
    browser,
    uploadImage,
  });

  let jobChain = Promise.resolve();

  const connect = () => {
    const ws = new WebSocket(`${toWebSocketUrl(config.serverUrl)}?token=${encodeURIComponent(config.token)}`);

    ws.on('open', () => {
      console.log(`Agent connected to ${config.serverUrl}`);
      ws.send(JSON.stringify({
        type: 'session.register',
        payload: {
          machineName: process.env.COMPUTERNAME || hostname(),
          allowedRoots: config.allowedRoots,
          capabilities: Object.keys(tools),
        },
      }));
    });

    ws.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (message?.type === 'agent.ready') {
        console.log(`Agent session ready: ${message.payload?.sessionId || 'unknown'}`);
        return;
      }

      if (message?.type === 'agent.error') {
        console.error(`Agent server error: ${message.payload?.message || 'unknown error'}`);
        return;
      }

      if (message?.type !== 'agent.job' || !message.payload) {
        return;
      }

      jobChain = jobChain.then(async () => {
        const job = message.payload;
        console.log(`Received job ${job.id} (${job.toolName})`);
        const tool = tools[job.toolName];
        if (!tool) {
          await postJson(`/api/agent/jobs/${job.id}/result`, {
            success: false,
            error: `Unsupported tool: ${job.toolName}`,
          });
          return;
        }

        try {
          if (job.requiresApproval) {
            console.log(`Job ${job.id} requires approval`);
            const approved = await askForApproval(job);
            if (!approved) {
              await postJson(`/api/agent/jobs/${job.id}/result`, {
                success: false,
                error: 'Local operator rejected this action.',
              });
              return;
            }
          }

          console.log(`Running job ${job.id} (${job.toolName})`);
          const result = await tool(job.arguments || {});
          console.log(`Completed job ${job.id} (${job.toolName})`);
          await postJson(`/api/agent/jobs/${job.id}/result`, {
            success: true,
            result,
          });
        } catch (error) {
          console.error(`Job ${job.id} failed before result upload`, error);
          await postJson(`/api/agent/jobs/${job.id}/result`, {
            success: false,
            error: error.message || 'Tool execution failed.',
            result: {
              type: 'text',
              error: error.message || 'Tool execution failed.',
            },
          });
        }
      }).catch((error) => {
        console.error('Failed to handle agent job.', error);
      });
    });

    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'session.ping',
          payload: {
            at: new Date().toISOString(),
          },
        }));
      }
    }, 15000);

    ws.on('close', (code, reasonBuffer) => {
      clearInterval(heartbeat);
      const reason = reasonBuffer?.toString?.() || '';
      console.log(`Agent disconnected (code=${code}${reason ? `, reason=${reason}` : ''}). Reconnecting in 3s...`);
      setTimeout(connect, 3000);
    });

    ws.on('error', (error) => {
      console.error('Agent websocket error.', error.message || error);
    });
  };

  connect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
