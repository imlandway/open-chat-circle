const state = {
  session: loadSession(),
  authMode: 'login',
  navSection: 'conversations',
  mineSection: null,
  contacts: [],
  invites: [],
  adminUsers: [],
  conversations: [],
  messages: [],
  activeConversation: null,
  realtimeSource: null,
  pollingTimer: null,
  chatListHeight: loadChatListHeight(),
  avatarCrop: createEmptyAvatarCropState(),
};

const authPanel = document.querySelector('#auth-panel');
const navRail = document.querySelector('#nav-rail');
const navMineBtn = document.querySelector('#nav-mine-btn');
const navAdminBtn = document.querySelector('#nav-admin-btn');
const navSectionButtons = [...document.querySelectorAll('[data-nav-section]')];
const topbarTitle = document.querySelector('#topbar-title');
const userPanel = document.querySelector('#user-panel');
const contactsPanel = document.querySelector('#contacts-panel');
const conversationsPanel = document.querySelector('#conversations-panel');
const adminPanel = document.querySelector('#admin-panel');
const conversationList = document.querySelector('#conversation-list');
const messageList = document.querySelector('#message-list');
const emptyState = document.querySelector('#empty-state');
const chatPanel = document.querySelector('#chat-panel');
const chatResizer = document.querySelector('#chat-resizer');
const chatTitle = document.querySelector('#chat-title');
const chatMeta = document.querySelector('#chat-meta');
const chatAvatar = document.querySelector('#chat-avatar');
const userSummary = document.querySelector('#user-summary');
const contactsList = document.querySelector('#contacts-list');
const inviteList = document.querySelector('#invite-list');
const adminUserList = document.querySelector('#admin-user-list');
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
const avatarCropStage = document.querySelector('#avatar-crop-stage');
const avatarCropImage = document.querySelector('#avatar-crop-image');
const closeAvatarBtn = document.querySelector('#close-avatar-btn');
const saveAvatarBtn = document.querySelector('#save-avatar-btn');

boot();

function boot() {
  wireStaticEvents();
  render();

  if (!state.session?.sessionToken) {
    return;
  }

  hydrateApp().catch((error) => {
    resetToLoggedOut();
    handleError(error);
  });
}

function setConnectionStatus(message, tone = 'offline') {
  connectionStatus.textContent = message;
  connectionStatus.classList.remove('connected', 'unstable');

  if (tone === 'connected') {
    connectionStatus.classList.add('connected');
    return;
  }

  if (tone === 'unstable') {
    connectionStatus.classList.add('unstable');
  }
}

function wireStaticEvents() {
  navMineBtn.addEventListener('click', () => {
    state.navSection = 'mine';
    render();
  });

  navSectionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.navSection = button.dataset.navSection;
      render();
    });
  });

  logoutBtn.addEventListener('click', () => {
    resetToLoggedOut();
  });

  refreshContactsBtn.addEventListener('click', () => {
    hydrateSideData().catch(handleError);
  });

  createInviteBtn.addEventListener('click', async () => {
    try {
      const response = await api('/api/invites', {
        method: 'POST',
        body: {
          uses: 5,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      showToast(`已生成邀请码 ${response.invite.code}`);
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
    const memberIds = [...groupMemberList.querySelectorAll('input[type="checkbox"]:checked')].map(
      (checkbox) => checkbox.value,
    );

    try {
      const response = await api('/api/conversations/group', {
        method: 'POST',
        body: {
          name: groupNameInput.value.trim(),
          memberIds,
        },
      });
      groupForm.reset();
      groupDialog.close();
      await hydrateConversations();
      await selectConversation(response.conversation.id);
    } catch (error) {
      handleError(error);
    }
  });

  messageForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitTextMessage();
  });

  imageInput.addEventListener('change', async () => {
    await submitImageMessage();
  });

  chatResizer.addEventListener('pointerdown', startChatResize);

  closeAvatarBtn.addEventListener('click', closeAvatarCropper);
  avatarDialog.addEventListener('close', resetAvatarCropper);
  avatarDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeAvatarCropper();
  });

  saveAvatarBtn.addEventListener('click', async () => {
    try {
      const file = await exportAvatarCrop();
      const upload = await uploadImage(file);
      const response = await api('/api/users/me', {
        method: 'PATCH',
        body: {
          nickname: state.session.user.nickname,
          account: state.session.user.account,
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

  avatarCropStage.addEventListener('pointerdown', onAvatarPointerDown);
  avatarCropStage.addEventListener('pointermove', onAvatarPointerMove);
  avatarCropStage.addEventListener('pointerup', onAvatarPointerEnd);
  avatarCropStage.addEventListener('pointercancel', onAvatarPointerEnd);
  avatarCropStage.addEventListener('wheel', onAvatarWheel, { passive: false });

  window.addEventListener('resize', () => {
    if (avatarDialog.open && state.avatarCrop.image) {
      initializeAvatarCrop();
    }
    applyChatHeight();
  });

  window.addEventListener('beforeunload', () => {
    disconnectRealtime();
  });
}

function createEmptyAvatarCropState() {
  return {
    fileName: '',
    objectUrl: '',
    image: null,
    baseScale: 1,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    pointers: new Map(),
    gesture: null,
  };
}

function loadSession() {
  const raw = localStorage.getItem('open-chat-circle-session');
  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(raw);
    if (session?.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
      localStorage.removeItem('open-chat-circle-session');
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem('open-chat-circle-session');
    return null;
  }
}

function saveSession(session) {
  if (!session) {
    localStorage.removeItem('open-chat-circle-session');
    return;
  }
  const expiresAt = session.expiresAt
    ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  localStorage.setItem('open-chat-circle-session', JSON.stringify({
    ...session,
    expiresAt,
  }));
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
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem('open-chat-circle-remembered');
    return null;
  }
}

function syncRememberedAccount(account) {
  const remembered = loadRememberedCredentials();
  if (!remembered) {
    return;
  }

  saveRememberedCredentials(account, remembered.password, true);
}

function syncRememberedPassword(password) {
  const remembered = loadRememberedCredentials();
  if (!remembered) {
    return;
  }

  saveRememberedCredentials(state.session.user.account, password, true);
}

function loadChatListHeight() {
  const raw = localStorage.getItem('open-chat-circle-chat-height');
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 420;
}

function saveChatListHeight(height) {
  localStorage.setItem('open-chat-circle-chat-height', String(height));
}

function applyChatHeight() {
  if (chatPanel.classList.contains('hidden')) {
    return;
  }

  const panelHeight = chatPanel.getBoundingClientRect().height;
  const headerHeight = chatPanel.querySelector('.chat-header')?.offsetHeight || 0;
  const composerHeight = messageForm.offsetHeight || 0;
  const resizerHeight = chatResizer.offsetHeight || 16;
  const maxHeight = Math.max(220, panelHeight - headerHeight - composerHeight - resizerHeight - 24);
  const nextHeight = clamp(state.chatListHeight, 220, maxHeight);

  state.chatListHeight = nextHeight;
  messageList.style.height = `${nextHeight}px`;
  saveChatListHeight(nextHeight);
}

function startChatResize(event) {
  event.preventDefault();

  const startY = event.clientY;
  const startHeight = messageList.getBoundingClientRect().height;

  function onPointerMove(moveEvent) {
    state.chatListHeight = startHeight + (moveEvent.clientY - startY);
    applyChatHeight();
  }

  function onPointerUp() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}

async function hydrateApp() {
  await ensureSession();
  await Promise.all([hydrateSideData(), hydrateConversations()]);
  connectRealtime();
  render();
}

async function ensureSession() {
  const response = await api('/api/auth/me');
  state.session.user = response.user;
  saveSession(state.session);
}

async function hydrateSideData() {
  const contactsResponse = await api('/api/contacts');
  state.contacts = contactsResponse.contacts;

  if (state.session.user.isAdmin) {
    const [invitesResponse, usersResponse] = await Promise.all([
      api('/api/invites'),
      api('/api/admin/users'),
    ]);
    state.invites = invitesResponse.invites;
    state.adminUsers = usersResponse.users;
  } else {
    state.invites = [];
    state.adminUsers = [];
  }

  render();
}

async function hydrateConversations() {
  const response = await api('/api/conversations');
  state.conversations = response.conversations;

  if (state.activeConversation) {
    state.activeConversation = state.conversations.find((item) => item.id === state.activeConversation.id) ?? null;
    if (!state.activeConversation) {
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

  state.navSection = 'conversations';
  state.activeConversation = conversation;
  render();
  await loadMessages(conversation.id, { markAsRead: true });
  render();
}

async function loadMessages(conversationId, { markAsRead = true } = {}) {
  const response = await api(`/api/conversations/${conversationId}/messages`);
  state.messages = response.messages;

  const lastMessage = state.messages.at(-1);
  if (!markAsRead || !lastMessage || lastMessage.senderId === state.session.user.id) {
    return;
  }

  try {
    await api(`/api/conversations/${conversationId}/read`, {
      method: 'POST',
      body: {
        messageId: lastMessage.id,
      },
    });
    setConversationUnreadCount(conversationId, 0);
  } catch (error) {
    console.error('Failed to mark conversation as read.', error);
  }
}

async function refreshActiveConversation(markAsRead = false) {
  if (!state.activeConversation) {
    return;
  }

  await hydrateConversations();
  if (!state.activeConversation) {
    return;
  }
  await loadMessages(state.activeConversation.id, { markAsRead });
  render();
}

function connectRealtime() {
  disconnectRealtime();

  if (!state.session?.sessionToken) {
    setConnectionStatus('未连接', 'offline');
    return;
  }

  if (!('EventSource' in window)) {
    setConnectionStatus('浏览器不支持实时连接，已启用自动刷新', 'unstable');
    startPollingFallback();
    return;
  }

  setConnectionStatus('正在连接实时同步...', 'unstable');
  const source = new EventSource(`/api/events?token=${encodeURIComponent(state.session.sessionToken)}`);
  state.realtimeSource = source;

  source.addEventListener('ready', () => {
    setConnectionStatus('实时同步已连接', 'connected');
    stopPollingFallback();
  });

  source.onopen = () => {
    setConnectionStatus('实时同步已连接', 'connected');
    stopPollingFallback();
  };

  source.onerror = () => {
    setConnectionStatus('连接波动，已启用自动刷新', 'unstable');
    startPollingFallback();
  };

  source.onmessage = (event) => {
    if (!event.data) {
      return;
    }

    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch (error) {
      console.error('Failed to parse realtime payload.', error);
      return;
    }

    handleRealtimeEvent(payload).catch((error) => {
      console.error('Failed to handle realtime event.', error);
    });
  };
}

function disconnectRealtime() {
  if (state.realtimeSource) {
    state.realtimeSource.close();
    state.realtimeSource = null;
  }
  stopPollingFallback();
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
      console.error('Polling refresh failed.', error);
    }
  }, 2500);
}

function stopPollingFallback() {
  if (!state.pollingTimer) {
    return;
  }

  window.clearInterval(state.pollingTimer);
  state.pollingTimer = null;
}

async function handleRealtimeEvent(event) {
  if (!event?.type) {
    return;
  }

  if (event.type === 'message.created') {
    await hydrateConversations();
    if (state.activeConversation?.id === event.payload.conversationId) {
      await loadMessages(state.activeConversation.id, {
        markAsRead: event.payload.senderId !== state.session.user.id,
      });
    }
    render();
    return;
  }

  if (event.type === 'read.updated') {
    await hydrateConversations();
    if (state.activeConversation?.id === event.payload.conversationId) {
      await loadMessages(state.activeConversation.id, { markAsRead: false });
    }
    render();
  }
}

function render() {
  const authenticated = Boolean(state.session?.sessionToken && state.session?.user);
  if (!authenticated) {
    state.navSection = 'conversations';
  }

  if (authenticated && state.navSection === 'admin' && !state.session.user.isAdmin) {
    state.navSection = 'conversations';
  }

  navRail.classList.toggle('hidden', !authenticated);
  authPanel.classList.toggle('hidden', authenticated);
  userPanel.classList.toggle('hidden', !authenticated || state.navSection !== 'mine');
  contactsPanel.classList.toggle('hidden', !authenticated || state.navSection !== 'contacts');
  conversationsPanel.classList.toggle('hidden', !authenticated || state.navSection !== 'conversations');
  adminPanel.classList.toggle('hidden', !authenticated || !state.session?.user?.isAdmin || state.navSection !== 'admin');
  createGroupBtn.classList.toggle('hidden', !authenticated || state.navSection !== 'conversations');
  logoutBtn.classList.toggle('hidden', !authenticated);

  if (!authenticated) {
    topbarTitle.textContent = '登录';
    renderAuthPanel();
    conversationList.innerHTML = '';
    contactsList.innerHTML = '';
    inviteList.innerHTML = '';
    adminUserList.innerHTML = '';
    userSummary.innerHTML = '';
    chatAvatar.innerHTML = '';
    chatPanel.classList.add('hidden');
    emptyState.classList.remove('hidden');
    setConnectionStatus('未连接', 'offline');
    return;
  }

  renderNavigation();
  renderUserSummary();
  renderContacts();
  renderInvites();
  renderAdminUsers();
  renderConversations();
  renderMessages();
}

function renderNavigation() {
  const user = state.session.user;
  navMineBtn.innerHTML = `
    ${renderAvatar(user)}
    <span class="nav-label">我的</span>
  `;
  navMineBtn.classList.toggle('active', state.navSection === 'mine');
  navAdminBtn.classList.toggle('hidden', !user.isAdmin);
  navAdminBtn.classList.toggle('active', state.navSection === 'admin');

  navSectionButtons.forEach((button) => {
    button.classList.toggle('active', state.navSection === button.dataset.navSection);
  });

  topbarTitle.textContent = getTopbarTitle();
}

function getTopbarTitle() {
  if (!state.session?.user) {
    return '登录';
  }

  if (state.navSection === 'mine') {
    return '我的';
  }

  if (state.navSection === 'contacts') {
    return '联系人';
  }

  if (state.navSection === 'admin') {
    return '全部账号';
  }

  return '会话';
}

function renderAuthPanel() {
  const remembered = loadRememberedCredentials();
  authPanel.innerHTML = `
    <div class="auth-tabs">
      <button class="auth-tab ghost-btn ${state.authMode === 'login' ? 'active' : ''}" type="button" data-auth-mode="login">登录</button>
      <button class="auth-tab ghost-btn ${state.authMode === 'register' ? 'active' : ''}" type="button" data-auth-mode="register">邀请码注册</button>
    </div>
    ${
      state.authMode === 'login'
        ? `
          <form id="login-form" class="auth-form stack">
            <label class="field">
              <span>账号</span>
              <input name="account" type="text" value="${escapeAttribute(remembered?.account || '')}" required />
            </label>
            <label class="field">
              <span>密码</span>
              <input name="password" type="password" value="${escapeAttribute(remembered?.password || '')}" required />
            </label>
            <label class="checkbox-row">
              <input name="rememberPassword" type="checkbox" ${remembered ? 'checked' : ''} />
              <span>记住密码</span>
            </label>
            <button class="primary-btn" type="submit">登录</button>
          </form>
        `
        : `
          <form id="register-form" class="auth-form stack">
            <label class="field">
              <span>邀请码</span>
              <input name="inviteCode" type="text" value="OPEN-CIRCLE-2026" required />
            </label>
            <label class="field">
              <span>昵称</span>
              <input name="nickname" type="text" required />
            </label>
            <label class="field">
              <span>密码</span>
              <input name="password" type="password" minlength="8" required />
            </label>
            <button class="primary-btn" type="submit">注册并进入</button>
          </form>
        `
    }
    <p class="meta hint">管理员默认账号：captain</p>
  `;

  authPanel.querySelectorAll('[data-auth-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.authMode = button.dataset.authMode;
      renderAuthPanel();
    });
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
    <div class="stack">
      <div class="user-card profile-hero">
        <div class="user-card-main">
          ${renderAvatar(user, 'large')}
          <div class="user-text">
            <div class="user-title">${escapeHtml(user.nickname)}</div>
            <div class="meta">@${escapeHtml(user.account)}</div>
            <div class="meta">${user.isAdmin ? '管理员' : '成员'}</div>
          </div>
        </div>
      </div>

      <div class="mine-tabs">
        <button class="mine-tab ${state.mineSection === 'profile' ? 'active' : ''}" type="button" data-mine-section="profile">资料设置</button>
        <button class="mine-tab ${state.mineSection === 'password' ? 'active' : ''}" type="button" data-mine-section="password">密码设置</button>
        <button class="mine-tab ${state.mineSection === 'avatar' ? 'active' : ''}" type="button" data-mine-section="avatar">头像设置</button>
      </div>

      ${
        state.mineSection === 'profile'
          ? `
            <form id="profile-form" class="stack form-card">
              <div class="section-title">资料设置</div>
              <label class="field">
                <span>昵称</span>
                <input name="nickname" type="text" value="${escapeAttribute(user.nickname)}" required />
              </label>
              <label class="field">
                <span>账号</span>
                <input name="account" type="text" value="${escapeAttribute(user.account)}" minlength="3" required />
              </label>
              <button class="primary-btn" type="submit">保存资料</button>
            </form>
          `
          : ''
      }

      ${
        state.mineSection === 'password'
          ? `
            <form id="password-form" class="stack form-card">
              <div class="section-title">密码设置</div>
              <label class="field">
                <span>当前密码</span>
                <input name="currentPassword" type="password" required />
              </label>
              <label class="field">
                <span>新密码</span>
                <input name="newPassword" type="password" minlength="8" required />
              </label>
              <label class="field">
                <span>确认新密码</span>
                <input name="confirmPassword" type="password" minlength="8" required />
              </label>
              <button class="primary-btn" type="submit">修改密码</button>
            </form>
          `
          : ''
      }

      ${
        state.mineSection === 'avatar'
          ? `
            <div class="form-card profile-avatar-card">
              <div class="section-title">头像设置</div>
              <div class="profile-avatar-preview">
                ${renderAvatar(user, 'large')}
                <div class="stack">
                  <div>${escapeHtml(user.nickname)}</div>
                  <div class="meta">选择图片后会进入裁剪</div>
                </div>
              </div>
              <div class="inline-actions">
                <label class="ghost-btn profile-avatar-btn" for="user-avatar-input">选择头像</label>
                <input id="user-avatar-input" type="file" accept="image/*" hidden />
              </div>
            </div>
          `
          : ''
      }
    </div>
  `;

  userSummary.querySelectorAll('[data-mine-section]').forEach((button) => {
    button.addEventListener('click', () => {
      state.mineSection = state.mineSection === button.dataset.mineSection
        ? null
        : button.dataset.mineSection;
      renderUserSummary();
    });
  });

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

  userSummary.querySelector('#profile-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    try {
      const response = await api('/api/users/me', {
        method: 'PATCH',
        body: {
          nickname: form.get('nickname'),
          account: form.get('account'),
          avatarUrl: state.session.user.avatarUrl,
        },
      });
      state.session.user = response.user;
      saveSession(state.session);
      syncRememberedAccount(response.user.account);
      await Promise.all([hydrateSideData(), hydrateConversations()]);
      render();
      showToast('资料已更新');
    } catch (error) {
      handleError(error);
    }
  });

  userSummary.querySelector('#password-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get('currentPassword') || '');
    const newPassword = String(form.get('newPassword') || '');
    const confirmPassword = String(form.get('confirmPassword') || '');

    if (newPassword !== confirmPassword) {
      showToast('两次输入的新密码不一致');
      return;
    }

    try {
      await api('/api/auth/password', {
        method: 'PATCH',
        body: {
          currentPassword,
          newPassword,
        },
      });
      syncRememberedPassword(newPassword);
      event.currentTarget.reset();
      showToast('密码已更新');
    } catch (error) {
      handleError(error);
    }
  });
  return;
  userSummary.innerHTML = `
    <div class="stack">
      <div class="user-card profile-hero">
        <div class="user-card-main">
          ${renderAvatar(user, 'large')}
          <div class="user-text">
            <div class="user-title">${escapeHtml(user.nickname)}</div>
            <div class="meta">@${escapeHtml(user.account)}</div>
            <div class="meta">${user.isAdmin ? '管理员' : '成员'}</div>
          </div>
        </div>
        <div class="stack profile-actions">
          <label class="ghost-btn profile-avatar-btn" for="user-avatar-input">修改头像</label>
          <input id="user-avatar-input" type="file" accept="image/*" hidden />
        </div>
      </div>

      <form id="profile-form" class="stack form-card">
        <div class="section-title">资料设置</div>
        <label class="field">
          <span>昵称</span>
          <input name="nickname" type="text" value="${escapeAttribute(user.nickname)}" required />
        </label>
        <label class="field">
          <span>账号</span>
          <input name="account" type="text" value="${escapeAttribute(user.account)}" minlength="3" required />
        </label>
        <button class="primary-btn" type="submit">保存资料</button>
      </form>

      <form id="password-form" class="stack form-card">
        <div class="section-title">密码设置</div>
        <label class="field">
          <span>当前密码</span>
          <input name="currentPassword" type="password" required />
        </label>
        <label class="field">
          <span>新密码</span>
          <input name="newPassword" type="password" minlength="8" required />
        </label>
        <label class="field">
          <span>确认新密码</span>
          <input name="confirmPassword" type="password" minlength="8" required />
        </label>
        <button class="primary-btn" type="submit">修改密码</button>
      </form>
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

  userSummary.querySelector('#profile-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    try {
      const response = await api('/api/users/me', {
        method: 'PATCH',
        body: {
          nickname: form.get('nickname'),
          account: form.get('account'),
          avatarUrl: state.session.user.avatarUrl,
        },
      });
      state.session.user = response.user;
      saveSession(state.session);
      syncRememberedAccount(response.user.account);
      await Promise.all([hydrateSideData(), hydrateConversations()]);
      render();
      showToast('资料已更新');
    } catch (error) {
      handleError(error);
    }
  });

  userSummary.querySelector('#password-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get('currentPassword') || '');
    const newPassword = String(form.get('newPassword') || '');
    const confirmPassword = String(form.get('confirmPassword') || '');

    if (newPassword !== confirmPassword) {
      showToast('两次输入的新密码不一致');
      return;
    }

    try {
      await api('/api/auth/password', {
        method: 'PATCH',
        body: {
          currentPassword,
          newPassword,
        },
      });
      syncRememberedPassword(newPassword);
      event.currentTarget.reset();
      showToast('密码已更新');
    } catch (error) {
      handleError(error);
    }
  });
}

function renderContacts() {
  contactsList.innerHTML = '';

  if (state.contacts.length === 0) {
    contactsList.innerHTML = '<div class="invite-item">还没有联系人</div>';
    return;
  }

  for (const contact of state.contacts) {
    const card = document.createElement('div');
    card.className = 'contact-item';
    card.innerHTML = `
      <div class="contact-main">
        ${renderAvatar(contact)}
        <div class="contact-text">
          <div class="contact-title">${escapeHtml(contact.nickname)}</div>
          <div class="meta">@${escapeHtml(contact.account)}</div>
        </div>
      </div>
    `;
    card.addEventListener('click', async () => {
      try {
        const response = await api('/api/conversations/direct', {
          method: 'POST',
          body: {
            peerUserId: contact.id,
          },
        });
        state.navSection = 'conversations';
        await hydrateConversations();
        await selectConversation(response.conversation.id);
      } catch (error) {
        handleError(error);
      }
    });
    contactsList.appendChild(card);
  }
}

function renderInvites() {
  inviteList.innerHTML = '';

  if (state.invites.length === 0) {
    inviteList.innerHTML = '<div class="invite-item">还没有邀请码</div>';
    return;
  }

  for (const invite of state.invites) {
    const card = document.createElement('div');
    card.className = 'invite-item';
    card.innerHTML = `
      <div>
        <strong>${escapeHtml(invite.code)}</strong>
        <div class="meta">${invite.usedCount}/${invite.maxUses} 次 · ${escapeHtml(invite.status)}</div>
      </div>
    `;
    inviteList.appendChild(card);
  }
}

function renderAdminUsers() {
  adminUserList.innerHTML = '';

  if (!state.session?.user?.isAdmin) {
    return;
  }

  if (state.adminUsers.length === 0) {
    adminUserList.innerHTML = '<div class="invite-item">还没有用户</div>';
    return;
  }

  for (const user of state.adminUsers) {
    const card = document.createElement('div');
    card.className = 'admin-user-item';
    card.innerHTML = `
      <div class="contact-main">
        ${renderAvatar(user)}
        <div class="contact-text">
          <div class="contact-title">${escapeHtml(user.nickname)}</div>
          <div class="meta">@${escapeHtml(user.account)}</div>
          <div class="meta">${user.isAdmin ? '管理员' : '成员'} · ${escapeHtml(user.status)}</div>
        </div>
      </div>
      <div class="inline-actions">
        ${user.id === state.session.user.id ? '<span class="status-pill">当前登录</span>' : ''}
        <button class="ghost-btn" type="button" data-reset-user-id="${escapeAttribute(user.id)}">重置密码</button>
      </div>
    `;
    adminUserList.appendChild(card);
  }

  adminUserList.querySelectorAll('[data-reset-user-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const targetUserId = button.dataset.resetUserId;
      const target = state.adminUsers.find((user) => user.id === targetUserId);
      const newPassword = window.prompt(`给 ${target?.nickname || '该用户'} 设置新密码（至少 8 位）`);

      if (!newPassword) {
        return;
      }

      try {
        await api(`/api/admin/users/${targetUserId}/reset-password`, {
          method: 'POST',
          body: {
            newPassword,
          },
        });
        showToast(`已重置 ${target?.account || '该用户'} 的密码`);
      } catch (error) {
        handleError(error);
      }
    });
  });
}

function renderConversations() {
  conversationList.innerHTML = '';

  if (state.conversations.length === 0) {
    conversationList.innerHTML = '<div class="invite-item">还没有会话</div>';
    return;
  }

  for (const conversation of state.conversations) {
    const item = document.createElement('div');
    item.className = `conversation-item ${state.activeConversation?.id === conversation.id ? 'active' : ''}`;
    item.innerHTML = `
      <div class="conversation-main">
        ${renderAvatar({ nickname: conversation.name, avatarUrl: conversation.avatarUrl })}
        <div class="conversation-text">
          <div class="conversation-title">${escapeHtml(conversation.name || '未命名会话')}</div>
          <div class="conversation-preview">${escapeHtml(getConversationPreview(conversation))}</div>
        </div>
      </div>
      <div class="conversation-side">
        <span class="meta">${formatConversationTime(conversation.updatedAt)}</span>
        ${
          conversation.unreadCount > 0
            ? `<span class="badge">${conversation.unreadCount}</span>`
            : '<span class="status-pill">已读</span>'
        }
      </div>
    `;
    item.addEventListener('click', () => {
      selectConversation(conversation.id).catch(handleError);
    });
    conversationList.appendChild(item);
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
  requestAnimationFrame(() => {
    applyChatHeight();
  });

  if (state.messages.length === 0) {
    messageList.innerHTML = '<div class="meta">还没有消息，发一条试试吧。</div>';
    return;
  }

  messageList.innerHTML = '';

  for (const message of state.messages) {
    const mine = message.senderId === state.session.user.id;
    const row = document.createElement('div');
    row.className = `message-row ${mine ? 'mine' : ''}`;

    if (!mine) {
      const sender = message.sender
        ?? state.activeConversation.members.find((member) => member.id === message.senderId)
        ?? { nickname: '?' };
      row.insertAdjacentHTML('beforeend', renderAvatar(sender, 'small'));
    }

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.innerHTML = message.type === 'image'
      ? `
        <img class="message-image" src="${escapeAttribute(message.imageUrl)}" alt="${escapeAttribute(message.imageName || '图片')}" />
        <div class="message-content">${escapeHtml(message.imageName || '图片')}</div>
        <div class="message-meta">
          <span>${formatDateTime(message.createdAt)}</span>
          ${mine ? `<span class="message-receipt">${escapeHtml(getReceiptText(message, state.activeConversation.type))}</span>` : ''}
        </div>
      `
      : `
        <div class="message-content">${escapeHtml(message.text)}</div>
        <div class="message-meta">
          <span>${formatDateTime(message.createdAt)}</span>
          ${mine ? `<span class="message-receipt">${escapeHtml(getReceiptText(message, state.activeConversation.type))}</span>` : ''}
        </div>
      `;

    row.appendChild(bubble);
    messageList.appendChild(row);
  }

  messageList.scrollTop = messageList.scrollHeight;
}

function renderGroupMembers() {
  groupMemberList.innerHTML = '';

  if (state.contacts.length === 0) {
    groupMemberList.innerHTML = '<div class="invite-item">当前没有可选联系人</div>';
    return;
  }

  for (const contact of state.contacts) {
    const label = document.createElement('label');
    label.className = 'checkbox-row';
    label.innerHTML = `
      <input type="checkbox" value="${escapeAttribute(contact.id)}" />
      ${renderAvatar(contact, 'xs')}
      <span>${escapeHtml(contact.nickname)} <span class="meta">@${escapeHtml(contact.account)}</span></span>
    `;
    groupMemberList.appendChild(label);
  }
}

async function submitTextMessage() {
  if (!state.activeConversation) {
    return;
  }

  const text = messageInput.value.trim();
  if (!text) {
    return;
  }

  const submittedAt = Date.now();

  try {
    const response = await api(`/api/conversations/${state.activeConversation.id}/messages`, {
      method: 'POST',
      body: {
        type: 'text',
        text,
      },
    });
    messageInput.value = '';
    mergeConversation(response.conversation);
    upsertMessage(response.message);
    render();
  } catch (error) {
    await refreshActiveConversation(false);
    if (didMessagePersist({ type: 'text', text, submittedAt })) {
      messageInput.value = '';
      showToast('消息已发出');
      return;
    }
    handleError(error);
  }
}

async function submitImageMessage() {
  const file = imageInput.files?.[0];
  imageInput.value = '';

  if (!file || !state.activeConversation) {
    return;
  }

  const submittedAt = Date.now();

  try {
    const upload = await uploadImage(file);
    const response = await api(`/api/conversations/${state.activeConversation.id}/messages`, {
      method: 'POST',
      body: {
        type: 'image',
        imageUrl: upload.url,
        imageName: upload.name,
      },
    });
    mergeConversation(response.conversation);
    upsertMessage(response.message);
    render();
  } catch (error) {
    await refreshActiveConversation(false);
    if (didMessagePersist({ type: 'image', imageName: file.name, submittedAt })) {
      showToast('图片已发出');
      return;
    }
    handleError(error);
  }
}

async function openAvatarCropper(file) {
  const objectUrl = URL.createObjectURL(file);
  const image = await loadImage(objectUrl);

  state.avatarCrop = createEmptyAvatarCropState();
  state.avatarCrop.fileName = file.name || 'avatar.png';
  state.avatarCrop.objectUrl = objectUrl;
  state.avatarCrop.image = image;

  avatarCropImage.src = objectUrl;
  avatarDialog.showModal();

  requestAnimationFrame(() => {
    initializeAvatarCrop();
  });
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

  avatarCropImage.removeAttribute('src');
  avatarCropImage.style.transform = '';
  avatarCropStage.classList.remove('dragging');
  state.avatarCrop = createEmptyAvatarCropState();
}

function initializeAvatarCrop() {
  if (!state.avatarCrop.image) {
    return;
  }

  const rect = avatarCropStage.getBoundingClientRect();
  state.avatarCrop.baseScale = Math.max(
    rect.width / state.avatarCrop.image.width,
    rect.height / state.avatarCrop.image.height,
  );
  state.avatarCrop.zoom = 1;
  state.avatarCrop.offsetX = 0;
  state.avatarCrop.offsetY = 0;
  state.avatarCrop.pointers.clear();
  state.avatarCrop.gesture = null;
  renderAvatarCropPreview();
}

function renderAvatarCropPreview() {
  if (!state.avatarCrop.image) {
    return;
  }

  clampAvatarCropOffsets();
  const totalScale = state.avatarCrop.baseScale * state.avatarCrop.zoom;
  avatarCropImage.style.width = `${state.avatarCrop.image.width}px`;
  avatarCropImage.style.height = `${state.avatarCrop.image.height}px`;
  avatarCropImage.style.transform = `translate(-50%, -50%) translate(${state.avatarCrop.offsetX}px, ${state.avatarCrop.offsetY}px) scale(${totalScale})`;
}

function clampAvatarCropOffsets() {
  if (!state.avatarCrop.image) {
    return;
  }

  const rect = avatarCropStage.getBoundingClientRect();
  const totalScale = state.avatarCrop.baseScale * state.avatarCrop.zoom;
  const maxOffsetX = Math.max(0, (state.avatarCrop.image.width * totalScale - rect.width) / 2);
  const maxOffsetY = Math.max(0, (state.avatarCrop.image.height * totalScale - rect.height) / 2);

  state.avatarCrop.offsetX = clamp(state.avatarCrop.offsetX, -maxOffsetX, maxOffsetX);
  state.avatarCrop.offsetY = clamp(state.avatarCrop.offsetY, -maxOffsetY, maxOffsetY);
}

function onAvatarPointerDown(event) {
  if (!state.avatarCrop.image) {
    return;
  }

  avatarCropStage.setPointerCapture(event.pointerId);
  state.avatarCrop.pointers.set(event.pointerId, {
    clientX: event.clientX,
    clientY: event.clientY,
  });

  if (state.avatarCrop.pointers.size === 1) {
    state.avatarCrop.gesture = {
      type: 'pan',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX: state.avatarCrop.offsetX,
      startOffsetY: state.avatarCrop.offsetY,
    };
    avatarCropStage.classList.add('dragging');
    return;
  }

  if (state.avatarCrop.pointers.size === 2) {
    startAvatarPinchGesture();
  }
}

function onAvatarPointerMove(event) {
  if (!state.avatarCrop.image || !state.avatarCrop.pointers.has(event.pointerId)) {
    return;
  }

  state.avatarCrop.pointers.set(event.pointerId, {
    clientX: event.clientX,
    clientY: event.clientY,
  });

  if (!state.avatarCrop.gesture) {
    return;
  }

  if (state.avatarCrop.gesture.type === 'pan' && state.avatarCrop.pointers.size === 1) {
    state.avatarCrop.offsetX = state.avatarCrop.gesture.startOffsetX + (event.clientX - state.avatarCrop.gesture.startClientX);
    state.avatarCrop.offsetY = state.avatarCrop.gesture.startOffsetY + (event.clientY - state.avatarCrop.gesture.startClientY);
    renderAvatarCropPreview();
    return;
  }

  if (state.avatarCrop.gesture.type === 'pinch' && state.avatarCrop.pointers.size >= 2) {
    const [first, second] = [...state.avatarCrop.pointers.values()];
    const currentDistance = getDistance(first, second);
    const midpoint = getMidpoint(first, second);
    const nextZoom = clamp(
      state.avatarCrop.gesture.startZoom * (currentDistance / state.avatarCrop.gesture.startDistance),
      1,
      4,
    );
    const nextScale = state.avatarCrop.baseScale * nextZoom;
    const focus = toCropCoordinates(midpoint.clientX, midpoint.clientY);

    state.avatarCrop.zoom = nextZoom;
    state.avatarCrop.offsetX = focus.x - state.avatarCrop.gesture.focusImageX * nextScale;
    state.avatarCrop.offsetY = focus.y - state.avatarCrop.gesture.focusImageY * nextScale;
    renderAvatarCropPreview();
  }
}

function onAvatarPointerEnd(event) {
  if (!state.avatarCrop.pointers.has(event.pointerId)) {
    return;
  }

  state.avatarCrop.pointers.delete(event.pointerId);

  if (state.avatarCrop.pointers.size === 0) {
    state.avatarCrop.gesture = null;
    avatarCropStage.classList.remove('dragging');
    return;
  }

  if (state.avatarCrop.pointers.size === 1) {
    const remaining = [...state.avatarCrop.pointers.values()][0];
    state.avatarCrop.gesture = {
      type: 'pan',
      startClientX: remaining.clientX,
      startClientY: remaining.clientY,
      startOffsetX: state.avatarCrop.offsetX,
      startOffsetY: state.avatarCrop.offsetY,
    };
    avatarCropStage.classList.add('dragging');
    return;
  }

  startAvatarPinchGesture();
}

function startAvatarPinchGesture() {
  const [first, second] = [...state.avatarCrop.pointers.values()];
  const midpoint = getMidpoint(first, second);
  const focus = toCropCoordinates(midpoint.clientX, midpoint.clientY);
  const totalScale = state.avatarCrop.baseScale * state.avatarCrop.zoom;

  state.avatarCrop.gesture = {
    type: 'pinch',
    startZoom: state.avatarCrop.zoom,
    startDistance: getDistance(first, second),
    focusImageX: (focus.x - state.avatarCrop.offsetX) / totalScale,
    focusImageY: (focus.y - state.avatarCrop.offsetY) / totalScale,
  };
  avatarCropStage.classList.remove('dragging');
}

function onAvatarWheel(event) {
  if (!state.avatarCrop.image) {
    return;
  }

  event.preventDefault();
  const factor = event.deltaY < 0 ? 1.1 : 0.9;
  zoomAvatarCrop(clamp(state.avatarCrop.zoom * factor, 1, 4), event.clientX, event.clientY);
}

function zoomAvatarCrop(nextZoom, clientX, clientY) {
  const focus = toCropCoordinates(clientX, clientY);
  const oldScale = state.avatarCrop.baseScale * state.avatarCrop.zoom;
  const nextScale = state.avatarCrop.baseScale * nextZoom;
  const imageX = (focus.x - state.avatarCrop.offsetX) / oldScale;
  const imageY = (focus.y - state.avatarCrop.offsetY) / oldScale;

  state.avatarCrop.zoom = nextZoom;
  state.avatarCrop.offsetX = focus.x - imageX * nextScale;
  state.avatarCrop.offsetY = focus.y - imageY * nextScale;
  renderAvatarCropPreview();
}

function toCropCoordinates(clientX, clientY) {
  const rect = avatarCropStage.getBoundingClientRect();
  return {
    x: clientX - (rect.left + rect.width / 2),
    y: clientY - (rect.top + rect.height / 2),
  };
}

function getDistance(first, second) {
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

function getMidpoint(first, second) {
  return {
    clientX: (first.clientX + second.clientX) / 2,
    clientY: (first.clientY + second.clientY) / 2,
  };
}

async function exportAvatarCrop() {
  if (!state.avatarCrop.image) {
    throw new Error('请先选择头像图片');
  }

  const rect = avatarCropStage.getBoundingClientRect();
  const outputSize = 512;
  const ratio = outputSize / rect.width;
  const totalScale = state.avatarCrop.baseScale * state.avatarCrop.zoom * ratio;
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext('2d');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, outputSize, outputSize);
  context.drawImage(
    state.avatarCrop.image,
    outputSize / 2 + state.avatarCrop.offsetX * ratio - (state.avatarCrop.image.width * totalScale) / 2,
    outputSize / 2 + state.avatarCrop.offsetY * ratio - (state.avatarCrop.image.height * totalScale) / 2,
    state.avatarCrop.image.width * totalScale,
    state.avatarCrop.image.height * totalScale,
  );

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/png', 0.92);
  });

  if (!blob) {
    throw new Error('头像裁剪失败，请重试');
  }

  return new File([blob], normalizeAvatarFileName(state.avatarCrop.fileName), { type: 'image/png' });
}

function normalizeAvatarFileName(fileName) {
  const base = String(fileName || 'avatar').replace(/\.[^.]+$/, '');
  return `${base || 'avatar'}-avatar.png`;
}

function mergeConversation(conversation) {
  const index = state.conversations.findIndex((item) => item.id === conversation.id);
  if (index === -1) {
    state.conversations.unshift(conversation);
  } else {
    state.conversations[index] = conversation;
  }

  state.conversations.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

  if (state.activeConversation?.id === conversation.id) {
    state.activeConversation = state.conversations.find((item) => item.id === conversation.id) ?? conversation;
  }
}

function upsertMessage(message) {
  if (!message || !state.activeConversation || message.conversationId !== state.activeConversation.id) {
    return;
  }

  const index = state.messages.findIndex((item) => item.id === message.id);
  if (index === -1) {
    state.messages.push(message);
  } else {
    state.messages[index] = message;
  }

  state.messages.sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

function setConversationUnreadCount(conversationId, unreadCount) {
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (conversation) {
    conversation.unreadCount = unreadCount;
  }
  if (state.activeConversation?.id === conversationId) {
    state.activeConversation.unreadCount = unreadCount;
  }
}

function getConversationPreview(conversation) {
  const latest = conversation.latestMessage;
  if (!latest) {
    return '暂无消息';
  }
  if (latest.type === 'image') {
    return `[图片] ${latest.imageName || '图片'}`;
  }
  return latest.text || '暂无消息';
}

function getConversationMeta(conversation) {
  if (conversation.type === 'direct') {
    const peer = conversation.members.find((member) => member.id !== state.session.user.id);
    return peer ? `与 ${peer.nickname} 的私聊` : '私聊';
  }
  return `${conversation.members.length} 人群聊`;
}

function getReceiptText(message, conversationType) {
  if (conversationType === 'group') {
    return message.readByCount > 0 ? `已读 ${message.readByCount}` : '未读';
  }
  return message.readByCount > 0 ? '已读' : '未读';
}

function renderAvatar(user, size = '') {
  const classes = ['avatar'];
  if (size) {
    classes.push(size);
  }

  const initials = getInitials(user?.nickname || user?.account || '?');
  const content = user?.avatarUrl
    ? `<img src="${escapeAttribute(user.avatarUrl)}" alt="${escapeAttribute(user.nickname || 'avatar')}" />`
    : escapeHtml(initials);

  return `<div class="${classes.join(' ')}">${content}</div>`;
}

function getInitials(value) {
  const text = String(value || '?').trim();
  if (!text) {
    return '?';
  }

  const chars = [...text];
  if (chars.length === 1) {
    return chars[0].toUpperCase();
  }
  return `${chars[0]}${chars[1]}`.toUpperCase();
}

function formatConversationTime(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date)
    : new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date);
}

function formatDateTime(value) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

async function loadImage(objectUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败，请换一张图片重试'));
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
  const headers = {};
  if (!options.skipAuth && state.session?.sessionToken) {
    headers.Authorization = `Bearer ${state.session.sessionToken}`;
  }
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  return readJson(response);
}

async function readJson(response) {
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;

  if (!response.ok) {
    const error = new Error(data?.message || '请求失败');
    error.statusCode = response.status;
    error.details = data?.details;
    throw error;
  }

  return data;
}

function handleError(error) {
  console.error(error);
  showToast(error.message || '操作失败，请重试');
}

let toastTimer = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.add('hidden');
  }, 2600);
}

function resetToLoggedOut() {
  disconnectRealtime();
  closeAvatarCropper();
  state.session = null;
  state.contacts = [];
  state.invites = [];
  state.adminUsers = [];
  state.conversations = [];
  state.messages = [];
  state.activeConversation = null;
  saveSession(null);
  render();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
