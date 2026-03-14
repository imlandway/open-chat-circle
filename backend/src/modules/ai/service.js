import { randomUUID } from 'node:crypto';
import { AppError, assert } from '../../core/http/errors.js';

const ASSISTANT_RUNS = 'assistantRuns';
const AGENT_JOBS = 'agentJobs';
const AGENT_SESSIONS = 'agentSessions';
const CONVERSATIONS = 'conversations';

const TOOL_APPROVALS = {
  codex_run: false,
  fs_list: false,
  fs_read: false,
  fs_search: false,
  fs_write: false,
  shell_run: false,
  browser_navigate: false,
  browser_click: false,
  browser_type: false,
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
    description: 'Run a PowerShell command inside an allowed working directory. Use this for explicit shell tasks, not for basic file listing, reading, or searching.',
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

const SAFE_SHELL_INSPECTION_COMMANDS = [
  /^(get-childitem|gci|dir|ls)\b/i,
  /^(get-location|pwd)\b/i,
  /^(get-content|gc|type|cat)\b/i,
  /^(select-string|sls|findstr)\b/i,
];

const SHELL_RISKY_TOKENS = [';', '&&', '||', '|', '>', '<'];

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

function buildSystemPrompt(assistantName = 'Codex') {
  return [
    `You are ${assistantName} inside Open Chat Circle.`,
    'You are helping the admin operate their own Windows computer through a trusted local agent.',
    'Default to action, not discussion.',
    'Use tools whenever the user asks you to inspect files, run commands, edit code, or control the browser.',
    'Prefer fs_list, fs_read, and fs_search for file inspection tasks.',
    'Only use shell_run when the user explicitly wants a shell command or when the fs_* tools cannot complete the task.',
    'Do not ask for clarification when the next tool step is obvious.',
    'Do not claim actions completed unless a tool result confirms it.',
    'Keep replies short, direct, and practical.',
    'Do not write filler, reassurance, repeated explanations, or long diagnostic lists.',
    'When a tool fails or times out, reply in at most two short sentences: what failed, then the next step.',
    'If the user only says hello, reply briefly and invite one concrete task.',
    'If you receive a screenshot tool result, summarize only the useful visible details before continuing.',
  ].join(' ');
}

function normalizeAssistantText(text) {
  const normalized = String(text || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return normalized || '\u5df2\u5904\u7406\u5b8c\u6210\u3002';
}

function toUserFacingErrorMessage(error) {
  const rawMessage = String(error?.message || '').trim();
  if (!rawMessage) {
    return '\u672a\u77e5\u9519\u8bef';
  }

  if (/timeout|timed out/i.test(rawMessage)) {
    return '\u6267\u884c\u8d85\u65f6';
  }

  if (/api key/i.test(rawMessage)) {
    return 'AI API key \u65e0\u6548\u6216\u4e0d\u53ef\u7528';
  }

  if (/insufficient|quota|billing|balance|credit/i.test(rawMessage)) {
    return '\u6a21\u578b\u8d26\u6237\u989d\u5ea6\u4e0d\u8db3';
  }

  return rawMessage;
}

function shouldRequireToolApproval(toolName, argumentsPayload) {
  void argumentsPayload;
  return Boolean(TOOL_APPROVALS[toolName]);
}

function normalizeToolResult(result) {
  if (!result || typeof result !== 'object') {
    return {
      type: 'text',
      text: '',
      imageUrl: '',
      imageName: '',
      metadata: {},
      error: '',
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

function toToolCallDefinitionsForChatCompletions(toolDefinitions) {
  return toolDefinitions.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function createJsonTransport({ baseUrl, apiKey }) {
  return async function requestJson(path, payload) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const raw = await response.text();
    const data = raw ? JSON.parse(raw) : null;
    if (!response.ok) {
      throw new Error(data?.error?.message || 'AI provider request failed.');
    }
    return data;
  };
}

function extractResponsesApiText(state) {
  if (typeof state?.response?.output_text === 'string' && state.response.output_text.trim()) {
    return state.response.output_text.trim();
  }

  const parts = [];
  for (const item of state?.response?.output ?? []) {
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

function createResponsesApiClient(config, transport = null) {
  const requestJson = transport ?? createJsonTransport({
    baseUrl: (config.aiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, ''),
    apiKey: config.aiApiKey || config.openaiApiKey,
  });

  return {
    async start({ systemPrompt, messages, tools }) {
      const response = await requestJson('/responses', {
        model: config.aiModel || config.openaiModel || 'gpt-5',
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: systemPrompt }],
          },
          ...messages.map((message) => ({
            role: message.role,
            content: [{ type: 'input_text', text: message.text }],
          })),
        ],
        tools,
      });

      return {
        provider: 'openai',
        response,
      };
    },

    async continue(state, toolOutputs) {
      const response = await requestJson('/responses', {
        model: config.aiModel || config.openaiModel || 'gpt-5',
        previous_response_id: state.response.id,
        input: toolOutputs.map((toolOutput) => ({
          type: 'function_call_output',
          call_id: toolOutput.callId,
          output: JSON.stringify(toModelToolOutput(toolOutput.result)),
        })),
      });

      return {
        provider: 'openai',
        response,
      };
    },

    getToolCalls(state) {
      return (state.response.output ?? [])
        .filter((item) => item?.type === 'function_call')
        .map((item) => ({
          callId: item.call_id,
          name: item.name,
          arguments: item.arguments,
        }));
    },

    getText(state) {
      return extractResponsesApiText(state);
    },
  };
}

function createLegacyResponsesClient(config, legacyClient) {
  if (!legacyClient) {
    return null;
  }

  return {
    async start({ systemPrompt, messages, tools }) {
      const response = await legacyClient.createResponse({
        model: config.aiModel || config.openaiModel || 'gpt-5',
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: systemPrompt }],
          },
          ...messages.map((message) => ({
            role: message.role,
            content: [{ type: 'input_text', text: message.text }],
          })),
        ],
        tools,
      });

      return {
        provider: 'openai',
        response,
      };
    },

    async continue(state, toolOutputs) {
      const response = await legacyClient.createResponse({
        model: config.aiModel || config.openaiModel || 'gpt-5',
        previous_response_id: state.response.id,
        input: toolOutputs.map((toolOutput) => ({
          type: 'function_call_output',
          call_id: toolOutput.callId,
          output: JSON.stringify(toModelToolOutput(toolOutput.result)),
        })),
      });

      return {
        provider: 'openai',
        response,
      };
    },

    getToolCalls(state) {
      return (state.response.output ?? [])
        .filter((item) => item?.type === 'function_call')
        .map((item) => ({
          callId: item.call_id,
          name: item.name,
          arguments: item.arguments,
        }));
    },

    getText(state) {
      return extractResponsesApiText(state);
    },
  };
}

function createChatCompletionsClient(config, transport = null) {
  const requestJson = transport ?? createJsonTransport({
    baseUrl: (config.aiBaseUrl || 'https://api.deepseek.com').replace(/\/$/, ''),
    apiKey: config.aiApiKey,
  });

  return {
    async start({ systemPrompt, messages, tools }) {
      const chatMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.map((message) => ({
          role: message.role,
          content: message.text,
        })),
      ];

      const completion = await requestJson('/chat/completions', {
        model: config.aiModel || 'deepseek-chat',
        messages: chatMessages,
        tools: toToolCallDefinitionsForChatCompletions(tools),
        temperature: 0.2,
      });

      return {
        provider: 'chat-completions',
        messages: chatMessages,
        completion,
      };
    },

    async continue(state, toolOutputs, tools) {
      const assistantMessage = state.completion?.choices?.[0]?.message ?? {};
      const nextMessages = [
        ...state.messages,
        {
          role: 'assistant',
          content: assistantMessage.content ?? '',
          tool_calls: assistantMessage.tool_calls ?? [],
        },
        ...toolOutputs.map((toolOutput) => ({
          role: 'tool',
          tool_call_id: toolOutput.callId,
          content: JSON.stringify(toModelToolOutput(toolOutput.result)),
        })),
      ];

      const completion = await requestJson('/chat/completions', {
        model: config.aiModel || 'deepseek-chat',
        messages: nextMessages,
        tools: toToolCallDefinitionsForChatCompletions(tools),
        temperature: 0.2,
      });

      return {
        provider: 'chat-completions',
        messages: nextMessages,
        completion,
      };
    },

    getToolCalls(state) {
      return (state.completion?.choices?.[0]?.message?.tool_calls ?? []).map((toolCall) => ({
        callId: toolCall.id,
        name: toolCall.function?.name,
        arguments: toolCall.function?.arguments,
      }));
    },

    getText(state) {
      return String(state.completion?.choices?.[0]?.message?.content || '').trim();
    },
  };
}

function createAiClient(config, { aiClient = null, openaiClient = null } = {}) {
  if (aiClient) {
    return aiClient;
  }

  const legacyClient = createLegacyResponsesClient(config, openaiClient);
  if (legacyClient) {
    return legacyClient;
  }

  if ((config.aiProvider || 'openai').toLowerCase() === 'deepseek') {
    return createChatCompletionsClient({
      ...config,
      aiBaseUrl: config.aiBaseUrl || 'https://api.deepseek.com',
      aiModel: config.aiModel || 'deepseek-chat',
    });
  }

  return createResponsesApiClient({
    ...config,
    aiBaseUrl: config.aiBaseUrl || 'https://api.openai.com/v1',
    aiModel: config.aiModel || config.openaiModel || 'gpt-5',
  });
}

export class AiService {
  constructor({ store, config, authService, chatService, realtimeHub, aiClient = null, openaiClient = null }) {
    this.store = store;
    this.config = config;
    this.authService = authService;
    this.chatService = chatService;
    this.realtimeHub = realtimeHub;
    this.aiClient = createAiClient(config, {
      aiClient,
      openaiClient,
    });
    this.runLocks = new Map();
    this.jobWaiters = new Map();
    this.agentSockets = new Map();
    this.activeAgentSessionId = null;
  }

  getAssistantDefinitions() {
    return [
      {
        kind: 'codex',
        account: this.config.codexAssistantAccount || this.config.aiAssistantAccount || 'codex',
        nickname: this.config.codexAssistantNickname || 'Codex',
        executionMode: 'local_codex',
      },
      {
        kind: 'deepseek',
        account: this.config.deepseekAssistantAccount || 'deepseek',
        nickname: this.config.deepseekAssistantNickname || 'DeepSeek',
        executionMode: 'server_ai',
      },
    ];
  }

  async getAssistantUsers() {
    const definitions = this.getAssistantDefinitions();
    const users = [];
    for (const definition of definitions) {
      users.push(await this.authService.ensureAssistantUser({
        account: definition.account,
        nickname: definition.nickname,
        assistantKind: definition.kind,
      }));
    }

    return users.map((user, index) => ({
      kind: definitions[index].kind,
      account: definitions[index].account,
      nickname: definitions[index].nickname,
      executionMode: definitions[index].executionMode,
      user,
    }));
  }

  async getAssistantUser(kind = 'codex') {
    const assistants = await this.getAssistantUsers();
    const assistant = assistants.find((item) => item.kind === kind) || assistants[0];
    return assistant?.user ?? null;
  }

  async getAssistantProfileByUserId(userId) {
    const assistants = await this.getAssistantUsers();
    return assistants.find((item) => item.user.id === userId) || null;
  }

  async getConversationAssistant(conversationId) {
    const [assistants, conversations] = await Promise.all([
      this.getAssistantUsers(),
      this.store.read(CONVERSATIONS),
    ]);
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation || !Array.isArray(conversation.memberIds)) {
      return null;
    }

    if (conversation.type === 'group') {
      const deepseek = assistants.find((assistant) => (
        assistant.kind === 'deepseek'
        && conversation.memberIds.includes(assistant.user.id)
      ));
      if (deepseek) {
        return deepseek;
      }
      return assistants.find((assistant) => conversation.memberIds.includes(assistant.user.id)) || null;
    }

    return assistants.find((assistant) => conversation.memberIds.includes(assistant.user.id)) || null;
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

    const assistant = await this.getConversationAssistant(conversation.id);
    const isAssistantConversation = Boolean(assistant);

    if (!isAssistantConversation) {
      return {
        ...conversation,
        isAssistant: Boolean(conversation.isAssistant),
      };
    }

    return {
      ...conversation,
      isAssistant: true,
      assistantKind: assistant.kind,
      agentOnline: assistant.kind === 'codex' ? this.isAgentOnline() : false,
    };
  }

  async decorateConversations(conversations) {
    return Promise.all((conversations ?? []).map((conversation) => this.decorateConversation(conversation)));
  }

  async ensureAssistantConversation(actor, kind = 'codex') {
    assert(actor?.isAdmin, 403, 'Only admins can use the assistant.');
    const assistant = await this.getAssistantUser(kind);
    const conversation = await this.chatService.createDirectConversation(actor.id, assistant.id);
    return this.decorateConversation(conversation);
  }

  async ensureAssistantConversations(actor) {
    assert(actor?.isAdmin, 403, 'Only admins can use the assistant.');
    const assistants = await this.getAssistantUsers();
    await this.migrateLegacyGroupAssistantMemberships(assistants);
    const conversations = [];
    for (const assistant of assistants) {
      conversations.push(await this.ensureAssistantConversation(actor, assistant.kind));
    }
    return conversations;
  }

  async isAssistantConversationId(conversationId) {
    return Boolean(await this.getConversationAssistant(conversationId));
  }

  async enqueueConversationRun({ actorUserId, conversationId, triggerMessageId }) {
    const assistant = await this.getConversationAssistant(conversationId);
    assert(assistant, 404, 'Assistant conversation not found.');
    const run = {
      id: `run_${randomUUID()}`,
      assistantUserId: assistant.user.id,
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
      const assistant = await this.getAssistantProfileByUserId(run.assistantUserId);
      const executionMode = String(assistant?.executionMode || this.config.aiExecutionMode || 'server_ai').toLowerCase();

      if (executionMode === 'local_codex') {
        await this.processLocalCodexRun(runId, run);
        return;
      }

      if (!this.config.aiApiKey && !this.config.openaiApiKey) {
        const message = await this.postAssistantText(
          run.conversationId,
          'AI API key 未配置，当前无法执行 AI 指令。',
          run.assistantUserId,
        );
        await this.finishRun(runId, {
          status: 'completed',
          responseMessageIds: [message.id],
        });
        return;
      }

      const contextMessages = await this.buildRunContext(run);
      let response = await this.aiClient.start({
        systemPrompt: buildSystemPrompt(assistant?.nickname || assistant?.user?.nickname || 'AI'),
        messages: contextMessages,
        tools: TOOL_DEFINITIONS,
      });

      const responseMessageIds = [];
      const pendingImages = [];

      for (let step = 0; step < 6; step += 1) {
        const toolCalls = this.aiClient.getToolCalls(response);
        if (toolCalls.length === 0) {
          const finalText = normalizeAssistantText(this.aiClient.getText(response));

          for (const image of pendingImages) {
            const sentImage = await this.postAssistantImage(run.conversationId, image, run.assistantUserId);
            responseMessageIds.push(sentImage.id);
          }

          const finalMessage = await this.postAssistantText(run.conversationId, finalText, run.assistantUserId);
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
            callId: toolCall.callId,
            result,
          });
        }

        response = await this.aiClient.continue(response, toolOutputs, TOOL_DEFINITIONS);
      }

      const timeoutMessage = await this.postAssistantText(
        run.conversationId,
        '这次执行超时了。请把指令拆成更具体的一步再试。',
        run.assistantUserId,
      );
      await this.finishRun(runId, {
        status: 'completed',
        responseMessageIds: [timeoutMessage.id],
      });
    } catch (error) {
      const fallbackMessage = await this.postAssistantText(
        run.conversationId,
        `执行失败：${toUserFacingErrorMessage(error)}。`,
        run.assistantUserId,
      );
      await this.finishRun(runId, {
        status: 'failed',
        error: error.message || 'Unknown AI run failure.',
        responseMessageIds: [fallbackMessage.id],
      });
    }
  }

  async processLocalCodexRun(runId, run) {
    const contextMessages = await this.buildRunContext(run);
    const instruction = this.extractRelayInstruction(contextMessages);
    const relayResult = await this.requestAgentJob({
      runId: run.id,
      conversationId: run.conversationId,
      toolName: 'codex_run',
      argumentsPayload: {
        instruction,
        history: contextMessages.slice(-12),
        cwd: this.config.aiRelayCwd || '',
      },
      callId: `codex_run_${run.id}`,
      requiresApproval: false,
    });

    const responseMessageIds = [];
    if (relayResult.type === 'image' && relayResult.imageUrl) {
      const sentImage = await this.postAssistantImage(run.conversationId, relayResult, run.assistantUserId);
      responseMessageIds.push(sentImage.id);
    }

    const relayLabel = '[Codex relay]';
    const finalText = relayResult.error
      ? `${relayLabel}\n\u6267\u884c\u5931\u8d25\uff1a${relayResult.error}\u3002`
      : `${relayLabel}\n${normalizeAssistantText(relayResult.text)}`;
    const finalMessage = await this.postAssistantText(run.conversationId, finalText, run.assistantUserId);
    responseMessageIds.push(finalMessage.id);

    await this.finishRun(runId, {
      status: relayResult.error ? 'failed' : 'completed',
      error: relayResult.error || '',
      responseMessageIds,
    });
  }

  extractRelayInstruction(contextMessages) {
    const latestUserMessage = [...(contextMessages || [])]
      .reverse()
      .find((message) => message?.role === 'user' && String(message.text || '').trim());

    return String(latestUserMessage?.text || '').trim() || '\u8bf7\u76f4\u63a5\u5904\u7406\u5f53\u524d\u8bf7\u6c42\u3002';
  }

  async buildRunContext(run) {
    const conversationAssistant = await this.getConversationAssistant(run.conversationId);
    const assistant = run.assistantUserId
      ? await this.authService.getUserById(run.assistantUserId)
      : conversationAssistant?.user;
    const conversations = await this.store.read(CONVERSATIONS);
    const conversation = conversations.find((item) => item.id === run.conversationId) ?? null;
    const isGroupConversation = conversation?.type === 'group';
    const messages = await this.chatService.listMessages(run.requestedBy, run.conversationId, { limit: 40 });
    const triggerIndex = messages.findIndex((message) => message.id === run.triggerMessageId);
    const thread = triggerIndex >= 0 ? messages.slice(0, triggerIndex + 1) : messages;

    return thread
      .filter((message) => !message.isRecalled)
      .slice(-20)
      .map((message) => {
        const textParts = [];
        const senderName = message.sender?.nickname || 'Unknown user';

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

        const body = textParts.join('\n\n').trim() || '[Empty message]';
        return {
          role: assistant && message.senderId === assistant.id ? 'assistant' : 'user',
          text: isGroupConversation && message.senderId !== assistant?.id
            ? `${senderName}: ${body}`
            : body,
        };
      });
  }

  async executeToolCall(run, toolCall) {
    const toolName = toolCall.name;
    const argumentsPayload = parseToolArguments(toolCall.arguments);
    assert(TOOL_APPROVALS[toolName] !== undefined, 400, `Unsupported tool: ${toolName}`);

    const requiresApproval = shouldRequireToolApproval(toolName, argumentsPayload);
    return this.requestAgentJob({
      runId: run.id,
      conversationId: run.conversationId,
      toolName,
      argumentsPayload,
      callId: toolCall.callId,
      requiresApproval,
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
        error: '本地 agent 未连接，当前无法操作这台电脑。',
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

    console.log(`[agent-job] dispatching ${job.id} tool=${toolName}`);
    await this.dispatchJob(job.id);

    return new Promise((resolve) => {
      const timeout = setTimeout(async () => {
        this.jobWaiters.delete(job.id);
        const timeoutResult = normalizeToolResult({
          type: 'text',
          error: '本地 agent 执行超时。请重试。',
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
    console.log(`[agent-job] completed ${jobId} success=${success}${error ? ` error=${error}` : ''}`);

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

  async migrateLegacyGroupAssistantMemberships(assistants = null) {
    const assistantProfiles = assistants || await this.getAssistantUsers();
    const codex = assistantProfiles.find((assistant) => assistant.kind === 'codex');
    const deepseek = assistantProfiles.find((assistant) => assistant.kind === 'deepseek');
    if (!codex || !deepseek) {
      return;
    }

    await this.store.mutate(CONVERSATIONS, (conversations) => conversations.map((conversation) => {
      if (
        conversation.type !== 'group'
        || !Array.isArray(conversation.memberIds)
        || !conversation.memberIds.includes(codex.user.id)
        || conversation.memberIds.includes(deepseek.user.id)
      ) {
        return conversation;
      }

      return {
        ...conversation,
        memberIds: conversation.memberIds.map((memberId) => (
          memberId === codex.user.id ? deepseek.user.id : memberId
        )),
        updatedAt: new Date().toISOString(),
      };
    }));
  }

  async broadcastAssistantPresenceChange() {
    const assistant = await this.getAssistantUser('codex');
    if (!assistant) {
      return;
    }
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

  async postAssistantText(conversationId, text, assistantUserId) {
    const assistant = await this.authService.getUserById(assistantUserId);
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

  async postAssistantImage(conversationId, imageResult, assistantUserId) {
    const assistant = await this.authService.getUserById(assistantUserId);
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
