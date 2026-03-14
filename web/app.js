const CHAT_HEIGHT_STORAGE_VERSION = '4';
const DEFAULT_CHAT_LIST_HEIGHT = 120;
const MIN_CHAT_LIST_HEIGHT = 96;
const REMEMBERED_ACCOUNTS_KEY = 'open-chat-circle-remembered-accounts';
const LEGACY_REMEMBERED_KEY = 'open-chat-circle-remembered';
const MAX_REMEMBERED_ACCOUNTS = 8;

let state;

const initialSession = loadSession();
const initialRememberedAccounts = loadRememberedAccounts();

state = {
  session: initialSession,
  rememberedAccounts: initialRememberedAccounts,
  selectedRememberedUserId: initialSession?.user?.id || null,
  manualLoginEntry: false,
  authMode: 'login',
  navSection: 'conversations',
  mineSection: null,
  contacts: [],
  invites: [],
  adminUsers: [],
  discoverUsers: [],
  conversations: [],
  messages: [],
  activeConversation: null,
  replyToMessageId: null,
  groupProfileConversation: null,
  groupMemberAddQuery: '',
  groupSelectedAddMemberIds: [],
  messageContextMenu: null,
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
const addFriendBtn = document.querySelector('#add-friend-btn');
const logoutBtn = document.querySelector('#logout-btn');
const refreshContactsBtn = document.querySelector('#refresh-contacts-btn');
const createInviteBtn = document.querySelector('#create-invite-btn');
const messageForm = document.querySelector('#message-form');
const replyPreview = document.querySelector('#reply-preview');
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
const avatarViewDialog = document.querySelector('#avatar-view-dialog');
const avatarViewImage = document.querySelector('#avatar-view-image');
const closeAvatarViewBtn = document.querySelector('#close-avatar-view-btn');
const addFriendDialog = document.querySelector('#add-friend-dialog');
const addFriendForm = document.querySelector('#add-friend-form');
const friendSearchInput = document.querySelector('#friend-search-input');
const discoverUserList = document.querySelector('#discover-user-list');
const closeAddFriendBtn = document.querySelector('#close-add-friend-btn');
const groupProfileDialog = document.querySelector('#group-profile-dialog');
const groupProfileTitle = document.querySelector('#group-profile-title');
const groupProfileMeta = document.querySelector('#group-profile-meta');
const groupMemberManageList = document.querySelector('#group-member-manage-list');
const groupMemberAddPanel = document.querySelector('#group-member-add-panel');
const groupMemberSearchInput = document.querySelector('#group-member-search-input');
const groupSelectedMemberList = document.querySelector('#group-selected-member-list');
const groupAddableMemberList = document.querySelector('#group-addable-member-list');
const submitAddGroupMembersBtn = document.querySelector('#submit-add-group-members-btn');
const closeGroupProfileBtn = document.querySelector('#close-group-profile-btn');
const groupAvatarInput = document.querySelector('#group-avatar-input');
const messageContextMenu = document.querySelector('#message-context-menu');

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

  addFriendBtn?.addEventListener('click', () => {
    openAddFriendDialog().catch(handleError);
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
  messageList.addEventListener('contextmenu', onMessageBubbleContextMenu);
  chatAvatar.addEventListener('click', () => {
    if (state.activeConversation?.type === 'group') {
      openGroupProfile(state.activeConversation.id).catch(handleError);
    }
  });

  closeAvatarBtn.addEventListener('click', closeAvatarCropper);
  avatarDialog.addEventListener('close', resetAvatarCropper);
  avatarDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeAvatarCropper();
  });
  closeAvatarViewBtn?.addEventListener('click', closeAvatarViewer);
  avatarViewDialog?.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeAvatarViewer();
  });
  closeAddFriendBtn?.addEventListener('click', () => {
    addFriendDialog?.close();
  });
  addFriendDialog?.addEventListener('cancel', (event) => {
    event.preventDefault();
    addFriendDialog.close();
  });
  addFriendForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await searchDiscoverUsers(friendSearchInput?.value || '');
  });
  closeGroupProfileBtn?.addEventListener('click', () => {
    closeGroupProfile();
  });
  groupProfileDialog?.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeGroupProfile();
  });
  submitAddGroupMembersBtn?.addEventListener('click', async () => {
    await submitGroupMembersAdd();
  });
  groupMemberSearchInput?.addEventListener('input', (event) => {
    state.groupMemberAddQuery = event.target.value || '';
    renderGroupProfile();
  });
  groupAvatarInput?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    try {
      await updateGroupAvatar(file);
    } catch (error) {
      handleError(error);
    }
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
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMessageContextMenu();
    }
  });
  window.addEventListener('scroll', closeMessageContextMenu, true);

  window.addEventListener('resize', () => {
    if (avatarDialog.open && state.avatarCrop.image) {
      initializeAvatarCrop();
    }
    closeMessageContextMenu();
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

function loadRememberedAccounts() {
  const raw = localStorage.getItem(REMEMBERED_ACCOUNTS_KEY);
  if (raw) {
    try {
      const accounts = JSON.parse(raw);
      if (!Array.isArray(accounts)) {
        throw new Error('Remembered accounts should be an array.');
      }
      return accounts
        .map(normalizeRememberedAccount)
        .filter(Boolean)
        .sort((left, right) => new Date(right.lastUsedAt).getTime() - new Date(left.lastUsedAt).getTime());
    } catch {
      localStorage.removeItem(REMEMBERED_ACCOUNTS_KEY);
    }
  }

  const legacyRaw = localStorage.getItem(LEGACY_REMEMBERED_KEY);
  if (!legacyRaw) {
    return [];
  }

  try {
    const legacyRemembered = JSON.parse(legacyRaw);
    if (!legacyRemembered?.account) {
      throw new Error('Legacy remembered account is missing account.');
    }

    const migratedAccounts = [
      normalizeRememberedAccount({
        userId: `legacy:${legacyRemembered.account}`,
        account: legacyRemembered.account,
        nickname: legacyRemembered.account,
        avatarUrl: '',
        isAdmin: false,
        password: legacyRemembered.password || '',
        lastUsedAt: new Date().toISOString(),
      }),
    ].filter(Boolean);

    saveRememberedAccounts(migratedAccounts);
    return migratedAccounts;
  } catch {
    localStorage.removeItem(LEGACY_REMEMBERED_KEY);
    return [];
  }
}

function normalizeRememberedAccount(account) {
  if (!account?.account) {
    return null;
  }

  return {
    userId: String(account.userId || `legacy:${account.account}`),
    account: String(account.account || '').trim(),
    nickname: String(account.nickname || account.account || '').trim(),
    avatarUrl: String(account.avatarUrl || ''),
    isAdmin: Boolean(account.isAdmin),
    password: String(account.password || ''),
    lastUsedAt: account.lastUsedAt || new Date().toISOString(),
  };
}

function saveRememberedAccounts(accounts) {
  const normalized = accounts
    .map(normalizeRememberedAccount)
    .filter(Boolean)
    .sort((left, right) => new Date(right.lastUsedAt).getTime() - new Date(left.lastUsedAt).getTime())
    .slice(0, MAX_REMEMBERED_ACCOUNTS);

  if (normalized.length === 0) {
    localStorage.removeItem(REMEMBERED_ACCOUNTS_KEY);
    localStorage.removeItem(LEGACY_REMEMBERED_KEY);
    if (state) {
      state.rememberedAccounts = [];
    }
    return;
  }

  localStorage.setItem(REMEMBERED_ACCOUNTS_KEY, JSON.stringify(normalized));
  localStorage.removeItem(LEGACY_REMEMBERED_KEY);
  if (state) {
    state.rememberedAccounts = normalized;
  }
}

function rememberAccountFromSession(session, { password = '', rememberPassword = false } = {}) {
  if (!session?.user?.account) {
    return;
  }

  const nextAccount = normalizeRememberedAccount({
    userId: session.user.id,
    account: session.user.account,
    nickname: session.user.nickname,
    avatarUrl: session.user.avatarUrl,
    isAdmin: session.user.isAdmin,
    password: rememberPassword ? password : '',
    lastUsedAt: new Date().toISOString(),
  });

  const accounts = loadRememberedAccounts().filter(
    (item) => item.userId !== nextAccount.userId && item.account !== nextAccount.account,
  );
  saveRememberedAccounts([nextAccount, ...accounts]);
  state.selectedRememberedUserId = nextAccount.userId;
  state.manualLoginEntry = false;
}

function getSelectedRememberedAccount() {
  if (state.manualLoginEntry || state.rememberedAccounts.length === 0) {
    return null;
  }

  if (state.selectedRememberedUserId) {
    const selected = state.rememberedAccounts.find((item) => item.userId === state.selectedRememberedUserId);
    if (selected) {
      return selected;
    }
  }

  return state.rememberedAccounts[0] || null;
}

function syncRememberedAccount(account) {
  if (!state.session?.user?.id) {
    return;
  }

  const accounts = loadRememberedAccounts();
  const current = accounts.find((item) => item.userId === state.session.user.id);
  if (!current) {
    return;
  }

  saveRememberedAccounts(accounts.map((item) => {
    if (item.userId !== state.session.user.id) {
      return item;
    }

    return {
      ...item,
      account,
      nickname: state.session.user.nickname,
      avatarUrl: state.session.user.avatarUrl,
      isAdmin: state.session.user.isAdmin,
      lastUsedAt: new Date().toISOString(),
    };
  }));
  state.selectedRememberedUserId = state.session.user.id;
}

function syncRememberedPassword(password) {
  if (!state.session?.user?.id) {
    return;
  }

  const accounts = loadRememberedAccounts();
  const current = accounts.find((item) => item.userId === state.session.user.id);
  if (!current || !current.password) {
    return;
  }

  saveRememberedAccounts(accounts.map((item) => {
    if (item.userId !== state.session.user.id) {
      return item;
    }

    return {
      ...item,
      password,
      lastUsedAt: new Date().toISOString(),
    };
  }));
  state.selectedRememberedUserId = state.session.user.id;
}

function loadChatListHeight() {
  const version = localStorage.getItem('open-chat-circle-chat-height-version');
  if (version !== CHAT_HEIGHT_STORAGE_VERSION) {
    localStorage.setItem('open-chat-circle-chat-height-version', CHAT_HEIGHT_STORAGE_VERSION);
    localStorage.setItem('open-chat-circle-chat-height', String(DEFAULT_CHAT_LIST_HEIGHT));
    return DEFAULT_CHAT_LIST_HEIGHT;
  }

  const raw = localStorage.getItem('open-chat-circle-chat-height');
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_CHAT_LIST_HEIGHT;
}

function saveChatListHeight(height) {
  localStorage.setItem('open-chat-circle-chat-height-version', CHAT_HEIGHT_STORAGE_VERSION);
  localStorage.setItem('open-chat-circle-chat-height', String(height));
}

function applyChatHeight() {
  if (chatPanel.classList.contains('hidden')) {
    return;
  }

  const panelHeight = chatPanel.getBoundingClientRect().height;
  const headerHeight = chatPanel.querySelector('.chat-header')?.offsetHeight || 0;
  const composerHeight = messageForm.offsetHeight || 0;
  const resizerHeight = chatResizer.offsetHeight || 0;
  const maxHeight = Math.max(MIN_CHAT_LIST_HEIGHT, panelHeight - headerHeight - composerHeight - resizerHeight - 24);
  const nextHeight = clamp(state.chatListHeight, MIN_CHAT_LIST_HEIGHT, maxHeight);

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
  if (state.session.user.isAdmin) {
    await ensureAssistantConversation();
  }
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

async function ensureAssistantConversation() {
  const response = await api('/api/ai/conversation', {
    method: 'POST',
  });
  mergeConversation(response.conversation);
}

async function selectConversation(conversationId) {
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) {
    return;
  }

  closeMessageContextMenu();
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

async function searchDiscoverUsers(query = '') {
  const response = await api(`/api/users/discover?q=${encodeURIComponent(query)}`);
  state.discoverUsers = response.users || [];
  renderDiscoverUsers();
}

async function openAddFriendDialog() {
  await searchDiscoverUsers('');
  addFriendDialog?.showModal();
  friendSearchInput?.focus();
}

function renderDiscoverUsers() {
  if (!discoverUserList) {
    return;
  }

  if (state.discoverUsers.length === 0) {
    discoverUserList.innerHTML = '<div class="invite-item">没有找到可添加的用户</div>';
    return;
  }

  discoverUserList.innerHTML = '';

  for (const user of state.discoverUsers) {
    const card = document.createElement('div');
    card.className = 'contact-item';
    card.innerHTML = `
      <div class="contact-main">
        ${renderAvatar(user)}
        <div class="contact-text">
          <div class="contact-title">${escapeHtml(user.nickname)}</div>
          <div class="meta">@${escapeHtml(user.account)}</div>
        </div>
      </div>
      <button class="primary-btn" type="button" data-add-friend-id="${escapeAttribute(user.id)}">添加</button>
    `;
    discoverUserList.appendChild(card);
  }
}

async function addFriend(userId) {
  const result = await api('/api/friends', {
    method: 'POST',
    body: { userId },
  });
  showToast(`已添加 ${result.user.nickname}`);
  await Promise.all([hydrateSideData(), hydrateConversations(), searchDiscoverUsers(friendSearchInput?.value || '')]);
  render();
}

async function openGroupProfile(conversationId) {
  const response = await api(`/api/conversations/${conversationId}`);
  state.groupProfileConversation = response.conversation;
  state.groupMemberAddQuery = '';
  state.groupSelectedAddMemberIds = [];
  renderGroupProfile();
  render();
  groupProfileDialog?.showModal();
}

function closeGroupProfile() {
  state.groupProfileConversation = null;
  state.groupMemberAddQuery = '';
  state.groupSelectedAddMemberIds = [];
  if (groupProfileDialog?.open) {
    groupProfileDialog.close();
  }
}

function renderGroupProfile() {
  const conversation = state.groupProfileConversation;
  if (
    !conversation
    || !groupProfileTitle
    || !groupProfileMeta
    || !groupMemberManageList
    || !groupSelectedMemberList
    || !groupAddableMemberList
  ) {
    return;
  }

  groupProfileTitle.textContent = conversation.name || '群主页';
  const canEdit = Boolean(conversation.canManageMembers);
  groupProfileMeta.innerHTML = `
    <div class="user-card">
      <div class="user-card-main">
        <button
          class="group-profile-avatar-btn ${canEdit ? 'is-editable' : ''}"
          type="button"
          aria-label="${canEdit ? '设置群头像' : '群头像'}"
          ${canEdit ? 'data-edit-group-avatar="true"' : 'disabled'}
        >
          ${renderAvatar({ nickname: conversation.name, avatarUrl: conversation.avatarUrl }, 'large')}
        </button>
        <div class="user-text">
          <button
            class="group-profile-name-btn ${canEdit ? 'is-editable' : ''}"
            type="button"
            aria-label="${canEdit ? '设置群昵称' : '群昵称'}"
            ${canEdit ? 'data-edit-group-name="true"' : 'disabled'}
          >
            ${escapeHtml(conversation.name || '未命名群聊')}
          </button>
          <div class="meta">${escapeHtml(conversation.owner?.nickname || '未知群主')} · ${conversation.members.length} 人</div>
        </div>
      </div>
    </div>
  `;

  groupMemberManageList.innerHTML = '';
  for (const member of conversation.members) {
    const isOwner = member.id === conversation.createdBy;
    const canKick = conversation.canManageMembers && !isOwner;
    const row = document.createElement('div');
    row.className = 'contact-item';
    row.innerHTML = `
      <div class="contact-main">
        ${renderAvatar(member, 'small')}
        <div class="contact-text">
          <div class="contact-title">${escapeHtml(member.nickname)}</div>
          <div class="meta">@${escapeHtml(member.account)}${isOwner ? ' · 群主' : ''}</div>
        </div>
      </div>
      ${canKick ? `<button class="ghost-btn" type="button" data-kick-member-id="${escapeAttribute(member.id)}">移出</button>` : ''}
    `;
    groupMemberManageList.appendChild(row);
  }

  const addableMembers = state.contacts.filter(
    (contact) => !conversation.memberIds.includes(contact.id),
  );
  const addableMemberIds = new Set(addableMembers.map((contact) => contact.id));
  state.groupSelectedAddMemberIds = state.groupSelectedAddMemberIds.filter(
    (memberId) => addableMemberIds.has(memberId),
  );
  const selectedIds = new Set(state.groupSelectedAddMemberIds);
  const memberQuery = state.groupMemberAddQuery.trim().toLowerCase();
  const filteredAddableMembers = addableMembers;
  groupMemberAddPanel?.classList.toggle('hidden', !conversation.canManageMembers);
  if (groupMemberSearchInput) {
    groupMemberSearchInput.value = state.groupMemberAddQuery;
  }
  groupSelectedMemberList.innerHTML = '';
  groupAddableMemberList.innerHTML = '';
  if (!conversation.canManageMembers) {
    return;
  }

  if (state.groupSelectedAddMemberIds.length === 0) {
    groupSelectedMemberList.innerHTML = '<div class="group-member-chip empty">还没有选择要拉进群的好友</div>';
  } else {
    for (const contact of addableMembers.filter((item) => selectedIds.has(item.id))) {
      const chip = document.createElement('button');
      chip.className = 'group-member-chip';
      chip.type = 'button';
      chip.dataset.toggleGroupMemberId = contact.id;
      chip.innerHTML = `
        ${renderAvatar(contact, 'xs')}
        <span>${escapeHtml(contact.nickname)}${contact.isAssistant ? ' <span class="badge">AI</span>' : ''}</span>
      `;
      groupSelectedMemberList.appendChild(chip);
    }
  }

  if (addableMembers.length === 0) {
    groupAddableMemberList.innerHTML = '<div class="invite-item">没有可拉入的好友</div>';
    return;
  }

  for (const contact of filteredAddableMembers) {
    const row = document.createElement('div');
    row.className = 'contact-item group-member-option';
    row.innerHTML = `
      <div class="contact-main">
        ${renderAvatar(contact, 'small')}
        <div class="contact-text">
          <div class="contact-title">${escapeHtml(contact.nickname)}${contact.isAssistant ? ' <span class="badge">AI</span>' : ''}</div>
          <div class="meta">@${escapeHtml(contact.account)}</div>
        </div>
      </div>
      <button
        class="primary-btn group-member-option-btn"
        type="button"
        data-add-group-member-id="${escapeAttribute(contact.id)}"
      >
        拉进群
      </button>
    `;
    groupAddableMemberList.appendChild(row);
  }
  if (false && conversation.canManageMembers) {
    if (addableMembers.length === 0) {
      groupAddableMemberList.innerHTML = '<div class="invite-item">没有可拉入的好友</div>';
    } else {
      for (const contact of addableMembers) {
        const label = document.createElement('label');
        label.className = 'checkbox-row';
        label.innerHTML = `
          <input type="checkbox" value="${escapeAttribute(contact.id)}" />
          ${renderAvatar(contact, 'xs')}
          <span>${escapeHtml(contact.nickname)} <span class="meta">@${escapeHtml(contact.account)}</span></span>
        `;
        groupAddableMemberList.appendChild(label);
      }
    }
  }
}

async function submitGroupMembersAdd() {
  const conversation = state.groupProfileConversation;
  if (!conversation) {
    return;
  }

  const memberIds = [...state.groupSelectedAddMemberIds];
  if (memberIds.length === 0) {
    showToast('请先选择要拉入的好友');
    return;
  }

  const response = await api(`/api/conversations/${conversation.id}/members`, {
    method: 'POST',
    body: { memberIds },
  });
  applyConversationUpdate(response.conversation);
  state.groupProfileConversation = response.conversation;
  state.groupMemberAddQuery = '';
  state.groupSelectedAddMemberIds = [];
  renderGroupProfile();
  render();
  showToast('已拉人进群');
}

async function addGroupMember(memberId) {
  const conversation = state.groupProfileConversation;
  if (!conversation || !memberId) {
    return;
  }

  const response = await api(`/api/conversations/${conversation.id}/members`, {
    method: 'POST',
    body: { memberIds: [memberId] },
  });
  applyConversationUpdate(response.conversation);
  state.groupProfileConversation = response.conversation;
  renderGroupProfile();
  render();
  showToast('已拉人进群');
}

async function removeGroupMember(memberId) {
  const conversation = state.groupProfileConversation;
  if (!conversation) {
    return;
  }

  const response = await api(`/api/conversations/${conversation.id}/members/${memberId}`, {
    method: 'DELETE',
  });
  applyConversationUpdate(response.conversation);
  state.groupProfileConversation = response.conversation;
  renderGroupProfile();
  render();
  showToast('已移出群成员');
}

function toggleGroupMemberSelection(memberId) {
  const conversation = state.groupProfileConversation;
  if (!conversation?.canManageMembers || !memberId) {
    return;
  }

  const nextSelection = new Set(state.groupSelectedAddMemberIds);
  if (nextSelection.has(memberId)) {
    nextSelection.delete(memberId);
  } else {
    nextSelection.add(memberId);
  }

  state.groupSelectedAddMemberIds = [...nextSelection];
  renderGroupProfile();
}

async function updateGroupConversationInfo(payload) {
  const conversation = state.groupProfileConversation;
  if (!conversation) {
    return;
  }

  const response = await api(`/api/conversations/${conversation.id}`, {
    method: 'PATCH',
    body: payload,
  });
  applyConversationUpdate(response.conversation);
  state.groupProfileConversation = response.conversation;
  renderGroupProfile();
  render();
}

async function updateGroupAvatar(file) {
  const upload = await uploadImage(file);
  await updateGroupConversationInfo({
    avatarUrl: upload.url,
  });
  showToast('群头像已更新');
}

async function promptRenameGroup() {
  const conversation = state.groupProfileConversation;
  if (!conversation?.canManageMembers) {
    return;
  }

  const nextName = window.prompt('请输入新的群昵称', conversation.name || '');
  if (nextName == null) {
    return;
  }

  const trimmed = nextName.trim();
  if (!trimmed || trimmed === conversation.name) {
    return;
  }

  await updateGroupConversationInfo({
    name: trimmed,
  });
  showToast('群昵称已更新');
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

  if (event.type === 'message.updated') {
    upsertMessage(event.payload);
    await hydrateConversations();
    render();
    return;
  }

  if (event.type === 'conversation.updated') {
    if (!event.payload.memberIds?.includes(state.session.user.id)) {
      state.conversations = state.conversations.filter((item) => item.id !== event.payload.id);
      if (state.activeConversation?.id === event.payload.id) {
        state.activeConversation = null;
        state.messages = [];
      }
      if (state.groupProfileConversation?.id === event.payload.id) {
        closeGroupProfile();
      }
      render();
      return;
    }
    mergeConversation(event.payload);
    if (state.groupProfileConversation?.id === event.payload.id) {
      state.groupProfileConversation = event.payload;
      renderGroupProfile();
    }
    if (state.activeConversation?.id === event.payload.id) {
      state.activeConversation = {
        ...state.activeConversation,
        ...event.payload,
      };
      await loadMessages(event.payload.id, { markAsRead: false });
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

function getMineSectionLabel(section) {
  if (section === 'profile') {
    return '资料设置';
  }
  if (section === 'password') {
    return '密码设置';
  }
  if (section === 'avatar') {
    return '头像设置';
  }
  return '我的';
}

function renderAuthPanel() {
  state.rememberedAccounts = loadRememberedAccounts();
  const remembered = getSelectedRememberedAccount();
  const accountValue = remembered?.account || '';
  const passwordValue = remembered?.password || '';
  const rememberedCards = state.rememberedAccounts
    .map((account) => renderRememberedAccountOption(account, remembered?.userId === account.userId))
    .join('');

  authPanel.innerHTML = `
    <div class="auth-tabs">
      <button class="auth-tab ghost-btn ${state.authMode === 'login' ? 'active' : ''}" type="button" data-auth-mode="login">登录</button>
      <button class="auth-tab ghost-btn ${state.authMode === 'register' ? 'active' : ''}" type="button" data-auth-mode="register">邀请码注册</button>
    </div>
    ${
      state.authMode === 'login'
        ? `
          ${
            state.rememberedAccounts.length > 0
              ? `
                <div class="remembered-section stack">
                  <div class="remembered-header">
                    <span class="section-title">选择曾登录账号</span>
                    <button class="ghost-btn remembered-reset" type="button" data-clear-remembered-selection>
                      使用其他账号
                    </button>
                  </div>
                  <div class="remembered-list">
                    ${rememberedCards}
                  </div>
                </div>
              `
              : ''
          }
          <form id="login-form" class="auth-form stack">
            <label class="field">
              <span>账号</span>
              <input
                name="account"
                type="text"
                value="${escapeAttribute(accountValue)}"
                ${remembered ? 'readonly' : ''}
                required
              />
            </label>
            <label class="field">
              <span>密码</span>
              <input name="password" type="password" value="${escapeAttribute(passwordValue)}" required />
            </label>
            <label class="checkbox-row">
              <input name="rememberPassword" type="checkbox" ${remembered?.password ? 'checked' : ''} />
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

  authPanel.querySelectorAll('[data-remembered-user-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedRememberedUserId = button.dataset.rememberedUserId;
      state.manualLoginEntry = false;
      renderAuthPanel();
      authPanel.querySelector('input[name="password"]')?.focus();
    });
  });

  authPanel.querySelector('[data-clear-remembered-selection]')?.addEventListener('click', () => {
    state.selectedRememberedUserId = null;
    state.manualLoginEntry = true;
    renderAuthPanel();
    authPanel.querySelector('input[name="account"]')?.focus();
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
      rememberAccountFromSession(session, {
        password: String(form.get('password') || ''),
        rememberPassword: form.get('rememberPassword') === 'on',
      });
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
      rememberAccountFromSession(session);
      await hydrateApp();
      showToast('注册成功');
    } catch (error) {
      handleError(error);
    }
  });
}

function renderRememberedAccountOption(account, selected) {
  return `
    <button
      class="remembered-account ${selected ? 'selected' : ''}"
      type="button"
      data-remembered-user-id="${escapeAttribute(account.userId)}"
    >
      <div class="remembered-account-main">
        ${renderAvatar(account, 'small')}
        <div class="remembered-account-copy">
          <strong>${escapeHtml(account.nickname || account.account)}</strong>
          <span class="meta">@${escapeHtml(account.account)}</span>
        </div>
      </div>
      <span class="remembered-account-note">${account.password ? '已记住密码' : '需输入密码'}</span>
    </button>
  `;
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
        ${
          state.mineSection
            ? `
              <button class="mine-tab active" type="button" data-mine-section="${escapeAttribute(state.mineSection)}">${escapeHtml(getMineSectionLabel(state.mineSection))}</button>
            `
            : `
              <button class="mine-tab" type="button" data-mine-section="profile">资料设置</button>
              <button class="mine-tab" type="button" data-mine-section="password">密码设置</button>
              <button class="mine-tab" type="button" data-mine-section="avatar">头像设置</button>
            `
        }
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
          <div class="contact-title">${escapeHtml(contact.nickname)}${contact.isAssistant ? ' <span class="badge">AI</span>' : ''}</div>
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
    messageList.classList.remove('empty');
    clearReplyTarget();
    closeMessageContextMenu();
    return;
  }

  chatPanel.classList.remove('hidden');
  emptyState.classList.add('hidden');
  chatAvatar.innerHTML = renderAvatar({
    nickname: state.activeConversation.name,
    avatarUrl: state.activeConversation.avatarUrl,
  }, 'large', { preview: state.activeConversation.type !== 'group' });
  chatTitle.textContent = state.activeConversation.name || '未命名会话';
  chatMeta.textContent = getConversationMeta(state.activeConversation);
  chatAvatar.classList.toggle('clickable-avatar', state.activeConversation.type === 'group');
  renderReplyPreview();
  requestAnimationFrame(() => {
    applyChatHeight();
  });

  if (state.messages.length === 0) {
    messageList.classList.add('empty');
    messageList.innerHTML = '<div class="meta">还没有消息，发一条试试吧。</div>';
    closeMessageContextMenu();
    return;
  }

  messageList.classList.remove('empty');
  messageList.innerHTML = '';

  for (const message of state.messages) {
    const mine = message.senderId === state.session.user.id;
    const row = document.createElement('div');
    row.className = `message-row ${mine ? 'mine' : ''}`;
    row.dataset.messageId = message.id;

    if (!mine) {
      const sender = message.sender
        ?? state.activeConversation.members.find((member) => member.id === message.senderId)
        ?? { nickname: '?' };
      row.insertAdjacentHTML('beforeend', renderAvatar(sender, 'small'));
    }

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.dataset.messageBubbleId = message.id;
    const replyBlock = message.replyTo
      ? `
        <button class="reply-chip" type="button" data-jump-message-id="${escapeAttribute(message.replyTo.id)}">
          <strong>${escapeHtml(message.replyTo.sender?.nickname || '未知用户')}</strong>
          <span>${escapeHtml(getReplyPreviewText(message.replyTo))}</span>
        </button>
      `
      : '';
    const body = message.isRecalled
      ? '<div class="message-content message-recalled">这条消息已撤回</div>'
      : message.type === 'image'
        ? `
          <img
            class="message-image"
            src="${escapeAttribute(message.imageUrl)}"
            alt="${escapeAttribute(message.imageName || '图片')}"
            data-image-preview="true"
            data-image-url="${escapeAttribute(message.imageUrl)}"
            data-image-label="${escapeAttribute(message.imageName || '图片预览')}"
          />
          <div class="message-content">${escapeHtml(message.imageName || '图片')}</div>
        `
        : `<div class="message-content">${escapeHtml(message.text)}</div>`;
    bubble.innerHTML = `
      ${replyBlock}
      ${body}
      <div class="message-meta">
        <span>${formatDateTime(message.createdAt)}</span>
        ${mine ? `<span class="message-receipt">${escapeHtml(getReceiptText(message, state.activeConversation.type))}</span>` : ''}
      </div>
    `;

    row.appendChild(bubble);
    messageList.appendChild(row);
  }

  messageList.scrollTop = messageList.scrollHeight;
  renderMessageContextMenu();
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
      <span>${escapeHtml(contact.nickname)}${contact.isAssistant ? ' <span class="badge">AI</span>' : ''} <span class="meta">@${escapeHtml(contact.account)}</span></span>
    `;
    groupMemberList.appendChild(label);
  }
}

function setReplyTarget(messageId) {
  const message = state.messages.find((item) => item.id === messageId);
  if (!message || message.isRecalled) {
    return;
  }

  state.replyToMessageId = messageId;
  renderReplyPreview();
  messageInput?.focus();
}

function clearReplyTarget() {
  state.replyToMessageId = null;
  renderReplyPreview();
}

function renderReplyPreview() {
  if (!replyPreview) {
    return;
  }

  const message = state.messages.find((item) => item.id === state.replyToMessageId);
  if (!message) {
    replyPreview.classList.add('hidden');
    replyPreview.innerHTML = '';
    return;
  }

  const senderName = message.sender?.nickname || '未知用户';
  const previewText = message.type === 'image'
    ? `[图片] ${message.imageName || '图片'}`
    : message.text;
  replyPreview.classList.remove('hidden');
  replyPreview.innerHTML = `
    <div class="reply-preview-copy">
      <strong>回复 ${escapeHtml(senderName)}</strong>
      <span>${escapeHtml(previewText || '消息')}</span>
    </div>
    <button class="ghost-btn" type="button" data-clear-reply>取消</button>
  `;
  replyPreview.querySelector('[data-clear-reply]')?.addEventListener('click', () => {
    clearReplyTarget();
  });
}

function onMessageBubbleContextMenu(event) {
  const bubble = event.target.closest('.message-bubble');
  if (!bubble) {
    closeMessageContextMenu();
    return;
  }

  const messageId = bubble.dataset.messageBubbleId;
  const message = state.messages.find((item) => item.id === messageId);
  if (!message) {
    closeMessageContextMenu();
    return;
  }

  const actions = [];
  if (!message.isRecalled) {
    actions.push({ key: 'reply', label: '回复' });
  }
  if (message.senderId === state.session?.user?.id && !message.isRecalled) {
    actions.push({ key: 'recall', label: '撤回', danger: true });
  }

  if (actions.length === 0) {
    closeMessageContextMenu();
    return;
  }

  event.preventDefault();
  state.messageContextMenu = {
    messageId,
    x: event.clientX,
    y: event.clientY,
    actions,
  };
  renderMessageContextMenu();
}

function renderMessageContextMenu() {
  if (!messageContextMenu) {
    return;
  }

  const menu = state.messageContextMenu;
  if (!menu) {
    messageContextMenu.classList.add('hidden');
    messageContextMenu.innerHTML = '';
    return;
  }

  messageContextMenu.innerHTML = menu.actions
    .map((action) => `
      <button
        class="message-context-action ${action.danger ? 'danger' : ''}"
        type="button"
        data-message-menu-action="${escapeAttribute(action.key)}"
        data-message-id="${escapeAttribute(menu.messageId)}"
      >
        ${escapeHtml(action.label)}
      </button>
    `)
    .join('');
  messageContextMenu.classList.remove('hidden');

  const menuWidth = 160;
  const estimatedHeight = menu.actions.length * 42 + 12;
  const left = Math.min(menu.x, window.innerWidth - menuWidth - 12);
  const top = Math.min(menu.y, window.innerHeight - estimatedHeight - 12);
  messageContextMenu.style.left = `${Math.max(12, left)}px`;
  messageContextMenu.style.top = `${Math.max(12, top)}px`;
}

function closeMessageContextMenu() {
  state.messageContextMenu = null;
  if (!messageContextMenu) {
    return;
  }
  messageContextMenu.classList.add('hidden');
  messageContextMenu.innerHTML = '';
}

async function recallMessage(messageId) {
  if (!state.activeConversation) {
    return;
  }

  const response = await api(`/api/conversations/${state.activeConversation.id}/messages/${messageId}/recall`, {
    method: 'POST',
  });
  closeMessageContextMenu();
  upsertMessage(response.message);
  applyConversationUpdate(response.conversation);
  if (state.replyToMessageId === messageId) {
    clearReplyTarget();
  }
  render();
  showToast('消息已撤回');
}

function jumpToMessage(messageId) {
  const target = messageList.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
  if (!target) {
    return;
  }

  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.add('message-row-highlight');
  window.setTimeout(() => {
    target.classList.remove('message-row-highlight');
  }, 1600);
}

function applyConversationUpdate(conversation) {
  if (!conversation.memberIds?.includes(state.session.user.id)) {
    state.conversations = state.conversations.filter((item) => item.id !== conversation.id);
    if (state.activeConversation?.id === conversation.id) {
      state.activeConversation = null;
      state.messages = [];
    }
    return;
  }
  mergeConversation(conversation);
  if (state.groupProfileConversation?.id === conversation.id) {
    state.groupProfileConversation = {
      ...state.groupProfileConversation,
      ...conversation,
    };
  }
  if (state.activeConversation?.id === conversation.id) {
    state.activeConversation = {
      ...state.activeConversation,
      ...conversation,
    };
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
        replyToMessageId: state.replyToMessageId,
      },
    });
    messageInput.value = '';
    clearReplyTarget();
    applyConversationUpdate(response.conversation);
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
        replyToMessageId: state.replyToMessageId,
      },
    });
    clearReplyTarget();
    applyConversationUpdate(response.conversation);
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

function openAvatarViewer(url, label = '头像预览') {
  if (!avatarViewDialog || !avatarViewImage || !url) {
    return;
  }

  avatarViewImage.src = url;
  avatarViewImage.alt = label;
  avatarViewDialog.showModal();
}

function closeAvatarViewer() {
  if (!avatarViewDialog || !avatarViewImage) {
    return;
  }

  if (avatarViewDialog.open) {
    avatarViewDialog.close();
  }

  avatarViewImage.removeAttribute('src');
}

function onDocumentClick(event) {
  const messageMenuAction = event.target.closest('[data-message-menu-action]');
  if (messageMenuAction) {
    event.preventDefault();
    const action = messageMenuAction.dataset.messageMenuAction;
    const messageId = messageMenuAction.dataset.messageId;
    closeMessageContextMenu();
    if (action === 'reply') {
      setReplyTarget(messageId);
      return;
    }
    if (action === 'recall') {
      recallMessage(messageId).catch(handleError);
      return;
    }
  }

  if (!event.target.closest('#message-context-menu')) {
    closeMessageContextMenu();
  }

  const editGroupAvatarTrigger = event.target.closest('[data-edit-group-avatar]');
  if (editGroupAvatarTrigger) {
    event.preventDefault();
    groupAvatarInput?.click();
    return;
  }

  const editGroupNameTrigger = event.target.closest('[data-edit-group-name]');
  if (editGroupNameTrigger) {
    event.preventDefault();
    promptRenameGroup().catch(handleError);
    return;
  }

  const addGroupMemberTrigger = event.target.closest('[data-add-group-member-id]');
  if (addGroupMemberTrigger) {
    event.preventDefault();
    addGroupMember(addGroupMemberTrigger.dataset.addGroupMemberId).catch(handleError);
    return;
  }

  const addFriendTrigger = event.target.closest('[data-add-friend-id]');
  if (addFriendTrigger) {
    event.preventDefault();
    addFriend(addFriendTrigger.dataset.addFriendId).catch(handleError);
    return;
  }

  const jumpTrigger = event.target.closest('[data-jump-message-id]');
  if (jumpTrigger) {
    event.preventDefault();
    jumpToMessage(jumpTrigger.dataset.jumpMessageId);
    return;
  }

  const kickTrigger = event.target.closest('[data-kick-member-id]');
  if (kickTrigger) {
    event.preventDefault();
    removeGroupMember(kickTrigger.dataset.kickMemberId).catch(handleError);
    return;
  }

  const trigger = event.target.closest('[data-avatar-preview]');
  if (!trigger) {
    const imageTrigger = event.target.closest('[data-image-preview]');
    if (!imageTrigger) {
      return;
    }
    event.preventDefault();
    openAvatarViewer(imageTrigger.dataset.imageUrl, imageTrigger.dataset.imageLabel || '图片预览');
    return;
  }

  const url = trigger.dataset.avatarUrl;
  if (!url) {
    return;
  }

  event.preventDefault();
  openAvatarViewer(url, trigger.dataset.avatarLabel || '头像预览');
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
  const mergedConversation = index === -1
    ? conversation
    : {
        ...state.conversations[index],
        ...conversation,
        agentOnline: conversation.agentOnline ?? state.conversations[index].agentOnline,
      };
  if (index === -1) {
    state.conversations.unshift(mergedConversation);
  } else {
    state.conversations[index] = mergedConversation;
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
  if (latest.isRecalled) {
    return '一条消息已撤回';
  }
  if (latest.type === 'image') {
    return `[图片] ${latest.imageName || '图片'}`;
  }
  return latest.text || '暂无消息';
}

function getReplyPreviewText(message) {
  if (message.isRecalled) {
    return '原消息已撤回';
  }
  if (message.type === 'image') {
    return `[图片] ${message.imageName || '图片'}`;
  }
  return message.text || '消息';
}

function getConversationMeta(conversation) {
  if (conversation.isAssistant) {
    return conversation.agentOnline
      ? 'AI 助手 · 本地 agent 已连接'
      : 'AI 助手 · 本地 agent 未连接';
  }
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

function renderAvatar(user, size = '', options = {}) {
  const classes = ['avatar'];
  if (size) {
    classes.push(size);
  }

  const initials = getInitials(user?.nickname || user?.account || '?');
  const label = escapeAttribute(user?.nickname || user?.account || '头像');
  const previewAttrs = user?.avatarUrl && (options.preview ?? true)
    ? ` data-avatar-preview="true" data-avatar-url="${escapeAttribute(user.avatarUrl)}" data-avatar-label="${label}" tabindex="0" role="button"`
    : '';
  const content = user?.avatarUrl
    ? `<img src="${escapeAttribute(user.avatarUrl)}" alt="${label}" />`
    : escapeHtml(initials);

  return `<div class="${classes.join(' ')}"${previewAttrs}>${content}</div>`;
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
  closeMessageContextMenu();
  closeGroupProfile();
  state.selectedRememberedUserId = state.session?.user?.id || state.selectedRememberedUserId;
  state.manualLoginEntry = false;
  state.rememberedAccounts = loadRememberedAccounts();
  state.session = null;
  state.contacts = [];
  state.discoverUsers = [];
  state.invites = [];
  state.adminUsers = [];
  state.conversations = [];
  state.messages = [];
  state.activeConversation = null;
  state.replyToMessageId = null;
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
