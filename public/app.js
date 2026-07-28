const socketState = document.querySelector("#socketState");
const workspaceMeta = document.querySelector("#workspaceMeta");
const messages = document.querySelector("#messages");
const eventList = document.querySelector("#eventList");
const promptForm = document.querySelector("#promptForm");
const promptInput = document.querySelector("#promptInput");
const sendButton = document.querySelector("#sendButton");
const addImageButton = document.querySelector("#addImageButton");
const imageInput = document.querySelector("#imageInput");
const imagePreviewList = document.querySelector("#imagePreviewList");
const resetButton = document.querySelector("#resetButton");
const clearEventsButton = document.querySelector("#clearEventsButton");
const emptyState = document.querySelector("#emptyState");
const newChatButton = document.querySelector("#newChatButton");
const recentsList = document.querySelector("#recentsList");
const settingsButton = document.querySelector("#settingsButton");
const toolsButton = document.querySelector("#toolsButton");
const settingsDialog = document.querySelector("#settingsDialog");
const settingsForm = document.querySelector("#settingsForm");
const closeSettingsButton = document.querySelector("#closeSettingsButton");
const configInput = document.querySelector("#configInput");
const configStatus = document.querySelector("#configStatus");
const reloadConfigButton = document.querySelector("#reloadConfigButton");
const remoteTemplateButton = document.querySelector("#remoteTemplateButton");
const stdioTemplateButton = document.querySelector("#stdioTemplateButton");
const autoApproveTemplateButton = document.querySelector("#autoApproveTemplateButton");
const toolsDialog = document.querySelector("#toolsDialog");
const toolsForm = document.querySelector("#toolsForm");
const closeToolsButton = document.querySelector("#closeToolsButton");
const toolTypeSelect = document.querySelector("#toolTypeSelect");
const toolLabelInput = document.querySelector("#toolLabelInput");
const toolUrlInput = document.querySelector("#toolUrlInput");
const toolCommandInput = document.querySelector("#toolCommandInput");
const toolArgsInput = document.querySelector("#toolArgsInput");
const toolCwdInput = document.querySelector("#toolCwdInput");
const addToolButton = document.querySelector("#addToolButton");
const reloadToolsButton = document.querySelector("#reloadToolsButton");
const toolsList = document.querySelector("#toolsList");
const toolsStatus = document.querySelector("#toolsStatus");
const providerSelect = document.querySelector("#providerSelect");
const providerModelInput = document.querySelector("#providerModelInput");
const providerBaseUrlInput = document.querySelector("#providerBaseUrlInput");
const providerApiKeyInput = document.querySelector("#providerApiKeyInput");
const providerApiKeyField = document.querySelector("#providerApiKeyField");
const refreshModelsButton = document.querySelector("#refreshModelsButton");
const providerModelsStatus = document.querySelector("#providerModelsStatus");
const appShell = document.querySelector("#appShell");
const sidebarToggleButton = document.querySelector("#sidebarToggleButton");
const streamResizeHandle = document.querySelector("#streamResizeHandle");

let socket;
let runActive = false;
let activeSessionId = null;
let pendingSessionId = null;
let promptHistoryIndex = null;
let promptHistoryDraft = "";
let streamingAnswer = null;
let attachedImages = [];

const STORAGE_KEY = "ai-harness.sessions";
const SIDEBAR_STORAGE_KEY = "ai-harness.sidebarCollapsed";
const STREAM_WIDTH_STORAGE_KEY = "ai-harness.streamWidth";
const PROVIDER_STORAGE_KEY = "ai-harness.providerSettings";
const MIN_STREAM_WIDTH = 260;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const CONFIG_TEMPLATES = {
  remote: `
[[mcp.servers]]
server_label = "docs"
server_url = "https://example.com/mcp"
allowed_tools = ["search"]
require_approval = "always"

[mcp.servers.headers]
Authorization = "Bearer \${MCP_TOKEN}"
`,
  stdio: `
[mcp_servers.local]
command = "node"
args = ["/absolute/path/to/server.js"]
cwd = "/absolute/path/to/server"
message_format = "content-length"
`,
  autoApprove: `
[mcp]
auto_approve = true
`,
};

let toolsConfigContent = "";

function createSession(title = "New chat") {
  return {
    id: crypto.randomUUID(),
    title,
    messages: [],
    updatedAt: Date.now(),
  };
}

function loadSessions() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(stored) && stored.length > 0) return stored;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return [createSession("AI Harness Session")];
}

let sessions = loadSessions();
activeSessionId = sessions[0].id;

function applySidebarState(collapsed) {
  appShell.classList.toggle("sidebar-collapsed", collapsed);
  sidebarToggleButton.setAttribute("aria-pressed", String(collapsed));
  sidebarToggleButton.setAttribute(
    "aria-label",
    collapsed ? "Expand sidebar" : "Collapse sidebar",
  );
  sidebarToggleButton.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
}

function loadSidebarState() {
  applySidebarState(localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");
}

function toggleSidebar() {
  const collapsed = !appShell.classList.contains("sidebar-collapsed");
  localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  applySidebarState(collapsed);
}

function clampStreamWidth(width) {
  return Math.max(width, MIN_STREAM_WIDTH);
}

function setStreamWidth(width) {
  const clamped = clampStreamWidth(width);
  appShell.style.setProperty("--stream-width", `${clamped}px`);
  streamResizeHandle.setAttribute("aria-valuemin", String(MIN_STREAM_WIDTH));
  streamResizeHandle.setAttribute("aria-valuenow", String(clamped));
  localStorage.setItem(STREAM_WIDTH_STORAGE_KEY, String(clamped));
}

function loadStreamWidth() {
  const stored = Number(localStorage.getItem(STREAM_WIDTH_STORAGE_KEY));
  setStreamWidth(Number.isFinite(stored) && stored > 0 ? stored : 360);
}

function startStreamResize(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  appShell.classList.add("resizing-stream");
  streamResizeHandle.setPointerCapture(event.pointerId);

  const move = (moveEvent) => {
    setStreamWidth(window.innerWidth - moveEvent.clientX - 4);
  };
  const stop = () => {
    appShell.classList.remove("resizing-stream");
    streamResizeHandle.removeEventListener("pointermove", move);
    streamResizeHandle.removeEventListener("pointerup", stop);
    streamResizeHandle.removeEventListener("pointercancel", stop);
  };

  streamResizeHandle.addEventListener("pointermove", move);
  streamResizeHandle.addEventListener("pointerup", stop);
  streamResizeHandle.addEventListener("pointercancel", stop);
}

function saveSessions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function activeSession() {
  return sessions.find((session) => session.id === activeSessionId);
}

function titleFromPrompt(prompt) {
  const compact = prompt.replace(/\s+/g, " ").trim();
  if (!compact) return "New chat";
  return compact.length > 34 ? `${compact.slice(0, 34)}...` : compact;
}

function promptHistory() {
  const prompts = [];
  const seen = new Set();
  for (const session of sessions) {
    for (const message of session.messages) {
      if (message.role !== "user" || seen.has(message.text)) continue;
      seen.add(message.text);
      prompts.push(message.text);
    }
  }
  return prompts.reverse();
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
  imagePreviewList.replaceChildren();
  attachedImages.forEach((image, index) => {
    const item = document.createElement("div");
    item.className = "imagePreview";
    const img = document.createElement("img");
    img.src = image.dataUrl;
    img.alt = image.name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.ariaLabel = `Remove ${image.name}`;
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      attachedImages.splice(index, 1);
      renderImagePreviews();
      promptInput.focus();
    });
    item.append(img, remove);
    imagePreviewList.append(item);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
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
  sendButton.disabled = value || socket?.readyState !== WebSocket.OPEN;
  promptInput.disabled = value;
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

  const body = document.createElement("p");
  body.textContent = text;

  article.append(body);
  if (role === "agent") {
    const actions = document.createElement("div");
    actions.className = "messageActions";
    for (const label of ["Copy", "Good", "Bad", "Retry", "More"]) {
      const button = document.createElement("button");
      button.type = "button";
      button.ariaLabel = label;
      button.textContent = {
        Copy: "▱",
        Good: "♡",
        Bad: "♢",
        Retry: "↻",
        More: "…",
      }[label];
      actions.append(button);
    }
    article.append(actions);
  }
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
      renderRecents();
      renderMessages();
      addEvent("Opened recent chat", session.title);
    });
    recentsList.append(button);
  }
}

function startNewChat() {
  if (runActive) return;
  const session = createSession();
  sessions = [session, ...sessions];
  activeSessionId = session.id;
  saveSessions();
  renderRecents();
  renderMessages();
  eventList.replaceChildren();
  addEvent("New chat started");
}

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function describeAgentEvent(event) {
  if (event.type === "start") return "Run started";
  if (event.type === "turn") return `Model turn ${event.turn}`;
  if (event.type === "response") return `Response ${event.id}`;
  if (event.type === "tool_start") return `Tool started: ${event.name}`;
  if (event.type === "tool_result") {
    const ok = event.output?.ok === false ? "failed" : "completed";
    return `Tool ${ok}: ${event.name}`;
  }
  if (event.type === "mcp_call") return `MCP call: ${event.server}.${event.name}`;
  if (event.type === "approval_request") {
    return `Approval requested: ${event.server}.${event.name}`;
  }
  if (event.type === "approval_response") {
    return `Approval ${event.approved ? "granted" : "denied"}: ${event.server}.${event.name}`;
  }
  if (event.type === "final") return "Final answer received";
  return event.type;
}

function addEvent(title, detail) {
  const item = document.createElement("li");
  const stamp = document.createElement("time");
  stamp.dateTime = new Date().toISOString();
  stamp.textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const heading = document.createElement("span");
  heading.textContent = title;

  item.append(stamp, heading);
  if (detail !== undefined) {
    const pre = document.createElement("pre");
    pre.textContent = typeof detail === "string" ? detail : formatJson(detail);
    item.append(pre);
  }

  eventList.append(item);
  scrollToEnd(eventList);
}

function send(payload) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function defaultProviderSettings() {
  return {
    provider: "openai",
    model: "gpt-5.1-codex",
    baseUrl: "",
    apiKey: "",
  };
}

function loadProviderSettings() {
  try {
    return { ...defaultProviderSettings(), ...JSON.parse(localStorage.getItem(PROVIDER_STORAGE_KEY) || "{}") };
  } catch {
    localStorage.removeItem(PROVIDER_STORAGE_KEY);
    return defaultProviderSettings();
  }
}

function currentProviderSettings() {
  return {
    provider: providerSelect.value,
    model: providerModelInput.value.trim(),
    baseUrl: providerBaseUrlInput.value.trim(),
    apiKey: providerApiKeyInput.value.trim(),
  };
}

function saveProviderSettings() {
  const settings = currentProviderSettings();
  localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(settings));
  send({ type: "provider_settings", ...settings });
  workspaceMeta.textContent = `${settings.provider} · ${settings.model || "default model"}`;
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

function renderProviderSettings(settings = loadProviderSettings()) {
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
}

async function loadProviderModels() {
  const current = currentProviderSettings();
  setProviderModelsStatus("Loading models...");
  refreshModelsButton.disabled = true;
  try {
    const response = await fetch("/api/models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: current.provider,
        baseUrl: current.baseUrl,
        apiKey: current.apiKey,
      }),
    });
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "Unable to load models.");
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
    const response = await fetch("/api/config");
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "Unable to load config.");
    configInput.value = payload.content;
    setConfigStatus(payload.exists ? "Loaded .ai-harness/config.toml" : "No config file yet");
  } catch (error) {
    setConfigStatus(error.message, "error");
  } finally {
    reloadConfigButton.disabled = false;
  }
}

async function saveConfig() {
  setConfigStatus("Saving...");
  try {
    const response = await fetch("/api/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: configInput.value }),
    });
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "Unable to save config.");
    setConfigStatus(`Saved ${payload.path}`, "success");
    addEvent("Config saved", `${payload.path} (${payload.bytes} bytes)`);
  } catch (error) {
    setConfigStatus(error.message, "error");
  }
}

async function saveConfigContent(content) {
  const response = await fetch("/api/config", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error || "Unable to save config.");
  send({ type: "reload_tools" });
  configInput.value = content;
  return payload;
}

function stripTomlComment(line) {
  return line.replace(/^\s*#\s?/, "");
}

function mcpBlocks(content) {
  const lines = content.split("\n");
  const headerPattern = /^\s*(#\s*)?(\[\[mcp\.servers\]\]|\[mcp_servers\.([A-Za-z0-9_-]+)\])\s*$/;
  const starts = [];
  lines.forEach((line, index) => {
    const match = line.match(headerPattern);
    if (match) starts.push({ index, match });
  });

  return starts.map((start, listIndex) => {
    const end = starts[listIndex + 1]?.index ?? lines.length;
    const blockLines = lines.slice(start.index, end);
    const uncommented = blockLines.map(stripTomlComment).join("\n");
    const isRemote = start.match[2] === "[[mcp.servers]]";
    const label = isRemote
      ? uncommented.match(/server_label\s*=\s*"([^"]+)"/)?.[1] || "remote"
      : start.match[3];
    return {
      index: listIndex,
      start: start.index,
      end,
      enabled: !start.match[1],
      type: isRemote ? "remote" : "stdio",
      label,
      detail: isRemote
        ? uncommented.match(/server_url\s*=\s*"([^"]+)"/)?.[1] ||
          uncommented.match(/connector_id\s*=\s*"([^"]+)"/)?.[1] ||
          "remote MCP server"
        : uncommented.match(/command\s*=\s*"([^"]+)"/)?.[1] || "stdio MCP server",
    };
  });
}

function setToolBlockEnabled(content, block, enabled) {
  const lines = content.split("\n");
  const changed = lines.slice(block.start, block.end).map((line) => {
    if (!line.trim()) return line;
    if (enabled) return line.replace(/^(\s*)#\s?/, "$1");
    return /^\s*#/.test(line) ? line : `# ${line}`;
  });
  lines.splice(block.start, block.end - block.start, ...changed);
  return lines.join("\n");
}

function quoteToml(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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

    const meta = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = block.label;
    const detail = document.createElement("span");
    detail.textContent = `${block.type} · ${block.detail}`;
    meta.append(title, detail);

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

    row.append(meta, toggle);
    toolsList.append(row);
  }
}

async function loadTools() {
  setToolsStatus("Loading...");
  reloadToolsButton.disabled = true;
  try {
    const response = await fetch("/api/config");
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "Unable to load tools.");
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
  } catch (error) {
    setToolsStatus(error.message, "error");
  } finally {
    addToolButton.disabled = false;
  }
}

async function loadHealth() {
  try {
    const response = await fetch("/api/health");
    const health = await response.json();
    const settings = loadProviderSettings();
    workspaceMeta.textContent = `${settings.provider || health.provider} · ${settings.model || health.model}`;
  } catch {
    workspaceMeta.textContent = "Server health unavailable";
  }
}

function connect() {
  setState("Connecting", "state-pending");
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

  socket.addEventListener("open", () => {
    setState("Online", "state-online");
    send({ type: "provider_settings", ...loadProviderSettings() });
    setBusy(false);
    addEvent("Socket connected");
  });

  socket.addEventListener("close", () => {
    setState("Offline", "state-idle");
    setBusy(false);
    addEvent("Socket closed");
    window.setTimeout(connect, 1500);
  });

  socket.addEventListener("error", () => {
    setState("Error", "state-error");
    addEvent("Socket error");
  });

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
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
    if (payload.type === "approval") {
      addEvent(`Approval ${payload.approved ? "auto-approved" : "denied"}`, payload.description);
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
  });
}

promptForm.addEventListener("submit", (event) => {
  event.preventDefault();
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
  send({ type: "prompt", prompt: displayPrompt, sessionId, history, images });
});

addImageButton.addEventListener("click", () => {
  imageInput.click();
});

imageInput.addEventListener("change", async () => {
  await addImages(Array.from(imageInput.files || []));
  imageInput.value = "";
});

promptInput.addEventListener("input", () => {
  resetPromptHistoryCursor();
  resizePromptInput();
});
promptInput.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    promptForm.requestSubmit();
    return;
  }
  if (
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    (event.key === "ArrowUp" || event.key === "ArrowDown")
  ) {
    event.preventDefault();
    navigatePromptHistory(event.key === "ArrowUp" ? -1 : 1);
  }
});

newChatButton.addEventListener("click", startNewChat);
sidebarToggleButton.addEventListener("click", toggleSidebar);

streamResizeHandle.addEventListener("pointerdown", startStreamResize);
streamResizeHandle.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const current = Number(localStorage.getItem(STREAM_WIDTH_STORAGE_KEY)) || 360;
  setStreamWidth(current + (event.key === "ArrowLeft" ? 24 : -24));
});
window.addEventListener("resize", () => {
  const current = Number(localStorage.getItem(STREAM_WIDTH_STORAGE_KEY)) || 360;
  setStreamWidth(current);
});

settingsButton.addEventListener("click", async () => {
  renderProviderSettings();
  settingsDialog.showModal();
  await loadProviderModels();
  await loadConfig();
});

toolsButton.addEventListener("click", async () => {
  toolsDialog.showModal();
  renderToolTypeFields();
  await loadTools();
});

closeSettingsButton.addEventListener("click", () => {
  settingsDialog.close();
});

closeToolsButton.addEventListener("click", () => {
  toolsDialog.close();
});

reloadConfigButton.addEventListener("click", loadConfig);
refreshModelsButton.addEventListener("click", loadProviderModels);
reloadToolsButton.addEventListener("click", loadTools);
toolTypeSelect.addEventListener("change", renderToolTypeFields);

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveProviderSettings();
  await saveConfig();
});

toolsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await addTool();
});

providerSelect.addEventListener("change", async () => {
  const nextProvider = providerSelect.value;
  if (!providerBaseUrlInput.value || /api\.openai\.com|localhost:11434/.test(providerBaseUrlInput.value)) {
    providerBaseUrlInput.value = nextProvider === "ollama"
      ? "http://localhost:11434"
      : nextProvider === "custom"
        ? "http://localhost:8000/v1"
        : "";
  }
  setModelOptions([], defaultModelForProvider(nextProvider));
  renderProviderSettings(currentProviderSettings());
  await loadProviderModels();
});

providerBaseUrlInput.addEventListener("change", loadProviderModels);

remoteTemplateButton.addEventListener("click", () => {
  appendConfigTemplate(CONFIG_TEMPLATES.remote);
});

stdioTemplateButton.addEventListener("click", () => {
  appendConfigTemplate(CONFIG_TEMPLATES.stdio);
});

autoApproveTemplateButton.addEventListener("click", () => {
  appendConfigTemplate(CONFIG_TEMPLATES.autoApprove);
});

resetButton.addEventListener("click", () => {
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

clearEventsButton.addEventListener("click", () => {
  eventList.replaceChildren();
});

loadHealth();
connect();
renderProviderSettings();
loadSidebarState();
loadStreamWidth();
renderRecents();
renderMessages();
resizePromptInput();
