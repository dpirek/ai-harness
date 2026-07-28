const socketState = document.querySelector("#socketState");
const workspaceMeta = document.querySelector("#workspaceMeta");
const messages = document.querySelector("#messages");
const eventList = document.querySelector("#eventList");
const promptForm = document.querySelector("#promptForm");
const promptInput = document.querySelector("#promptInput");
const sendButton = document.querySelector("#sendButton");
const resetButton = document.querySelector("#resetButton");
const clearEventsButton = document.querySelector("#clearEventsButton");
const emptyState = document.querySelector("#emptyState");
const newChatButton = document.querySelector("#newChatButton");
const recentsList = document.querySelector("#recentsList");
const settingsButton = document.querySelector("#settingsButton");
const settingsDialog = document.querySelector("#settingsDialog");
const settingsForm = document.querySelector("#settingsForm");
const closeSettingsButton = document.querySelector("#closeSettingsButton");
const configInput = document.querySelector("#configInput");
const configStatus = document.querySelector("#configStatus");
const reloadConfigButton = document.querySelector("#reloadConfigButton");
const remoteTemplateButton = document.querySelector("#remoteTemplateButton");
const stdioTemplateButton = document.querySelector("#stdioTemplateButton");
const autoApproveTemplateButton = document.querySelector("#autoApproveTemplateButton");
const appShell = document.querySelector("#appShell");
const sidebarToggleButton = document.querySelector("#sidebarToggleButton");
const streamResizeHandle = document.querySelector("#streamResizeHandle");

let socket;
let runActive = false;
let activeSessionId = null;
let pendingSessionId = null;
let promptHistoryIndex = null;
let promptHistoryDraft = "";

const STORAGE_KEY = "ai-harness.sessions";
const SIDEBAR_STORAGE_KEY = "ai-harness.sidebarCollapsed";
const STREAM_WIDTH_STORAGE_KEY = "ai-harness.streamWidth";
const MIN_STREAM_WIDTH = 260;
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

function addMessageToSession(sessionId, role, text) {
  const session = sessions.find((candidate) => candidate.id === sessionId);
  if (!session) return;
  session.messages.push({ role, text });
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

function renderMessage(role, text) {
  emptyState?.remove();
  const article = document.createElement("article");
  article.className = `message message-${role}`;

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

function renderMessages() {
  messages.replaceChildren();
  const session = activeSession();
  if (!session || session.messages.length === 0) {
    messages.append(emptyState);
    return;
  }
  for (const message of session.messages) {
    renderMessage(message.role, message.text);
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

async function loadHealth() {
  try {
    const response = await fetch("/api/health");
    const health = await response.json();
    workspaceMeta.textContent = `${health.model} · API key ${health.hasApiKey ? "configured" : "missing"} · writes ${health.approveAll ? "auto-approved" : "approval-gated"}`;
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
      addEvent("Agent session ready", {
        model: payload.model,
        approveAll: payload.approveAll,
      });
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
    if (payload.type === "done") {
      const targetSessionId = payload.sessionId || pendingSessionId || activeSessionId;
      addMessageToSession(targetSessionId, "agent", payload.text);
      if (targetSessionId === activeSessionId) renderMessages();
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
      pendingSessionId = null;
      setBusy(false);
    }
  });
}

promptForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt || runActive) return;
  const sessionId = activeSessionId;
  const session = activeSession();
  const history = session ? session.messages.slice(-20) : [];
  addMessageToSession(sessionId, "user", prompt);
  renderMessages();
  addEvent("Prompt sent", prompt);
  promptInput.value = "";
  resetPromptHistoryCursor();
  resizePromptInput();
  setBusy(true);
  pendingSessionId = sessionId;
  send({ type: "prompt", prompt, sessionId, history });
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
  settingsDialog.showModal();
  await loadConfig();
});

closeSettingsButton.addEventListener("click", () => {
  settingsDialog.close();
});

reloadConfigButton.addEventListener("click", loadConfig);

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveConfig();
});

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
loadSidebarState();
loadStreamWidth();
renderRecents();
renderMessages();
resizePromptInput();
