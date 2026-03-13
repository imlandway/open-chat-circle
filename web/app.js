const state = {
  session: loadSession(),
  contacts: [],
  invites: [],
  conversations: [],
  messages: [],
  activeConversation: null,
  socket: null,
  pollingTimer: null,
};

const authPanel = document.querySelector('#auth-panel');
const userPanel = document.querySelector('#user-panel');
const contactsPanel = document.querySelector('#contacts-panel');
const adminPanel = document.querySelector('#admin-panel');
const conversationList = document.querySelector('#conversation-list');
const messageList = document.querySelector('#message-list');
const emptyState = document.querySelector('#empty-state');
const chatPanel = document.querySelector('#chat-panel');
const chatTitle = document.querySelector('#chat-title');
const chatMeta = document.querySelector('#chat-meta');
const userSummary = document.querySelector('#user-summary');
const contactsList = document.querySelector('#contacts-list');
const inviteList = document.querySelector('#invite-list');
const connectionStatus = document.querySelector('#connection-status');
const createGroupBtn = document.querySelector('#create-group-btn');
const logoutBtn = document.querySelector('#logout-btn');
const refreshContactsBtn = document.querySelector('#refresh-contacts-btn');
const createInviteBtn = document.querySelector('#create-invite-btn');
const messageForm = document.querySelector('#message-form');
const messageInput = document.querySelector('#message-input');
const imageInput = document.querySelector('#image-input');
const toast = document.querySelector('#toast');
const groupDialog = document.querySelector('#group-dialog');
const groupForm = document.querySelector('#group-form');
const groupNameInput = document.querySelector('#group-name-input');
const groupMemberList = document.querySelector('#group-member-list');

boot();

function boot() {
  renderAuthPanel('login');
  wireEvents();
  if (state.session?.sessionToken) {
    hydrateApp().catch(handleError);
  } else {
    render();
  }
}

function wireEvents() {
  logoutBtn.addEventListener('click', async () => {
    disconnectSocket();
    state.session = null;
    state.contacts = [];
    state.invites = [];
    state.conversations = [];
    state.messages = [];
    state.activeConversation = null;
    saveSession(null);
    render();
  });

  refreshContactsBtn.addEventListener('click', () => hydrateSideData().catch(handleError));

  createInviteBtn.addEventListener('click', async () => {
    try {
      const invite = await api('/api/invites', {
        method: 'POST',
        body: {
          uses: 5,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      showToast(`已生成邀请码 ${invite.invite.code}`);
      await hydrateSideData();
    } catch (error) {
      handleError(error);
    }
  });

  createGroupBtn.addEventListener('click', () => {
    renderGroupMembers();
    groupDialog.showModal();
  });

  groupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const memberIds = [...groupMemberList.querySelectorAll('input[type="checkbox"]:checked')]
      .map((checkbox) => checkbox.value);
    try {
      const result = await api('/api/conversations/group', {
        method: 'POST',
        body: {
          name: groupNameInput.value.trim(),
          memberIds,
        },
      });
      groupDialog.close();
      groupForm.reset();
      await hydrateConversations();
      await selectConversation(result.conversation.id);
    } catch (error) {
      handleError(error);
    }
  });

  messageForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.activeConversation) {
      return;
    }
    const text = messageInput.value.trim();
    if (!text) {
      return;
    }
    messageInput.value = '';
    try {
      await api(`/api/conversations/${state.activeConversation.id}/messages`, {
        method: 'POST',
        body: {
          type: 'text',
          text,
        },
      });
      await refreshActiveConversation();
    } catch (error) {
      handleError(error);
    }
  });

  imageInput.addEventListener('change', async () => {
    const file = imageInput.files?.[0];
    if (!file || !state.activeConversation) {
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      const upload = await fetch('/api/uploads/images', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${state.session.sessionToken}`,
        },
        body: formData,
      }).then(readJson);

      await api(`/api/conversations/${state.activeConversation.id}/messages`, {
        method: 'POST',
        body: {
          type: 'image',
          imageUrl: upload.url,
          imageName: upload.name,
        },
      });
      imageInput.value = '';
      await refreshActiveConversation();
    } catch (error) {
      handleError(error);
    }
  });
}

async function hydrateApp() {
  await ensureSession();
  await Promise.all([hydrateSideData(), hydrateConversations()]);
  connectSocket();
  render();
}

function startPollingFallback() {
  if (state.pollingTimer || !state.session?.sessionToken) {
    return;
  }

  state.pollingTimer = window.setInterval(async () => {
    try {
      await hydrateConversations();
      if (state.activeConversation) {
        await loadMessages(state.activeConversation.id);
      }
      render();
    } catch (error) {
      console.error(error);
    }
  }, 4000);
}

function stopPollingFallback() {
  if (!state.pollingTimer) {
    return;
  }

  window.clearInterval(state.pollingTimer);
  state.pollingTimer = null;
}

async function ensureSession() {
  const me = await api('/api/auth/me');
  state.session.user = me.user;
  saveSession(state.session);
}

async function hydrateSideData() {
  const contactsResponse = await api('/api/contacts');
  state.contacts = contactsResponse.contacts;
  if (state.session.user.isAdmin) {
    const invitesResponse = await api('/api/invites');
    state.invites = invitesResponse.invites;
  } else {
    state.invites = [];
  }
  render();
}

async function hydrateConversations() {
  const response = await api('/api/conversations');
  state.conversations = response.conversations;
  if (state.activeConversation) {
    const next = state.conversations.find((item) => item.id === state.activeConversation.id);
    if (next) {
      state.activeConversation = next;
      await loadMessages(next.id);
    } else {
      state.activeConversation = null;
      state.messages = [];
    }
  }
  render();
}

async function selectConversation(conversationId) {
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) {
    return;
  }
  state.activeConversation = conversation;
  await loadMessages(conversation.id);
  render();
}

async function loadMessages(conversationId) {
  const response = await api(`/api/conversations/${conversationId}/messages`);
  state.messages = response.messages;
  const lastMessage = state.messages.at(-1);
  if (lastMessage) {
    await api(`/api/conversations/${conversationId}/read`, {
      method: 'POST',
      body: { messageId: lastMessage.id },
    });
  }
}

async function refreshActiveConversation() {
  if (!state.activeConversation) {
    return;
  }
  await hydrateConversations();
  await loadMessages(state.activeConversation.id);
  render();
}

function connectSocket() {
  disconnectSocket();
  connectionStatus.textContent = '连接中...';
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(
    `${protocol}//${location.host}/ws?token=${encodeURIComponent(state.session.sessionToken)}`,
  );
  state.socket = socket;

  socket.addEventListener('open', () => {
    connectionStatus.textContent = '实时连接已开启';
  });

  socket.addEventListener('close', () => {
    connectionStatus.textContent = '连接已断开';
    window.setTimeout(() => {
      if (state.session?.sessionToken) {
        connectSocket();
      }
    }, 2000);
  });

  socket.addEventListener('message', async (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === 'message.created' || payload.type === 'read.updated') {
      await hydrateConversations();
      if (state.activeConversation?.id === payload.payload.conversationId) {
        await loadMessages(state.activeConversation.id);
      }
      render();
    }
  });
}

function disconnectSocket() {
  if (state.socket) {
    state.socket.close();
    state.socket = null;
  }
}

function render() {
  const authenticated = Boolean(state.session?.sessionToken);
  userPanel.classList.toggle('hidden', !authenticated);
  contactsPanel.classList.toggle('hidden', !authenticated);
  adminPanel.classList.toggle('hidden', !authenticated || !state.session.user.isAdmin);
  createGroupBtn.classList.toggle('hidden', !authenticated);

  if (!authenticated) {
    renderAuthPanel('login');
    conversationList.innerHTML = '';
    contactsList.innerHTML = '';
    inviteList.innerHTML = '';
    chatPanel.classList.add('hidden');
    emptyState.classList.remove('hidden');
    connectionStatus.textContent = '未连接';
    return;
  }

  userSummary.innerHTML = `
    <div>
      <strong>${escapeHtml(state.session.user.nickname)}</strong>
      <div class="meta">@${escapeHtml(state.session.user.account)}</div>
    </div>
    <span class="meta">${state.session.user.isAdmin ? '管理员' : '成员'}</span>
  `;

  renderContacts();
  renderInvites();
  renderConversations();
  renderMessages();
}

function renderAuthPanel(mode) {
  authPanel.innerHTML = `
    <div class="auth-tabs">
      <button class="auth-tab ghost-btn ${mode === 'login' ? 'active' : ''}" data-mode="login">登录</button>
      <button class="auth-tab ghost-btn ${mode === 'register' ? 'active' : ''}" data-mode="register">邀请码注册</button>
    </div>
    ${
      mode === 'login'
        ? `
          <form id="login-form" class="stack">
            <input name="account" type="text" placeholder="账号" required />
            <input name="password" type="password" placeholder="密码" required />
            <button class="primary-btn" type="submit">登录</button>
          </form>
        `
        : `
          <form id="register-form" class="stack">
            <input name="inviteCode" type="text" placeholder="邀请码" value="OPEN-CIRCLE-2026" required />
            <input name="nickname" type="text" placeholder="昵称" required />
            <input name="password" type="password" placeholder="密码（至少 8 位）" required />
            <button class="primary-btn" type="submit">注册并进入</button>
          </form>
        `
    }
    <p class="meta">开发管理员账号：captain / chatcircle123</p>
  `;

  authPanel.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => renderAuthPanel(button.dataset.mode));
  });

  authPanel.querySelector('#login-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const session = await api('/api/auth/login', {
        method: 'POST',
        skipAuth: true,
        body: {
          account: form.get('account'),
          password: form.get('password'),
        },
      });
      state.session = session;
      saveSession(session);
      await hydrateApp();
      showToast('登录成功');
    } catch (error) {
      handleError(error);
    }
  });

  authPanel.querySelector('#register-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const session = await api('/api/auth/register-with-invite', {
        method: 'POST',
        skipAuth: true,
        body: {
          inviteCode: form.get('inviteCode'),
          nickname: form.get('nickname'),
          password: form.get('password'),
        },
      });
      state.session = session;
      saveSession(session);
      await hydrateApp();
      showToast('注册成功');
    } catch (error) {
      handleError(error);
    }
  });
}

function renderContacts() {
  contactsList.innerHTML = '';
  for (const contact of state.contacts) {
    const element = document.createElement('div');
    element.className = 'contact-item';
    element.innerHTML = `
      <div><strong>${escapeHtml(contact.nickname)}</strong></div>
      <div class="meta">@${escapeHtml(contact.account)}</div>
    `;
    element.addEventListener('click', async () => {
      try {
        const response = await api('/api/conversations/direct', {
          method: 'POST',
          body: { peerUserId: contact.id },
        });
        await hydrateConversations();
        await selectConversation(response.conversation.id);
      } catch (error) {
        handleError(error);
      }
    });
    contactsList.appendChild(element);
  }
}

function renderInvites() {
  inviteList.innerHTML = '';
  for (const invite of state.invites) {
    const element = document.createElement('div');
    element.className = 'invite-item';
    element.innerHTML = `
      <div><strong>${escapeHtml(invite.code)}</strong></div>
      <div class="meta">${invite.usedCount}/${invite.maxUses} · ${invite.status}</div>
    `;
    inviteList.appendChild(element);
  }
}

function renderConversations() {
  conversationList.innerHTML = '';
  if (state.conversations.length === 0) {
    conversationList.innerHTML = '<div class="card">还没有会话</div>';
    return;
  }

  for (const conversation of state.conversations) {
    const element = document.createElement('div');
    element.className = `card ${state.activeConversation?.id === conversation.id ? 'active' : ''}`;
    element.innerHTML = `
      <div class="panel-header">
        <strong>${escapeHtml(conversation.name || '未命名会话')}</strong>
        ${conversation.unreadCount ? `<span class="badge">${conversation.unreadCount}</span>` : ''}
      </div>
      <div class="meta">${escapeHtml(conversation.latestMessage?.text || conversation.latestMessage?.imageName || '还没有消息')}</div>
    `;
    element.addEventListener('click', () => selectConversation(conversation.id).catch(handleError));
    conversationList.appendChild(element);
  }
}

function renderMessages() {
  if (!state.activeConversation) {
    chatPanel.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  chatPanel.classList.remove('hidden');
  emptyState.classList.add('hidden');
  chatTitle.textContent = state.activeConversation.name || '未命名会话';
  chatMeta.textContent = `${state.activeConversation.type === 'group' ? '群聊' : '私聊'} · ${state.activeConversation.members.length} 人`;
  messageList.innerHTML = '';

  for (const message of state.messages) {
    const mine = message.senderId === state.session.user.id;
    const row = document.createElement('div');
    row.className = `message-row ${mine ? 'mine' : ''}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    if (message.type === 'image') {
      bubble.innerHTML = `
        <img src="${escapeAttribute(message.imageUrl)}" alt="${escapeAttribute(message.imageName || 'image')}" />
        <div>${escapeHtml(message.imageName || '图片')}</div>
        <div class="message-meta">${formatDateTime(message.createdAt)}</div>
      `;
    } else {
      bubble.innerHTML = `
        <div>${escapeHtml(message.text)}</div>
        <div class="message-meta">${formatDateTime(message.createdAt)}</div>
      `;
    }

    row.appendChild(bubble);
    messageList.appendChild(row);
  }

  messageList.scrollTop = messageList.scrollHeight;
}

function renderGroupMembers() {
  groupMemberList.innerHTML = '';
  for (const contact of state.contacts) {
    const row = document.createElement('label');
    row.className = 'checkbox-row';
    row.innerHTML = `
      <input type="checkbox" value="${escapeAttribute(contact.id)}" />
      <span>${escapeHtml(contact.nickname)} <span class="meta">@${escapeHtml(contact.account)}</span></span>
    `;
    groupMemberList.appendChild(row);
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.skipAuth || !state.session?.sessionToken
        ? {}
        : { Authorization: `Bearer ${state.session.sessionToken}` }),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return readJson(response);
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || '请求失败');
  }
  return data;
}

function saveSession(session) {
  if (session) {
    localStorage.setItem('open-chat-circle-session', JSON.stringify(session));
  } else {
    localStorage.removeItem('open-chat-circle-session');
  }
}

function loadSession() {
  const raw = localStorage.getItem('open-chat-circle-session');
  return raw ? JSON.parse(raw) : null;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.add('hidden');
  }, 2500);
}

function handleError(error) {
  console.error(error);
  showToast(error.message || String(error));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function formatDateTime(value) {
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function connectSocket() {
  disconnectSocket();
  connectionStatus.textContent = '正在连接...';
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(
    `${protocol}//${location.host}/ws?token=${encodeURIComponent(state.session.sessionToken)}`,
  );
  state.socket = socket;

  socket.addEventListener('open', () => {
    stopPollingFallback();
    connectionStatus.textContent = '实时连接已开启';
  });

  socket.addEventListener('close', () => {
    connectionStatus.textContent = '连接不稳定，已切换自动刷新';
    startPollingFallback();
    window.setTimeout(() => {
      if (state.session?.sessionToken) {
        connectSocket();
      }
    }, 2000);
  });

  socket.addEventListener('message', async (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === 'message.created' || payload.type === 'read.updated') {
      await hydrateConversations();
      if (state.activeConversation?.id === payload.payload.conversationId) {
        await loadMessages(state.activeConversation.id);
      }
      render();
    }
  });
}

function disconnectSocket() {
  if (state.socket) {
    state.socket.close();
    state.socket = null;
  }
  stopPollingFallback();
}
