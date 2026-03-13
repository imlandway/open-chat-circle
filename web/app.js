const state = {
  session: loadSession(),
  contacts: [],
  invites: [],
  conversations: [],
  messages: [],
  activeConversation: null,
  socket: null,
  pollingTimer: null,
  avatarCrop: createEmptyAvatarCropState(),
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
const chatAvatar = document.querySelector('#chat-avatar');
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
const closeGroupBtn = document.querySelector('#close-group-btn');
const avatarDialog = document.querySelector('#avatar-dialog');
const avatarCropCanvas = document.querySelector('#avatar-crop-canvas');
const avatarZoomInput = document.querySelector('#avatar-zoom-input');
const avatarOffsetXInput = document.querySelector('#avatar-offset-x-input');
const avatarOffsetYInput = document.querySelector('#avatar-offset-y-input');
const closeAvatarBtn = document.querySelector('#close-avatar-btn');
const saveAvatarBtn = document.querySelector('#save-avatar-btn');

boot();

function boot() {
  wireStaticEvents();

  if (state.session?.sessionToken) {
    hydrateApp().catch((error) => {
      resetToLoggedOut();
      handleError(error);
    });
    return;
  }

  render();
}

function createEmptyAvatarCropState() {
  return {
    fileName: '',
    objectUrl: '',
    image: null,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  };
}

function wireStaticEvents() {
  logoutBtn.addEventListener('click', () => {
    resetToLoggedOut();
  });

  refreshContactsBtn.addEventListener('click', () => {
    hydrateSideData().catch(handleError);
  });

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

  closeGroupBtn.addEventListener('click', () => {
    groupDialog.close();
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

    const submittedAt = Date.now();
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
      await refreshActiveConversation();
      if (didMessagePersist({ type: 'text', text, submittedAt })) {
        showToast('消息已发送，界面已自动刷新');
        return;
      }
      messageInput.value = text;
      handleError(error);
    }
  });

  imageInput.addEventListener('change', async () => {
    const file = imageInput.files?.[0];
    if (!file || !state.activeConversation) {
      return;
    }

    try {
      const upload = await uploadImage(file);
      await api(`/api/conversations/${state.activeConversation.id}/messages`, {
        method: 'POST',
        body: {
          type: 'image',
          imageUrl: upload.url,
          imageName: upload.name,
        },
      });
      await refreshActiveConversation();
    } catch (error) {
      await refreshActiveConversation();
      if (didMessagePersist({ type: 'image', imageName: file.name, submittedAt: Date.now() - 1000 })) {
        showToast('图片已发送，界面已自动刷新');
      } else {
        handleError(error);
      }
    } finally {
      imageInput.value = '';
    }
  });

  avatarZoomInput.addEventListener('input', () => {
    state.avatarCrop.zoom = Number(avatarZoomInput.value);
    renderAvatarCropPreview();
  });

  avatarOffsetXInput.addEventListener('input', () => {
    state.avatarCrop.offsetX = Number(avatarOffsetXInput.value);
    renderAvatarCropPreview();
  });

  avatarOffsetYInput.addEventListener('input', () => {
    state.avatarCrop.offsetY = Number(avatarOffsetYInput.value);
    renderAvatarCropPreview();
  });

  closeAvatarBtn.addEventListener('click', closeAvatarCropper);
  avatarDialog.addEventListener('close', resetAvatarCropper);

  saveAvatarBtn.addEventListener('click', async () => {
    try {
      const file = await exportAvatarCrop();
      const upload = await uploadImage(file);
      const response = await api('/api/users/me', {
        method: 'PATCH',
        body: {
          nickname: state.session.user.nickname,
          avatarUrl: upload.url,
        },
      });
      state.session.user = response.user;
      saveSession(state.session);
      closeAvatarCropper();
      await Promise.all([hydrateSideData(), hydrateConversations()]);
      render();
      showToast('头像已更新');
    } catch (error) {
      handleError(error);
    }
  });
}

function resetToLoggedOut() {
  disconnectSocket();
  closeAvatarCropper();
  state.session = null;
  state.contacts = [];
  state.invites = [];
  state.conversations = [];
  state.messages = [];
  state.activeConversation = null;
  saveSession(null);
  render();
}

function saveRememberedCredentials(account, password, remember) {
  if (!remember) {
    localStorage.removeItem('open-chat-circle-remembered');
    return;
  }

  localStorage.setItem('open-chat-circle-remembered', JSON.stringify({
    account,
    password,
  }));
}

function loadRememberedCredentials() {
  const raw = localStorage.getItem('open-chat-circle-remembered');
  return raw ? JSON.parse(raw) : null;
}

async function hydrateApp() {
  await ensureSession();
  await Promise.all([hydrateSideData(), hydrateConversations()]);
  connectSocket();
  render();
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
      await loadMessages(next.id, { markAsRead: false });
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
  await loadMessages(conversation.id, { markAsRead: true });
  render();
}

async function loadMessages(conversationId, options = { markAsRead: true }) {
  const response = await api(`/api/conversations/${conversationId}/messages`);
  state.messages = response.messages;

  if (!options.markAsRead) {
    return;
  }

  const lastMessage = state.messages.at(-1);
  if (!lastMessage) {
    return;
  }

  try {
    await api(`/api/conversations/${conversationId}/read`, {
      method: 'POST',
      body: { messageId: lastMessage.id },
    });
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (conversation) {
      conversation.unreadCount = 0;
    }
    if (state.activeConversation?.id === conversationId) {
      state.activeConversation.unreadCount = 0;
    }
  } catch (error) {
    console.error('Failed to mark conversation as read.', error);
  }
}

async function refreshActiveConversation() {
  if (!state.activeConversation) {
    return;
  }

  await hydrateConversations();
  await loadMessages(state.activeConversation.id, { markAsRead: false });
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
        await loadMessages(state.activeConversation.id, { markAsRead: false });
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

function connectSocket() {
  disconnectSocket();
  if (!state.session?.sessionToken) {
    connectionStatus.textContent = '未连接';
    return;
  }

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
        await loadMessages(state.activeConversation.id, { markAsRead: false });
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

function render() {
  const authenticated = Boolean(state.session?.sessionToken && state.session?.user);
  authPanel.classList.toggle('hidden', authenticated);
  userPanel.classList.toggle('hidden', !authenticated);
  contactsPanel.classList.toggle('hidden', !authenticated);
  adminPanel.classList.toggle('hidden', !authenticated || !state.session?.user?.isAdmin);
  createGroupBtn.classList.toggle('hidden', !authenticated);

  if (!authenticated) {
    renderAuthPanel('login');
    conversationList.innerHTML = '';
    contactsList.innerHTML = '';
    inviteList.innerHTML = '';
    userSummary.innerHTML = '';
    chatAvatar.innerHTML = '';
    chatPanel.classList.add('hidden');
    emptyState.classList.remove('hidden');
    connectionStatus.textContent = '未连接';
    return;
  }

  renderUserSummary();
  renderContacts();
  renderInvites();
  renderConversations();
  renderMessages();
}

function renderAuthPanel(mode) {
  const rememberedCredentials = loadRememberedCredentials();
  authPanel.innerHTML = `
    <div class="auth-tabs">
      <button class="auth-tab ghost-btn ${mode === 'login' ? 'active' : ''}" data-mode="login" type="button">登录</button>
      <button class="auth-tab ghost-btn ${mode === 'register' ? 'active' : ''}" data-mode="register" type="button">邀请码注册</button>
    </div>
    ${
      mode === 'login'
        ? `
          <form id="login-form" class="stack">
            <input name="account" type="text" placeholder="账号" value="${escapeAttribute(rememberedCredentials?.account || '')}" required />
            <input name="password" type="password" placeholder="密码" value="${escapeAttribute(rememberedCredentials?.password || '')}" required />
            <label class="checkbox-row">
              <input name="rememberPassword" type="checkbox" ${rememberedCredentials ? 'checked' : ''} />
              <span>记住密码</span>
            </label>
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
    <p class="meta">管理员默认账号：captain / chatcircle123</p>
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
      saveRememberedCredentials(
        form.get('account'),
        form.get('password'),
        form.get('rememberPassword') === 'on',
      );
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

function renderUserSummary() {
  const user = state.session.user;
  userSummary.innerHTML = `
    <div class="user-card">
      <div class="user-card-main">
        ${renderAvatar(user, 'large')}
        <div class="user-text">
          <div class="user-title">${escapeHtml(user.nickname)}</div>
          <div class="meta">@${escapeHtml(user.account)}</div>
        </div>
      </div>
      <div class="stack">
        <label class="ghost-btn" for="user-avatar-input">更换头像</label>
        <input id="user-avatar-input" type="file" accept="image/*" hidden />
        <span class="meta">${user.isAdmin ? '管理员' : '成员'}</span>
      </div>
    </div>
  `;

  userSummary.querySelector('#user-avatar-input')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    try {
      await openAvatarCropper(file);
    } catch (error) {
      handleError(error);
    }
  });
}

function renderContacts() {
  contactsList.innerHTML = '';

  if (state.contacts.length === 0) {
    contactsList.innerHTML = '<div class="card">还没有联系人</div>';
    return;
  }

  for (const contact of state.contacts) {
    const element = document.createElement('div');
    element.className = 'contact-item';
    element.innerHTML = `
      <div class="contact-main">
        ${renderAvatar(contact)}
        <div class="contact-text">
          <div class="contact-title">${escapeHtml(contact.nickname)}</div>
          <div class="meta">@${escapeHtml(contact.account)}</div>
        </div>
      </div>
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

  if (state.invites.length === 0) {
    inviteList.innerHTML = '<div class="card">还没有邀请码</div>';
    return;
  }

  for (const invite of state.invites) {
    const element = document.createElement('div');
    element.className = 'invite-item';
    element.innerHTML = `
      <div>
        <strong>${escapeHtml(invite.code)}</strong>
        <div class="meta">${invite.usedCount}/${invite.maxUses} 次 · ${escapeHtml(invite.status)}</div>
      </div>
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
    element.className = `conversation-item ${state.activeConversation?.id === conversation.id ? 'active' : ''}`;
    element.innerHTML = `
      <div class="conversation-main">
        ${renderAvatar({
          nickname: conversation.name,
          avatarUrl: conversation.avatarUrl,
        })}
        <div class="conversation-text">
          <div class="conversation-title">${escapeHtml(conversation.name || '未命名会话')}</div>
          <div class="conversation-preview">${escapeHtml(getConversationPreview(conversation))}</div>
        </div>
      </div>
      <div class="conversation-side">
        <span class="meta">${formatConversationTime(conversation.updatedAt)}</span>
        ${
          conversation.unreadCount
            ? `<span class="badge">${conversation.unreadCount}</span>`
            : '<span class="status-pill">已读</span>'
        }
      </div>
    `;
    element.addEventListener('click', () => {
      selectConversation(conversation.id).catch(handleError);
    });
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
  chatAvatar.innerHTML = renderAvatar({
    nickname: state.activeConversation.name,
    avatarUrl: state.activeConversation.avatarUrl,
  }, 'large');
  chatTitle.textContent = state.activeConversation.name || '未命名会话';
  chatMeta.textContent = getConversationMeta(state.activeConversation);
  messageList.innerHTML = '';

  for (const message of state.messages) {
    const mine = message.senderId === state.session.user.id;
    const sender = message.sender ?? state.activeConversation.members.find((member) => member.id === message.senderId);
    const row = document.createElement('div');
    row.className = `message-row ${mine ? 'mine' : ''}`;

    if (!mine) {
      row.insertAdjacentHTML('beforeend', renderAvatar(sender ?? { nickname: '?' }, 'small'));
    }

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    if (message.type === 'image') {
      bubble.innerHTML = `
        <img src="${escapeAttribute(message.imageUrl)}" alt="${escapeAttribute(message.imageName || '图片')}" />
        <div class="message-content">${escapeHtml(message.imageName || '图片')}</div>
        <div class="message-meta">
          <span>${formatDateTime(message.createdAt)}</span>
          ${mine ? `<span class="message-receipt">${escapeHtml(getReceiptText(message, state.activeConversation.type))}</span>` : ''}
        </div>
      `;
    } else {
      bubble.innerHTML = `
        <div class="message-content">${escapeHtml(message.text)}</div>
        <div class="message-meta">
          <span>${formatDateTime(message.createdAt)}</span>
          ${mine ? `<span class="message-receipt">${escapeHtml(getReceiptText(message, state.activeConversation.type))}</span>` : ''}
        </div>
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
      ${renderAvatar(contact, 'xs')}
      <span>${escapeHtml(contact.nickname)} <span class="meta">@${escapeHtml(contact.account)}</span></span>
    `;
    groupMemberList.appendChild(row);
  }
}

async function openAvatarCropper(file) {
  const objectUrl = URL.createObjectURL(file);
  const image = await loadImage(objectUrl);
  state.avatarCrop = {
    fileName: file.name || 'avatar.png',
    objectUrl,
    image,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  };
  avatarZoomInput.value = '1';
  avatarOffsetXInput.value = '0';
  avatarOffsetYInput.value = '0';
  avatarDialog.showModal();
  renderAvatarCropPreview();
}

function closeAvatarCropper() {
  if (avatarDialog.open) {
    avatarDialog.close();
  } else {
    resetAvatarCropper();
  }
}

function resetAvatarCropper() {
  if (state.avatarCrop.objectUrl) {
    URL.revokeObjectURL(state.avatarCrop.objectUrl);
  }
  state.avatarCrop = createEmptyAvatarCropState();
  const ctx = avatarCropCanvas.getContext('2d');
  ctx.clearRect(0, 0, avatarCropCanvas.width, avatarCropCanvas.height);
}

function renderAvatarCropPreview() {
  const { image, zoom, offsetX, offsetY } = state.avatarCrop;
  const ctx = avatarCropCanvas.getContext('2d');
  const cropSize = avatarCropCanvas.width;
  ctx.clearRect(0, 0, cropSize, cropSize);
  ctx.fillStyle = '#f5fbf9';
  ctx.fillRect(0, 0, cropSize, cropSize);

  if (!image) {
    return;
  }

  const transform = calculateAvatarTransform({
    imageWidth: image.width,
    imageHeight: image.height,
    cropSize,
    zoom,
    offsetXPercent: offsetX,
    offsetYPercent: offsetY,
  });

  ctx.drawImage(
    image,
    transform.drawX,
    transform.drawY,
    transform.drawWidth,
    transform.drawHeight,
  );

  ctx.strokeStyle = 'rgba(15, 118, 110, 0.9)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, cropSize - 4, cropSize - 4);
}

function calculateAvatarTransform({ imageWidth, imageHeight, cropSize, zoom, offsetXPercent, offsetYPercent }) {
  const baseScale = Math.max(cropSize / imageWidth, cropSize / imageHeight);
  const scale = baseScale * zoom;
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const maxOffsetX = Math.max(0, (drawWidth - cropSize) / 2);
  const maxOffsetY = Math.max(0, (drawHeight - cropSize) / 2);
  const actualOffsetX = (offsetXPercent / 100) * maxOffsetX;
  const actualOffsetY = (offsetYPercent / 100) * maxOffsetY;

  return {
    drawWidth,
    drawHeight,
    drawX: (cropSize - drawWidth) / 2 + actualOffsetX,
    drawY: (cropSize - drawHeight) / 2 + actualOffsetY,
  };
}

async function exportAvatarCrop() {
  const { image, fileName, zoom, offsetX, offsetY } = state.avatarCrop;
  if (!image) {
    throw new Error('请先选择头像图片');
  }

  const outputSize = 512;
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  const transform = calculateAvatarTransform({
    imageWidth: image.width,
    imageHeight: image.height,
    cropSize: outputSize,
    zoom,
    offsetXPercent: offsetX,
    offsetYPercent: offsetY,
  });

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outputSize, outputSize);
  ctx.drawImage(image, transform.drawX, transform.drawY, transform.drawWidth, transform.drawHeight);

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/png', 0.92);
  });

  if (!blob) {
    throw new Error('头像裁剪失败，请重试');
  }

  return new File([blob], normalizeAvatarFileName(fileName), { type: 'image/png' });
}

function normalizeAvatarFileName(fileName) {
  const base = String(fileName || 'avatar').replace(/\.[^.]+$/, '');
  return `${base || 'avatar'}-avatar.png`;
}

function loadImage(objectUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败，请换一张图片试试'));
    image.src = objectUrl;
  });
}

async function uploadImage(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/uploads/images', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${state.session.sessionToken}`,
    },
    body: formData,
  });

  return readJson(response);
}

function didMessagePersist({ type, text = '', imageName = '', submittedAt = 0 }) {
  const latestMessage = state.messages.at(-1);
  if (!latestMessage || latestMessage.senderId !== state.session.user.id) {
    return false;
  }

  const createdAt = new Date(latestMessage.createdAt).getTime();
  if (createdAt < submittedAt - 15000) {
    return false;
  }

  if (type === 'text') {
    return latestMessage.type === 'text' && latestMessage.text === text;
  }

  if (type === 'image') {
    return latestMessage.type === 'image' && latestMessage.imageName === imageName;
  }

  return false;
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

function getConversationPreview(conversation) {
  if (!conversation.latestMessage) {
    return '还没有消息';
  }

  if (conversation.latestMessage.type === 'image') {
    return `[图片] ${conversation.latestMessage.imageName || '图片'}`;
  }

  return conversation.latestMessage.text || '还没有消息';
}

function getConversationMeta(conversation) {
  if (conversation.type === 'direct') {
    const peer = conversation.members.find((member) => member.id !== state.session.user.id);
    return peer ? `私聊 · @${peer.account}` : '私聊';
  }

  return `群聊 · ${conversation.members.length} 人`;
}

function getReceiptText(message, conversationType) {
  const count = Number(message.readByCount || 0);
  if (conversationType === 'group') {
    return count > 0 ? `${count} 人已读` : '未读';
  }
  return count > 0 ? '已读' : '未读';
}

function formatConversationTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function renderAvatar(entity, sizeClass = '') {
  const label = getAvatarLabel(entity?.nickname || entity?.account || '?');
  const classes = ['avatar', sizeClass].filter(Boolean).join(' ');
  if (entity?.avatarUrl) {
    return `<div class="${classes}"><img src="${escapeAttribute(entity.avatarUrl)}" alt="${escapeAttribute(entity.nickname || 'avatar')}" /></div>`;
  }
  return `<div class="${classes}"><span>${escapeHtml(label)}</span></div>`;
}

function getAvatarLabel(value) {
  const text = String(value || '?').trim();
  return text.slice(0, 1).toUpperCase();
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
