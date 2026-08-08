import HarnessSidebar from "./components/harness-sidebar.js";
import HarnessChat from "./components/harness-chat.js";
import WorkspacePanel from "./components/workspace-panel.js";
import StreamPanel from "./components/stream-panel.js";
import ColumnResizeHandle from "./components/column-resize-handle.js";
import { mountAppShell } from "./components/app-shell.js";
import { appendMessageText } from "./lib/message-rendering.js";
import {
  defaultProviderSettings,
  normalizeToolPermissions,
} from "./lib/settings.js";
import { CONFIG_TEMPLATES, mcpBlocks, quoteToml, setToolBlockEnabled } from "./lib/mcp-config.js";
import { appendEvent, describeAgentEvent, renderEventList } from "./lib/event-rendering.js";
import { readFileAsDataUrl, renderImagePreviews as renderImagePreviewList } from "./lib/image-attachments.js";
import { createSession, promptHistoryFromSessions, titleFromPrompt } from "./lib/sessions.js";
import { renderWorkspaceNodes, renderWorkspacePicker } from "./lib/workspace-rendering.js";
import { loadUiState, saveUiState } from "./services/ui-state-api.js";
import {
  loadWorkspaceFile,
  loadWorkspaceTree as fetchWorkspaceTree,
  saveWorkspaceFile,
} from "./services/workspace-api.js";
import {
  loadConfig as fetchConfig,
  loadHealth as fetchHealth,
  loadProviderModels as fetchProviderModels,
  loadSystemPrompts as fetchSystemPrompts,
  saveConfig as persistConfig,
  saveSystemPrompt as persistSystemPrompt,
} from "./services/settings-api.js";
import SocketService from "./services/socket-service.js";

const appShell = mountAppShell();
const sidebarComponent = document.querySelector("harness-sidebar");
const chatComponent = document.querySelector("harness-chat");
const workspaceComponent = document.querySelector("workspace-panel");
const streamComponent = document.querySelector("stream-panel");
const workspacePickerModal = document.querySelector("workspace-picker-modal");
const fileEditorModal = document.querySelector("file-editor-modal");
const providersModal = document.querySelector("providers-modal");
const systemPromptsModal = document.querySelector("system-prompts-modal");
const toolsModal = document.querySelector("tools-modal");
const mcpModal = document.querySelector("mcp-modal");

const socketState = document.querySelector("#socketState");
const workspaceMeta = document.querySelector("#workspaceMeta");
const workspaceInput = document.querySelector("#workspaceInput");
const messages = document.querySelector("#messages");
const eventList = document.querySelector("#eventList");
const promptInput = document.querySelector("#promptInput");
const sendButton = document.querySelector("#sendButton");
const imagePreviewList = document.querySelector("#imagePreviewList");
const emptyState = document.querySelector("#emptyState");
const recentsList = document.querySelector("#recentsList");
const settingsDialog = document.querySelector("#settingsDialog");
const systemPromptsDialog = document.querySelector("#systemPromptsDialog");
const systemPromptsList = document.querySelector("#systemPromptsList");
const systemPromptEditor = document.querySelector("#systemPromptEditor");
const systemPromptEditorTitle = document.querySelector("#systemPromptEditorTitle");
const systemPromptContent = document.querySelector("#systemPromptContent");
const systemPromptsStatus = document.querySelector("#systemPromptsStatus");
const saveSystemPromptButton = document.querySelector("#saveSystemPromptButton");
const configInput = document.querySelector("#configInput");
const configStatus = document.querySelector("#configStatus");
const saveConfigButton = document.querySelector("#saveConfigButton");
const settingsStatus = document.querySelector("#settingsStatus");
const reloadConfigButton = document.querySelector("#reloadConfigButton");
const toolsDialog = document.querySelector("#toolsDialog");
const mcpDialog = document.querySelector("#mcpDialog");
const toolPermissionsStatus = document.querySelector("#toolPermissionsStatus");
const toolTypeSelect = document.querySelector("#toolTypeSelect");
const toolLabelInput = document.querySelector("#toolLabelInput");
const toolUrlInput = document.querySelector("#toolUrlInput");
const toolCommandInput = document.querySelector("#toolCommandInput");
const toolArgsInput = document.querySelector("#toolArgsInput");
const toolCwdInput = document.querySelector("#toolCwdInput");
const addToolButton = document.querySelector("#addToolButton");
const mcpTableToolbar = document.querySelector("#mcpTableToolbar");
const mcpEditor = document.querySelector("#mcpEditor");
const reloadToolsButton = document.querySelector("#reloadToolsButton");
const toolsList = document.querySelector("#toolsList");
const toolsStatus = document.querySelector("#toolsStatus");
const providerSelect = document.querySelector("#providerSelect");
const providerSettingsSection = document.querySelector("#providerSettings");
const providerNameInput = document.querySelector("#providerNameInput");
const providersTableBody = document.querySelector("#providersTableBody");
const providerEditor = document.querySelector("#providerEditor");
const saveSettingsButton = document.querySelector("#saveSettingsButton");
const providerModelInput = document.querySelector("#providerModelInput");
const providerBaseUrlInput = document.querySelector("#providerBaseUrlInput");
const providerApiKeyInput = document.querySelector("#providerApiKeyInput");
const providerApiKeyField = document.querySelector("#providerApiKeyField");
const refreshModelsButton = document.querySelector("#refreshModelsButton");
const providerModelsStatus = document.querySelector("#providerModelsStatus");
const toolPermissionInputs = [...document.querySelectorAll("[data-tool-permission]")];
const sidebarToggleButton = document.querySelector("#sidebarToggleButton");
const sidebarResizeHandle = document.querySelector("#sidebarResizeHandle");
const streamResizeHandle = document.querySelector("#streamResizeHandle");
const toggleFilesColumnButton = document.querySelector("#toggleFilesColumnButton");
const toggleStreamColumnButton = document.querySelector("#toggleStreamColumnButton");
const filesResizeHandle = document.querySelector("#filesResizeHandle");
const workspaceTreeElement = document.querySelector("#workspaceTree");
const filesWorkspaceLabel = document.querySelector("#filesWorkspaceLabel");
const selectWorkspaceRootButton = document.querySelector("#selectWorkspaceRootButton");
const workspacePickerDialog = document.querySelector("#workspacePickerDialog");
const workspacePickerTree = document.querySelector("#workspacePickerTree");
const workspacePickerPath = document.querySelector("#workspacePickerPath");
const parentWorkspacePickerButton = document.querySelector("#parentWorkspacePickerButton");
const confirmWorkspacePickerButton = document.querySelector("#confirmWorkspacePickerButton");
const fileEditorDialog = document.querySelector("#fileEditorDialog");
const fileEditorTitle = document.querySelector("#fileEditorTitle");
const fileEditorPath = document.querySelector("#fileEditorPath");
const fileEditorContent = document.querySelector("#fileEditorContent");
const fileEditorStatus = document.querySelector("#fileEditorStatus");
const saveFileEditorButton = document.querySelector("#saveFileEditorButton");

let socketService;
let runActive = false;
let activeSessionId = null;
let pendingSessionId = null;
let promptHistoryIndex = null;
let promptHistoryDraft = "";
let streamingAnswer = null;
let attachedImages = [];
let defaultWorkspace = ".";
let workspaceBrowserRoot = null;
let workspaceBrowserNodes = [];
let pendingWorkspacePath = null;
let workspacePickerRoot = null;
let workspacePickerParent = null;
let editingFilePath = null;

const MIN_STREAM_WIDTH = 260;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SIDEBAR_WIDTH_STORAGE_KEY = "ai-harness.sidebarWidth";
const STREAM_WIDTH_STORAGE_KEY = "ai-harness.streamWidth";
const FILES_WIDTH_STORAGE_KEY = "ai-harness.filesWidth";
const FILES_VISIBLE_STORAGE_KEY = "ai-harness.filesVisible";
const STREAM_VISIBLE_STORAGE_KEY = "ai-harness.streamVisible";

let toolsConfigContent = "";
let systemPrompts = [];
let editingSystemPromptKey = null;

function renderSystemPrompts() {
  systemPromptsList.replaceChildren();
  for (const prompt of systemPrompts) {
    const row = document.createElement("article"); row.className = "systemPromptRow";
    const title = document.createElement("strong"); title.textContent = prompt.title;
    const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "Edit";
    edit.addEventListener("click", () => {
      editingSystemPromptKey = prompt.key;
      systemPromptEditorTitle.textContent = prompt.title;
      systemPromptContent.value = prompt.content;
      systemPromptsList.hidden = true; systemPromptEditor.hidden = false; saveSystemPromptButton.hidden = false;
    });
    row.append(title, edit); systemPromptsList.append(row);
  }
}

async function loadSystemPrompts() {
  systemPrompts = await fetchSystemPrompts();
  renderSystemPrompts();
}

async function saveSystemPrompt() {
  await persistSystemPrompt(editingSystemPromptKey, systemPromptContent.value);
  systemPromptsStatus.textContent = "System prompt saved"; systemPromptsStatus.dataset.state = "success";
  systemPromptEditor.hidden = true; systemPromptsList.hidden = false; saveSystemPromptButton.hidden = true;
  await loadSystemPrompts();
}

let sessions = [];
let providerSettings = defaultProviderSettings();
let providers = [];
let editingProviderId = null;
let storedToolPermissions = normalizeToolPermissions();
let sidebarWidth = 344;
let streamWidth = 360;
let filesWidth = 300;
let uiStateSaveQueue = Promise.resolve();

function persistUiState(state) {
  uiStateSaveQueue = uiStateSaveQueue
    .then(() => saveUiState(state))
    .catch((error) => addEvent("UI state save failed", error.message, { persist: false }));
}

function applySidebarState(collapsed) {
  appShell.classList.toggle("sidebar-collapsed", collapsed);
  sidebarToggleButton.setAttribute("aria-pressed", String(collapsed));
  sidebarToggleButton.setAttribute(
    "aria-label",
    collapsed ? "Expand sidebar" : "Collapse sidebar",
  );
  sidebarToggleButton.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
}

function toggleSidebar() {
  const collapsed = !appShell.classList.contains("sidebar-collapsed");
  persistUiState({ sidebarCollapsed: collapsed });
  applySidebarState(collapsed);
}

function applyRightColumnState(column, visible) {
  const isFiles = column === "files";
  const className = isFiles ? "files-collapsed" : "stream-collapsed";
  const button = isFiles ? toggleFilesColumnButton : toggleStreamColumnButton;
  const label = isFiles ? "workspace" : "stream";
  appShell.classList.toggle(className, !visible);
  button.setAttribute("aria-pressed", String(visible));
  button.title = `${visible ? "Hide" : "Show"} ${label} column`;
  button.setAttribute("aria-label", button.title);
}

function toggleRightColumn(column) {
  const isFiles = column === "files";
  const visible = appShell.classList.contains(isFiles ? "files-collapsed" : "stream-collapsed");
  localStorage.setItem(isFiles ? FILES_VISIBLE_STORAGE_KEY : STREAM_VISIBLE_STORAGE_KEY, String(visible));
  applyRightColumnState(column, visible);
}

function setSidebarWidth(width) {
  const clamped = Math.max(width, MIN_SIDEBAR_WIDTH);
  appShell.style.setProperty("--sidebar-width", `${clamped}px`);
  sidebarResizeHandle.setAttribute("aria-valuemin", String(MIN_SIDEBAR_WIDTH));
  sidebarResizeHandle.setAttribute("aria-valuenow", String(clamped));
  sidebarWidth = clamped;
  localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clamped));
}

function startSidebarResize(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  appShell.classList.remove("sidebar-collapsed");
  applySidebarState(false);
  persistUiState({ sidebarCollapsed: false });
  appShell.classList.add("resizing-column");
  sidebarResizeHandle.classList.add("is-resizing");
  sidebarResizeHandle.setPointerCapture(event.pointerId);
  const move = (moveEvent) => setSidebarWidth(moveEvent.clientX);
  const stop = () => {
    appShell.classList.remove("resizing-column");
    sidebarResizeHandle.classList.remove("is-resizing");
    sidebarResizeHandle.removeEventListener("pointermove", move);
    sidebarResizeHandle.removeEventListener("pointerup", stop);
    sidebarResizeHandle.removeEventListener("pointercancel", stop);
  };
  sidebarResizeHandle.addEventListener("pointermove", move);
  sidebarResizeHandle.addEventListener("pointerup", stop);
  sidebarResizeHandle.addEventListener("pointercancel", stop);
}

function clampStreamWidth(width) {
  return Math.max(width, MIN_STREAM_WIDTH);
}

function setStreamWidth(width) {
  const clamped = clampStreamWidth(width);
  appShell.style.setProperty("--stream-width", `${clamped}px`);
  streamResizeHandle.setAttribute("aria-valuemin", String(MIN_STREAM_WIDTH));
  streamResizeHandle.setAttribute("aria-valuenow", String(clamped));
  streamWidth = clamped;
  localStorage.setItem(STREAM_WIDTH_STORAGE_KEY, String(clamped));
}

function startStreamResize(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  appShell.classList.add("resizing-column");
  streamResizeHandle.classList.add("is-resizing");
  streamResizeHandle.setPointerCapture(event.pointerId);

  const move = (moveEvent) => {
    setStreamWidth(window.innerWidth - moveEvent.clientX - 4);
  };
  const stop = () => {
    appShell.classList.remove("resizing-column");
    streamResizeHandle.classList.remove("is-resizing");
    streamResizeHandle.removeEventListener("pointermove", move);
    streamResizeHandle.removeEventListener("pointerup", stop);
    streamResizeHandle.removeEventListener("pointercancel", stop);
  };

  streamResizeHandle.addEventListener("pointermove", move);
  streamResizeHandle.addEventListener("pointerup", stop);
  streamResizeHandle.addEventListener("pointercancel", stop);
}

function setFilesWidth(width) {
  const clamped = Math.max(width, 220);
  appShell.style.setProperty("--files-width", `${clamped}px`);
  filesResizeHandle.setAttribute("aria-valuemin", "220");
  filesResizeHandle.setAttribute("aria-valuenow", String(clamped));
  filesWidth = clamped;
  localStorage.setItem(FILES_WIDTH_STORAGE_KEY, String(clamped));
}

function startFilesResize(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  appShell.classList.add("resizing-column");
  filesResizeHandle.classList.add("is-resizing");
  filesResizeHandle.setPointerCapture(event.pointerId);
  const move = (moveEvent) => {
    const visibleStreamWidth = appShell.classList.contains("stream-collapsed") ? 0 : streamWidth + 8;
    setFilesWidth(window.innerWidth - moveEvent.clientX - visibleStreamWidth - 4);
  };
  const stop = () => {
    appShell.classList.remove("resizing-column"); filesResizeHandle.classList.remove("is-resizing");
    filesResizeHandle.removeEventListener("pointermove", move);
    filesResizeHandle.removeEventListener("pointerup", stop);
    filesResizeHandle.removeEventListener("pointercancel", stop);
  };
  filesResizeHandle.addEventListener("pointermove", move);
  filesResizeHandle.addEventListener("pointerup", stop);
  filesResizeHandle.addEventListener("pointercancel", stop);
}

async function openFileEditor(node) {
  const workspace = activeSession()?.workspace || defaultWorkspace;
  editingFilePath = node.path;
  fileEditorTitle.textContent = node.name;
  fileEditorPath.textContent = node.path;
  fileEditorContent.value = "";
  fileEditorContent.disabled = true;
  saveFileEditorButton.disabled = true;
  fileEditorStatus.textContent = "Loading…";
  fileEditorDialog.showModal();
  try {
    const content = await loadWorkspaceFile(workspace, node.path);
    if (editingFilePath !== node.path || !fileEditorDialog.open) return;
    fileEditorContent.value = content;
    fileEditorContent.disabled = false;
    saveFileEditorButton.disabled = false;
    fileEditorStatus.textContent = "";
    fileEditorContent.focus();
  } catch (error) {
    fileEditorStatus.textContent = error.message;
  }
}

async function saveEditedFile() {
  if (!editingFilePath) return;
  saveFileEditorButton.disabled = true;
  fileEditorStatus.textContent = "Saving…";
  try {
    await saveWorkspaceFile(
      activeSession()?.workspace || defaultWorkspace,
      editingFilePath,
      fileEditorContent.value,
    );
    fileEditorStatus.textContent = "Saved";
    addEvent("File saved", editingFilePath);
  } catch (error) {
    fileEditorStatus.textContent = error.message;
  } finally {
    saveFileEditorButton.disabled = false;
  }
}

async function loadWorkspaceTree() {
  const selectedWorkspace = activeSession()?.workspace || defaultWorkspace;
  filesWorkspaceLabel.textContent = selectedWorkspace;
  workspaceTreeElement.innerHTML = '<p class="workspaceTreeStatus">Loading files…</p>';
  selectWorkspaceRootButton.disabled = true;
  try {
    const payload = await fetchWorkspaceTree(selectedWorkspace);
    workspaceBrowserRoot = payload.root;
    workspaceBrowserNodes = payload.tree || [];
    selectWorkspaceRootButton.disabled = false;
    selectWorkspaceRootButton.title = "Choose workspace folder";
    workspaceTreeElement.replaceChildren();
    renderWorkspaceNodes(workspaceBrowserNodes, workspaceTreeElement, {
      onOpenFile: openFileEditor,
      onSelectFolder(path) { workspaceInput.value = path; saveActiveWorkspace(); },
    });
  } catch (error) {
    workspaceBrowserRoot = null;
    workspaceBrowserNodes = [];
    workspaceTreeElement.innerHTML = "";
    const status = document.createElement("p"); status.className = "workspaceTreeStatus"; status.textContent = error.message;
    workspaceTreeElement.append(status);
  }
}

function chooseWorkspacePickerPath(path) {
  pendingWorkspacePath = path;
  workspacePickerPath.textContent = path;
  workspacePickerTree.querySelectorAll(".workspacePickerOption").forEach((button) => {
    button.classList.toggle("selected", button.dataset.path === path);
  });
}

async function loadWorkspacePickerRoot(rootPath) {
  parentWorkspacePickerButton.disabled = true;
  workspacePickerTree.innerHTML = '<p class="workspaceTreeStatus">Loading folders…</p>';
  const payload = await fetchWorkspaceTree(rootPath);
  workspacePickerRoot = payload.root;
  workspacePickerParent = payload.parent;
  parentWorkspacePickerButton.disabled = workspacePickerParent === workspacePickerRoot;
  renderWorkspacePicker(workspacePickerTree, workspacePickerRoot, payload.tree || [], {
    onChoose: chooseWorkspacePickerPath,
    onConfirm: () => confirmWorkspacePickerButton.click(),
  });
  chooseWorkspacePickerPath(workspacePickerRoot);
}

async function openWorkspacePicker() {
  if (!workspaceBrowserRoot) return;
  workspacePickerDialog.showModal();
  try { await loadWorkspacePickerRoot(workspaceBrowserRoot); } catch (error) { workspacePickerPath.textContent = error.message; }
}

function saveSessions() {
  persistUiState({ sessions });
}

function activeSession() {
  return sessions.find((session) => session.id === activeSessionId);
}

function renderWorkspace() {
  workspaceInput.value = activeSession()?.workspace || defaultWorkspace;
}

function saveActiveWorkspace() {
  const session = activeSession();
  if (!session) return;
  const workspace = workspaceInput.value.trim();
  if (!workspace) {
    workspaceInput.value = session.workspace || defaultWorkspace;
    return;
  }
  if (workspace === session.workspace) return;
  session.workspace = workspace;
  filesWorkspaceLabel.textContent = workspace;
  session.updatedAt = Date.now();
  saveSessions();
  send({ type: "reset", sessionId: session.id });
  addEvent("Workspace selected", workspace);
  loadWorkspaceTree();
}

function promptHistory() {
  return promptHistoryFromSessions(sessions);
}

function resetPromptHistoryCursor() {
  promptHistoryIndex = null;
  promptHistoryDraft = "";
}

function setPromptInput(value) {
  promptInput.value = value;
  resizePromptInput();
  promptInput.setSelectionRange(promptInput.value.length, promptInput.value.length);
}

function navigatePromptHistory(direction) {
  const history = promptHistory();
  if (history.length === 0) return false;

  if (promptHistoryIndex === null) {
    promptHistoryDraft = promptInput.value;
    promptHistoryIndex = history.length;
  }

  promptHistoryIndex += direction;
  if (promptHistoryIndex < 0) promptHistoryIndex = 0;
  if (promptHistoryIndex > history.length) promptHistoryIndex = history.length;

  if (promptHistoryIndex === history.length) {
    setPromptInput(promptHistoryDraft);
  } else {
    setPromptInput(history[promptHistoryIndex]);
  }
  return true;
}

function addMessageToSession(sessionId, role, text, images = []) {
  const session = sessions.find((candidate) => candidate.id === sessionId);
  if (!session) return;
  session.messages.push({ role, text, images });
  if (role === "user" && session.messages.length === 1) {
    session.title = titleFromPrompt(text);
  }
  session.updatedAt = Date.now();
  sessions = [
    session,
    ...sessions.filter((candidate) => candidate.id !== sessionId),
  ];
  saveSessions();
  renderRecents();
}

function renderImagePreviews() {
  renderImagePreviewList(imagePreviewList, attachedImages, (index) => {
    attachedImages.splice(index, 1);
    renderImagePreviews();
    promptInput.focus();
  });
}

async function addImages(files) {
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    if (file.size > MAX_IMAGE_BYTES) {
      addEvent("Image skipped", `${file.name} is larger than 8 MB`);
      continue;
    }
    attachedImages.push({
      name: file.name,
      type: file.type,
      dataUrl: await readFileAsDataUrl(file),
    });
  }
  renderImagePreviews();
  promptInput.focus();
}

function resizePromptInput() {
  promptInput.style.height = "26px";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 168)}px`;
  promptInput.style.overflowY = promptInput.scrollHeight > 168 ? "auto" : "hidden";
}

function setState(label, className) {
  socketState.textContent = label;
  socketState.className = `state ${className}`;
}

function setBusy(value) {
  runActive = value;
  sendButton.disabled = value || !socketService?.isOpen;
  promptInput.disabled = value;
  workspaceInput.disabled = value;
}

function scrollToEnd(element) {
  element.scrollTop = element.scrollHeight;
}

function renderMessage(role, text, images = []) {
  emptyState?.remove();
  const article = document.createElement("article");
  article.className = `message message-${role}`;

  if (images.length > 0) {
    const gallery = document.createElement("div");
    gallery.className = "messageImages";
    for (const image of images) {
      const img = document.createElement("img");
      img.src = image.dataUrl;
      img.alt = image.name || "Attached image";
      gallery.append(img);
    }
    article.append(gallery);
  }

  const body = document.createElement("div");
  body.className = "messageBody";
  appendMessageText(body, text);

  article.append(body);
  messages.append(article);
  scrollToEnd(messages);
}

function startStreamingAnswer(sessionId) {
  streamingAnswer = { sessionId, text: "", body: null };
  if (sessionId !== activeSessionId) return;

  emptyState?.remove();
  const article = document.createElement("article");
  article.className = "message message-agent message-streaming";
  const body = document.createElement("p");
  article.append(body);
  messages.append(article);
  streamingAnswer.body = body;
  scrollToEnd(messages);
}

function appendStreamingAnswer(sessionId, text) {
  if (!streamingAnswer || streamingAnswer.sessionId !== sessionId) {
    startStreamingAnswer(sessionId);
  }
  streamingAnswer.text += text;
  if (streamingAnswer.body && sessionId === activeSessionId) {
    streamingAnswer.body.textContent = streamingAnswer.text;
    scrollToEnd(messages);
  }
}

function finishStreamingAnswer() {
  streamingAnswer = null;
}

function renderMessages() {
  messages.replaceChildren();
  const session = activeSession();
  if (!session || session.messages.length === 0) {
    messages.append(emptyState);
    return;
  }
  for (const message of session.messages) {
    renderMessage(message.role, message.text, message.images || []);
  }
}

function renderRecents() {
  recentsList.replaceChildren();
  if (sessions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "emptyRecents";
    empty.textContent = "No recent chats";
    recentsList.append(empty);
    return;
  }

  for (const session of sessions) {
    const row = document.createElement("div");
    row.className = "recentRow";
    const button = document.createElement("button");
    button.type = "button";
    button.title = session.title || "New chat";
    button.className = session.id === activeSessionId ? "active" : "";
    const label = document.createElement("span");
    label.className = "navLabel";
    label.textContent = session.title || "New chat";
    button.append(label);
    button.addEventListener("click", () => {
      if (runActive || session.id === activeSessionId) return;
      activeSessionId = session.id;
      persistUiState({ activeSessionId });
      renderRecents();
      renderMessages();
      renderEvents();
      renderWorkspace();
      loadWorkspaceTree();
      addEvent("Opened recent chat", session.title);
    });
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "deleteConversationButton";
    deleteButton.title = `Delete ${session.title || "conversation"}`;
    deleteButton.setAttribute("aria-label", `Delete ${session.title || "conversation"}`);
    deleteButton.textContent = "×";
    deleteButton.addEventListener("click", () => {
      if (runActive && session.id === activeSessionId) return;
      if (!window.confirm(`Delete conversation “${session.title || "New chat"}”?`)) return;
      const deletingActive = session.id === activeSessionId;
      sessions = sessions.filter((candidate) => candidate.id !== session.id);
      if (sessions.length === 0) sessions = [createSession("AI Harness Session", defaultWorkspace)];
      if (deletingActive) activeSessionId = sessions[0].id;
      persistUiState({ sessions, activeSessionId });
      send({ type: "reset", sessionId: session.id });
      renderRecents();
      renderMessages();
      renderEvents();
      renderWorkspace();
      loadWorkspaceTree();
    });
    row.append(button, deleteButton);
    recentsList.append(row);
  }
}

function startNewChat() {
  if (runActive) return;
  const session = createSession("New chat", defaultWorkspace);
  sessions = [session, ...sessions];
  activeSessionId = session.id;
  persistUiState({ sessions, activeSessionId });
  renderRecents();
  renderMessages();
  renderWorkspace();
  renderEvents();
  loadWorkspaceTree();
  addEvent("New chat started");
}

function renderEvent({ title, detail, timestamp }) {
  appendEvent(eventList, { title, detail, timestamp });
}

function renderEvents() {
  renderEventList(eventList, activeSession()?.events || []);
}

function addEvent(title, detail, { persist = true } = {}) {
  const event = { title, detail, timestamp: Date.now() };
  renderEvent(event);
  const session = activeSession();
  if (!persist || !session) return;
  session.events ||= [];
  session.events.push(event);
  session.events = session.events.slice(-500);
  session.updatedAt = Date.now();
  saveSessions();
}

function send(payload) {
  socketService?.send(payload);
}

function currentProviderSettings() {
  return {
    provider: providerSelect.value,
    model: providerModelInput.value.trim(),
    baseUrl: providerBaseUrlInput.value.trim(),
    apiKey: providerApiKeyInput.value.trim(),
  };
}

function providerFormRecord(existing = {}) {
  return {
    id: existing.id || crypto.randomUUID(),
    name: providerNameInput.value.trim() || `${providerSelect.value} provider`,
    type: providerSelect.value,
    model: providerModelInput.value.trim(),
    baseUrl: providerBaseUrlInput.value.trim(),
    apiKey: providerApiKeyInput.value.trim(),
    selected: existing.selected === true,
  };
}

function renderProvidersTable() {
  providersTableBody.replaceChildren();
  if (providers.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = "No providers saved. Configure one below and choose Add provider.";
    row.append(cell);
    providersTableBody.append(row);
    return;
  }
  for (const item of providers) {
    const row = document.createElement("tr");
    row.classList.toggle("selected", item.selected === true);
    const selectCell = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.selected === true;
    checkbox.setAttribute("aria-label", `Use ${item.name}`);
    checkbox.addEventListener("change", () => {
      providers = providers.map((provider) => ({ ...provider, selected: provider.id === item.id }));
      providerSettings = { provider: item.type, model: item.model, baseUrl: item.baseUrl, apiKey: item.apiKey };
      editingProviderId = item.id;
      persistUiState({ providers });
      renderProvidersTable();
      renderProviderSettings(providerSettings, item.name);
      send({ type: "provider_settings", ...providerSettings });
    });
    selectCell.append(checkbox);
    row.append(selectCell);
    for (const value of [item.name, item.type, item.model || "Default"]) {
      const cell = document.createElement("td"); cell.textContent = value; row.append(cell);
    }
    const apiKeyCell = document.createElement("td");
    apiKeyCell.className = "providerKeyStatus";
    apiKeyCell.textContent = item.type === "ollama" ? "Not required" : item.apiKey ? "••••••••" : "Not set";
    row.append(apiKeyCell);
    const actionCell = document.createElement("td");
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", async () => {
      editingProviderId = item.id;
      renderProviderSettings({ provider: item.type, model: item.model, baseUrl: item.baseUrl, apiKey: item.apiKey }, item.name);
      providerSettingsSection.classList.add("editor-open");
      providerEditor.hidden = false;
      saveSettingsButton.hidden = false;
      await loadProviderModels();
    });
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "providerDeleteButton";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      if (!window.confirm(`Delete provider “${item.name}”?`)) return;
      const deletedSelectedProvider = item.selected === true;
      providers = providers.filter((provider) => provider.id !== item.id);
      if (deletedSelectedProvider && providers.length > 0) {
        providers = providers.map((provider, index) => ({ ...provider, selected: index === 0 }));
        const next = providers[0];
        providerSettings = {
          provider: next.type, model: next.model, baseUrl: next.baseUrl, apiKey: next.apiKey,
        };
        send({ type: "provider_settings", ...providerSettings });
      } else if (deletedSelectedProvider) {
        providerSettings = defaultProviderSettings();
        send({ type: "provider_settings", ...providerSettings });
      }
      if (editingProviderId === item.id) editingProviderId = null;
      persistUiState({ providers });
      renderProvidersTable();
      settingsStatus.textContent = `${item.name} deleted`;
      settingsStatus.dataset.state = "success";
    });
    actionCell.append(editButton, deleteButton);
    row.append(actionCell);
    providersTableBody.append(row);
  }
}

function addProvider() {
  editingProviderId = null;
  renderProviderSettings(defaultProviderSettings(), "");
  providerSettingsSection.classList.add("editor-open");
  providerEditor.hidden = false;
  saveSettingsButton.hidden = false;
  settingsStatus.textContent = "Configure the new provider, then save.";
  settingsStatus.dataset.state = "";
  providerNameInput.focus();
}

function saveProviderSettings() {
  const settings = currentProviderSettings();
  const editing = providers.find((item) => item.id === editingProviderId);
  if (editing) {
    providers = providers.map((item) => item.id === editing.id ? providerFormRecord(item) : item);
  } else {
    const record = providerFormRecord({ selected: providers.length === 0 });
    providers.push(record);
    editingProviderId = record.id;
  }
  persistUiState(providers.length > 0 ? { providers } : { providerSettings: settings });
  renderProvidersTable();
  const updated = providers.find((item) => item.id === editingProviderId);
  if (!updated || updated.selected) {
    providerSettings = settings;
    send({ type: "provider_settings", ...settings });
    workspaceMeta.textContent = `${settings.provider} · ${settings.model || "default model"}`;
  }
  settingsStatus.textContent = "Provider settings saved";
  settingsStatus.dataset.state = "success";
  providerEditor.hidden = true;
  providerSettingsSection.classList.remove("editor-open");
  saveSettingsButton.hidden = true;
}

function currentToolPermissions() {
  const permissions = normalizeToolPermissions();
  for (const input of toolPermissionInputs) {
    permissions[input.dataset.toolPermission] = input.checked;
  }
  return permissions;
}

function renderToolPermissions(settings = storedToolPermissions) {
  const permissions = normalizeToolPermissions(settings);
  for (const input of toolPermissionInputs) {
    input.checked = permissions[input.dataset.toolPermission] === true;
  }
}

function saveToolPermissions() {
  const permissions = currentToolPermissions();
  storedToolPermissions = permissions;
  persistUiState({ toolPermissions: permissions });
  send({ type: "tool_permissions", permissions });
  toolPermissionsStatus.textContent = "Tool permissions saved";
  toolPermissionsStatus.dataset.state = "success";
}

function defaultModelForProvider(provider) {
  if (provider === "custom") return "custom-model";
  return provider === "ollama" ? "llama3.1" : "gpt-5.1-codex";
}

function setProviderModelsStatus(message, state = "") {
  providerModelsStatus.textContent = message;
  providerModelsStatus.dataset.state = state;
}

function setModelOptions(models, selectedModel) {
  const selected = selectedModel || defaultModelForProvider(providerSelect.value);
  providerModelInput.replaceChildren();
  const uniqueModels = [...new Set([selected, ...models].filter(Boolean))];
  for (const model of uniqueModels) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    providerModelInput.append(option);
  }
  providerModelInput.value = selected;
}

function renderProviderSettings(settings = providerSettings, name = providers.find((item) => item.selected)?.name || "") {
  providerNameInput.value = name;
  providerSelect.value = ["openai", "ollama", "custom"].includes(settings.provider)
    ? settings.provider
    : "openai";
  setModelOptions([], settings.model || defaultModelForProvider(providerSelect.value));
  providerBaseUrlInput.value = settings.baseUrl || "";
  providerApiKeyInput.value = settings.apiKey || "";
  providerBaseUrlInput.placeholder = providerSelect.value === "ollama"
    ? "http://localhost:11434"
    : providerSelect.value === "custom"
      ? "http://localhost:8000/v1"
      : "https://api.openai.com/v1";
  providerApiKeyField.hidden = providerSelect.value === "ollama";
  providerApiKeyInput.placeholder = providerSelect.value === "openai"
    ? "Required OpenAI API key"
    : "Optional bearer token";
}

async function loadProviderModels() {
  const current = currentProviderSettings();
  setProviderModelsStatus("Loading models...");
  refreshModelsButton.disabled = true;
  try {
    const payload = await fetchProviderModels(current);
    setModelOptions(payload.models || [], current.model);
    setProviderModelsStatus(`${payload.models.length} model${payload.models.length === 1 ? "" : "s"} loaded`, "success");
  } catch (error) {
    setModelOptions([], current.model || defaultModelForProvider(current.provider));
    setProviderModelsStatus(error.message, "error");
  } finally {
    refreshModelsButton.disabled = false;
  }
}

function setConfigStatus(message, state = "") {
  configStatus.textContent = message;
  configStatus.dataset.state = state;
}

function appendConfigTemplate(template) {
  const prefix = configInput.value.trimEnd();
  configInput.value = `${prefix}${prefix ? "\n\n" : ""}${template.trimStart()}`;
  configInput.focus();
}

async function loadConfig() {
  setConfigStatus("Loading...");
  reloadConfigButton.disabled = true;
  try {
    const payload = await fetchConfig();
    configInput.value = payload.content;
    setConfigStatus(payload.exists ? "Loaded MCP configuration from SQLite" : "No MCP configuration yet");
  } catch (error) {
    setConfigStatus(error.message, "error");
  } finally {
    reloadConfigButton.disabled = false;
  }
}

async function saveConfig() {
  setConfigStatus("Saving...");
  saveConfigButton.disabled = true;
  try {
    const payload = await persistConfig(configInput.value);
    setConfigStatus(`Saved ${payload.path}`, "success");
    addEvent("Config saved", `${payload.path} (${payload.bytes} bytes)`);
  } catch (error) {
    setConfigStatus(error.message, "error");
  } finally {
    saveConfigButton.disabled = false;
  }
}

async function saveConfigContent(content) {
  const payload = await persistConfig(content);
  send({ type: "reload_tools" });
  configInput.value = content;
  return payload;
}

function toolSnippet() {
  const label = toolLabelInput.value.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(label)) {
    throw new Error("Label must contain only letters, numbers, _ or -.");
  }

  if (toolTypeSelect.value === "remote") {
    const url = toolUrlInput.value.trim();
    if (!url) throw new Error("Server URL is required.");
    return `[[mcp.servers]]
server_label = "${quoteToml(label)}"
server_url = "${quoteToml(url)}"
require_approval = "always"`;
  }

  const command = toolCommandInput.value.trim();
  if (!command) throw new Error("Command is required.");
  const args = toolArgsInput.value
    .split(/\s+/)
    .map((arg) => arg.trim())
    .filter(Boolean)
    .map((arg) => `"${quoteToml(arg)}"`)
    .join(", ");
  const cwd = toolCwdInput.value.trim();
  return `[mcp_servers.${label}]
command = "${quoteToml(command)}"
args = [${args}]${cwd ? `\ncwd = "${quoteToml(cwd)}"` : ""}
message_format = "content-length"`;
}

function setToolsStatus(message, state = "") {
  toolsStatus.textContent = message;
  toolsStatus.dataset.state = state;
}

function renderToolTypeFields() {
  const remote = toolTypeSelect.value === "remote";
  document.querySelectorAll(".remoteToolField").forEach((field) => {
    field.hidden = !remote;
  });
  document.querySelectorAll(".stdioToolField").forEach((field) => {
    field.hidden = remote;
  });
}

function renderTools() {
  const blocks = mcpBlocks(toolsConfigContent);
  toolsList.replaceChildren();
  if (blocks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "emptyTools";
    empty.textContent = "No MCP servers configured.";
    toolsList.append(empty);
    return;
  }

  for (const block of blocks) {
    const row = document.createElement("article");
    row.className = "toolRow";

    const title = document.createElement("strong");
    title.textContent = block.label;
    const type = document.createElement("span");
    type.textContent = block.type;
    const detail = document.createElement("span");
    detail.textContent = block.detail;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = `toggleButton ${block.enabled ? "enabled" : ""}`;
    toggle.textContent = block.enabled ? "On" : "Off";
    toggle.addEventListener("click", async () => {
      setToolsStatus(`${block.enabled ? "Disabling" : "Enabling"} ${block.label}...`);
      try {
        toolsConfigContent = setToolBlockEnabled(toolsConfigContent, block, !block.enabled);
        await saveConfigContent(toolsConfigContent);
        renderTools();
        setToolsStatus(`${block.label} ${block.enabled ? "disabled" : "enabled"}`, "success");
      } catch (error) {
        setToolsStatus(error.message, "error");
      }
    });

    row.append(title, type, detail, toggle);
    toolsList.append(row);
  }
}

async function loadTools() {
  setToolsStatus("Loading...");
  reloadToolsButton.disabled = true;
  try {
    const payload = await fetchConfig();
    toolsConfigContent = payload.content;
    renderTools();
    setToolsStatus(payload.exists ? "Loaded MCP servers" : "No config file yet");
  } catch (error) {
    setToolsStatus(error.message, "error");
  } finally {
    reloadToolsButton.disabled = false;
  }
}

async function addTool() {
  setToolsStatus("Adding server...");
  addToolButton.disabled = true;
  try {
    const snippet = toolSnippet();
    const prefix = toolsConfigContent.trimEnd();
    toolsConfigContent = `${prefix}${prefix ? "\n\n" : ""}${snippet}\n`;
    await saveConfigContent(toolsConfigContent);
    toolLabelInput.value = "";
    toolUrlInput.value = "";
    toolCommandInput.value = "";
    toolArgsInput.value = "";
    toolCwdInput.value = "";
    renderTools();
    setToolsStatus("Server added", "success");
    mcpEditor.hidden = true;
    mcpTableToolbar.hidden = false;
    document.querySelector(".toolsListPanel").hidden = false;
  } catch (error) {
    setToolsStatus(error.message, "error");
  } finally {
    addToolButton.disabled = false;
  }
}

async function loadHealth() {
  try {
    const health = await fetchHealth();
    defaultWorkspace = health.workspace || ".";
    let changed = false;
    for (const session of sessions) {
      if (!session.workspace || session.workspace === ".") {
        session.workspace = defaultWorkspace;
        changed = true;
      }
    }
    if (changed) saveSessions();
    renderWorkspace();
    const settings = providerSettings;
    workspaceMeta.textContent = `${settings.provider || health.provider} · ${settings.model || health.model}`;
  } catch {
    workspaceMeta.textContent = "Server health unavailable";
  }
}

function handleSocketMessage(payload) {
    if (payload.type === "ready") {
      addEvent("Server defaults", {
        provider: payload.provider,
        model: payload.model,
        approveAll: payload.approveAll,
      });
      return;
    }
    if (payload.type === "provider_settings") {
      addEvent("Agent session ready", {
        provider: payload.provider,
        model: payload.model,
        baseUrl: payload.baseUrl,
      });
      return;
    }
    if (payload.type === "tool_permissions") {
      addEvent("Tool permissions updated", payload.permissions);
      return;
    }
    if (payload.type === "reload_tools") {
      addEvent("Tools reloaded");
      return;
    }
    if (payload.type === "info") {
      addEvent(payload.message);
      return;
    }
    if (payload.type === "tool") {
      addEvent(`Tool call: ${payload.name}`, payload.args);
      return;
    }
    if (payload.type === "approval_request") {
      addEvent("Approval requested", payload.description);
      const approved = window.confirm(`Allow this tool action?\n\n${payload.description}`);
      send({
        type: "approval_response",
        requestId: payload.requestId,
        description: payload.description,
        approved,
      });
      return;
    }
    if (payload.type === "approval") {
      addEvent(`Approval ${payload.approved ? "accepted" : "denied"}`, payload.description);
      return;
    }
    if (payload.type === "agent_event") {
      addEvent(describeAgentEvent(payload.event), payload.event);
      return;
    }
    if (payload.type === "answer_start") {
      startStreamingAnswer(payload.sessionId || pendingSessionId || activeSessionId);
      return;
    }
    if (payload.type === "answer_delta") {
      appendStreamingAnswer(payload.sessionId || pendingSessionId || activeSessionId, payload.text || "");
      return;
    }
    if (payload.type === "done") {
      const targetSessionId = payload.sessionId || pendingSessionId || activeSessionId;
      addMessageToSession(targetSessionId, "agent", payload.text);
      if (targetSessionId === activeSessionId) renderMessages();
      finishStreamingAnswer();
      pendingSessionId = null;
      setBusy(false);
      return;
    }
    if (payload.type === "reset") {
      addEvent("Conversation reset");
      return;
    }
    if (payload.type === "error") {
      const targetSessionId = payload.sessionId || pendingSessionId || activeSessionId;
      addMessageToSession(targetSessionId, "agent", payload.error);
      if (targetSessionId === activeSessionId) renderMessages();
      addEvent("Error", payload.error);
      setState("Error", "state-error");
      finishStreamingAnswer();
      pendingSessionId = null;
      setBusy(false);
    }
}

function connect() {
  setState("Connecting", "state-pending");
  socketService = new SocketService({
    onOpen() {
      setState("Online", "state-online");
      send({ type: "provider_settings", ...providerSettings });
      send({ type: "tool_permissions", permissions: storedToolPermissions });
      setBusy(false);
      addEvent("Socket connected");
    },
    onClose() {
      setState("Offline", "state-idle");
      setBusy(false);
      addEvent("Socket closed");
      window.setTimeout(connect, 1500);
    },
    onError() {
      setState("Error", "state-error");
      addEvent("Socket error");
    },
    onMessage: handleSocketMessage,
  });
  socketService.connect();
}

chatComponent.addEventListener("submit-prompt", () => {
  const prompt = promptInput.value.trim();
  if ((!prompt && attachedImages.length === 0) || runActive) return;
  const sessionId = activeSessionId;
  const session = activeSession();
  const history = session ? session.messages.slice(-20) : [];
  const images = attachedImages;
  const displayPrompt = prompt || "Analyze attached image";
  addMessageToSession(
    sessionId,
    "user",
    displayPrompt,
    images,
  );
  renderMessages();
  addEvent("Prompt sent", images.length > 0 ? `${displayPrompt} (${images.length} image)` : displayPrompt);
  promptInput.value = "";
  attachedImages = [];
  renderImagePreviews();
  resetPromptHistoryCursor();
  resizePromptInput();
  setBusy(true);
  pendingSessionId = sessionId;
  send({
    type: "prompt",
    prompt: displayPrompt,
    sessionId,
    history,
    images,
    workspace: session?.workspace || defaultWorkspace,
  });
});

workspaceComponent.addEventListener("workspace-change", saveActiveWorkspace);
workspaceComponent.addEventListener("focus-prompt", () => promptInput.focus());
workspaceComponent.addEventListener("refresh-workspace", loadWorkspaceTree);
workspaceComponent.addEventListener("choose-workspace", openWorkspacePicker);
chatComponent.addEventListener("images-selected", async (event) => addImages(event.detail.files));
chatComponent.addEventListener("prompt-edited", resetPromptHistoryCursor);
chatComponent.addEventListener("navigate-prompt-history", (event) => navigatePromptHistory(event.detail.direction));
chatComponent.addEventListener("toggle-column", (event) => toggleRightColumn(event.detail.column));
sidebarComponent.addEventListener("new-chat", startNewChat);
sidebarComponent.addEventListener("toggle-sidebar", toggleSidebar);

sidebarResizeHandle.addEventListener("column-resize-start", (event) => startSidebarResize(event.detail.sourceEvent));
sidebarResizeHandle.addEventListener("column-resize-key", (event) => {
  if (appShell.classList.contains("sidebar-collapsed")) {
    applySidebarState(false);
    persistUiState({ sidebarCollapsed: false });
  }
  setSidebarWidth(sidebarWidth + (event.detail.key === "ArrowLeft" ? -24 : 24));
});

streamResizeHandle.addEventListener("column-resize-start", (event) => startStreamResize(event.detail.sourceEvent));
streamResizeHandle.addEventListener("column-resize-key", (event) => {
  setStreamWidth(streamWidth + (event.detail.key === "ArrowLeft" ? 24 : -24));
});
filesResizeHandle.addEventListener("column-resize-start", (event) => startFilesResize(event.detail.sourceEvent));
filesResizeHandle.addEventListener("column-resize-key", (event) => {
  setFilesWidth(filesWidth + (event.detail.key === "ArrowLeft" ? 24 : -24));
});
workspacePickerModal.addEventListener("workspace-picker-parent", async () => {
  if (!workspacePickerParent) return;
  try { await loadWorkspacePickerRoot(workspacePickerParent); } catch (error) { workspacePickerPath.textContent = error.message; }
});
workspacePickerModal.addEventListener("workspace-picker-confirm", () => {
  if (!pendingWorkspacePath) return;
  workspaceInput.value = pendingWorkspacePath;
  workspacePickerDialog.close();
  saveActiveWorkspace();
});
fileEditorModal.addEventListener("save-workspace-file", saveEditedFile);
window.addEventListener("resize", () => {
  setStreamWidth(streamWidth);
  setFilesWidth(filesWidth);
});

sidebarComponent.addEventListener("open-modal", async (event) => {
  if (event.detail.modal === "providers") {
    renderProvidersTable(); providerSettingsSection.classList.remove("editor-open");
    providerEditor.hidden = true; saveSettingsButton.hidden = true;
    settingsStatus.textContent = "Provider settings are stored in SQLite."; settingsStatus.dataset.state = "";
    settingsDialog.showModal();
  }
  if (event.detail.modal === "system-prompts") {
    systemPromptEditor.hidden = true; systemPromptsList.hidden = false; saveSystemPromptButton.hidden = true;
    systemPromptsDialog.showModal();
    try { await loadSystemPrompts(); } catch (error) { systemPromptsStatus.textContent = error.message; systemPromptsStatus.dataset.state = "error"; }
  }
  if (event.detail.modal === "tools") {
    toolsDialog.showModal(); renderToolPermissions();
    toolPermissionsStatus.textContent = "Tool permissions are stored in SQLite."; toolPermissionsStatus.dataset.state = "";
  }
  if (event.detail.modal === "mcp") {
    mcpDialog.showModal(); mcpEditor.hidden = true; mcpTableToolbar.hidden = false;
    document.querySelector(".toolsListPanel").hidden = false; renderToolTypeFields(); await loadTools();
  }
});

systemPromptsModal.addEventListener("save-system-prompt", async () => {
  try { await saveSystemPrompt(); } catch (error) { systemPromptsStatus.textContent = error.message; systemPromptsStatus.dataset.state = "error"; }
});
providersModal.addEventListener("refresh-provider-models", loadProviderModels);
providersModal.addEventListener("add-provider", addProvider);
mcpModal.addEventListener("reload-mcp-config", loadConfig);
mcpModal.addEventListener("save-mcp-config", saveConfig);
mcpModal.addEventListener("reload-mcp-tools", loadTools);
mcpModal.addEventListener("show-mcp-editor", () => {
  mcpEditor.hidden = false;
  mcpTableToolbar.hidden = true;
  document.querySelector(".toolsListPanel").hidden = true;
  renderToolTypeFields();
  toolLabelInput.focus();
});
providersModal.addEventListener("save-provider-settings", saveProviderSettings);
toolsModal.addEventListener("save-tool-permissions", saveToolPermissions);
mcpModal.addEventListener("add-mcp-tool", addTool);
mcpModal.addEventListener("mcp-type-change", renderToolTypeFields);
providersModal.addEventListener("provider-type-change", async () => {
  const nextProvider = providerSelect.value;
  const providerName = providerNameInput.value;
  if (!providerBaseUrlInput.value || /api\.openai\.com|localhost:11434/.test(providerBaseUrlInput.value)) {
    providerBaseUrlInput.value = nextProvider === "ollama"
      ? "http://localhost:11434"
      : nextProvider === "custom"
        ? "http://localhost:8000/v1"
        : "";
  }
  setModelOptions([], defaultModelForProvider(nextProvider));
  renderProviderSettings(currentProviderSettings(), providerName);
  await loadProviderModels();
});

mcpModal.addEventListener("append-mcp-template", (event) => {
  appendConfigTemplate(CONFIG_TEMPLATES[event.detail.template]);
});

chatComponent.addEventListener("reset-chat", () => {
  const session = activeSession();
  if (session) {
    session.messages = [];
    session.title = "New chat";
    session.updatedAt = Date.now();
    saveSessions();
    renderRecents();
  }
  messages.replaceChildren();
  messages.append(emptyState);
  send({ type: "reset", sessionId: activeSessionId });
});

streamComponent.addEventListener("clear-stream", () => {
  const session = activeSession();
  if (session) {
    session.events = [];
    saveSessions();
  }
  renderEvents();
});

async function initialize() {
  let state = {};
  try {
    state = await loadUiState();
    sessions = Array.isArray(state.sessions) && state.sessions.length > 0
      ? state.sessions.map((session) => ({
        ...session,
        messages: Array.isArray(session.messages) ? session.messages : [],
        events: Array.isArray(session.events) ? session.events : [],
        workspace: session.workspace || defaultWorkspace,
      }))
      : [createSession("AI Harness Session", defaultWorkspace)];
    providerSettings = { ...defaultProviderSettings(), ...(state.providerSettings || {}) };
    providers = Array.isArray(state.providers) ? state.providers : [];
    editingProviderId = providers.find((item) => item.selected)?.id || null;
    storedToolPermissions = normalizeToolPermissions(state.toolPermissions);
    const localSidebarWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    const localStreamWidth = Number(localStorage.getItem(STREAM_WIDTH_STORAGE_KEY));
    const localFilesWidth = Number(localStorage.getItem(FILES_WIDTH_STORAGE_KEY));
    sidebarWidth = Number.isFinite(localSidebarWidth) && localSidebarWidth > 0
      ? localSidebarWidth
      : 344;
    streamWidth = Number.isFinite(localStreamWidth) && localStreamWidth > 0
      ? localStreamWidth
      : 360;
    filesWidth = Number.isFinite(localFilesWidth) && localFilesWidth > 0 ? localFilesWidth : 300;
    applySidebarState(state.sidebarCollapsed === true);
    applyRightColumnState("files", localStorage.getItem(FILES_VISIBLE_STORAGE_KEY) !== "false");
    applyRightColumnState("stream", localStorage.getItem(STREAM_VISIBLE_STORAGE_KEY) !== "false");
  } catch (error) {
    sessions = [createSession("AI Harness Session", defaultWorkspace)];
    applySidebarState(false);
    addEvent("UI state load failed", error.message, { persist: false });
  }
  activeSessionId = sessions.some((session) => session.id === state?.activeSessionId)
    ? state.activeSessionId
    : sessions[0].id;
  setSidebarWidth(sidebarWidth);
  setStreamWidth(streamWidth);
  setFilesWidth(filesWidth);
  renderProviderSettings();
  renderToolPermissions();
  renderRecents();
  renderMessages();
  renderEvents();
  renderWorkspace();
  resizePromptInput();
  await loadHealth();
  await loadWorkspaceTree();
  connect();
}

initialize();
