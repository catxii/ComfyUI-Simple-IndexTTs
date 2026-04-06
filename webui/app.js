const state = {
  voices: [],
  roles: [],
  lines: [],
  settings: {
    localFilesOnly: true,
    outputPrefix: "indextts_ui",
    mergeSilenceMs: 300,
  },
  emotionPresets: [],
  mergeResult: null,
  downloadList: [],
  mergedAudios: [],
  mergeTask: null,
  voicePickerRoleId: "",
  isGeneratingAll: false,
  batchGenerationTask: null,
  currentProjectId: "",
  currentProjectName: "",
  lastSavedAt: "",
  lanShare: {
    enabled: false,
    url: "",
    ips: [],
    port: 8192,
    error: "",
  },
  auth: {
    requireAuth: false,
    authenticated: false,
    username: "",
    isOwner: false,
    mode: "login",
  },
};

const GENERATION_POLL_INTERVAL_MS = 600;
const AVATAR_BASE_URL = "https://api.dicebear.com/9.x/thumbs/svg";
const VOICE_PREVIEW_SIGNATURE_VERSION = 4;
const EMOTION_PRESET_SIGNATURE_VERSION = 2;
const WORKSPACE_STORAGE_KEY = "indextts_ui_state";
const PROJECTS_STORAGE_KEY = "indextts_ui_projects";
const AUTO_SAVE_INTERVAL_MS = 60 * 1000;
let generationPollTimer = null;
let autoSaveTimer = null;
let activePronunciationLineId = "";
const lineViewCache = new Map();
const voiceViewCache = new Map();
const expandedRoleIds = new Set();
let pendingProjectCloseAfterSave = false;
const EMOTION_EMOJIS = {
  平静: "🙂",
  温柔: "🥰",
  开心: "😄",
  激动: "🤩",
  生气: "😠",
  悲伤: "😢",
  惊讶: "😲",
  癫狂: "😵",
};
const DEFAULT_VOICE_PREVIEW_TEXTS = {
  平静: "这件事我已经知道了，我们按原计划继续推进就好。",
  温柔: "别担心，我会一直陪着你，我们慢慢来就好。",
  开心: "太好了，终于等到这个好消息了，我现在真的很开心。",
  激动: "就是现在，机会已经来了，我们立刻开始行动吧。",
  生气: "你这样做太过分了，我现在真的很生气。",
  悲伤: "说到这里，我还是有些难过，心里一直放不下。",
  惊讶: "什么？居然会变成这样，这真的太让人意外了。",
  癫狂: "哈哈哈，既然如此，那就让一切彻底失控吧！",
};

const els = {
  roleList: document.querySelector("#roleList"),
  lineList: document.querySelector("#lineList"),
  addRoleBtn: document.querySelector("#addRoleBtn"),
  addLineBtn: document.querySelector("#addLineBtn"),
  openProjectManagerBtn: document.querySelector("#openProjectManagerBtn"),
  saveCurrentProjectBtn: document.querySelector("#saveCurrentProjectBtn"),
  closeCurrentProjectBtn: document.querySelector("#closeCurrentProjectBtn"),
  clearCurrentDialoguesBtn: document.querySelector("#clearCurrentDialoguesBtn"),
  pasteScriptBtn: document.querySelector("#pasteScriptBtn"),
  insertDemoBtn: document.querySelector("#insertDemoBtn"),
  generateAllBtn: document.querySelector("#generateAllBtn"),
  generateMissingBtn: document.querySelector("#generateMissingBtn"),
  mergeBtn: document.querySelector("#mergeBtn"),
  openMergedAudiosBtn: document.querySelector("#openMergedAudiosBtn"),
  clearOutputsBtn: document.querySelector("#clearOutputsBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  importBtn: document.querySelector("#importBtn"),
  importInput: document.querySelector("#importInput"),
  openSettingsBtn: document.querySelector("#openSettingsBtn"),
  toggleLanShareBtn: null,
  lanShareMeta: null,
  lanShareLink: null,
  copyLanShareBtn: null,
  authEntryBtn: null,
  authLogoutEntryBtn: null,
  authModal: null,
  closeAuthModalBtn: null,
  authTitle: null,
  authHint: null,
  authUsername: null,
  authPassword: null,
  authSubmitBtn: null,
  authSwitchBtn: null,
  authLogoutBtn: null,
  loadModelBtn: document.querySelector("#loadModelBtn"),
  scriptImportModal: document.querySelector("#scriptImportModal"),
  closeScriptImportModalBtn: document.querySelector("#closeScriptImportModalBtn"),
  quickAddLineBtn: document.querySelector("#quickAddLineBtn"),
  importScriptBtn: document.querySelector("#importScriptBtn"),
  scriptInput: document.querySelector("#scriptInput"),
  currentProjectTitle: document.querySelector("#currentProjectTitle"),
  currentProjectTitleInput: document.querySelector("#currentProjectTitleInput"),
  saveWorkspaceBtn: document.querySelector("#saveWorkspaceBtn"),
  projectSaveStatus: document.querySelector("#projectSaveStatus"),
  projectManagerModal: document.querySelector("#projectManagerModal"),
  closeProjectManagerModalBtn: document.querySelector("#closeProjectManagerModalBtn"),
  projectManagerList: document.querySelector("#projectManagerList"),
  saveProjectModal: document.querySelector("#saveProjectModal"),
  closeSaveProjectModalBtn: document.querySelector("#closeSaveProjectModalBtn"),
  cancelSaveProjectBtn: document.querySelector("#cancelSaveProjectBtn"),
  confirmSaveProjectBtn: document.querySelector("#confirmSaveProjectBtn"),
  saveProjectNameInput: document.querySelector("#saveProjectNameInput"),
  settingsModal: document.querySelector("#settingsModal"),
  closeSettingsModalBtn: document.querySelector("#closeSettingsModalBtn"),
  pronunciationModal: document.querySelector("#pronunciationModal"),
  closePronunciationModalBtn: document.querySelector("#closePronunciationModalBtn"),
  cancelPronunciationBtn: document.querySelector("#cancelPronunciationBtn"),
  clearPronunciationBtn: document.querySelector("#clearPronunciationBtn"),
  savePronunciationBtn: document.querySelector("#savePronunciationBtn"),
  pronunciationInput: document.querySelector("#pronunciationInput"),
  pronunciationPreview: document.querySelector("#pronunciationPreview"),
  pronunciationCharList: document.querySelector("#pronunciationCharList"),
  localFilesOnly: document.querySelector("#localFilesOnly"),
  outputPrefix: document.querySelector("#outputPrefix"),
  mergeSilenceMs: document.querySelector("#mergeSilenceMs"),
  lineCountHint: document.querySelector("#lineCountHint"),
  mergeResultCard: document.querySelector("#mergeResultCard"),
  mergeResultAudio: document.querySelector("#mergeResultAudio"),
  mergeResultDownload: document.querySelector("#mergeResultDownload"),
  mergeResultMeta: document.querySelector("#mergeResultMeta"),
  downloadListModal: document.querySelector("#downloadListModal"),
  closeDownloadListModalBtn: document.querySelector("#closeDownloadListModalBtn"),
  downloadListBody: document.querySelector("#downloadListBody"),
  mergedAudiosModal: document.querySelector("#mergedAudiosModal"),
  closeMergedAudiosModalBtn: document.querySelector("#closeMergedAudiosModalBtn"),
  mergedAudiosBody: document.querySelector("#mergedAudiosBody"),
  mergeProgressPanel: document.querySelector("#mergeProgressPanel"),
  mergeProgressTitle: document.querySelector("#mergeProgressTitle"),
  mergeProgressText: document.querySelector("#mergeProgressText"),
  mergeProgressFill: document.querySelector("#mergeProgressFill"),
  mergeProgressDescription: document.querySelector("#mergeProgressDescription"),
  taskDock: document.querySelector("#taskDock"),
  taskDockTitle: document.querySelector("#taskDockTitle"),
  taskDockCount: document.querySelector("#taskDockCount"),
  taskDockProgress: document.querySelector("#taskDockProgress"),
  taskDockDescription: document.querySelector("#taskDockDescription"),
  roleTemplate: document.querySelector("#roleTemplate"),
  lineTemplate: document.querySelector("#lineTemplate"),
  toast: document.querySelector("#toast"),
  voiceCenterBtn: null,
  voiceCenterModal: null,
  closeVoiceCenterModalBtn: null,
  voiceUploadInput: null,
  voiceUploadBtn: null,
  voicePreviewText: null,
  voiceCenterList: null,
};

function anyModalOpen() {
  return [els.scriptImportModal, els.downloadListModal, els.mergedAudiosModal, els.voiceCenterModal, els.settingsModal, els.projectManagerModal, els.saveProjectModal, els.pronunciationModal]
    .filter(Boolean)
    .some((modal) => !modal.classList.contains("hidden"));
}

function syncBodyModalLock() {
  document.body.classList.toggle("modal-open", anyModalOpen());
}

function openScriptImportModal() {
  els.scriptImportModal.classList.remove("hidden");
  els.scriptImportModal.setAttribute("aria-hidden", "false");
  syncBodyModalLock();
  requestAnimationFrame(() => {
    els.scriptInput.focus();
  });
}

function closeScriptImportModal() {
  els.scriptImportModal.classList.add("hidden");
  els.scriptImportModal.setAttribute("aria-hidden", "true");
  syncBodyModalLock();
}

function formatEmotionLabel(emotion) {
  const emoji = EMOTION_EMOJIS[emotion];
  return emoji ? `${emoji} ${emotion}` : emotion;
}

function stopVoicePreviewPlayback(targetVoiceId = "") {
  if (!els.voiceCenterList) return;
  const players = els.voiceCenterList.querySelectorAll("[data-voice-player]");
  players.forEach((player) => {
    if (!(player instanceof HTMLAudioElement)) return;
    if (targetVoiceId && player.dataset.voicePlayer !== targetVoiceId) return;
    try {
      player.pause();
      player.currentTime = 0;
    } catch (_) {
      // Ignore player reset failures from detached or not-yet-ready nodes.
    }
  });
}

function loadAndPlayVoicePreview(player, audioUrl) {
  if (!(player instanceof HTMLAudioElement) || !audioUrl) return;
  try {
    player.pause();
  } catch (_) {
    // noop
  }
  player.src = audioUrl;
  player.load();
  try {
    player.currentTime = 0;
  } catch (_) {
    // noop
  }
  player.play().catch(() => {});
}

function getCachedVoicePreview(voice, emotionPreset = "") {
  if (!voice) return null;
  const targetEmotion = emotionPreset || voice.previewActiveEmotion || "";
  if (!targetEmotion) return null;
  const cached = voice.previews?.[targetEmotion];
  const signature = getVoicePreviewSignature(voice, targetEmotion);
  if (cached?.audioUrl && cached.previewSignature === signature) {
    return { ...cached, emotionPreset: targetEmotion };
  }
  return null;
}

function getSingleLineDownloadInfo(line) {
  if (!line?.generatedFile) return null;
  const wavFilename = line.generatedFile.replace(/\.[^.]+$/, ".wav");
  return {
    url: `/indextts-ui/api/generated-wav/${encodeURIComponent(line.generatedFile)}`,
    filename: wavFilename,
  };
}

function snapshotVoicePreviewPlayback() {
  const states = new Map();
  if (!els.voiceCenterList) return states;
  const players = els.voiceCenterList.querySelectorAll("[data-voice-player]");
  players.forEach((player) => {
    if (!(player instanceof HTMLAudioElement)) return;
    const voiceId = player.dataset.voicePlayer || "";
    if (!voiceId || !player.src) return;
    states.set(voiceId, {
      src: player.currentSrc || player.src,
      currentTime: Number.isFinite(player.currentTime) ? player.currentTime : 0,
      shouldResume: !player.paused && !player.ended,
      volume: player.volume,
      muted: player.muted,
      playbackRate: player.playbackRate,
    });
  });
  return states;
}

function restoreVoicePreviewPlayback(player, snapshot) {
  if (!(player instanceof HTMLAudioElement) || !snapshot?.src) return;
  player.src = snapshot.src;
  player.load();
  player.volume = snapshot.volume ?? 1;
  player.muted = Boolean(snapshot.muted);
  player.playbackRate = snapshot.playbackRate || 1;
  const applyState = () => {
    try {
      const duration = Number.isFinite(player.duration) ? player.duration : 0;
      player.currentTime = duration > 0 ? Math.min(snapshot.currentTime || 0, Math.max(duration - 0.05, 0)) : (snapshot.currentTime || 0);
    } catch (_) {
      // noop
    }
    if (snapshot.shouldResume) {
      player.play().catch(() => {});
    }
    player.removeEventListener("loadedmetadata", applyState);
    player.removeEventListener("canplay", applyState);
  };
  player.addEventListener("loadedmetadata", applyState);
  player.addEventListener("canplay", applyState);
}

function openDownloadListModal() {
  els.downloadListModal.classList.remove("hidden");
  els.downloadListModal.setAttribute("aria-hidden", "false");
  syncBodyModalLock();
}

function closeDownloadListModal() {
  els.downloadListModal.classList.add("hidden");
  els.downloadListModal.setAttribute("aria-hidden", "true");
  syncBodyModalLock();
}

function openMergedAudiosModal() {
  renderMergedAudiosModal();
  els.mergedAudiosModal.classList.remove("hidden");
  els.mergedAudiosModal.setAttribute("aria-hidden", "false");
  syncBodyModalLock();
}

function closeMergedAudiosModal() {
  els.mergedAudiosModal.classList.add("hidden");
  els.mergedAudiosModal.setAttribute("aria-hidden", "true");
  syncBodyModalLock();
}

function openSettingsModal() {
  els.settingsModal.classList.remove("hidden");
  els.settingsModal.setAttribute("aria-hidden", "false");
  fillSettingsForm();
  syncBodyModalLock();
}

function closeSettingsModal() {
  els.settingsModal.classList.add("hidden");
  els.settingsModal.setAttribute("aria-hidden", "true");
  syncBodyModalLock();
}

function openProjectManagerModal() {
  renderProjectManager();
  els.projectManagerModal.classList.remove("hidden");
  els.projectManagerModal.setAttribute("aria-hidden", "false");
  syncBodyModalLock();
}

function closeProjectManagerModal() {
  els.projectManagerModal.classList.add("hidden");
  els.projectManagerModal.setAttribute("aria-hidden", "true");
  syncBodyModalLock();
}

function openSaveProjectModal({ closeAfterSave = false } = {}) {
  pendingProjectCloseAfterSave = closeAfterSave;
  els.saveProjectNameInput.value = state.currentProjectName || "";
  els.saveProjectModal.classList.remove("hidden");
  els.saveProjectModal.setAttribute("aria-hidden", "false");
  syncBodyModalLock();
  requestAnimationFrame(() => {
    els.saveProjectNameInput.focus();
    els.saveProjectNameInput.select();
  });
}

function closeSaveProjectModal() {
  pendingProjectCloseAfterSave = false;
  els.saveProjectModal.classList.add("hidden");
  els.saveProjectModal.setAttribute("aria-hidden", "true");
  syncBodyModalLock();
}

function openVoiceCenterModal(roleId = "") {
  state.voicePickerRoleId = roleId || "";
  els.voiceCenterModal.classList.remove("hidden");
  els.voiceCenterModal.setAttribute("aria-hidden", "false");
  syncBodyModalLock();
  renderVoiceCenter();
}

function closeVoiceCenterModal() {
  if (!els.voiceCenterModal) return;
  state.voicePickerRoleId = "";
  els.voiceCenterModal.classList.add("hidden");
  els.voiceCenterModal.setAttribute("aria-hidden", "true");
  syncBodyModalLock();
}

function ensureToolbarButtons() {
  if (els.generateMissingBtn) return;
  const button = document.createElement("button");
  button.id = "generateMissingBtn";
  button.className = "secondary";
  button.type = "button";
  button.textContent = "仅批量生成未生成";
  els.generateAllBtn.insertAdjacentElement("afterend", button);
  els.generateMissingBtn = button;
}

function ensureLanShareUI() {
  if (els.toggleLanShareBtn || !els.settingsModal) return;
  const settingsPanel = els.settingsModal.querySelector(".settings-panel");
  if (!settingsPanel) return;

  const panel = document.createElement("section");
  panel.className = "settings-section lan-share-settings-section";
  panel.innerHTML = `
    <div class="settings-section-head">
      <h4>局域网共享</h4>
      <p>开启后，同一局域网内的用户可以访问这台电脑上的网页和音频生成服务。</p>
    </div>
    <div class="lan-share-panel settings-lan-share-panel">
      <button id="toggleLanShareBtn" class="secondary hero-share-btn" type="button">开启局域网共享</button>
      <div id="lanShareMeta" class="lan-share-meta hidden">
        <a id="lanShareLink" class="lan-share-link" href="#" target="_blank" rel="noreferrer noopener"></a>
        <button id="copyLanShareBtn" class="secondary lan-share-copy-btn" type="button">复制地址</button>
      </div>
    </div>
  `;
  const aboutSection = Array.from(settingsPanel.querySelectorAll(".settings-section"))
    .find((section) => section.querySelector(".about-card"));
  settingsPanel.insertBefore(panel, aboutSection || null);

  els.toggleLanShareBtn = panel.querySelector("#toggleLanShareBtn");
  els.lanShareMeta = panel.querySelector("#lanShareMeta");
  els.lanShareLink = panel.querySelector("#lanShareLink");
  els.copyLanShareBtn = panel.querySelector("#copyLanShareBtn");
}

function ensureAuthUI() {
  if (els.authModal) return;
  const modal = document.createElement("div");
  modal.id = "authModal";
  modal.className = "modal hidden";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="modal-backdrop" data-close-modal="auth"></div>
    <div class="modal-panel modal-panel-narrow" role="dialog" aria-modal="true" aria-labelledby="authTitle">
      <div class="modal-head">
        <div>
          <h3 id="authTitle">登录局域网账户</h3>
          <p id="authHint">局域网用户需要先注册或登录，数据会保存在这台电脑本地。</p>
        </div>
        <button id="closeAuthModalBtn" class="icon" type="button" title="关闭">×</button>
      </div>
      <div class="field-stack">
        <span>用户名</span>
        <input id="authUsername" type="text" maxlength="40" placeholder="输入用户名">
      </div>
      <div class="field-stack">
        <span>密码</span>
        <input id="authPassword" type="password" maxlength="128" placeholder="输入密码">
      </div>
      <div class="modal-actions auth-actions">
        <button id="authSwitchBtn" class="secondary" type="button">没有账号？去注册</button>
        <button id="authSubmitBtn" class="primary" type="button">登录</button>
      </div>
      <div class="modal-actions auth-actions auth-actions-logout hidden" id="authLogoutRow">
        <button id="authLogoutBtn" class="secondary danger-soft" type="button">退出登录</button>
      </div>
    </div>
  `;
  document.body.append(modal);

  els.authModal = modal;
  els.closeAuthModalBtn = modal.querySelector("#closeAuthModalBtn");
  els.authTitle = modal.querySelector("#authTitle");
  els.authHint = modal.querySelector("#authHint");
  els.authUsername = modal.querySelector("#authUsername");
  els.authPassword = modal.querySelector("#authPassword");
  els.authSubmitBtn = modal.querySelector("#authSubmitBtn");
  els.authSwitchBtn = modal.querySelector("#authSwitchBtn");
  els.authLogoutBtn = modal.querySelector("#authLogoutBtn");
  els.authLogoutRow = modal.querySelector("#authLogoutRow");
}

function ensureAuthEntryUI() {
  if (els.authEntryBtn || !els.openSettingsBtn) return;
  const heroActions = els.openSettingsBtn.parentElement;
  if (!heroActions) return;

  const wrap = document.createElement("div");
  wrap.className = "hero-auth-entry";
  wrap.innerHTML = `
    <button id="authEntryBtn" class="secondary hero-account-btn" type="button">账户</button>
    <button id="authLogoutEntryBtn" class="secondary danger-soft hero-account-logout hidden" type="button">退出登录</button>
  `;
  heroActions.insertBefore(wrap, els.openSettingsBtn);

  els.authEntryBtn = wrap.querySelector("#authEntryBtn");
  els.authLogoutEntryBtn = wrap.querySelector("#authLogoutEntryBtn");
}

function openAuthModal() {
  ensureAuthUI();
  renderAuthState();
  els.authModal.classList.remove("hidden");
  els.authModal.setAttribute("aria-hidden", "false");
  syncBodyModalLock();
  requestAnimationFrame(() => {
    if (!state.auth.authenticated) {
      els.authUsername.focus();
    }
  });
}

function closeAuthModal() {
  if (!els.authModal) return;
  if (state.auth.requireAuth && !state.auth.authenticated) return;
  els.authModal.classList.add("hidden");
  els.authModal.setAttribute("aria-hidden", "true");
  syncBodyModalLock();
}

function renderAuthState() {
  if (!els.authModal) return;
  const isRegister = state.auth.mode === "register";
  const authenticated = Boolean(state.auth.authenticated);
  els.authTitle.textContent = authenticated ? `当前账户：${state.auth.username}` : (isRegister ? "注册局域网账户" : "登录局域网账户");
  els.authHint.textContent = authenticated
    ? "你已经登录，可以直接使用共享音色和生成服务。"
    : `局域网用户需要先注册或登录，数据会保存在这台电脑本地。管理员账户：admin / admin。当前模式：${isRegister ? "注册" : "登录"}。`;
  els.authUsername.disabled = authenticated;
  els.authPassword.disabled = authenticated;
  els.authSubmitBtn.classList.toggle("hidden", authenticated);
  els.authSwitchBtn.classList.toggle("hidden", authenticated);
  els.authLogoutRow.classList.toggle("hidden", !authenticated);
  els.authSubmitBtn.textContent = isRegister ? "注册并登录" : "登录";
  els.authSwitchBtn.textContent = isRegister ? "已有账号？去登录" : "没有账号？去注册";

  if (els.authEntryBtn) {
    if (state.auth.isOwner) {
      els.authEntryBtn.textContent = "本机账户";
    } else if (authenticated && state.auth.username) {
      els.authEntryBtn.textContent = `账户：${state.auth.username}`;
    } else {
      els.authEntryBtn.textContent = "登录 / 注册";
    }
  }

  if (els.authLogoutEntryBtn) {
    els.authLogoutEntryBtn.classList.toggle("hidden", !authenticated || Boolean(state.auth.isOwner));
  }
}

async function fetchAuthStatus() {
  const result = await fetchJson("/indextts-ui/api/auth-status");
  state.auth = { ...state.auth, ...(result || {}) };
  renderAuthState();
  if (state.auth.requireAuth && !state.auth.authenticated) {
    openAuthModal();
  }
  return state.auth;
}

async function submitAuthForm() {
  ensureAuthUI();
  const username = (els.authUsername.value || "").trim();
  const password = els.authPassword.value || "";
  if (!username || !password) {
    showToast("请先输入用户名和密码。", true);
    return;
  }
  const endpoint = state.auth.mode === "register" ? "/indextts-ui/api/register" : "/indextts-ui/api/login";
  setButtonBusy(els.authSubmitBtn, true, state.auth.mode === "register" ? "注册中..." : "登录中...");
  try {
    const result = await fetchJson(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    state.auth = { ...state.auth, ...(result || {}) };
    els.authPassword.value = "";
    renderAuthState();
    closeAuthModal();
    await syncVoicesFromServer({ migrateLegacy: true });
    renderAll();
    showToast(state.auth.mode === "register" ? "注册成功，已自动登录。" : "登录成功。");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    if (els.authSubmitBtn) {
      els.authSubmitBtn.disabled = false;
    }
    renderAuthState();
  }
}

async function logoutAuth() {
  try {
    await fetchJson("/indextts-ui/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  } catch (_) {
    // ignore
  }
  state.auth = { ...state.auth, authenticated: false, username: "", isOwner: false, requireAuth: true, mode: "login" };
  state.voices = [];
  renderAuthState();
  renderAll();
  openAuthModal();
}

function renderLanShare() {
  if (!els.toggleLanShareBtn || !els.lanShareMeta || !els.lanShareLink || !els.copyLanShareBtn) return;
  const share = state.lanShare || {};
  const hasUrl = Boolean(share.enabled && share.url);

  els.toggleLanShareBtn.textContent = share.enabled ? "关闭局域网共享" : "开启局域网共享";
  els.toggleLanShareBtn.classList.toggle("is-active", Boolean(share.enabled));
  els.lanShareMeta.classList.toggle("hidden", !hasUrl);

  if (hasUrl) {
    els.lanShareLink.href = share.url;
    els.lanShareLink.textContent = share.url;
    els.copyLanShareBtn.disabled = false;
  } else {
    els.lanShareLink.href = "#";
    els.lanShareLink.textContent = "";
    els.copyLanShareBtn.disabled = true;
  }
}

async function fetchLanShareStatus() {
  const result = await fetchJson("/indextts-ui/api/lan-share-status");
  state.lanShare = { ...state.lanShare, ...(result || {}) };
  renderLanShare();
  return state.lanShare;
}

async function toggleLanShare() {
  if (!els.toggleLanShareBtn) return;
  const shareEnabled = Boolean(state.lanShare?.enabled);
  setButtonBusy(els.toggleLanShareBtn, true, shareEnabled ? "关闭中..." : "开启中...");
  try {
    const result = await fetchJson(
      shareEnabled ? "/indextts-ui/api/stop-lan-share" : "/indextts-ui/api/start-lan-share",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port: state.lanShare?.port || 8192 }),
      },
    );
    state.lanShare = { ...state.lanShare, ...(result || {}) };
    renderLanShare();
    if (state.lanShare.enabled && state.lanShare.url) {
      showToast(`局域网共享已开启：${state.lanShare.url}`);
    } else {
      showToast("局域网共享已关闭");
    }
  } catch (error) {
    showToast(error.message, true);
    await fetchLanShareStatus().catch(() => {});
  } finally {
    if (els.toggleLanShareBtn) {
      els.toggleLanShareBtn.disabled = false;
    }
    renderLanShare();
  }
}

async function copyLanShareUrl() {
  const url = state.lanShare?.url || "";
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    showToast("局域网地址已复制");
  } catch (error) {
    showToast("复制失败，请手动复制地址", true);
  }
}

function removeLegacySettingsSliders() {
  document.querySelectorAll("#settingsModal .slider-field").forEach((node) => node.remove());
}

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function getAvatarSeed(value, fallback) {
  const normalized = (value || "").trim();
  return normalized || fallback;
}

function createAvatarUrl(seed) {
  const params = new URLSearchParams({
    seed,
    backgroundType: "gradientLinear",
    radius: "50",
  });
  return `${AVATAR_BASE_URL}?${params.toString()}`;
}

function createAvatarElement({ seed, fallbackSeed, className, alt }) {
  const avatar = document.createElement("img");
  avatar.className = className;
  avatar.alt = alt;
  avatar.loading = "lazy";
  avatar.decoding = "async";
  avatar.referrerPolicy = "no-referrer";
  avatar.src = createAvatarUrl(getAvatarSeed(seed, fallbackSeed));
  return avatar;
}

function createVoice(data = {}) {
  return {
    id: data.id || uid("voice"),
    name: data.name || `基础音色${state.voices.length + 1}`,
    audioFile: data.audioFile || "",
    audioUrl: data.audioUrl || "",
    ownerUsername: data.ownerUsername || "",
    isShared: Boolean(data.isShared),
    isProtected: Boolean(data.isProtected),
    canDelete: data.canDelete !== undefined ? Boolean(data.canDelete) : true,
    previews: data.previews || {},
    previewPendingEmotion: data.previewPendingEmotion || "",
    previewBatchPending: Boolean(data.previewBatchPending),
    previewBatchCurrentIndex: data.previewBatchCurrentIndex || 0,
    previewBatchTotal: data.previewBatchTotal || 0,
    previewActiveEmotion: data.previewActiveEmotion || "",
    previewActiveUrl: data.previewActiveUrl || "",
  };
}

function createRole(data = {}) {
  return {
    id: data.id || uid("role"),
    name: data.name || `角色${state.roles.length + 1}`,
    voiceId: data.voiceId || "",
    audioFile: data.audioFile || "",
    audioUrl: data.audioUrl || "",
    defaultEmotion: data.defaultEmotion || (state.emotionPresets[0] || "平静"),
  };
}

function createLine(data = {}) {
  const fallbackRoleId = state.roles[0]?.id || "";
  return {
    id: data.id || uid("line"),
    roleId: data.roleId || fallbackRoleId,
    emotionMode: data.emotionMode || "preset",
    emotionPreset: data.emotionPreset || (state.emotionPresets[0] || "平静"),
    emotionText: data.emotionText || "",
    text: data.text || "",
    generatedFile: data.generatedFile || "",
    generatedUrl: data.generatedUrl || "",
    durationSeconds: data.durationSeconds || null,
    streamPreviewFile: data.streamPreviewFile || "",
    streamPreviewUrl: data.streamPreviewUrl || "",
    streamPreviewDurationSeconds: data.streamPreviewDurationSeconds || null,
    streamAutoPlay: false,
    streamLastPlayedUrl: "",
    generatedSignature: data.generatedSignature || "",
    pendingTaskKey: data.pendingTaskKey || "",
    pendingSignature: data.pendingSignature || "",
    pendingProgress: data.pendingProgress ?? null,
    pendingDescription: data.pendingDescription || "",
    pendingUpdatedAt: data.pendingUpdatedAt ?? 0,
    isGenerating: false,
    audioSettings: normalizeLineAudioSettings(data.audioSettings),
    numberReadingMode: data.numberReadingMode || "default",
    pronunciationOverridesText: data.pronunciationOverridesText || "",
  };
}

function serializeLine(line) {
  const { isGenerating, ...rest } = line;
  return rest;
}

function serializeVoice(voice) {
  return {
    ...voice,
    previewPendingEmotion: "",
    previewBatchPending: false,
    previewBatchCurrentIndex: 0,
    previewBatchTotal: 0,
  };
}

function createWorkspaceSnapshot() {
  return {
    version: 1,
    currentProjectId: state.currentProjectId || "",
    currentProjectName: state.currentProjectName || "",
    lastSavedAt: state.lastSavedAt || "",
    voices: state.voices.map(serializeVoice),
    roles: state.roles,
    lines: state.lines.map(serializeLine),
    settings: state.settings,
  };
}

function readSavedProjects() {
  const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Failed to load saved projects", error);
    return [];
  }
}

function writeSavedProjects(projects) {
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
}

function upsertSavedProject(snapshot) {
  if (!snapshot.currentProjectName) return;

  const projects = readSavedProjects();
  const now = new Date().toISOString();
  const projectId = snapshot.currentProjectId || uid("project");
  const existingIndex = projects.findIndex((project) => project.id === projectId);
  const nextRecord = {
    id: projectId,
    name: snapshot.currentProjectName,
    createdAt: existingIndex >= 0 ? projects[existingIndex].createdAt : now,
    updatedAt: now,
    payload: {
      version: snapshot.version || 1,
      voices: snapshot.voices,
      roles: snapshot.roles,
      lines: snapshot.lines,
      settings: snapshot.settings,
    },
  };

  if (existingIndex >= 0) {
    projects.splice(existingIndex, 1, nextRecord);
  } else {
    projects.push(nextRecord);
  }

  writeSavedProjects(projects);
}

function saveState({ skipProjectSync = false, touchTimestamp = true } = {}) {
  if (touchTimestamp) {
    state.lastSavedAt = new Date().toISOString();
  }
  const snapshot = createWorkspaceSnapshot();
  localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(snapshot));
  if (!skipProjectSync && snapshot.currentProjectName) {
    upsertSavedProject(snapshot);
  }
  renderProjectSaveStatus();
  renderLineCountHint();
}

function loadState() {
  const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state.voices = Array.isArray(parsed.voices) ? parsed.voices.map(createVoice) : [];
    state.roles = Array.isArray(parsed.roles) ? parsed.roles.map(createRole) : [];
    state.lines = Array.isArray(parsed.lines) ? parsed.lines.map(createLine) : [];
    state.settings = { ...state.settings, ...(parsed.settings || {}) };
    state.currentProjectId = parsed.currentProjectId || "";
    state.currentProjectName = parsed.currentProjectName || "";
    state.lastSavedAt = parsed.lastSavedAt || "";
    state.lines.forEach((line) => {
      line.isGenerating = Boolean(line.pendingTaskKey);
    });
    migrateLegacyRoleVoices();
  } catch (error) {
    console.warn("Failed to load saved UI state", error);
  }
}

function isMeaningfulRole(role) {
  const name = (role?.name || "").trim();
  return Boolean(role?.voiceId || role?.audioFile || (name && !/^角色\d+$/.test(name)));
}

function isWorkspaceMeaningful() {
  return (
    state.voices.length > 0
    || state.roles.some((role) => isMeaningfulRole(role))
    || state.lines.some((line) => (
      (line.text || "").trim()
      || line.generatedUrl
      || line.generatedFile
      || line.pendingTaskKey
    ))
  );
}

function resetWorkspace({ keepProjectIdentity = false } = {}) {
  state.voices = [];
  state.roles = [];
  state.lines = [];
  state.mergeResult = null;
  state.downloadList = [];
  state.voicePickerRoleId = "";
  state.isGeneratingAll = false;
  state.batchGenerationTask = null;
  expandedRoleIds.clear();
  if (!keepProjectIdentity) {
    state.currentProjectId = "";
    state.currentProjectName = "";
  }
}

function loadProjectSnapshot(payload, { projectId = "", projectName = "" } = {}) {
  resetWorkspace({ keepProjectIdentity: false });
  state.currentProjectId = projectId;
  state.currentProjectName = projectName;
  state.voices = Array.isArray(payload?.voices) ? payload.voices.map(createVoice) : [];
  state.roles = Array.isArray(payload?.roles) ? payload.roles.map(createRole) : [];
  state.lines = Array.isArray(payload?.lines) ? payload.lines.map(createLine) : [];
  state.settings = { ...state.settings, ...(payload?.settings || {}) };
  state.lines.forEach((line) => {
    line.isGenerating = Boolean(line.pendingTaskKey);
  });
  migrateLegacyRoleVoices();
}

function formatProjectTime(isoString) {
  if (!isoString) return "刚刚保存";
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return "刚刚保存";
  return parsed.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLastSavedTime(isoString) {
  if (!isoString) return "未保存";
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return "未保存";
  return parsed.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function showToast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  els.toast.style.background = isError ? "rgba(185, 47, 47, 0.94)" : "rgba(21, 35, 59, 0.92)";
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.add("hidden"), 3200);
}

function renderProjectTitle() {
  if (!els.currentProjectTitle || !els.currentProjectTitleInput) return;
  const title = (state.currentProjectName || "").trim() || "未命名";
  els.currentProjectTitle.textContent = title;
  els.currentProjectTitle.classList.toggle("is-empty", !state.currentProjectName.trim());
  if (document.activeElement !== els.currentProjectTitleInput) {
    els.currentProjectTitleInput.value = state.currentProjectName || "";
  }
}

function renderProjectSaveStatus() {
  if (!els.projectSaveStatus) return;
  els.projectSaveStatus.textContent = `最后保存：${formatLastSavedTime(state.lastSavedAt)}`;
}

function saveWorkspaceNow({ showNotice = true, skipProjectSync = false } = {}) {
  saveState({ skipProjectSync });
  if (showNotice) {
    showToast("保存成功");
  }
}

function startAutoSave() {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
  }
  autoSaveTimer = setInterval(() => {
    if (!document.hidden && isWorkspaceMeaningful()) {
      saveState({ skipProjectSync: true });
    }
  }, AUTO_SAVE_INTERVAL_MS);
}

function beginProjectTitleEdit() {
  if (!els.currentProjectTitle || !els.currentProjectTitleInput) return;
  els.currentProjectTitle.classList.add("hidden");
  els.currentProjectTitleInput.classList.remove("hidden");
  els.currentProjectTitleInput.value = state.currentProjectName || "";
  requestAnimationFrame(() => {
    els.currentProjectTitleInput.focus();
    els.currentProjectTitleInput.select();
  });
}

function finishProjectTitleEdit({ commit = true } = {}) {
  if (!els.currentProjectTitle || !els.currentProjectTitleInput) return;
  const previousName = (state.currentProjectName || "").trim();
  const nextName = (els.currentProjectTitleInput.value || "").trim();
  els.currentProjectTitleInput.classList.add("hidden");
  els.currentProjectTitle.classList.remove("hidden");

  if (!commit) {
    els.currentProjectTitleInput.value = state.currentProjectName || "";
    renderProjectTitle();
    return;
  }

  state.currentProjectName = nextName;
  if (nextName && !state.currentProjectId) {
    state.currentProjectId = uid("project");
  }
  saveState({ skipProjectSync: !nextName });
  renderProjectTitle();
  if (!els.projectManagerModal.classList.contains("hidden")) {
    renderProjectManager();
  }
  if (nextName !== previousName) {
    showToast(nextName ? `项目“${nextName}”已保存。` : "项目名称已清空，当前显示为未命名。");
  }
}

function renderProjectManager() {
  if (!els.projectManagerList) return;
  els.projectManagerList.innerHTML = "";

  const projects = readSavedProjects().sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  if (!projects.length) {
    const empty = document.createElement("div");
    empty.className = "project-empty";
    empty.textContent = "还没有保存过的历史项目。";
    els.projectManagerList.append(empty);
    return;
  }

  projects.forEach((project) => {
    const row = document.createElement("article");
    row.className = "project-item";
    if (project.id === state.currentProjectId) {
      row.classList.add("is-current");
    }

    const lineCount = Array.isArray(project.payload?.lines) ? project.payload.lines.length : 0;
    const roleCount = Array.isArray(project.payload?.roles) ? project.payload.roles.length : 0;
    row.innerHTML = `
      <div class="project-item-main">
        <div class="project-item-title-row">
          <strong class="project-item-title">${project.name || "未命名项目"}</strong>
          ${project.id === state.currentProjectId ? '<span class="project-item-badge">当前</span>' : ""}
        </div>
        <div class="project-item-meta">角色 ${roleCount} 个 · 对白 ${lineCount} 条 · ${formatProjectTime(project.updatedAt)}</div>
      </div>
    `;

    const actions = document.createElement("div");
    actions.className = "project-item-actions";

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "secondary";
    openBtn.textContent = "打开";
    openBtn.addEventListener("click", () => {
      loadProjectSnapshot(project.payload, { projectId: project.id, projectName: project.name || "" });
      saveState();
      renderAll();
      closeProjectManagerModal();
      showToast(`已打开项目“${project.name || "未命名项目"}”`);
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "secondary danger-soft";
    removeBtn.textContent = "删除";
    removeBtn.addEventListener("click", () => {
      const nextProjects = readSavedProjects().filter((item) => item.id !== project.id);
      writeSavedProjects(nextProjects);
      if (project.id === state.currentProjectId) {
        state.currentProjectId = "";
        state.currentProjectName = "";
        saveState({ skipProjectSync: true });
        renderProjectTitle();
      }
      renderProjectManager();
      showToast(`已删除项目“${project.name || "未命名项目"}”`);
    });

    actions.append(openBtn, removeBtn);
    row.append(actions);
    els.projectManagerList.append(row);
  });
}

function setButtonBusy(button, busy, busyText, idleText = null) {
  if (!button) return;
  if (!button.dataset.idleText) {
    button.dataset.idleText = idleText || button.textContent;
  }
  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.idleText;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 401) {
      state.auth = { ...state.auth, authenticated: false, requireAuth: true };
      openAuthModal();
    }
    throw new Error(text || `Request failed: ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function normalizeLineAudioSettings(settings = {}) {
  return {
    volume: clampNumber(settings.volume, 0, 200, 100),
    pitch: clampNumber(settings.pitch, -12, 12, 0),
    speed: clampNumber(settings.speed, 50, 150, 100),
  };
}

function getAudioSettingsSignature(audioSettings = {}) {
  const normalized = normalizeLineAudioSettings(audioSettings);
  return JSON.stringify({
    volume: normalized.volume,
    pitch: normalized.pitch,
    speed: normalized.speed,
  });
}

function syncSettingsFromForm() {
  state.settings.localFilesOnly = els.localFilesOnly.checked;
  state.settings.outputPrefix = els.outputPrefix.value.trim() || "indextts_ui";
  state.settings.mergeSilenceMs = Number(els.mergeSilenceMs.value || 300);
}

function fillSettingsForm() {
  els.localFilesOnly.checked = Boolean(state.settings.localFilesOnly);
  els.outputPrefix.value = state.settings.outputPrefix || "indextts_ui";
  els.mergeSilenceMs.value = state.settings.mergeSilenceMs ?? 300;
}

function formatDurationBrief(totalSeconds = 0) {
  const safeSeconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function estimateLineDurationSeconds(line) {
  const text = (line?.text || "").trim();
  if (!text) return 0;

  const role = getResolvedRoleById(line.roleId);
  if (line.generatedUrl && Number.isFinite(line.durationSeconds) && line.durationSeconds > 0 && role && !isLineDirty(line, role)) {
    return Number(line.durationSeconds);
  }

  const settings = normalizeLineAudioSettings(line.audioSettings);
  const speedFactor = Math.max(0.5, (settings.speed || 100) / 100);
  const textLength = text.replace(/\s+/g, "").length;
  const punctuationCount = (text.match(/[，。！？；：、,.!?]/g) || []).length;
  const baseSeconds = textLength / (4.6 * speedFactor);
  const pauseSeconds = punctuationCount * 0.12;
  return Math.max(1.2, baseSeconds + pauseSeconds);
}

function renderLineCountHint() {
  if (!els.lineCountHint) return;
  const effectiveLines = state.lines.filter((line) => ((line.text || "").trim() || line.generatedUrl));
  const contentDuration = effectiveLines.reduce((total, line) => total + estimateLineDurationSeconds(line), 0);
  const silenceSeconds = Math.max(0, effectiveLines.length - 1) * ((Number(state.settings.mergeSilenceMs) || 0) / 1000);
  const totalSeconds = contentDuration + silenceSeconds;
  els.lineCountHint.textContent = `${state.lines.length} 条台词 · 预估时长 ${formatDurationBrief(totalSeconds)}`;
}

function getVoiceById(voiceId) {
  return state.voices.find((voice) => voice.id === voiceId) || null;
}

function getVoiceScopeLabel(voice) {
  if (voice?.isShared) return "共享音色";
  if (state.auth.isOwner && (voice?.ownerUsername || "") === "owner") return "我的音色";
  if ((voice?.ownerUsername || "") && voice.ownerUsername === state.auth.username) return "我的音色";
  if (voice?.ownerUsername) return `${voice.ownerUsername} 的音色`;
  return "我的音色";
}

async function registerExistingVoice(name, audioFile) {
  const result = await fetchJson("/indextts-ui/api/register-existing-voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, audioFile }),
  });
  return result.voice || null;
}

async function syncVoicesFromServer({ migrateLegacy = false } = {}) {
  if (state.auth.requireAuth && !state.auth.authenticated) {
    state.voices = [];
    return [];
  }

  const previewCache = new Map(state.voices.map((voice) => [voice.id, voice]));
  if (migrateLegacy && state.auth.isOwner) {
    for (const voice of state.voices) {
      if (!voice?.audioFile) continue;
      try {
        await registerExistingVoice(voice.name, voice.audioFile);
      } catch (_) {
        // ignore duplicates and registration failures during migration
      }
    }
  }

  const result = await fetchJson("/indextts-ui/api/voices");
  const items = Array.isArray(result.items) ? result.items : [];
  state.voices = items.map((item) => {
    const cached = previewCache.get(item.id) || {};
    return createVoice({
      ...item,
      previews: item.previews || cached.previews || {},
      previewPendingEmotion: cached.previewPendingEmotion || "",
      previewBatchPending: cached.previewBatchPending || false,
      previewBatchCurrentIndex: cached.previewBatchCurrentIndex || 0,
      previewBatchTotal: cached.previewBatchTotal || 0,
      previewActiveEmotion: cached.previewActiveEmotion || "",
      previewActiveUrl: cached.previewActiveUrl || "",
    });
  });
  return state.voices;
}

function clearRolesUsingVoice(voiceId) {
  state.roles = state.roles.map((role) => (role.voiceId === voiceId ? { ...role, voiceId: "" } : role));
}

async function renameVoiceOnServer(voice, nextName) {
  const trimmedName = (nextName || "").trim();
  if (!trimmedName || trimmedName === voice.name) {
    return voice.name;
  }

  const result = await fetchJson("/indextts-ui/api/update-voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voiceId: voice.id, name: trimmedName }),
  });
  const updated = result.voice || null;
  if (!updated) return trimmedName;

  const index = state.voices.findIndex((item) => item.id === voice.id);
  if (index >= 0) {
    state.voices[index] = createVoice({
      ...state.voices[index],
      ...updated,
    });
  }
  saveState();
  renderRoles();
  updateVoiceCenterCard(voice.id);
  return trimmedName;
}

async function deleteVoiceOnServer(voice) {
  await fetchJson("/indextts-ui/api/delete-voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voiceId: voice.id }),
  });
  state.voices = state.voices.filter((item) => item.id !== voice.id);
  clearRolesUsingVoice(voice.id);
  saveState();
  renderVoiceCenter();
  renderRoles();
  renderLines();
}

function getResolvedRole(role) {
  if (!role) return null;
  const voice = getVoiceById(role.voiceId);
  return {
    ...role,
    audioFile: voice?.audioFile || role.audioFile || "",
    audioUrl: voice?.audioUrl || role.audioUrl || "",
    voiceName: voice?.name || "",
  };
}

function getRoleById(roleId) {
  return state.roles.find((role) => role.id === roleId) || null;
}

function getResolvedRoleById(roleId) {
  return getResolvedRole(getRoleById(roleId));
}

function migrateLegacyRoleVoices() {
  const voicesByAudio = new Map(state.voices.filter((voice) => voice.audioFile).map((voice) => [voice.audioFile, voice]));

  state.roles = state.roles.map((role) => {
    if (role.voiceId && getVoiceById(role.voiceId)) {
      return role;
    }

    if (!role.audioFile) {
      return { ...role, voiceId: role.voiceId || "" };
    }

    let voice = voicesByAudio.get(role.audioFile);
    if (!voice) {
      voice = createVoice({
        name: role.name ? `${role.name}基础音色` : `基础音色${state.voices.length + 1}`,
        audioFile: role.audioFile,
        audioUrl: role.audioUrl,
      });
      state.voices.push(voice);
      voicesByAudio.set(role.audioFile, voice);
    }

    return {
      ...role,
      voiceId: voice.id,
    };
  });
}

function assignVoiceToRole(roleId, voiceId) {
  const role = getRoleById(roleId);
  const voice = getVoiceById(voiceId);
  if (!role || !voice) return;

  role.voiceId = voice.id;
  saveState();
  renderRoles();
  renderLines();
  showToast(`已将“${voice.name}”设置为“${role.name}”的基础音色。`);
}

function findRoleByName(name) {
  const normalized = (name || "").trim().toLowerCase();
  if (!normalized) return null;
  return state.roles.find((role) => (role.name || "").trim().toLowerCase() === normalized) || null;
}

function getOrCreateRoleByName(name) {
  const cleanName = (name || "").trim();
  if (!cleanName) return null;

  const existing = findRoleByName(cleanName);
  if (existing) return existing;

  const role = createRole({ name: cleanName });
  state.roles.push(role);
  return role;
}

function syncRoleEmotionToLines(roleId, emotionPreset) {
  let updatedCount = 0;

  state.lines.forEach((line) => {
    if (line.roleId !== roleId) return;
    line.emotionMode = "preset";
    line.emotionPreset = emotionPreset;
    line.emotionText = "";
    updatedCount += 1;
  });

  return updatedCount;
}

function importScriptText(rawText) {
  const input = (rawText || "").replace(/\r\n?/g, "\n").trim();
  if (!input) {
    showToast("请先粘贴要导入的对白脚本。", true);
    return;
  }

  const addedLines = [];
  const invalidRows = [];

  for (const [index, rawLine] of input.split("\n").entries()) {
    const lineText = rawLine.trim();
    if (!lineText) continue;

    const match = lineText.match(/^([^|｜]+)[|｜](.+)$/);
    if (!match) {
      invalidRows.push(index + 1);
      continue;
    }

    const roleName = match[1].trim();
    const dialogue = match[2].trim();
    if (!roleName || !dialogue) {
      invalidRows.push(index + 1);
      continue;
    }

    const role = getOrCreateRoleByName(roleName);
    if (!role) {
      invalidRows.push(index + 1);
      continue;
    }

    addedLines.push(createLine({
      roleId: role.id,
        emotionPreset: role.defaultEmotion || state.emotionPresets[0] || "平静",
      text: dialogue,
    }));
  }

  if (!addedLines.length) {
    showToast("没有找到可导入的有效对白，请检查格式是否为 角色|台词。", true);
    return;
  }

  state.lines.push(...addedLines);
  saveState();
  renderAll();
  els.scriptInput.value = "";
  closeScriptImportModal();

  const skippedText = invalidRows.length ? `，跳过 ${invalidRows.length} 行` : "";
  showToast(`已导入 ${addedLines.length} 条对白${skippedText}。`);
}

function addBlankLine() {
  state.lines.push(createLine({
    roleId: state.roles[0]?.id || "",
    emotionPreset: state.roles[0]?.defaultEmotion || "平静",
  }));
  saveState();
  renderLines();
}

function getLineSignature(line, role) {
  return JSON.stringify({
    emotionPresetVersion: EMOTION_PRESET_SIGNATURE_VERSION,
    roleId: line.roleId || "",
    roleAudioFile: role?.audioFile || "",
    emotionMode: line.emotionMode || "preset",
    emotionPreset: line.emotionMode === "preset" ? (line.emotionPreset || "") : "",
    emotionText: line.emotionMode === "text" ? (line.emotionText || "").trim() : "",
    text: (line.text || "").trim(),
    audioSettings: getAudioSettingsSignature(line.audioSettings),
    numberReadingMode: line.numberReadingMode || "default",
    pronunciationOverridesText: (line.pronunciationOverridesText || "").trim(),
  });
}

function isLineDirty(line, role) {
  if (!line.generatedUrl) return true;
  return line.generatedSignature !== getLineSignature(line, role);
}

function doesLineNeedGeneration(line) {
  const role = getResolvedRoleById(line.roleId);
  if (!role) return true;
  if (line.pendingTaskKey || line.isGenerating) return false;
  return isLineDirty(line, role);
}

function countPronunciationOverrides(text = "") {
  return String(text || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .length;
}

function parsePronunciationOverridesText(text = "") {
  const entries = [];
  const invalid = [];
  String(text || "")
    .split(/\r?\n/)
    .forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (!line) return;
      const separatorIndex = line.search(/[|｜]/);
      if (separatorIndex < 0) {
        invalid.push(index + 1);
        return;
      }
      const source = line.slice(0, separatorIndex).trim();
      const target = line.slice(separatorIndex + 1).trim();
      if (!source || !target) {
        invalid.push(index + 1);
        return;
      }
      entries.push({ source, target });
    });
  return { entries, invalid };
}

function normalizePronunciationOverridesText(text = "") {
  const { entries, invalid } = parsePronunciationOverridesText(text);
  return {
    text: entries.map((item) => `${item.source}|${item.target}`).join("\n"),
    count: entries.length,
    invalid,
  };
}

function extractPronunciationSingleChars(text = "") {
  const seen = new Set();
  const chars = [];
  for (const char of String(text || "")) {
    if (!/[\u4e00-\u9fff]/.test(char)) continue;
    if (seen.has(char)) continue;
    seen.add(char);
    chars.push(char);
  }
  return chars;
}

function insertSingleCharPronunciationEntry(char) {
  if (!char || !els.pronunciationInput) return;
  const current = String(els.pronunciationInput.value || "").trimEnd();
  const exists = current
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith(`${char}|`) || line.trim().startsWith(`${char}｜`));
  if (exists) {
    showToast(`“${char}”已经在发音词典里了`, true);
    return;
  }
  const nextValue = current ? `${current}\n${char}|` : `${char}|`;
  els.pronunciationInput.value = nextValue;
  els.pronunciationInput.focus();
  const caret = els.pronunciationInput.value.length;
  els.pronunciationInput.setSelectionRange(caret, caret);
}

function renderPronunciationCharList(text = "") {
  if (!els.pronunciationCharList) return;
  els.pronunciationCharList.innerHTML = "";
  const chars = extractPronunciationSingleChars(text);
  if (!chars.length) {
    const empty = document.createElement("span");
    empty.className = "pronunciation-char-empty";
    empty.textContent = "当前台词里没有可快捷加入的单字";
    els.pronunciationCharList.append(empty);
    return;
  }

  chars.forEach((char) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary pronunciation-char-chip";
    button.textContent = char;
    button.title = `把“${char}”加入发音词典`;
    button.addEventListener("click", () => {
      insertSingleCharPronunciationEntry(char);
    });
    els.pronunciationCharList.append(button);
  });
}

function openPronunciationModal(lineId) {
  const line = state.lines.find((item) => item.id === lineId);
  if (!line || !els.pronunciationModal) return;
  activePronunciationLineId = lineId;
  els.pronunciationInput.value = line.pronunciationOverridesText || "";
  els.pronunciationPreview.textContent = (line.text || "").trim() || "当前台词为空";
  renderPronunciationCharList(line.text || "");
  els.pronunciationModal.classList.remove("hidden");
  els.pronunciationModal.setAttribute("aria-hidden", "false");
  syncBodyModalLock();
  requestAnimationFrame(() => {
    els.pronunciationInput.focus();
    els.pronunciationInput.select();
  });
}

function closePronunciationModal() {
  activePronunciationLineId = "";
  if (!els.pronunciationModal) return;
  els.pronunciationModal.classList.add("hidden");
  els.pronunciationModal.setAttribute("aria-hidden", "true");
  syncBodyModalLock();
}

function savePronunciationOverridesForActiveLine() {
  const line = state.lines.find((item) => item.id === activePronunciationLineId);
  if (!line) {
    closePronunciationModal();
    return;
  }
  const normalized = normalizePronunciationOverridesText(els.pronunciationInput.value || "");
  if (normalized.invalid.length) {
    showToast(`第 ${normalized.invalid.join("、")} 行格式不正确，请使用 原词|pin1 yin1`, true);
    return;
  }
  line.pronunciationOverridesText = normalized.text;
  saveState();
  refreshLineView(line);
  closePronunciationModal();
  showToast(normalized.count ? `已保存 ${normalized.count} 条发音设置` : "已清空发音设置");
}

function getLineNode(lineId) {
  return els.lineList.querySelector(`[data-line-id="${lineId}"]`);
}

function refreshLineView(line) {
  const cached = lineViewCache.get(line.id);
  if (!cached) return false;
  updateLineVisualState(line, getResolvedRoleById(line.roleId), cached.node, cached.controls);
  return true;
}

function refreshLineViews(lines) {
  let needsFullRender = false;
  for (const line of lines) {
    if (!refreshLineView(line)) {
      needsFullRender = true;
      break;
    }
  }

  if (needsFullRender) {
    renderLines();
    return;
  }

  renderLineCountHint();
  updateTaskDock();
}

function getPendingLinesWithIndex() {
  return state.lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => Boolean(line.isGenerating || line.pendingTaskKey));
}

function getTaskDockTarget(pendingLines) {
  if (!pendingLines.length) return null;

  const ranked = [...pendingLines].sort((left, right) => {
    const leftStarted = typeof left.line.pendingProgress === "number" && left.line.pendingProgress > 0 ? 1 : 0;
    const rightStarted = typeof right.line.pendingProgress === "number" && right.line.pendingProgress > 0 ? 1 : 0;
    if (rightStarted !== leftStarted) return rightStarted - leftStarted;

    const leftProgress = typeof left.line.pendingProgress === "number" ? left.line.pendingProgress : -1;
    const rightProgress = typeof right.line.pendingProgress === "number" ? right.line.pendingProgress : -1;
    if (rightProgress !== leftProgress) return rightProgress - leftProgress;

    const leftUpdatedAt = left.line.pendingUpdatedAt || 0;
    const rightUpdatedAt = right.line.pendingUpdatedAt || 0;
    if (rightUpdatedAt !== leftUpdatedAt) return rightUpdatedAt - leftUpdatedAt;

    return left.index - right.index;
  });

  return ranked[0];
}

function scrollToLine(lineId) {
  const node = getLineNode(lineId);
  if (!node) return;
  node.scrollIntoView({ behavior: "smooth", block: "center" });
  node.classList.remove("jump-focus");
  void node.offsetWidth;
  node.classList.add("jump-focus");
  clearTimeout(node._focusPulseTimer);
  node._focusPulseTimer = setTimeout(() => {
    node.classList.remove("jump-focus");
  }, 1300);
}

function updateTaskDock() {
  const pendingLines = getPendingLinesWithIndex();
  const batchTask = state.batchGenerationTask;
  if (!pendingLines.length && !batchTask) {
    els.taskDock.classList.add("hidden");
    return;
  }

  const current = getTaskDockTarget(pendingLines);
  if (!current && !batchTask) {
    els.taskDock.classList.add("hidden");
    return;
  }

  if (current) {
    const role = getRoleById(current.line.roleId);
    const progress = typeof current.line.pendingProgress === "number"
      ? `${Math.max(0, Math.min(100, current.line.pendingProgress * 100)).toFixed(1)}%`
      : "处理中";
    const detail = current.line.pendingDescription || "正在生成";
    const roleName = role?.name || "未命名角色";
    const queueText = batchTask
      ? `当前整批第 ${batchTask.current}/${batchTask.total} 条`
      : pendingLines.length > 1
        ? `另有 ${pendingLines.length - 1} 个任务等待/处理中`
        : "点击定位到当前任务";

    els.taskDockTitle.textContent = batchTask
      ? `${batchTask.label} ${batchTask.current}/${batchTask.total}`
      : pendingLines.length > 1
        ? `${pendingLines.length} 个任务执行中`
        : "1 个任务执行中";
    els.taskDockCount.textContent = batchTask
      ? `${batchTask.total}`
      : String(pendingLines.length);
    els.taskDockProgress.textContent = progress;
    els.taskDockDescription.textContent = `第 ${current.index + 1} 条 · ${roleName} · ${detail} · ${queueText}`;
    els.taskDock.classList.remove("hidden");
    return;
  }

  const overallProgress = batchTask.total > 0
    ? `${Math.max(0, Math.min(100, ((batchTask.current - 1) / batchTask.total) * 100)).toFixed(1)}%`
    : "0.0%";
  els.taskDockTitle.textContent = `${batchTask.label} ${batchTask.current}/${batchTask.total}`;
  els.taskDockCount.textContent = String(batchTask.total);
  els.taskDockProgress.textContent = overallProgress;
  const fallbackLocation = typeof batchTask.currentLineIndex === "number"
    ? `点击定位第 ${batchTask.currentLineIndex + 1} 条台词`
    : "点击定位到当前任务";
  els.taskDockDescription.textContent = batchTask.description || fallbackLocation;
  els.taskDock.classList.remove("hidden");
}

function buildTaskKey(line) {
  return `line_${line.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function hasPendingGeneration() {
  return state.lines.some((line) => line.pendingTaskKey);
}

function scheduleGenerationPolling() {
  clearTimeout(generationPollTimer);
  generationPollTimer = null;
  if (!hasPendingGeneration()) return;
  generationPollTimer = setTimeout(() => {
    reconcilePendingGenerations().catch((error) => {
      console.warn("Failed to reconcile generation status", error);
      scheduleGenerationPolling();
    });
  }, GENERATION_POLL_INTERVAL_MS);
}

async function fetchGenerationStatus(taskKey) {
  return fetchJson(`/indextts-ui/api/generation-status?taskKey=${encodeURIComponent(taskKey)}`);
}

async function cancelGeneration(taskKey) {
  return fetchJson("/indextts-ui/api/cancel-generation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskKey }),
  });
}

async function reconcilePendingGenerations() {
  const pendingLines = state.lines.filter((line) => line.pendingTaskKey);
  if (!pendingLines.length) return;

  let changed = false;
  const updatedLines = [];
  const linesToAutoplay = [];

  for (const line of pendingLines) {
    try {
      const task = await fetchGenerationStatus(line.pendingTaskKey);
      if (task.status === "running" || task.status === "cancelling") {
        line.isGenerating = true;
        line.pendingProgress = typeof task.progress === "number" ? task.progress : line.pendingProgress;
        line.pendingDescription = task.description || line.pendingDescription;
        if (task.preview?.audioUrl && task.preview.audioUrl !== line.streamPreviewUrl) {
          line.streamPreviewFile = task.preview.audioFile || line.streamPreviewFile;
          line.streamPreviewUrl = task.preview.audioUrl;
          line.streamPreviewDurationSeconds = task.preview.durationSeconds ?? line.streamPreviewDurationSeconds;
          if (line.streamAutoPlay) {
            linesToAutoplay.push(line.id);
          }
        }
        line.pendingUpdatedAt = Date.now();
        changed = true;
        updatedLines.push(line);
        continue;
      }

      if (task.status === "completed" && task.result) {
        line.generatedFile = task.result.audioFile;
        line.generatedUrl = task.result.audioUrl;
        line.durationSeconds = task.result.durationSeconds;
        line.streamPreviewFile = task.result.previewAudioFile || line.streamPreviewFile;
        line.streamPreviewUrl = "";
        line.streamPreviewDurationSeconds = null;
        line.streamLastPlayedUrl = "";
        line.streamAutoPlay = false;
        line.generatedSignature = line.pendingSignature || line.generatedSignature;
        line.pendingTaskKey = "";
        line.pendingSignature = "";
        line.pendingProgress = null;
        line.pendingDescription = "";
        line.pendingUpdatedAt = 0;
        line.isGenerating = false;
        changed = true;
        updatedLines.push(line);
        continue;
      }

      if (task.status === "cancelled") {
        if (task.result?.preview) {
          line.streamPreviewFile = task.result.preview.audioFile || line.streamPreviewFile;
          line.streamPreviewUrl = task.result.preview.audioUrl || line.streamPreviewUrl;
          line.streamPreviewDurationSeconds = task.result.preview.durationSeconds ?? line.streamPreviewDurationSeconds;
        }
        line.streamAutoPlay = false;
        line.streamLastPlayedUrl = "";
        line.pendingTaskKey = "";
        line.pendingSignature = "";
        line.pendingProgress = null;
        line.pendingDescription = "";
        line.pendingUpdatedAt = 0;
        line.isGenerating = false;
        changed = true;
        updatedLines.push(line);
        continue;
      }

      if (task.status === "error" || task.status === "missing") {
        line.pendingTaskKey = "";
        line.pendingSignature = "";
        line.pendingProgress = null;
        line.pendingDescription = "";
        line.pendingUpdatedAt = 0;
        line.isGenerating = false;
        line.streamAutoPlay = false;
        changed = true;
        updatedLines.push(line);
      }
    } catch (error) {
      console.warn("Failed to fetch generation status", error);
    }
  }

  if (changed) {
    saveState();
    refreshLineViews(updatedLines);
    for (const lineId of linesToAutoplay) {
      const line = state.lines.find((item) => item.id === lineId);
      if (!line || !line.streamPreviewUrl || line.streamPreviewUrl === line.streamLastPlayedUrl) continue;
      line.streamLastPlayedUrl = line.streamPreviewUrl;
      playRenderedLine(lineId);
    }
  }

  scheduleGenerationPolling();
}

function updateAudioPresentation(line, audio, downloadLink) {
  const activeAudioUrl = line.isGenerating && line.streamPreviewUrl
    ? line.streamPreviewUrl
    : (line.generatedUrl || line.streamPreviewUrl);

  if (activeAudioUrl) {
    if (audio.src !== new URL(activeAudioUrl, window.location.origin).toString()) {
      audio.src = activeAudioUrl;
    }
    audio.classList.remove("hidden");
    if (line.generatedUrl) {
      const downloadInfo = getSingleLineDownloadInfo(line);
      downloadLink.href = downloadInfo?.url || line.generatedUrl;
      if (downloadInfo?.filename) {
        downloadLink.download = downloadInfo.filename;
      }
      downloadLink.classList.remove("hidden");
    } else {
      downloadLink.removeAttribute("href");
      downloadLink.removeAttribute("download");
      downloadLink.classList.add("hidden");
    }
  } else {
    audio.removeAttribute("src");
    audio.classList.add("hidden");
    downloadLink.removeAttribute("href");
    downloadLink.removeAttribute("download");
    downloadLink.classList.add("hidden");
  }
}

function updateLineVisualState(line, role, node, controls) {
  const { modeSelect, emotionSelect, emotionTextInput, generateBtn, status, audio, downloadLink, avatar, volumeInput, pitchInput, speedInput, volumeValue, pitchValue, speedValue, numberReadingSelect, pronunciationBtn, pronunciationSummary } = controls;
  const dirty = role ? isLineDirty(line, role) : true;
  const lineAudioSettings = normalizeLineAudioSettings(line.audioSettings);

  const isPending = Boolean(line.isGenerating || line.pendingTaskKey);
  const progressPercent = typeof line.pendingProgress === "number"
    ? `${Math.max(0, Math.min(100, line.pendingProgress * 100)).toFixed(1)}%`
    : "0%";

  node.classList.toggle("is-generating", isPending);
  node.style.setProperty("--line-progress", progressPercent);
  generateBtn.classList.remove("busy", "ready", "needs-render");

  if (line.emotionMode === "text") {
    emotionSelect.classList.add("hidden");
    emotionTextInput.classList.remove("hidden");
  } else {
    emotionSelect.classList.remove("hidden");
    emotionTextInput.classList.add("hidden");
  }

  modeSelect.value = line.emotionMode;
  volumeInput.value = String(lineAudioSettings.volume);
  pitchInput.value = String(lineAudioSettings.pitch);
  speedInput.value = String(lineAudioSettings.speed);
  if (numberReadingSelect) {
    numberReadingSelect.value = line.numberReadingMode || "default";
  }
  volumeValue.textContent = `${Math.round(lineAudioSettings.volume)}%`;
  pitchValue.textContent = lineAudioSettings.pitch > 0 ? `+${Math.round(lineAudioSettings.pitch)}` : `${Math.round(lineAudioSettings.pitch)}`;
  speedValue.textContent = `${(lineAudioSettings.speed / 100).toFixed(2)}x`;
  if (pronunciationBtn) {
    const pronunciationCount = countPronunciationOverrides(line.pronunciationOverridesText);
    pronunciationBtn.textContent = pronunciationCount ? `发音设置(${pronunciationCount})` : "发音设置";
    if (pronunciationSummary) {
      pronunciationSummary.textContent = line.numberReadingMode === "digits"
        ? (pronunciationCount ? `逐位读数字，已设 ${pronunciationCount} 条发音` : "逐位读数字")
        : (pronunciationCount ? `已设 ${pronunciationCount} 条发音` : "未设置发音覆盖");
    }
  }
  if (avatar) {
    avatar.src = createAvatarUrl(getAvatarSeed(role?.name ? `role:${role.name}` : "", line.roleId || line.id));
    avatar.alt = `${role?.name || "角色"}头像`;
  }
  updateAudioPresentation(line, audio, downloadLink);
  status.classList.remove("hidden");

  if (isPending) {
    generateBtn.textContent = "■";
    generateBtn.title = "停止生成";
    generateBtn.disabled = false;
    generateBtn.classList.add("busy");
    const progressText = typeof line.pendingProgress === "number"
      ? progressPercent
      : "";
    const detailText = line.pendingDescription || "生成中...";
    status.textContent = progressText ? `生成中 ${progressText} · ${detailText}` : detailText;
    return;
  }

  generateBtn.disabled = false;
  generateBtn.textContent = "▶";

  if (!line.generatedUrl) {
    generateBtn.classList.add("needs-render");
    generateBtn.title = "生成并播放";
    status.textContent = line.streamPreviewUrl ? "已停止，可试听当前片段或重新开始生成" : "未生成";
    return;
  }

  if (dirty) {
    generateBtn.classList.add("needs-render");
    generateBtn.title = "重新生成并播放";
    status.textContent = "内容已修改，点击播放按钮重新生成";
    return;
  }

  generateBtn.classList.add("ready");
  generateBtn.title = "播放已生成音频";
  status.textContent = "";
  status.classList.add("hidden");
}

async function playRenderedLine(lineId) {
  const node = getLineNode(lineId);
  const audio = node?.querySelector(".line-audio");
  if (!audio) return;
  try {
    await audio.play();
  } catch (error) {
    console.warn("Audio playback was interrupted", error);
  }
}

async function generateLineAudio(line, index, { autoplay = false } = {}) {
  const role = getResolvedRoleById(line.roleId);
  if (!role) {
    throw new Error("请先为这条台词选择角色。");
  }
  if (!role.audioFile) {
    throw new Error(`角色“${role.name}”还没有上传参考音频。`);
  }
  if (!line.text.trim()) {
    throw new Error("台词内容不能为空。");
  }

  const signature = getLineSignature(line, role);
  const taskKey = buildTaskKey(line);
  line.pendingTaskKey = taskKey;
  line.pendingSignature = signature;
  line.pendingProgress = 0;
  line.pendingDescription = "starting inference...";
  line.pendingUpdatedAt = Date.now();
  line.isGenerating = true;
  line.streamAutoPlay = autoplay;
  line.streamLastPlayedUrl = "";
  line.streamPreviewUrl = "";
  line.streamPreviewFile = "";
  line.streamPreviewDurationSeconds = null;
  saveState();
  refreshLineViews([line]);
  scheduleGenerationPolling();

  try {
    const result = await fetchJson("/indextts-ui/api/generate-line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskKey,
        role,
        line,
        lineIndex: index + 1,
        settings: state.settings,
      }),
    });

    if (result.status === "cancelled") {
      if (result.preview) {
        line.streamPreviewFile = result.preview.audioFile || line.streamPreviewFile;
        line.streamPreviewUrl = result.preview.audioUrl || line.streamPreviewUrl;
        line.streamPreviewDurationSeconds = result.preview.durationSeconds ?? line.streamPreviewDurationSeconds;
      }
      line.pendingTaskKey = "";
      line.pendingSignature = "";
      line.pendingProgress = null;
      line.pendingDescription = "";
      line.pendingUpdatedAt = 0;
      line.isGenerating = false;
      line.streamAutoPlay = false;
      saveState();
      refreshLineViews([line]);
      scheduleGenerationPolling();
      return result;
    }

    line.generatedFile = result.audioFile;
    line.generatedUrl = result.audioUrl;
    line.durationSeconds = result.durationSeconds;
    line.streamPreviewFile = result.previewAudioFile || line.streamPreviewFile;
    line.streamPreviewUrl = "";
    line.streamPreviewDurationSeconds = null;
    line.streamLastPlayedUrl = "";
    line.streamAutoPlay = false;
    line.generatedSignature = line.pendingSignature || signature;
    line.pendingTaskKey = "";
    line.pendingSignature = "";
    line.pendingProgress = null;
    line.pendingDescription = "";
    line.pendingUpdatedAt = 0;
    line.isGenerating = false;
    saveState();
    refreshLineViews([line]);
    scheduleGenerationPolling();

    if (autoplay) {
      await playRenderedLine(line.id);
    }
    return result;
  } catch (error) {
    line.pendingTaskKey = "";
    line.pendingSignature = "";
    line.pendingProgress = null;
    line.pendingDescription = "";
    line.pendingUpdatedAt = 0;
    line.isGenerating = false;
    line.streamAutoPlay = false;
    saveState();
    refreshLineViews([line]);
    scheduleGenerationPolling();
    throw error;
  }
}

function ensureVoiceCenterUI() {
  if (els.voiceCenterModal) return;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "secondary panel-action-btn panel-action-btn-voice";
  trigger.innerHTML = `
    <span class="panel-action-icon" aria-hidden="true">◉</span>
    <span class="panel-action-label">音色中心</span>
  `;
  els.addRoleBtn.insertAdjacentElement("beforebegin", trigger);
  els.voiceCenterBtn = trigger;

  const modal = document.createElement("div");
  modal.id = "voiceCenterModal";
  modal.className = "modal hidden";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="modal-backdrop" data-close-modal="voice-center"></div>
    <div class="modal-panel modal-panel-wide" role="dialog" aria-modal="true" aria-labelledby="voiceCenterTitle">
      <div class="modal-head">
        <div>
          <h3 id="voiceCenterTitle">音色中心</h3>
          <p>统一管理基础音色，角色从这里选择，并支持多情绪试听。建议使用 10 到 15 秒、单人、无底噪、无混响、情绪明确的参考音频。</p>
        </div>
        <button id="closeVoiceCenterModalBtn" class="icon" type="button" title="关闭">×</button>
      </div>
      <div class="voice-center-toolbar">
        <button id="voiceUploadBtn" class="primary" type="button">上传基础音色</button>
        <input id="voiceUploadInput" type="file" accept="audio/*" hidden>
        <label class="inline-field grow">
          <span>试听文案</span>
          <input id="voicePreviewText" type="text" placeholder="留空则使用默认试听文案">
        </label>
      </div>
      <div id="voiceCenterList" class="voice-center-list"></div>
    </div>
  `;
  document.body.append(modal);

  els.voiceCenterModal = modal;
  els.closeVoiceCenterModalBtn = modal.querySelector("#closeVoiceCenterModalBtn");
  els.voiceUploadInput = modal.querySelector("#voiceUploadInput");
  els.voiceUploadBtn = modal.querySelector("#voiceUploadBtn");
  els.voicePreviewText = modal.querySelector("#voicePreviewText");
  els.voiceCenterList = modal.querySelector("#voiceCenterList");
}

async function uploadVoiceFile(file) {
  const body = new FormData();
  body.append("file", file);
  body.append("name", file.name.replace(/\.[^.]+$/, "").trim() || `基础音色${state.voices.length + 1}`);
  const result = await fetchJson("/indextts-ui/api/upload-voice", {
    method: "POST",
    body,
  });

  await syncVoicesFromServer();
  const voice = getVoiceById(result.voice?.id);
  saveState();
  renderVoiceCenter();
  renderRoles();
  showToast(`已添加基础音色：${voice?.name || "基础音色"}`);
}

function getVoicePreviewPrompt(voice, emotionPreset) {
  const customText = (els.voicePreviewText?.value || "").trim();
  if (customText) return customText;
  return DEFAULT_VOICE_PREVIEW_TEXTS[emotionPreset] || `这是${voice.name}的${emotionPreset}情绪试听。`;
}

function getVoicePreviewSignature(voice, emotionPreset) {
  return `${VOICE_PREVIEW_SIGNATURE_VERSION}::${voice.id || voice.audioFile || voice.name || "voice"}::${emotionPreset}::${getVoicePreviewPrompt(voice, emotionPreset)}`;
}

async function previewVoiceEmotion(voiceId, emotionPreset, options = {}) {
  const { autoplay = true } = options;
  const voice = getVoiceById(voiceId);
  if (!voice || !voice.audioFile) {
    showToast("这个音色还没有参考音频。", true);
    return;
  }

  stopVoicePreviewPlayback(voiceId);

  const currentSignature = getVoicePreviewSignature(voice, emotionPreset);
  const cached = voice.previews?.[emotionPreset];
  if (cached?.audioUrl && cached.previewSignature === currentSignature) {
    voice.previewActiveEmotion = emotionPreset;
    voice.previewActiveUrl = cached.audioUrl;
    saveState();
    if (!updateVoiceCenterCard(voice.id)) {
      renderVoiceCenter();
    }
    const player = els.voiceCenterList.querySelector(`[data-voice-player="${voice.id}"]`);
    if (player && autoplay) {
      loadAndPlayVoicePreview(player, cached.audioUrl);
    }
    return;
  }

  voice.previewActiveEmotion = emotionPreset;
  voice.previewPendingEmotion = emotionPreset;
  if (!updateVoiceCenterCard(voice.id)) {
    renderVoiceCenter();
  }

  try {
    syncSettingsFromForm();
    const result = await fetchJson("/indextts-ui/api/preview-voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voice,
        emotionPreset,
        previewText: getVoicePreviewPrompt(voice, emotionPreset),
        previewSignature: currentSignature,
        settings: state.settings,
      }),
    });
    voice.previews = {
      ...(voice.previews || {}),
      [emotionPreset]: {
        ...result,
        previewSignature: currentSignature,
      },
    };
    voice.previewActiveEmotion = emotionPreset;
    voice.previewActiveUrl = result.audioUrl;
    saveState();
    if (!updateVoiceCenterCard(voice.id)) {
      renderVoiceCenter();
    }
    const player = els.voiceCenterList.querySelector(`[data-voice-player="${voice.id}"]`);
    if (player && autoplay) {
      loadAndPlayVoicePreview(player, result.audioUrl);
    }
  } catch (error) {
    showToast(error.message, true);
  } finally {
    voice.previewPendingEmotion = "";
    saveState();
    if (!updateVoiceCenterCard(voice.id)) {
      renderVoiceCenter();
    }
  }
}

async function previewAllVoiceEmotions(voiceId) {
  const voice = getVoiceById(voiceId);
  if (!voice || !voice.audioFile) {
    showToast("这个音色还没有参考音频。", true);
    return;
  }
  if (voice.previewBatchPending) {
    showToast("这个音色正在批量生成全部情绪试听。");
    return;
  }

  stopVoicePreviewPlayback(voiceId);
  voice.previewBatchPending = true;
  voice.previewBatchCurrentIndex = 0;
  voice.previewBatchTotal = state.emotionPresets.length;
  voice.previewPendingEmotion = "";
  saveState();
  if (!updateVoiceCenterCard(voice.id)) {
    renderVoiceCenter();
  }

  try {
    for (const [index, preset] of state.emotionPresets.entries()) {
      voice.previewBatchCurrentIndex = index + 1;
      voice.previewPendingEmotion = preset;
      saveState();
      if (!updateVoiceCenterCard(voice.id)) {
        renderVoiceCenter();
      }
      await previewVoiceEmotion(voiceId, preset, { autoplay: false });
    }
    showToast(`“${voice.name}”的全部情绪试听已准备完成。`);
  } finally {
    voice.previewBatchPending = false;
    voice.previewBatchCurrentIndex = 0;
    voice.previewBatchTotal = 0;
    voice.previewPendingEmotion = "";
    saveState();
    if (!updateVoiceCenterCard(voice.id)) {
      renderVoiceCenter();
    }
  }
}

function renderVoiceCenter() {
  if (!els.voiceCenterList) return;
  const playbackSnapshot = snapshotVoicePreviewPlayback();
  voiceViewCache.clear();
  els.voiceCenterList.innerHTML = "";
  const pickerRole = state.voicePickerRoleId ? getRoleById(state.voicePickerRoleId) : null;
  const pickerRoleName = pickerRole?.name || "";
  const title = document.getElementById("voiceCenterTitle");
  const subtitle = els.voiceCenterModal?.querySelector(".modal-copy p");

  if (title) {
    title.textContent = pickerRole ? `为“${pickerRoleName || "未命名角色"}”选择音色` : "音色中心";
  }

  if (subtitle) {
    subtitle.textContent = pickerRole
      ? "从下面挑一个基础音色，选中后会立刻回填到当前角色。"
      : "统一管理基础音色，角色从这里选择，并支持多情绪试听。";
  }

  if (!state.voices.length) {
    const empty = document.createElement("div");
    empty.className = "voice-empty";
    empty.textContent = pickerRole
      ? "还没有基础音色，先上传一条参考音频，再给这个角色选择。"
      : "还没有基础音色，先上传一条参考音频。";
    els.voiceCenterList.append(empty);
    return;
  }

  state.voices.forEach((voice) => {
    const card = document.createElement("article");
    card.className = "voice-card";

    const head = document.createElement("div");
    head.className = "voice-card-head";

    const avatar = createAvatarElement({
      seed: `voice:${voice.name}`,
      fallbackSeed: voice.id,
      className: "avatar voice-avatar",
      alt: `${voice.name || "基础音色"}头像`,
    });
    avatar.title = "点击依次生成全部情绪试听";
    avatar.tabIndex = 0;
    avatar.role = "button";
    avatar.addEventListener("click", () => {
      previewAllVoiceEmotions(voice.id);
    });
    avatar.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        previewAllVoiceEmotions(voice.id);
      }
    });

    const nameInput = document.createElement("input");
    nameInput.className = "voice-name-input";
    nameInput.type = "text";
    nameInput.value = voice.name;
    nameInput.placeholder = "基础音色名称";
    nameInput.addEventListener("input", (event) => {
      voice.name = event.target.value;
    });
    nameInput.addEventListener("change", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const previousName = voice.name;
      try {
        target.disabled = true;
        const savedName = await renameVoiceOnServer(voice, target.value);
        target.value = savedName;
      } catch (error) {
        voice.name = previousName;
        target.value = previousName;
        showToast(error.message, true);
      } finally {
        target.disabled = false;
      }
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "icon danger";
    removeBtn.textContent = "×";
    removeBtn.title = voice.canDelete ? "删除音色" : "这个共享音色由本机管理员维护，不能删除";
    removeBtn.disabled = !voice.canDelete;
    removeBtn.addEventListener("click", async () => {
      if (!voice.canDelete) {
        showToast("这个共享音色由本机管理员维护，不能删除。", true);
        return;
      }
      try {
        removeBtn.disabled = true;
        await deleteVoiceOnServer(voice);
      } catch (error) {
        removeBtn.disabled = false;
        showToast(error.message, true);
      }
    });

    head.append(avatar, nameInput, removeBtn);

  const meta = document.createElement("div");
  meta.className = "voice-card-meta";
  meta.textContent = voice.audioFile || "未上传参考音频";

  const badgeRow = document.createElement("div");
  badgeRow.className = "voice-card-badges";
  const scopeBadge = document.createElement("span");
  scopeBadge.className = `voice-badge ${voice.isShared ? "shared" : "owned"}`;
  scopeBadge.textContent = getVoiceScopeLabel(voice);
  badgeRow.append(scopeBadge);

  const player = document.createElement("audio");
    player.dataset.voicePlayer = voice.id;
    player.preload = "metadata";

    const previewStatus = document.createElement("div");
    previewStatus.className = "voice-preview-status";

    if (voice.previewBatchPending && voice.previewPendingEmotion) {
      player.controls = false;
      player.classList.add("hidden");
      previewStatus.classList.add("loading");
      previewStatus.textContent = `正在批量生成试听 ${voice.previewBatchCurrentIndex}/${voice.previewBatchTotal}：${formatEmotionLabel(voice.previewPendingEmotion)}...`;
    } else if (voice.previewPendingEmotion) {
      player.controls = false;
      player.classList.add("hidden");
      previewStatus.classList.add("loading");
      previewStatus.textContent = `正在加载${formatEmotionLabel(voice.previewPendingEmotion)}试听...`;
    } else {
      player.controls = true;
      previewStatus.textContent = voice.previewActiveEmotion
        ? `已缓存${formatEmotionLabel(voice.previewActiveEmotion)}试听，下次可直接播放。`
        : "选择一个情绪后会生成试听，并自动缓存到本地。";
    }

    const cachedPreview = getCachedVoicePreview(voice);
    const playerSource = !voice.previewPendingEmotion
      ? (cachedPreview?.audioUrl || voice.previewActiveUrl || "")
      : "";

    if (playerSource) {
      player.src = playerSource;
      player.load();
    }

    player.addEventListener("error", async () => {
      if (voice.previewPendingEmotion) return;
      const cached = getCachedVoicePreview(voice);
      if (!cached?.emotionPreset) return;
      voice.previewActiveUrl = "";
      delete voice.previews?.[cached.emotionPreset];
      saveState();
      renderVoiceCenter();
      try {
        await previewVoiceEmotion(voice.id, cached.emotionPreset, { autoplay: false });
      } catch (_) {
        // previewVoiceEmotion already surfaces the error.
      }
    });

    const chips = document.createElement("div");
    chips.className = "voice-emotion-chips";

    state.emotionPresets.forEach((preset) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "voice-emotion-chip";
      chip.textContent = formatEmotionLabel(preset);
      if (voice.previewActiveEmotion === preset) {
        chip.classList.add("active");
      }
      if (voice.previewPendingEmotion === preset || voice.previewBatchPending) {
        chip.disabled = true;
        chip.textContent = voice.previewPendingEmotion === preset ? `${formatEmotionLabel(preset)}...` : formatEmotionLabel(preset);
      }
      chip.addEventListener("click", () => {
        previewVoiceEmotion(voice.id, preset);
      });
      chips.append(chip);
    });

    const actions = document.createElement("div");
    actions.className = "voice-card-actions";

    if (pickerRole) {
      const selectBtn = document.createElement("button");
      selectBtn.type = "button";
      selectBtn.className = "primary";
      selectBtn.textContent = pickerRole.voiceId === voice.id ? `已用于 ${pickerRoleName}` : `选给 ${pickerRoleName}`;
      selectBtn.disabled = pickerRole.voiceId === voice.id;
      selectBtn.addEventListener("click", () => {
        assignVoiceToRole(pickerRole.id, voice.id);
        closeVoiceCenterModal();
      });
      actions.append(selectBtn);
    }

  card.append(head, meta, badgeRow, chips, previewStatus, player, actions);
    els.voiceCenterList.append(card);
    voiceViewCache.set(voice.id, { node: card });

    if (!voice.previewPendingEmotion) {
      const snapshot = playbackSnapshot.get(voice.id);
      if (snapshot?.src) {
        restoreVoicePreviewPlayback(player, snapshot);
      }
    }
  });
}

function updateVoiceCenterCard(voiceId) {
  if (!els.voiceCenterList) return false;
  const cached = voiceViewCache.get(voiceId);
  const voice = getVoiceById(voiceId);
  if (!cached?.node || !voice) return false;

  const playbackSnapshot = snapshotVoicePreviewPlayback();
  const oldNode = cached.node;
  const allCards = Array.from(els.voiceCenterList.children);
  const cardIndex = allCards.indexOf(oldNode);
  if (cardIndex === -1) return false;

  const pickerRole = state.voicePickerRoleId ? getRoleById(state.voicePickerRoleId) : null;
  const pickerRoleName = pickerRole?.name || "";

  const card = document.createElement("article");
  card.className = "voice-card";

  const head = document.createElement("div");
  head.className = "voice-card-head";

  const avatar = createAvatarElement({
    seed: `voice:${voice.name}`,
    fallbackSeed: voice.id,
    className: "avatar voice-avatar",
    alt: `${voice.name || "基础音色"}头像`,
  });
  avatar.title = "点击依次生成全部情绪试听";
  avatar.tabIndex = 0;
  avatar.role = "button";
  avatar.addEventListener("click", () => {
    previewAllVoiceEmotions(voice.id);
  });
  avatar.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      previewAllVoiceEmotions(voice.id);
    }
  });

  const nameInput = document.createElement("input");
  nameInput.className = "voice-name-input";
  nameInput.type = "text";
  nameInput.value = voice.name;
  nameInput.placeholder = "基础音色名称";
  nameInput.addEventListener("input", (event) => {
    voice.name = event.target.value;
  });
  nameInput.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const previousName = voice.name;
    try {
      target.disabled = true;
      const savedName = await renameVoiceOnServer(voice, target.value);
      target.value = savedName;
    } catch (error) {
      voice.name = previousName;
      target.value = previousName;
      showToast(error.message, true);
    } finally {
      target.disabled = false;
    }
  });

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "icon danger";
  removeBtn.textContent = "×";
  removeBtn.title = voice.canDelete ? "删除音色" : "这个共享音色由本机管理员维护，不能删除";
  removeBtn.disabled = !voice.canDelete;
  removeBtn.addEventListener("click", async () => {
    if (!voice.canDelete) {
      showToast("这个共享音色由本机管理员维护，不能删除。", true);
      return;
    }
    try {
      removeBtn.disabled = true;
      await deleteVoiceOnServer(voice);
    } catch (error) {
      removeBtn.disabled = false;
      showToast(error.message, true);
    }
  });

  head.append(avatar, nameInput, removeBtn);

  const meta = document.createElement("div");
  meta.className = "voice-card-meta";
  meta.textContent = voice.audioFile || "未上传参考音频";

  const badgeRow = document.createElement("div");
  badgeRow.className = "voice-card-badges";
  const scopeBadge = document.createElement("span");
  scopeBadge.className = `voice-badge ${voice.isShared ? "shared" : "owned"}`;
  scopeBadge.textContent = getVoiceScopeLabel(voice);
  badgeRow.append(scopeBadge);

  const player = document.createElement("audio");
  player.dataset.voicePlayer = voice.id;
  player.preload = "metadata";

  const previewStatus = document.createElement("div");
  previewStatus.className = "voice-preview-status";

  if (voice.previewBatchPending && voice.previewPendingEmotion) {
    player.controls = false;
    player.classList.add("hidden");
    previewStatus.classList.add("loading");
    previewStatus.textContent = `正在批量生成试听 ${voice.previewBatchCurrentIndex}/${voice.previewBatchTotal}：${formatEmotionLabel(voice.previewPendingEmotion)}...`;
  } else if (voice.previewPendingEmotion) {
    player.controls = false;
    player.classList.add("hidden");
    previewStatus.classList.add("loading");
    previewStatus.textContent = `正在加载${formatEmotionLabel(voice.previewPendingEmotion)}试听...`;
  } else {
    player.controls = true;
    previewStatus.textContent = voice.previewActiveEmotion
      ? `已缓存${formatEmotionLabel(voice.previewActiveEmotion)}试听，下次可直接播放。`
      : "选择一个情绪后会生成试听，并自动缓存到本地。";
  }

  const cachedPreview = getCachedVoicePreview(voice);
  const playerSource = !voice.previewPendingEmotion
    ? (cachedPreview?.audioUrl || voice.previewActiveUrl || "")
    : "";

  if (playerSource) {
    player.src = playerSource;
    player.load();
  }

  player.addEventListener("error", async () => {
    if (voice.previewPendingEmotion) return;
    const cachedPreviewOnError = getCachedVoicePreview(voice);
    if (!cachedPreviewOnError?.emotionPreset) return;
    voice.previewActiveUrl = "";
    delete voice.previews?.[cachedPreviewOnError.emotionPreset];
    saveState();
    updateVoiceCenterCard(voice.id);
    try {
      await previewVoiceEmotion(voice.id, cachedPreviewOnError.emotionPreset, { autoplay: false });
    } catch (_) {
      // previewVoiceEmotion already surfaces the error.
    }
  });

  const chips = document.createElement("div");
  chips.className = "voice-emotion-chips";

  state.emotionPresets.forEach((preset) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "voice-emotion-chip";
    chip.textContent = formatEmotionLabel(preset);
    if (voice.previewActiveEmotion === preset) {
      chip.classList.add("active");
    }
    if (voice.previewPendingEmotion === preset || voice.previewBatchPending) {
      chip.disabled = true;
      chip.textContent = voice.previewPendingEmotion === preset ? `${formatEmotionLabel(preset)}...` : formatEmotionLabel(preset);
    }
    chip.addEventListener("click", () => {
      previewVoiceEmotion(voice.id, preset);
    });
    chips.append(chip);
  });

  const actions = document.createElement("div");
  actions.className = "voice-card-actions";

  if (pickerRole) {
    const selectBtn = document.createElement("button");
    selectBtn.type = "button";
    selectBtn.className = "primary";
    selectBtn.textContent = pickerRole.voiceId === voice.id ? `已用于 ${pickerRoleName}` : `选给 ${pickerRoleName}`;
    selectBtn.disabled = pickerRole.voiceId === voice.id;
    selectBtn.addEventListener("click", () => {
      assignVoiceToRole(pickerRole.id, voice.id);
      closeVoiceCenterModal();
    });
    actions.append(selectBtn);
  }

    card.append(head, meta, badgeRow, chips, previewStatus, player, actions);
  oldNode.replaceWith(card);
  voiceViewCache.set(voice.id, { node: card });

  if (!voice.previewPendingEmotion) {
    const snapshot = playbackSnapshot.get(voice.id);
    if (snapshot?.src) {
      restoreVoicePreviewPlayback(player, snapshot);
    }
  }

  return true;
}

function renderRoles() {
  els.roleList.innerHTML = "";

  state.roles.forEach((role) => {
    const resolvedRole = getResolvedRole(role);
    const node = els.roleTemplate.content.firstElementChild.cloneNode(true);
    node.querySelectorAll("audio").forEach((element) => element.remove());
    const isExpanded = expandedRoleIds.has(role.id);
    const roleTop = node.querySelector(".role-top");
    const nameInput = node.querySelector(".role-name");
    const removeBtn = node.querySelector(".remove-role");
    const emotionSelect = node.querySelector(".role-default-emotion");
    const syncEmotionBtn = node.querySelector(".sync-role-emotion");
    const roleMetaBlocks = node.querySelectorAll(".role-meta");
    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = isExpanded ? "icon danger role-toggle-btn role-toggle-collapse" : "secondary role-toggle-btn";
    toggleBtn.textContent = isExpanded ? "×" : "修改";
    toggleBtn.title = isExpanded ? "折叠角色设置" : "展开角色设置";
    toggleBtn.addEventListener("click", () => {
      if (expandedRoleIds.has(role.id)) {
        expandedRoleIds.delete(role.id);
      } else {
        expandedRoleIds.add(role.id);
      }
      renderRoles();
    });

    const roleAvatar = createAvatarElement({
      seed: `role:${role.name}`,
      fallbackSeed: role.id,
      className: "avatar role-avatar",
      alt: `${role.name || "角色"}头像`,
    });

    removeBtn.textContent = "";
    removeBtn.title = "删除角色";
    nameInput.placeholder = "角色名称";
    const voiceMeta = roleMetaBlocks[0];
    voiceMeta.innerHTML = "";

    const voiceField = document.createElement("div");
    voiceField.className = "role-voice-field grow";

    const voiceLabel = document.createElement("span");
    voiceLabel.className = "role-voice-label";
    voiceLabel.textContent = "基础音色";

    const voiceSummary = document.createElement("button");
    voiceSummary.type = "button";
    voiceSummary.className = "role-voice-summary";
    voiceSummary.title = resolvedRole.voiceName || "点击修改基础音色";
    voiceSummary.innerHTML = `
      <strong>${resolvedRole.voiceName || "未选择基础音色"}</strong>
      <em>${resolvedRole.audioFile ? "点击修改当前基础音色" : "点击从音色中心选择"}</em>
    `;
    voiceSummary.addEventListener("click", () => {
      openVoiceCenterModal(role.id);
    });

    voiceField.append(voiceLabel, voiceSummary);

    const openCenterBtn = document.createElement("button");
    openCenterBtn.type = "button";
    openCenterBtn.className = "icon role-voice-edit-btn role-voice-switch";
    openCenterBtn.textContent = "";
    openCenterBtn.title = "切换基础音色";
    openCenterBtn.setAttribute("aria-label", "切换基础音色");
    openCenterBtn.addEventListener("click", () => {
      openVoiceCenterModal(role.id);
    });

    voiceMeta.append(voiceField, openCenterBtn);

    nameInput.value = role.name;

    state.emotionPresets.forEach((preset) => {
      const option = document.createElement("option");
      option.value = preset;
      option.textContent = formatEmotionLabel(preset);
      option.selected = preset === role.defaultEmotion;
      emotionSelect.append(option);
    });

    nameInput.addEventListener("input", (event) => {
      role.name = event.target.value;
      saveState();
      renderVoiceCenter();
      renderLines();
    });

    emotionSelect.addEventListener("change", (event) => {
      role.defaultEmotion = event.target.value;
      saveState();
      renderLines();
    });

    syncEmotionBtn.addEventListener("click", () => {
      const updatedCount = syncRoleEmotionToLines(role.id, role.defaultEmotion);
      saveState();
      renderLines();

      if (!updatedCount) {
        showToast(`角色“${role.name}”还没有对应的对白。`, true);
        return;
      }

      showToast(`已把“${role.name}”的默认情绪同步到 ${updatedCount} 条对白。`);
    });

    removeBtn.addEventListener("click", () => {
      expandedRoleIds.delete(role.id);
      const removedVoiceId = role.voiceId;
      state.roles = state.roles.filter((item) => item.id !== role.id);
      state.lines = state.lines.map((line) => (
        line.roleId === role.id ? { ...line, roleId: state.roles[0]?.id || "" } : line
      ));
      if (removedVoiceId && !state.roles.some((item) => item.voiceId === removedVoiceId)) {
        state.voices = state.voices.filter((voice) => voice.id !== removedVoiceId);
      }
      saveState();
      renderAll();
    });

    if (isExpanded) {
      roleTop.insertBefore(roleAvatar, nameInput);
      roleTop.insertBefore(toggleBtn, removeBtn);
      roleMetaBlocks.forEach((block) => block.classList.remove("hidden"));
      removeBtn.classList.remove("hidden");
    } else {
      roleTop.insertBefore(roleAvatar, nameInput);
      roleTop.append(toggleBtn);
      roleMetaBlocks.forEach((block) => block.classList.add("hidden"));
      removeBtn.classList.add("hidden");
    }

    els.roleList.append(node);
  });
}

function renderLines() {
  els.lineList.innerHTML = "";
  lineViewCache.clear();
  renderLineCountHint();

  state.lines.forEach((line, index) => {
    const node = els.lineTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.lineId = line.id;

    const addBeforeBtn = node.querySelector(".add-before");
    const lineTop = node.querySelector(".line-top");
    const roleSelect = node.querySelector(".line-role");
    const modeSelect = node.querySelector(".line-emotion-mode");
    const emotionSelect = node.querySelector(".line-emotion");
    const emotionTextInput = node.querySelector(".line-emotion-text");
    const textInput = node.querySelector(".line-text");
    const inputStack = node.querySelector(".line-input-stack");
    const existingLineActions = node.querySelector(".line-actions");
    const generateBtn = node.querySelector(".generate-line");
    const duplicateBtn = node.querySelector(".duplicate-line");
    const downloadLink = node.querySelector(".download-line");
    const removeBtn = node.querySelector(".remove-line");
    const status = node.querySelector(".line-status");
    const audio = node.querySelector(".line-audio");

    const audioSettingsRow = document.createElement("div");
    audioSettingsRow.className = "line-audio-settings";
    audioSettingsRow.innerHTML = `
      <label class="line-audio-control">
        <span>音量</span>
        <input class="line-volume" type="range" min="0" max="200" step="1">
        <strong class="line-volume-value">100%</strong>
      </label>
      <label class="line-audio-control">
        <span>音调</span>
        <input class="line-pitch" type="range" min="-12" max="12" step="1">
        <strong class="line-pitch-value">0</strong>
      </label>
      <label class="line-audio-control">
        <span>语速</span>
        <input class="line-speed" type="range" min="50" max="150" step="1">
        <strong class="line-speed-value">1.00x</strong>
      </label>
    `;
    inputStack.append(audioSettingsRow);

    const pronunciationSettingsRow = document.createElement("div");
    pronunciationSettingsRow.className = "line-pronunciation-settings";
    pronunciationSettingsRow.innerHTML = `
      <label class="line-number-reading-field">
        <span>数字读法</span>
        <select class="line-number-reading">
          <option value="default">默认读法</option>
          <option value="digits">逐位朗读</option>
        </select>
      </label>
      <button class="secondary line-pronunciation-btn" type="button">发音设置</button>
      <span class="line-pronunciation-summary">未设置发音覆盖</span>
    `;
    inputStack.append(pronunciationSettingsRow);

    const volumeInput = audioSettingsRow.querySelector(".line-volume");
    const pitchInput = audioSettingsRow.querySelector(".line-pitch");
    const speedInput = audioSettingsRow.querySelector(".line-speed");
    const volumeValue = audioSettingsRow.querySelector(".line-volume-value");
    const pitchValue = audioSettingsRow.querySelector(".line-pitch-value");
    const speedValue = audioSettingsRow.querySelector(".line-speed-value");
    const numberReadingSelect = pronunciationSettingsRow.querySelector(".line-number-reading");
    const pronunciationBtn = pronunciationSettingsRow.querySelector(".line-pronunciation-btn");
    const pronunciationSummary = pronunciationSettingsRow.querySelector(".line-pronunciation-summary");

    const avatar = createAvatarElement({
      seed: getRoleById(line.roleId)?.name ? `role:${getRoleById(line.roleId).name}` : "",
      fallbackSeed: line.roleId || line.id,
      className: "avatar line-avatar",
      alt: `${getRoleById(line.roleId)?.name || "角色"}头像`,
    });
    const lineActions = existingLineActions || document.createElement("div");
    if (!existingLineActions) {
      lineActions.className = "line-actions";
      lineTop.append(lineActions);
    }

    const lineMainControls = document.createElement("div");
    lineMainControls.className = "line-main-controls";
    lineTop.insertBefore(lineMainControls, lineActions);
    [addBeforeBtn, avatar, roleSelect, modeSelect, emotionSelect, emotionTextInput]
      .filter(Boolean)
      .forEach((element) => lineMainControls.append(element));
    [generateBtn, duplicateBtn, downloadLink, removeBtn]
      .filter(Boolean)
      .forEach((element) => lineActions.append(element));

    state.roles.forEach((role) => {
      const option = document.createElement("option");
      option.value = role.id;
      option.textContent = role.name || "未命名角色";
      option.selected = role.id === line.roleId;
      roleSelect.append(option);
    });

    state.emotionPresets.forEach((preset) => {
      const option = document.createElement("option");
      option.value = preset;
      option.textContent = formatEmotionLabel(preset);
      option.selected = preset === line.emotionPreset;
      emotionSelect.append(option);
    });

    modeSelect.value = line.emotionMode;
    textInput.value = line.text;
    emotionTextInput.placeholder = "例如：痛苦、压抑、克制";
    emotionTextInput.value = line.emotionText || "";

    const controls = {
      avatar,
      modeSelect,
      emotionSelect,
      emotionTextInput,
      volumeInput,
      pitchInput,
      speedInput,
      volumeValue,
      pitchValue,
      speedValue,
      numberReadingSelect,
      pronunciationBtn,
      pronunciationSummary,
      generateBtn,
      status,
      audio,
      downloadLink,
    };
    lineViewCache.set(line.id, { node, controls });

    const refreshRow = () => {
      updateLineVisualState(line, getResolvedRoleById(line.roleId), node, controls);
    };

    refreshRow();

    addBeforeBtn.addEventListener("click", () => {
      state.lines.splice(index, 0, createLine({
        roleId: line.roleId,
        emotionMode: line.emotionMode,
        emotionPreset: line.emotionPreset,
        emotionText: line.emotionText,
        audioSettings: line.audioSettings,
        numberReadingMode: line.numberReadingMode,
        pronunciationOverridesText: line.pronunciationOverridesText,
      }));
      saveState();
      renderLines();
    });

    roleSelect.addEventListener("change", (event) => {
      line.roleId = event.target.value;
      const role = getResolvedRoleById(line.roleId);
      if (line.emotionMode === "preset" && !line.emotionPreset) {
        line.emotionPreset = role?.defaultEmotion || state.emotionPresets[0] || "平静";
      }
      saveState();
      refreshRow();
    });

    modeSelect.addEventListener("change", (event) => {
      line.emotionMode = event.target.value;
      saveState();
      refreshRow();
    });

    emotionSelect.addEventListener("change", (event) => {
      line.emotionPreset = event.target.value;
      saveState();
      refreshRow();
    });

    emotionTextInput.addEventListener("input", (event) => {
      line.emotionText = event.target.value;
      saveState();
      refreshRow();
    });

    const updateLineAudioSetting = (key, value) => {
      line.audioSettings = {
        ...normalizeLineAudioSettings(line.audioSettings),
        [key]: value,
      };
      saveState();
      refreshRow();
    };

    volumeInput.addEventListener("input", (event) => {
      updateLineAudioSetting("volume", clampNumber(event.target.value, 0, 200, 100));
    });

    pitchInput.addEventListener("input", (event) => {
      updateLineAudioSetting("pitch", clampNumber(event.target.value, -12, 12, 0));
    });

    speedInput.addEventListener("input", (event) => {
      updateLineAudioSetting("speed", clampNumber(event.target.value, 50, 150, 100));
    });

    numberReadingSelect.addEventListener("change", (event) => {
      line.numberReadingMode = event.target.value || "default";
      saveState();
      refreshRow();
    });

    pronunciationBtn.addEventListener("click", () => {
      openPronunciationModal(line.id);
    });

    textInput.addEventListener("input", (event) => {
      line.text = event.target.value;
      saveState();
      refreshRow();
    });

    duplicateBtn.addEventListener("click", () => {
      state.lines.splice(index + 1, 0, createLine({
        roleId: line.roleId,
        emotionMode: line.emotionMode,
        emotionPreset: line.emotionPreset,
        emotionText: line.emotionText,
        text: line.text,
        audioSettings: line.audioSettings,
        numberReadingMode: line.numberReadingMode,
        pronunciationOverridesText: line.pronunciationOverridesText,
      }));
      saveState();
      renderLines();
    });

    removeBtn.addEventListener("click", () => {
      state.lines = state.lines.filter((item) => item.id !== line.id);
      saveState();
      renderLines();
    });

    generateBtn.addEventListener("click", async () => {
      syncSettingsFromForm();
      const role = getResolvedRoleById(line.roleId);

      try {
        if (line.isGenerating && line.pendingTaskKey) {
          await cancelGeneration(line.pendingTaskKey);
          showToast(`第 ${index + 1} 条台词正在停止`);
          return;
        }
        if (role && !isLineDirty(line, role) && line.generatedUrl) {
          await audio.play();
          return;
        }

        await generateLineAudio(line, index, { autoplay: true });
        showToast(`第 ${index + 1} 条台词生成完成`);
      } catch (error) {
        showToast(error.message, true);
      }
    });

    els.lineList.append(node);
  });

  updateTaskDock();
}

function renderMergeResult() {
  if (!state.mergeResult) {
    els.mergeResultCard.classList.add("hidden");
    return;
  }

  els.mergeResultCard.classList.remove("hidden");
  els.mergeResultAudio.src = state.mergeResult.audioUrl;
  els.mergeResultDownload.href = state.mergeResult.audioUrl;
  els.mergeResultMeta.textContent = `整段音频已生成，时长 ${state.mergeResult.durationSeconds || "?"} 秒。`;
}

function buildDownloadListItems(mergedResult) {
  const items = [];

  if (mergedResult?.audioUrl) {
    items.push({
      title: "合成音频 WAV",
      meta: `${mergedResult.audioFile} · ${mergedResult.durationSeconds || "?"} 秒`,
      url: mergedResult.audioUrl,
      filename: mergedResult.audioFile,
    });
  }

  state.lines.forEach((line, index) => {
    if (!line.generatedUrl || !line.generatedFile) return;
    const role = getRoleById(line.roleId);
    const roleName = role?.name || "未命名角色";
    const preview = (line.text || "").trim().slice(0, 36);
    const downloadInfo = getSingleLineDownloadInfo(line);
    items.push({
      title: `第 ${index + 1} 条 · ${roleName}`,
      meta: `${line.generatedFile}${preview ? ` · ${preview}` : ""}`,
      url: downloadInfo?.url || line.generatedUrl,
      filename: downloadInfo?.filename || line.generatedFile,
    });
  });

  return items;
}

function renderDownloadListModal() {
  els.downloadListBody.innerHTML = "";

  if (!state.downloadList.length) {
    const empty = document.createElement("div");
    empty.className = "download-item";
    empty.innerHTML = `
      <div class="download-item-main">
        <div class="download-item-title">还没有可下载的文件</div>
        <div class="download-item-meta">先生成单条音频或完成一次合成。</div>
      </div>
    `;
    els.downloadListBody.append(empty);
    return;
  }

  state.downloadList.forEach((item) => {
    const row = document.createElement("div");
    row.className = "download-item";
    row.innerHTML = `
      <div class="download-item-main">
        <div class="download-item-title">${item.title}</div>
        <div class="download-item-meta">${item.meta}</div>
      </div>
      <a class="secondary download-link" href="${item.url}" download="${item.filename}">下载</a>
    `;
    els.downloadListBody.append(row);
  });
}

function renderMergeProgress() {
  const task = state.mergeTask;
  if (!task || task.status === "completed" || task.status === "error" || task.status === "missing") {
    els.mergeProgressPanel.classList.add("hidden");
    els.mergeProgressFill.style.width = "0%";
    return;
  }

  const percent = typeof task.progress === "number"
    ? Math.max(0, Math.min(100, task.progress * 100))
    : 0;
  els.mergeProgressPanel.classList.remove("hidden");
  els.mergeProgressText.textContent = `${percent.toFixed(1)}%`;
  els.mergeProgressDescription.textContent = task.description || "准备合并音频...";
  els.mergeProgressFill.style.width = `${percent}%`;
}

function renderMergedAudiosModal() {
  els.mergedAudiosBody.innerHTML = "";

  if (!state.mergedAudios.length) {
    const empty = document.createElement("div");
    empty.className = "download-item";
    empty.innerHTML = `
      <div class="download-item-main">
        <div class="download-item-title">还没有合并音频</div>
        <div class="download-item-meta">先完成一次“合并音频”，这里就会记录下来。</div>
      </div>
    `;
    els.mergedAudiosBody.append(empty);
    return;
  }

  state.mergedAudios.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "download-item";
    const timeText = item.updatedAt
      ? new Date(item.updatedAt * 1000).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
      : "刚刚";
    row.innerHTML = `
      <div class="download-item-main">
        <div class="download-item-title">合并音频 ${index + 1}</div>
        <div class="download-item-meta">${item.audioFile} · ${item.durationSeconds || "?"} 秒 · ${timeText}</div>
      </div>
      <a class="secondary download-link" href="${item.audioUrl}" download="${item.audioFile}">下载</a>
    `;
    els.mergedAudiosBody.append(row);
  });
}

async function refreshMergedAudios() {
  const result = await fetchJson("/indextts-ui/api/list-merged-audios");
  state.mergedAudios = Array.isArray(result.items) ? result.items : [];
  if (!els.mergedAudiosModal.classList.contains("hidden")) {
    renderMergedAudiosModal();
  }
}

async function waitForMergeTask(taskKey) {
  while (true) {
    const task = await fetchJson(`/indextts-ui/api/merge-status?taskKey=${encodeURIComponent(taskKey)}`);
    state.mergeTask = task;
    renderMergeProgress();
    if (task.status === "completed" || task.status === "error" || task.status === "missing") {
      return task;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 350));
  }
}

function renderAll() {
  ensureLanShareUI();
  renderLanShare();
  renderVoiceCenter();
  renderRoles();
  renderLines();
  renderMergeResult();
  renderDownloadListModal();
  renderMergedAudiosModal();
  renderMergeProgress();
  renderProjectTitle();
  renderProjectSaveStatus();
  if (els.projectManagerModal && !els.projectManagerModal.classList.contains("hidden")) {
    renderProjectManager();
  }
  fillSettingsForm();
  updateTaskDock();
  scheduleGenerationPolling();
}

async function initConfig() {
  const config = await fetchJson("/indextts-ui/api/config");
  state.emotionPresets = config.emotionPresets || [];
  state.settings = { ...state.settings, ...(config.defaultSettings || {}), ...(state.settings || {}) };
  state.lanShare = { ...state.lanShare, ...(config.lanShare || {}) };
}

function ensureSeedData() {
  if (!state.roles.length) {
    state.roles.push(createRole({ name: "鏃佺櫧" }));
  }
  if (!state.lines.length) {
    state.lines.push(createLine({
      roleId: state.roles[0].id,
      emotionPreset: state.roles[0].defaultEmotion,
    }));
  }
}

async function generateAll() {
  if (state.isGeneratingAll) return;
  syncSettingsFromForm();

  if (!state.lines.length) {
    showToast("还没有可生成的台词。", true);
    return;
  }

  state.isGeneratingAll = true;
  setBatchGenerationTask({
    mode: "all",
    label: "批量生成中",
    current: 0,
    total: state.lines.length,
    currentLineIndex: 0,
    description: "正在准备第一条台词...",
  });
  setButtonBusy(els.generateAllBtn, true, `批量生成中 0/${state.lines.length}...`);

  try {
    for (const [index, line] of state.lines.entries()) {
      setBatchGenerationTask({
        mode: "all",
        label: "批量生成中",
        current: index + 1,
        total: state.lines.length,
        currentLineIndex: index,
        description: `正在处理第 ${index + 1}/${state.lines.length} 条台词`,
      });
      primeBatchLineUI(line, `等待启动第 ${index + 1}/${state.lines.length} 条台词...`);
      setButtonBusy(els.generateAllBtn, true, `批量生成中 ${index + 1}/${state.lines.length}...`);
      let result;
      try {
        result = await generateLineAudio(line, index);
      } catch (error) {
        clearPrimedBatchLineUI(line);
        throw error;
      }
      if (result?.status === "cancelled") {
        showToast("批量生成已停止");
        break;
      }
    }

    showToast("批量生成完成");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    state.isGeneratingAll = false;
    setBatchGenerationTask(null);
    setButtonBusy(els.generateAllBtn, false, "", "批量生成音频");
  }
}

async function generateMissingOnly() {
  if (state.isGeneratingAll) return;
  syncSettingsFromForm();

  const pendingLines = state.lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => doesLineNeedGeneration(line));

  if (!pendingLines.length) {
    showToast("当前没有需要生成的台词。", true);
    return;
  }

  state.isGeneratingAll = true;
  setBatchGenerationTask({
    mode: "missing",
    label: "生成未生成中",
    current: 0,
    total: pendingLines.length,
    currentLineIndex: pendingLines[0]?.index ?? 0,
    description: "正在准备第一条待生成台词...",
  });
  setButtonBusy(els.generateMissingBtn, true, `生成未生成中 0/${pendingLines.length}...`);
  setButtonBusy(els.generateAllBtn, true, "批量生成中...");

  try {
    for (const [queueIndex, item] of pendingLines.entries()) {
      setBatchGenerationTask({
        mode: "missing",
        label: "生成未生成中",
        current: queueIndex + 1,
        total: pendingLines.length,
        currentLineIndex: item.index,
        description: `正在处理第 ${queueIndex + 1}/${pendingLines.length} 条待生成台词`,
      });
      primeBatchLineUI(item.line, `等待启动第 ${queueIndex + 1}/${pendingLines.length} 条待生成台词...`);
      setButtonBusy(els.generateMissingBtn, true, `生成未生成中 ${queueIndex + 1}/${pendingLines.length}...`);
      let result;
      try {
        result = await generateLineAudio(item.line, item.index);
      } catch (error) {
        clearPrimedBatchLineUI(item.line);
        throw error;
      }
      if (result?.status === "cancelled") {
        showToast("批量生成已停止");
        break;
      }
    }

    showToast(`待生成台词已处理完成，共 ${pendingLines.length} 条。`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    state.isGeneratingAll = false;
    setBatchGenerationTask(null);
    setButtonBusy(els.generateMissingBtn, false, "", "仅批量生成未生成");
    setButtonBusy(els.generateAllBtn, false, "", "批量生成音频");
  }
}

async function mergeGenerated() {
  if (state.mergeTask && state.mergeTask.status === "running") return;
  syncSettingsFromForm();
  const files = state.lines.map((line) => line.generatedFile).filter(Boolean);
  if (!files.length) {
    showToast("请先生成至少一条音频。", true);
    return;
  }

  try {
    const taskKey = uid("merge");
    state.mergeTask = {
      taskKey,
      status: "running",
      progress: 0,
      description: "准备合并音频...",
    };
    setButtonBusy(els.mergeBtn, true, "合并中...");
    renderMergeProgress();
    const started = await fetchJson("/indextts-ui/api/merge-audios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskKey,
        files,
        silenceMs: state.settings.mergeSilenceMs,
        outputPrefix: state.settings.outputPrefix,
      }),
    });
    const task = await waitForMergeTask(started.taskKey || taskKey);
    if (task.status === "error") {
      throw new Error(task.error || "合并失败");
    }
    if (task.status === "missing" || !task.result) {
      throw new Error("合并任务状态丢失，请重试。");
    }
    state.mergeResult = task.result;
    await refreshMergedAudios();
    renderMergeResult();
    openMergedAudiosModal();
    showToast("合并音频完成");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setButtonBusy(els.mergeBtn, false, "", "合并音频");
    if (state.mergeTask?.status !== "running") {
      renderMergeProgress();
    }
  }
}

function exportProject() {
  syncSettingsFromForm();
  const payload = {
    ...createWorkspaceSnapshot(),
    exportedAt: new Date().toISOString(),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const exportName = state.currentProjectName || state.settings.outputPrefix || "indextts_ui";
  link.download = `${exportName}_project.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importProject(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const importedName = (parsed.currentProjectName || file.name.replace(/\.[^.]+$/, "")).trim();
      loadProjectSnapshot(parsed, {
        projectId: parsed.currentProjectId || uid("project"),
        projectName: importedName,
      });
      saveState();
      renderAll();
      showToast("项目已导入");
    } catch (error) {
      showToast(`导入失败：${error.message}`, true);
    }
  };
  reader.readAsText(file, "utf-8");
}

function insertDemo() {
  const narrator = state.roles[0] || createRole({ name: "鏃佺櫧" });
  if (!state.roles.length) {
    state.roles.push(narrator);
  }
  state.lines.push(
    createLine({ roleId: narrator.id, emotionPreset: narrator.defaultEmotion, text: "欢迎来到 IndexTTS 对白工作台。" }),
    createLine({ roleId: narrator.id, emotionPreset: "开心", text: "你可以为每条台词指定角色和情绪，然后一键批量生成。" }),
  );
  saveState();
  renderAll();
}

function clearOutputs() {
  state.lines = state.lines.map((line) => createLine({
    ...line,
    generatedFile: "",
    generatedUrl: "",
    durationSeconds: null,
    generatedSignature: "",
    pendingTaskKey: "",
    pendingSignature: "",
    pendingProgress: null,
    pendingDescription: "",
  }));
  state.mergeResult = null;
  state.downloadList = [];
  saveState();
  renderAll();
}

function completeCloseCurrentProject() {
  resetWorkspace({ keepProjectIdentity: false });
  saveState({ skipProjectSync: true });
  renderAll();
  showToast("当前项目已关闭并保存。");
}

function saveCurrentProject({ closeAfterSave = false } = {}) {
  syncSettingsFromForm();
  if (!state.currentProjectName.trim()) {
    openSaveProjectModal({ closeAfterSave });
    return;
  }

  if (!state.currentProjectId) {
    state.currentProjectId = uid("project");
  }
  saveState();
  renderProjectTitle();
  if (!els.projectManagerModal.classList.contains("hidden")) {
    renderProjectManager();
  }
  showToast(`项目“${state.currentProjectName}”已保存。`);

  if (closeAfterSave) {
    completeCloseCurrentProject();
  }
}

function confirmSaveCurrentProject() {
  const name = (els.saveProjectNameInput.value || "").trim();
  if (!name) {
    showToast("请先输入项目名称。", true);
    els.saveProjectNameInput.focus();
    return;
  }

  state.currentProjectName = name;
  if (!state.currentProjectId) {
    state.currentProjectId = uid("project");
  }
  saveState();
  renderProjectTitle();
  if (!els.projectManagerModal.classList.contains("hidden")) {
    renderProjectManager();
  }
  const shouldCloseAfterSave = pendingProjectCloseAfterSave;
  closeSaveProjectModal();
  showToast(`项目“${name}”已保存。`);

  if (shouldCloseAfterSave) {
    completeCloseCurrentProject();
  }
}

function closeCurrentProject() {
  syncSettingsFromForm();
  if (!isWorkspaceMeaningful()) {
    completeCloseCurrentProject();
    return;
  }

  if (state.currentProjectName.trim()) {
    saveCurrentProject({ closeAfterSave: true });
    return;
  }

  openSaveProjectModal({ closeAfterSave: true });
}

function clearCurrentDialogues() {
  state.lines = [];
  state.mergeResult = null;
  state.downloadList = [];
  saveState();
  renderAll();
  showToast("当前对白已清空。");
}

function setBatchGenerationTask(task) {
  state.batchGenerationTask = task;
  updateTaskDock();
}

function primeBatchLineUI(line, description) {
  line.isGenerating = true;
  line.pendingProgress = typeof line.pendingProgress === "number" && line.pendingProgress > 0
    ? line.pendingProgress
    : 0.02;
  line.pendingDescription = description || "等待生成任务启动...";
  line.pendingUpdatedAt = Date.now();
  refreshLineViews([line]);
}

function clearPrimedBatchLineUI(line) {
  if (line.pendingTaskKey) return;
  line.isGenerating = false;
  line.pendingProgress = null;
  line.pendingDescription = "";
  line.pendingUpdatedAt = 0;
  refreshLineViews([line]);
}

async function warmupModel() {
  syncSettingsFromForm();
  try {
    await fetchJson("/indextts-ui/api/load-model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: state.settings,
      }),
    });
    showToast("模型已经加载完成，可以开始生成。");
  } catch (error) {
    showToast(error.message, true);
  }
}

function bindEvents() {
  ensureToolbarButtons();
  ensureAuthUI();
  ensureAuthEntryUI();
  ensureLanShareUI();
  ensureVoiceCenterUI();
  removeLegacySettingsSliders();

  els.toggleLanShareBtn?.addEventListener("click", () => {
    toggleLanShare();
  });

  els.copyLanShareBtn?.addEventListener("click", () => {
    copyLanShareUrl();
  });

  els.authEntryBtn?.addEventListener("click", () => {
    openAuthModal();
  });

  els.authLogoutEntryBtn?.addEventListener("click", () => {
    logoutAuth();
  });

  els.closeAuthModalBtn?.addEventListener("click", () => {
    closeAuthModal();
  });

  els.authSubmitBtn?.addEventListener("click", () => {
    submitAuthForm();
  });

  els.authSwitchBtn?.addEventListener("click", () => {
    state.auth.mode = state.auth.mode === "register" ? "login" : "register";
    if (els.authPassword) {
      els.authPassword.value = "";
    }
    renderAuthState();
    els.authUsername?.focus();
  });

  els.authLogoutBtn?.addEventListener("click", () => {
    logoutAuth();
  });

  els.authModal?.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.dataset.closeModal === "auth") {
      closeAuthModal();
    }
  });

  [els.authUsername, els.authPassword].forEach((input) => {
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitAuthForm();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeAuthModal();
      }
    });
  });

  els.openSettingsBtn.addEventListener("click", () => {
    openSettingsModal();
  });

  els.openProjectManagerBtn.addEventListener("click", () => {
    openProjectManagerModal();
  });

  els.saveCurrentProjectBtn.addEventListener("click", () => {
    saveCurrentProject();
  });

  els.closeCurrentProjectBtn.addEventListener("click", () => {
    closeCurrentProject();
  });

  els.clearCurrentDialoguesBtn.addEventListener("click", () => {
    clearCurrentDialogues();
  });

  els.addRoleBtn.addEventListener("click", () => {
    state.roles.push(createRole());
    if (!state.lines.length) {
      state.lines.push(createLine({ roleId: state.roles[0].id }));
    }
    saveState();
    renderAll();
  });

  els.addLineBtn.addEventListener("click", () => {
    openScriptImportModal();
  });

  els.pasteScriptBtn?.addEventListener("click", () => {
    openScriptImportModal();
  });

  els.closeScriptImportModalBtn.addEventListener("click", () => {
    closeScriptImportModal();
  });

  els.closeDownloadListModalBtn.addEventListener("click", () => {
    closeDownloadListModal();
  });

  els.openMergedAudiosBtn.addEventListener("click", async () => {
    try {
      await refreshMergedAudios();
      openMergedAudiosModal();
    } catch (error) {
      showToast(error.message, true);
    }
  });

  els.closeMergedAudiosModalBtn.addEventListener("click", () => {
    closeMergedAudiosModal();
  });

  els.closeProjectManagerModalBtn.addEventListener("click", () => {
    closeProjectManagerModal();
  });

  els.closeSaveProjectModalBtn.addEventListener("click", () => {
    closeSaveProjectModal();
  });

  els.cancelSaveProjectBtn.addEventListener("click", () => {
    closeSaveProjectModal();
  });

  els.confirmSaveProjectBtn.addEventListener("click", () => {
    confirmSaveCurrentProject();
  });

  els.closeSettingsModalBtn.addEventListener("click", () => {
    closeSettingsModal();
  });

  els.closePronunciationModalBtn?.addEventListener("click", () => {
    closePronunciationModal();
  });

  els.cancelPronunciationBtn?.addEventListener("click", () => {
    closePronunciationModal();
  });

  els.clearPronunciationBtn?.addEventListener("click", () => {
    if (!els.pronunciationInput) return;
    els.pronunciationInput.value = "";
    els.pronunciationInput.focus();
  });

  els.savePronunciationBtn?.addEventListener("click", () => {
    savePronunciationOverridesForActiveLine();
  });

  els.voiceCenterBtn.addEventListener("click", () => {
    openVoiceCenterModal();
  });

  els.closeVoiceCenterModalBtn.addEventListener("click", () => {
    closeVoiceCenterModal();
  });

  els.scriptImportModal.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.dataset.closeModal === "script-import") {
      closeScriptImportModal();
    }
  });

  els.downloadListModal.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.dataset.closeModal === "download-list") {
      closeDownloadListModal();
    }
  });

  els.mergedAudiosModal.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.dataset.closeModal === "merged-audios") {
      closeMergedAudiosModal();
    }
  });

  els.projectManagerModal.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.dataset.closeModal === "project-manager") {
      closeProjectManagerModal();
    }
  });

  els.saveProjectModal.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.dataset.closeModal === "save-project") {
      closeSaveProjectModal();
    }
  });

  els.settingsModal.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.dataset.closeModal === "settings") {
      closeSettingsModal();
    }
  });

  els.pronunciationModal?.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.dataset.closeModal === "pronunciation") {
      closePronunciationModal();
    }
  });

  els.voiceCenterModal.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.dataset.closeModal === "voice-center") {
      closeVoiceCenterModal();
    }
  });

  els.quickAddLineBtn.addEventListener("click", () => {
    addBlankLine();
    closeScriptImportModal();
  });

  els.importScriptBtn.addEventListener("click", () => {
    importScriptText(els.scriptInput.value);
  });

  els.voiceUploadBtn.addEventListener("click", () => {
    els.voiceUploadInput.click();
  });

  els.voiceUploadInput.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    try {
      await uploadVoiceFile(file);
    } catch (error) {
      showToast(error.message, true);
    } finally {
      event.target.value = "";
    }
  });

  els.scriptInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeScriptImportModal();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      importScriptText(els.scriptInput.value);
    }
  });

  els.pronunciationInput?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closePronunciationModal();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      savePronunciationOverridesForActiveLine();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!els.downloadListModal.classList.contains("hidden")) {
      closeDownloadListModal();
      return;
    }
    if (els.voiceCenterModal && !els.voiceCenterModal.classList.contains("hidden")) {
      closeVoiceCenterModal();
      return;
    }
    if (els.pronunciationModal && !els.pronunciationModal.classList.contains("hidden")) {
      closePronunciationModal();
      return;
    }
    if (!els.scriptImportModal.classList.contains("hidden")) {
      closeScriptImportModal();
    }
  });

  els.insertDemoBtn.addEventListener("click", insertDemo);
  els.generateAllBtn.addEventListener("click", generateAll);
  els.generateMissingBtn.addEventListener("click", generateMissingOnly);
  els.mergeBtn.addEventListener("click", mergeGenerated);
  els.clearOutputsBtn.addEventListener("click", clearOutputs);
  els.exportBtn.addEventListener("click", exportProject);
  els.importBtn.addEventListener("click", () => els.importInput.click());
  els.importInput.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    if (file) {
      importProject(file);
    }
    event.target.value = "";
  });
  els.loadModelBtn.addEventListener("click", warmupModel);
  els.saveWorkspaceBtn?.addEventListener("click", () => {
    saveWorkspaceNow({ skipProjectSync: !state.currentProjectName });
  });
  els.currentProjectTitle?.addEventListener("dblclick", beginProjectTitleEdit);
  els.currentProjectTitleInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finishProjectTitleEdit({ commit: true });
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      finishProjectTitleEdit({ commit: false });
    }
  });
  els.currentProjectTitleInput?.addEventListener("blur", () => {
    if (els.currentProjectTitleInput.classList.contains("hidden")) return;
    finishProjectTitleEdit({ commit: true });
  });
  els.taskDock.addEventListener("click", () => {
    const pendingLines = getPendingLinesWithIndex();
    if (pendingLines.length) {
      const current = getTaskDockTarget(pendingLines);
      if (!current) return;
      scrollToLine(current.line.id);
      updateTaskDock();
      return;
    }
    const batchTask = state.batchGenerationTask;
    if (!batchTask || typeof batchTask.currentLineIndex !== "number") return;
    const line = state.lines[batchTask.currentLineIndex];
    if (!line) return;
    scrollToLine(line.id);
    updateTaskDock();
  });

  [els.localFilesOnly, els.outputPrefix, els.mergeSilenceMs].forEach((element) => {
    element.addEventListener("change", () => {
      syncSettingsFromForm();
      saveState();
    });
  });

  els.saveProjectNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      confirmSaveCurrentProject();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (els.voiceCenterModal && !els.voiceCenterModal.classList.contains("hidden")) {
      closeVoiceCenterModal();
      return;
    }
    if (!els.saveProjectModal.classList.contains("hidden")) {
      closeSaveProjectModal();
      return;
    }
    if (!els.projectManagerModal.classList.contains("hidden")) {
      closeProjectManagerModal();
      return;
    }
    if (!els.settingsModal.classList.contains("hidden")) {
      closeSettingsModal();
      return;
    }
    if (els.pronunciationModal && !els.pronunciationModal.classList.contains("hidden")) {
      closePronunciationModal();
      return;
    }
    if (!els.downloadListModal.classList.contains("hidden")) {
      closeDownloadListModal();
      return;
    }
    if (!els.mergedAudiosModal.classList.contains("hidden")) {
      closeMergedAudiosModal();
      return;
    }
    if (!els.scriptImportModal.classList.contains("hidden")) {
      closeScriptImportModal();
    }
  });
}

async function boot() {
  try {
    await initConfig();
    loadState();
    ensureSeedData();
    bindEvents();
    await fetchAuthStatus();
    if (!state.auth.requireAuth || state.auth.authenticated) {
      await refreshMergedAudios();
    } else {
      state.mergedAudios = [];
    }
    await syncVoicesFromServer({ migrateLegacy: true });
    startAutoSave();
    renderAll();
    reconcilePendingGenerations().catch((error) => {
      console.warn("Initial generation status sync failed", error);
    });
  } catch (error) {
    showToast(`页面初始化失败：${error.message}`, true);
  }
}

boot();

