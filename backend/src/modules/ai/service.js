import { randomUUID } from 'node:crypto';
import { AppError, assert } from '../../core/http/errors.js';

const ASSISTANT_RUNS = 'assistantRuns';
const AGENT_JOBS = 'agentJobs';
const AGENT_SESSIONS = 'agentSessions';
const CONVERSATIONS = 'conversations';
const MESSAGES = 'messages';

const TOOL_APPROVALS = {
  fs_list: false,
  fs_read: false,
  fs_search: false,
  fs_write: true,
  shell_run: true,
  browser_navigate: false,
  browser_click: true,
  browser_type: true,
  browser_screenshot: false,
};

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    name: 'fs_list',
    description: 'List files and folders inside an allowed directory on the connected Windows machine.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or configured-root-relative directory path.' },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'fs_read',
    description: 'Read a UTF-8 text file from the connected Windows machine.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'fs_search',
    description: 'Search for text across files inside an allowed directory.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        query: { type: 'string' },
        maxResults: { type: 'number' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'fs_write',
    description: 'Create or overwrite a text file on the connected Windows machine.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'shell_run',
    description: 'Run a PowerShell command inside an allowed working directory.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        cwd: { type: 'string' },
        timeoutMs: { type: 'number' },
      },
      required: ['command'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'browser_navigate',
    description: 'Open a URL in the local browser automation session.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string' },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'browser_click',
    description: 'Click an element in the browser automation session.',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
      },
      required: ['selector'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'browser_type',
    description: 'Type text into an element in the browser automation session.',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        text: { type: 'string' },
        clear: { type: 'boolean' },
      },
      required: ['selector', 'text'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'browser_screenshot',
    description: 'Take a screenshot of the current browser page and upload it back to chat.',
    parameters: {
      type: 'object',
      properties: {
        fileName: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
];

function toTimestamp(value) {
  const timestamp = new Date(value ?? 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function parseToolArguments(rawArguments) {
  if (!rawArguments) {
    return {};
  }
  if (typeof rawArguments === 'object') {
    return rawArguments;
  }

  try {
    return JSON.parse(rawArguments);
  } catch {
    return {};
  }
}

function extractResponseText(response) {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const parts = [];
  for (const item of response?.output ?? []) {
    if (item?.type !== 'message') {
      continue;
    }
    for (const content of item.content ?? []) {
      if (content?.type === 'output_text' && content.text) {
        parts.push(content.text);
      }
    }
  }

  return parts.join('\n').trim();
}

function buildSystemPrompt() {
  return [
    'You are Codex inside Open Chat Circle.',
    'You are helping the admin operate their own Windows computer through a trusted local agent.',
    'Use tools whenever the user asks you to inspect files, run commands, edit code, or control the browser.',
    'Do not claim actions completed unless a tool result confirms it.',
    'Be concise, collaborative, and practical.',
    'When a tool fails, explain what failed and what the user can do next.',
    'If you receive a screenshot tool result, you can summarize what is visible before continuing.',
  ].join(' ');
}

function normalizeToolResult(result) {
  if (!result || typeof result !== 'object') {
    return {
      type: 'text',
      text: '',
      metadata: {},
    };
  }

  return {
    type: result.type ?? 'text',
    text: result.text ?? '',
    imageUrl: result.imageUrl ?? '',
    imageName: result.imageName ?? '',
    metadata: result.metadata ?? {},
    error: result.error ?? '',
  };
}

function toModelToolOutput(result) {
  return {
    ok: !result.error,
    type: result.type,
    text: result.text,
    imageUrl: result.imageUrl,
    imageName: result.imageName,
    metadata: result.metadata,
    error: result.error || undefined,
  };
}

function createOpenAiClient(config) {
  return {
    async createResponse(payload) {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const raw = await response.text();
      const data = raw ? JSON.parse(raw) : null;
      if (!response.ok) {
        throw new Error(data?.error?.message || 'OpenAI request failed.');
      }
      return data;
    },
  };
}

export class AiService {
  constructor({ store, config, authService, chatService, realtimeHub, openaiClient = null }) {
    this.store = store;
    this.config = config;
    this.authService = authService;
    this.chatService = chatService;
    this.realtimeHub = realtimeHub;
    this.openaiClient = openaiClient ?? createOpenAiClient(config);
    this.runLocks = new Map();
    this.jobWaiters = new Map();
    this.agentSockets = new Map();
    this.activeAgentSessionId = null;
  }

  async getAssistantUser() {
    return this.authService.ensureAssistantUser({
      account: this.config.aiAssistantAccount,
      nickname: this.config.aiAssistantNickname,
    });
  }

  isAgentTokenValid(token) {
    return Boolean(this.config.aiAgentToken) && token === this.config.aiAgentToken;
  }

  isAgentOnline() {
    return Boolean(
      this.activeAgentSessionId
      && this.agentSockets.has(this.activeAgentSessionId),
    );
  }

  async decorateConversation(conversation) {
    if (!conversation) {
      return conversation;
    }

    const assistant = await this.getAssistantUser();
    const isAssistantConversation = Boolean(
      conversation.isAssistant
      || (
        conversation.type === 'direct'
        && Array.isArray(conversation.memberIds)
        && conversation.memberIds.includes(assistant.id)
      ),
    );

    if (!isAssistantConversation) {
      return {
        ...conversation,
        isAssistant: Boolean(conversation.isAssistant),
      };
    }

    return {
      ...conversation,
      isAssistant: true,
      agentOnline: this.isAgentOnline(),
    };
  }

  async decorateConversations(conversations) {
    return Promise.all((conversations ?? []).map((conversation) => this.decorateConversation(conversation)));
  }

  async ensureAssistantConversation(actor) {
    assert(actor?.isAdmin, 403, 'Only admins can use the assistant.');
    const assistant = await this.getAssistantUser();
    const conversation = await this.chatService.createDirectConversation(actor.id, assistant.id);
    return this.decorateConversation(conversation);
  }

  async isAssistantConversationId(conversationId) {
    const assistant = await this.getAssistantUser();
    const conversations = await this.store.read(CONVERSATIONS);
    return conversations.some((conversation) => (
      conversation.id === conversationId
      && conversation.type === 'direct'
      && Array.isArray(conversation.memberIds)
      && conversation.memberIds.includes(assistant.id)
    ));
  }

  async enqueueConversationRun({ actorUserId, conversationId, triggerMessageId }) {
    const assistant = await this.getAssistantUser();
    const run = {
      id: `run_${randomUUID()}`,
      assistantUserId: assistant.id,
      requestedBy: actorUserId,
      conversationId,
      triggerMessageId,
      status: 'queued',
      error: '',
      createdAt: new Date().toISOString(),
      startedAt: '',
      finishedAt: '',
      responseMessageIds: [],
    };

    await this.store.mutate(ASSISTANT_RUNS, (runs) => {
      runs.push(run);
      return runs;
    });

    const previous = this.runLocks.get(conversationId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => this.processRun(run.id))
      .finally(() => {
        if (this.runLocks.get(conversationId) === next) {
          this.runLocks.delete(conversationId);
        }
      });

    this.runLocks.set(conversationId, next);
    return run;
  }

  async waitForConversationIdle(conversationId) {
    const lock = this.runLocks.get(conversationId);
    if (lock) {
      await lock;
    }
  }

  async processRun(runId) {
    const run = await this.updateRun(runId, (current) => ({
      ...current,
      status: 'running',
      startedAt: new Date().toISOString(),
      error: '',
    }));

    try {
      if (!this.config.openaiApiKey) {
        const message = await this.postAssistantText(
          run.conversationId,
          'OpenAI API key 尚未配置，当前还不能执行 AI/本地 agent 指令。',
        );
        await this.finishRun(runId, {
          status: 'completed',
          responseMessageIds: [message.id],
        });
        return;
      }

      const contextMessages = await this.buildRunContext(run);
      let response = await this.openaiClient.createResponse({
        model: this.config.openaiModel,
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: buildSystemPrompt() }],
          },
          ...contextMessages,
        ],
        tools: TOOL_DEFINITIONS,
      });

      const responseMessageIds = [];
      const pendingImages = [];

      for (let step = 0; step < 6; step += 1) {
        const toolCalls = (response.output ?? []).filter((item) => item?.type === 'function_call');
        if (toolCalls.length === 0) {
          const finalText = extractResponseText(response) || '我已经处理完了。';

          for (const image of pendingImages) {
            const sentImage = await this.postAssistantImage(run.conversationId, image);
            responseMessageIds.push(sentImage.id);
          }

          const finalMessage = await this.postAssistantText(run.conversationId, finalText);
          responseMessageIds.push(finalMessage.id);
          await this.finishRun(runId, {
            status: 'completed',
            responseMessageIds,
          });
          return;
        }

        const toolOutputs = [];
        for (const toolCall of toolCalls) {
          const result = await this.executeToolCall(run, toolCall);
          if (result.type === 'image' && result.imageUrl) {
            pendingImages.push(result);
          }
          toolOutputs.push({
            type: 'function_call_output',
            call_id: toolCall.call_id,
            output: JSON.stringify(toModelToolOutput(result)),
          });
        }

        response = await this.openaiClient.createResponse({
          model: this.config.openaiModel,
          previous_response_id: response.id,
          input: toolOutputs,
        });
      }

      const timeoutMessage = await this.postAssistantText(
        run.conversationId,
        '这次指令链路太长了，我先停在这里。你可以换个更具体的步骤继续让我执行。',
      );
      await this.finishRun(runId, {
        status: 'completed',
        responseMessageIds: [timeoutMessage.id],
      });
    } catch (error) {
      const fallbackMessage = await this.postAssistantText(
        run.conversationId,
        `这次执行失败了：${error.message || '未知错误'}`,
      );
      await this.finishRun(runId, {
        status: 'failed',
        error: error.message || 'Unknown AI run failure.',
        responseMessageIds: [fallbackMessage.id],
      });
    }
  }

  async buildRunContext(run) {
    const assistant = await this.getAssistantUser();
    const messages = await this.chatService.listMessages(run.requestedBy, run.conversationId, { limit: 40 });
    const triggerIndex = messages.findIndex((message) => message.id === run.triggerMessageId);
    const thread = triggerIndex >= 0 ? messages.slice(0, triggerIndex + 1) : messages;

    return thread
      .filter((message) => !message.isRecalled)
      .slice(-20)
      .map((message) => {
        const textParts = [];
        if (message.replyTo) {
          const replySender = message.replyTo.sender?.nickname || 'unknown';
          const replyText = message.replyTo.type === 'image'
            ? `[图片] ${message.replyTo.imageName || 'image'}`
            : (message.replyTo.text || '');
          textParts.push(`Replying to ${replySender}: ${replyText}`);
        }

        if (message.type === 'image') {
          textParts.push(`[Image] ${message.imageName || 'image'} ${message.imageUrl}`);
        } else if (message.text) {
          textParts.push(message.text);
        }

        return {
          role: message.senderId === assistant.id ? 'assistant' : 'user',
          content: [
            {
              type: 'input_text',
              text: textParts.join('\n\n').trim() || '[Empty message]',
            },
          ],
        };
      });
  }

  async executeToolCall(run, toolCall) {
    const toolName = toolCall.name;
    const argumentsPayload = parseToolArguments(toolCall.arguments);
    assert(TOOL_APPROVALS[toolName] !== undefined, 400, `Unsupported tool: ${toolName}`);

    return this.requestAgentJob({
      runId: run.id,
      conversationId: run.conversationId,
      toolName,
      argumentsPayload,
      callId: toolCall.call_id,
      requiresApproval: TOOL_APPROVALS[toolName],
    });
  }

  async requestAgentJob({ runId, conversationId, toolName, argumentsPayload, callId, requiresApproval }) {
    const job = {
      id: `job_${randomUUID()}`,
      runId,
      conversationId,
      toolName,
      arguments: argumentsPayload,
      callId,
      requiresApproval,
      status: 'queued',
      requestedAt: new Date().toISOString(),
      startedAt: '',
      finishedAt: '',
      result: null,
      error: '',
      agentSessionId: this.activeAgentSessionId || '',
    };

    await this.store.mutate(AGENT_JOBS, (jobs) => {
      jobs.push(job);
      return jobs;
    });

    if (!this.isAgentOnline()) {
      const offlineResult = normalizeToolResult({
        type: 'text',
        text: '',
        error: '本地 agent 未连接，暂时无法操作这台电脑。',
        metadata: {
          offline: true,
        },
      });
      await this.completeAgentJob(job.id, {
        success: false,
        result: offlineResult,
        error: offlineResult.error,
      });
      return offlineResult;
    }

    await this.dispatchJob(job.id);

    return new Promise((resolve) => {
      const timeout = setTimeout(async () => {
        this.jobWaiters.delete(job.id);
        const timeoutResult = normalizeToolResult({
          type: 'text',
          error: '本地 agent 执行超时，请稍后再试。',
          metadata: {
            timeout: true,
          },
        });
        await this.completeAgentJob(job.id, {
          success: false,
          result: timeoutResult,
          error: timeoutResult.error,
        });
        resolve(timeoutResult);
      }, 120000);

      this.jobWaiters.set(job.id, {
        resolve: (payload) => {
          clearTimeout(timeout);
          resolve(payload);
        },
      });
    });
  }

  async dispatchJob(jobId) {
    const sessionId = this.activeAgentSessionId;
    const socket = sessionId ? this.agentSockets.get(sessionId) : null;
    if (!socket || socket.readyState !== 1) {
      return false;
    }

    const jobs = await this.store.read(AGENT_JOBS);
    const job = jobs.find((item) => item.id === jobId);
    if (!job) {
      return false;
    }

    socket.send(JSON.stringify({
      type: 'agent.job',
      payload: {
        id: job.id,
        runId: job.runId,
        conversationId: job.conversationId,
        toolName: job.toolName,
        arguments: job.arguments,
        requiresApproval: job.requiresApproval,
      },
    }));

    await this.store.mutate(AGENT_JOBS, (items) => items.map((item) => (
      item.id === jobId
        ? {
            ...item,
            status: 'dispatched',
            startedAt: item.startedAt || new Date().toISOString(),
            agentSessionId: sessionId,
          }
        : item
    )));

    return true;
  }

  async completeAgentJob(jobId, payload = {}) {
    const result = normalizeToolResult(payload.result);
    const success = payload.success !== false && !payload.error && !result.error;
    const error = payload.error || result.error || '';
    const finishedAt = new Date().toISOString();

    await this.store.mutate(AGENT_JOBS, (jobs) => jobs.map((job) => (
      job.id === jobId
        ? {
            ...job,
            status: success ? 'completed' : 'failed',
            finishedAt,
            result,
            error,
          }
        : job
    )));

    const waiter = this.jobWaiters.get(jobId);
    if (waiter) {
      this.jobWaiters.delete(jobId);
      waiter.resolve(result);
    }

    return {
      success,
      result,
      error,
    };
  }

  async openAgentSession(socket) {
    const session = {
      id: `agent_session_${randomUUID()}`,
      machineName: '',
      allowedRoots: [],
      capabilities: [],
      status: 'online',
      connectedAt: new Date().toISOString(),
      disconnectedAt: '',
      lastSeenAt: new Date().toISOString(),
    };

    await this.store.mutate(AGENT_SESSIONS, (sessions) => {
      sessions.push(session);
      return sessions;
    });

    this.agentSockets.set(session.id, socket);
    this.activeAgentSessionId = session.id;
    await this.broadcastAssistantPresenceChange();
    return session;
  }

  async handleAgentSocketMessage(sessionId, rawMessage) {
    let message;
    try {
      message = JSON.parse(rawMessage);
    } catch {
      return;
    }

    if (message?.type === 'session.register') {
      await this.store.mutate(AGENT_SESSIONS, (sessions) => sessions.map((session) => (
        session.id === sessionId
          ? {
              ...session,
              machineName: message.payload?.machineName || session.machineName,
              allowedRoots: Array.isArray(message.payload?.allowedRoots) ? message.payload.allowedRoots : [],
              capabilities: Array.isArray(message.payload?.capabilities) ? message.payload.capabilities : [],
              lastSeenAt: new Date().toISOString(),
            }
          : session
      )));
      await this.dispatchPendingJobs();
      await this.broadcastAssistantPresenceChange();
      return;
    }

    if (message?.type === 'session.ping') {
      await this.store.mutate(AGENT_SESSIONS, (sessions) => sessions.map((session) => (
        session.id === sessionId
          ? {
              ...session,
              lastSeenAt: new Date().toISOString(),
            }
          : session
      )));

      const socket = this.agentSockets.get(sessionId);
      if (socket?.readyState === 1) {
        socket.send(JSON.stringify({
          type: 'agent.pong',
          payload: {
            at: new Date().toISOString(),
          },
        }));
      }
    }
  }

  async closeAgentSession(sessionId) {
    this.agentSockets.delete(sessionId);
    if (this.activeAgentSessionId === sessionId) {
      this.activeAgentSessionId = null;
    }

    await this.store.mutate(AGENT_SESSIONS, (sessions) => sessions.map((session) => (
      session.id === sessionId
        ? {
            ...session,
            status: 'offline',
            disconnectedAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
          }
        : session
    )));

    await this.broadcastAssistantPresenceChange();
  }

  async dispatchPendingJobs() {
    const jobs = await this.store.read(AGENT_JOBS);
    for (const job of jobs.filter((item) => item.status === 'queued')) {
      await this.dispatchJob(job.id);
    }
  }

  async broadcastAssistantPresenceChange() {
    const assistant = await this.getAssistantUser();
    const conversations = await this.store.read(CONVERSATIONS);
    const targets = conversations.filter((conversation) => (
      conversation.type === 'direct'
      && Array.isArray(conversation.memberIds)
      && conversation.memberIds.includes(assistant.id)
    ));

    for (const conversation of targets) {
      const viewerIds = conversation.memberIds.filter((memberId) => memberId !== assistant.id);
      for (const viewerId of viewerIds) {
        try {
          const detail = await this.chatService.getConversationDetail(viewerId, conversation.id);
          const decorated = await this.decorateConversation(detail);
          this.realtimeHub.broadcastUsers([viewerId], {
            type: 'conversation.updated',
            payload: decorated,
          });
        } catch {
          // Ignore stale assistant conversations during presence fanout.
        }
      }
    }
  }

  async postAssistantText(conversationId, text) {
    const assistant = await this.getAssistantUser();
    const result = await this.chatService.sendMessage(assistant.id, conversationId, {
      type: 'text',
      text,
    });
    this.realtimeHub.broadcastUsers(result.conversation.memberIds, {
      type: 'message.created',
      payload: result.message,
    });
    return result.message;
  }

  async postAssistantImage(conversationId, imageResult) {
    const assistant = await this.getAssistantUser();
    const result = await this.chatService.sendMessage(assistant.id, conversationId, {
      type: 'image',
      imageUrl: imageResult.imageUrl,
      imageName: imageResult.imageName || 'screenshot.png',
    });
    this.realtimeHub.broadcastUsers(result.conversation.memberIds, {
      type: 'message.created',
      payload: result.message,
    });
    return result.message;
  }

  async updateRun(runId, updater) {
    let nextRun = null;

    await this.store.mutate(ASSISTANT_RUNS, (runs) => runs.map((run) => {
      if (run.id !== runId) {
        return run;
      }
      nextRun = updater(run);
      return nextRun;
    }));

    if (!nextRun) {
      throw new AppError(404, 'Assistant run not found.');
    }

    return nextRun;
  }

  async finishRun(runId, patch) {
    return this.updateRun(runId, (run) => ({
      ...run,
      ...patch,
      finishedAt: patch.finishedAt || new Date().toISOString(),
    }));
  }
}
