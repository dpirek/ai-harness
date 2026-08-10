import GuitarEffect from "/components/guitar-effect.js";
import ModelEngine from "/components/model-engine.js";
import Microphone from "/components/microphone.js";
import RigIO from "/components/rig-io.js";
import WorkspacePanel from "/components/workspace-panel.js";
import "/components/modals/file-editor-modal.js";
import "/components/modals/workspace-picker-modal.js";
import { describeAgentEvent } from "/lib/event-rendering.js";
import { workspaceExplorerIcon } from "/lib/icons.js";
import { appendMessageText } from "/lib/message-rendering.js";
import { mcpBlocks, quoteToml, setToolBlockEnabled } from "/lib/mcp-config.js";
import { normalizeToolPermissions } from "/lib/settings.js";
import { createSession, titleFromPrompt } from "/lib/sessions.js";
import { renderWorkspaceNodes, renderWorkspacePicker } from "/lib/workspace-rendering.js";
import { loadConfig, loadHealth, loadProviderModels, loadSystemPrompts, saveConfig, saveSystemPrompt } from "/services/settings-api.js";
import { loadUiState, saveUiState } from "/services/ui-state-api.js";
import { loadWorkspaceFile, loadWorkspaceTree, saveWorkspaceFile } from "/services/workspace-api.js";
import SocketService from "/services/socket-service.js";

const openPromptWithKeyboard = (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openStepPrompt(event.currentTarget);
  }
};

const connector = (className) => {
  const element = document.createElement("i");
  element.className = className;
  element.setAttribute("aria-hidden", "true");
  return element;
};

const element = (tag, { className, text, attrs = {}, children = [] } = {}) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
  node.append(...children);
  return node;
};

const runTimeValue = element("strong", { text: "00:00.0" });
const runModelValue = element("strong", { text: "—" });
const runTokensValue = element("strong", { text: "0" });
const runPromptsValue = element("strong", { text: "0" });
const displaySegment = (icon, label, value, className = "") => element("div", {
  className: `harness-display-segment ${className}`.trim(),
  children: [
    element("span", { className: "harness-display-icon", text: icon, attrs: { "aria-hidden": "true" } }),
    element("div", { children: [value, element("small", { text: label })] }),
  ],
});
const createHeaderSignalChannel = (channel) => Array.from({ length: 12 }, (_, index) => element("i", {
  className: `header-signal-segment ${index >= 9 ? "signal-hot" : index >= 7 ? "signal-warm" : "signal-safe"}`,
  attrs: { "aria-hidden": "true", "data-channel": channel },
}));
const headerSignalLeft = createHeaderSignalChannel("left");
const headerSignalRight = createHeaderSignalChannel("right");
const headerSignalMeter = element("div", {
  className: "header-signal-meter",
  attrs: { role: "meter", "aria-label": "Harness signal level", "aria-valuemin": "0", "aria-valuemax": "12", "aria-valuenow": "0" },
  children: [element("div", { className: "header-signal-track", children: [
    element("div", { className: "header-signal-channel", attrs: { "aria-hidden": "true" }, children: headerSignalLeft }),
    element("div", { className: "header-signal-channel", attrs: { "aria-hidden": "true" }, children: headerSignalRight }),
  ] })],
});
const harnessRunDisplay = element("section", {
  className: "harness-run-display",
  attrs: { "aria-label": "Current prompt statistics" },
  children: [
    displaySegment("◷", "elapsed", runTimeValue, "display-time"),
    displaySegment("◇", "model", runModelValue, "display-model"),
    displaySegment("Σ", "tokens", runTokensValue, "display-tokens"),
    displaySegment("#", "prompts", runPromptsValue, "display-prompts"),
  ],
});
const headerToolbar = document.querySelector(".topbar .toolbar");
headerToolbar.before(harnessRunDisplay);

const setHeaderSignalLevel = (level) => {
  const normalized = Math.max(0, Math.min(12, Math.round(level)));
  headerSignalMeter.setAttribute("aria-valuenow", String(normalized));
  headerSignalLeft.forEach((segment, index) => segment.classList.toggle("is-lit", index < normalized));
  headerSignalRight.forEach((segment, index) => segment.classList.toggle("is-lit", index < Math.max(0, normalized - 1)));
};

const transportButton = (className, icon, label) => element("button", {
  className: `transport-button ${className}`,
  text: icon,
  attrs: { type: "button", title: label, "aria-label": label },
});
const rewindButton = transportButton("transport-rewind", "◀◀", "Reset conversation");
const stopButton = transportButton("transport-stop", "■", "Stop current run");
const playButton = transportButton("transport-play", "▶", "Send prompt");
const recordButton = transportButton("transport-record", "●", "Enable recording");
recordButton.setAttribute("aria-pressed", "false");
const transportControls = element("div", {
  className: "transport-controls",
  attrs: { role: "group", "aria-label": "Harness transport controls" },
  children: [rewindButton, stopButton, playButton, recordButton],
});
document.querySelector(".topbar .brand").after(transportControls);

const explorerToggle = element("button", {
  className: "explorer-toggle",
  attrs: {
    type: "button",
    title: "Hide file explorer",
    "aria-label": "Hide file explorer",
    "aria-pressed": "true",
  },
  children: [workspaceExplorerIcon()],
});

const historyToggle = element("button", {
  className: "explorer-toggle history-toggle",
  text: "◷",
  attrs: {
    type: "button",
    title: "Hide conversation history",
    "aria-label": "Hide conversation history",
    "aria-pressed": "true",
  },
});
const gearButton = document.querySelector(".topbar .gear");
const toolbarButtonGroup = element("div", {
  className: "toolbar-button-group",
  attrs: { role: "group", "aria-label": "Workspace controls" },
  children: [explorerToggle, historyToggle, gearButton],
});
document.querySelector(".topbar .toolbar").append(toolbarButtonGroup);
const topbar = document.querySelector(".topbar");
topbar.append(headerSignalMeter);

const positionHeaderSignalMeter = () => {
  const topbarBounds = topbar.getBoundingClientRect();
  const statusBounds = harnessRunDisplay.getBoundingClientRect();
  const buttonsBounds = toolbarButtonGroup.getBoundingClientRect();
  const gapStart = statusBounds.right;
  const gapEnd = buttonsBounds.left;
  const availableWidth = Math.max(80, gapEnd - gapStart - 24);
  headerSignalMeter.style.width = `${Math.min(150, availableWidth)}px`;
  headerSignalMeter.style.left = `${gapStart - topbarBounds.left + ((gapEnd - gapStart) / 2)}px`;
};

requestAnimationFrame(positionHeaderSignalMeter);
window.addEventListener("resize", positionHeaderSignalMeter);
new ResizeObserver(positionHeaderSignalMeter).observe(topbar);

const fileExplorer = new WorkspacePanel();
fileExplorer.classList.add("rig-file-explorer");
document.querySelector(".app").append(fileExplorer);
const historyList = element("div", {
  className: "conversation-history-list",
  children: [element("p", { className: "conversation-history-empty", text: "No messages yet." })],
});
const historyCount = element("span", { text: "0 messages" });
const conversationHistory = element("aside", {
  className: "rig-conversation-history",
  attrs: { "aria-label": "Conversation history" },
  children: [
    element("header", { children: [
      element("div", { children: [element("h2", { text: "Conversation" }), historyCount] }),
    ] }),
    historyList,
  ],
});
document.querySelector(".app").append(conversationHistory);
const workspacePickerModal = document.createElement("workspace-picker-modal");
const fileEditorModal = document.createElement("file-editor-modal");
document.body.append(workspacePickerModal, fileEditorModal);

const workspaceTreeElement = fileExplorer.querySelector("#workspaceTree");
const filesWorkspaceLabel = fileExplorer.querySelector("#filesWorkspaceLabel");
const workspaceInput = fileExplorer.querySelector("#workspaceInput");
const workspacePickerDialog = workspacePickerModal.querySelector("#workspacePickerDialog");
const workspacePickerTree = workspacePickerModal.querySelector("#workspacePickerTree");
const workspacePickerPath = workspacePickerModal.querySelector("#workspacePickerPath");
const parentWorkspacePickerButton = workspacePickerModal.querySelector("#parentWorkspacePickerButton");
const confirmWorkspacePickerButton = workspacePickerModal.querySelector("#confirmWorkspacePickerButton");
const fileEditorDialog = fileEditorModal.querySelector("#fileEditorDialog");
const fileEditorTitle = fileEditorModal.querySelector("#fileEditorTitle");
const fileEditorPath = fileEditorModal.querySelector("#fileEditorPath");
const fileEditorContent = fileEditorModal.querySelector("#fileEditorContent");
const fileEditorStatus = fileEditorModal.querySelector("#fileEditorStatus");
const saveFileEditorButton = fileEditorModal.querySelector("#saveFileEditorButton");

const createEffect = (props) => new GuitarEffect({
  ...props,
  handlers: {
    click: (event) => openStepPrompt(event.currentTarget),
    keydown: openPromptWithKeyboard,
  },
});

const createEngine = () => new ModelEngine({
  model: "GPT-4.1",
  color: "#d49b17",
  controls: [
    { label: "TEMP", value: "0.20" },
    //{ label: "TOP_P", value: "1.00" },
    { label: "TOP_K", value: "40" },
    { label: "MAX_TOKENS", value: "2000" },
    { label: "FREQ_PEN", value: "0.00" },
    { label: "PRES_PEN", value: "0.00" },
  ],
  handlers: {
    click: (event) => openStepPrompt(event.currentTarget),
    keydown: openPromptWithKeyboard,
    modelClick: () => openModelConfig(),
  },
});

const createChannel = (props) => new RigIO({
  ...props,
  handlers: {
    click: (event) => openStepPrompt(event.currentTarget),
    keydown: openPromptWithKeyboard,
  },
});

const microphone = new Microphone({
  title: "Microphone",
  subtitle: "Capture",
  handlers: {
    click: (event) => openStepPrompt(event.currentTarget),
    keydown: openPromptWithKeyboard,
  },
});
const inputChannel = createChannel({ title: "INPUT", tokenCount: 0, signalLevel: 0, direction: "input", color: "#e84431" });
const inputComposer = createEffect({ color: "#e84431", icon: "#wave", title: "Input", subtitle: "Composer" });
const modelEngine = createEngine();
const toolOrchestrator = createEffect({ color: "#8a3abd", icon: "#tools", title: "Tool", subtitle: "Orchestrator" });
const mcpServers = createEffect({ color: "#168b83", icon: "#mcp", title: "MCP", subtitle: "Servers" });
const outputValidator = createEffect({ color: "#dca813", icon: "#clip", title: "Evaluator", subtitle: "Suite" });
const responseRenderer = createEffect({ color: "#216bbe", icon: "#code", title: "Response", subtitle: "Renderer" });
const outputChannel = createChannel({ title: "OUTPUT", tokenCount: 0, signalLevel: 0, direction: "output", color: "#2479cf" });

const signalUnits = [
  microphone,
  inputChannel,
  inputComposer,
  modelEngine,
  toolOrchestrator,
  mcpServers,
  outputValidator,
  responseRenderer,
  outputChannel,
];
const signalConnectors = [];

const harnessStages = [
  { name: "input", units: [microphone, inputChannel, inputComposer] },
  { name: "model", units: [modelEngine] },
  { name: "tool", units: [toolOrchestrator] },
  { name: "mcp", units: [mcpServers] },
  { name: "validation", units: [outputValidator] },
  { name: "response", units: [responseRenderer] },
  { name: "output", units: [outputChannel] },
];

const stepPromptConfig = new Map([
  [microphone, { title: "Microphone Input", keys: ["agent_instructions"] }],
  [inputChannel, { title: "Input Signal", keys: ["agent_instructions"] }],
  [inputComposer, { title: "Input Composer", keys: ["agent_instructions"] }],
  [modelEngine, { title: "Model Engine", keys: ["agent_instructions", "workspace_context"] }],
  [toolOrchestrator, { title: "Tool Orchestrator", keys: ["tool_contract"], showToolSettings: true }],
  [mcpServers, { title: "MCP Servers", keys: ["tool_contract"], showMcpSettings: true }],
  [outputValidator, { title: "Output Validation", keys: ["validation_reminder"] }],
  [responseRenderer, { title: "Final Response", keys: ["agent_instructions"] }],
  [outputChannel, { title: "Output Signal", keys: ["agent_instructions", "validation_reminder"] }],
]);

const promptModalTitle = element("h2", { text: "System Prompts", attrs: { id: "stepPromptModalTitle" } });
const promptModalStep = element("p", { className: "step-prompt-modal-step" });
const promptModalContent = element("div", { className: "step-prompt-modal-content" });
const closePromptModal = element("button", {
  className: "step-prompt-modal-close",
  text: "×",
  attrs: { type: "button", "aria-label": "Close system prompts" },
});
const stepPromptModal = element("dialog", {
  className: "step-prompt-modal",
  attrs: { "aria-labelledby": "stepPromptModalTitle" },
  children: [element("section", { className: "step-prompt-modal-panel", children: [
    element("header", { children: [promptModalTitle, closePromptModal] }),
    promptModalStep,
    promptModalContent,
  ] })],
});
document.body.append(stepPromptModal);

let systemPromptsByKey = null;
let systemPromptsRequest = null;

const toolChoices = [
  ["list_files", "List files", "List files and folders inside the workspace."],
  ["search_files", "Search files", "Search workspace text files with a regular expression."],
  ["read_file", "Read files", "Read selected UTF-8 files."],
  ["write_file", "Write files", "Create or replace UTF-8 files."],
  ["curl", "Curl", "Fetch HTTP or HTTPS URLs."],
  ["run_command", "Run commands", "Run shell commands in the workspace."],
];

const createToolSettings = () => {
  const status = element("p", { className: "tool-selection-status", text: "Enabled tools are available to the model." });
  const rows = toolChoices.map(([name, label, description]) => {
    const input = element("input", {
      attrs: { type: "checkbox", "data-tool-permission": name, "aria-label": `Enable ${label}` },
    });
    input.checked = storedToolPermissions[name] === true;
    return element("label", { className: "tool-selection-row", children: [
      element("span", { className: "tool-selection-copy", children: [
        element("strong", { text: label }),
        element("small", { text: description }),
      ] }),
      input,
    ] });
  });
  const saveButton = element("button", {
    className: "tool-selection-save",
    text: "Apply tool selection",
    attrs: { type: "button" },
  });
  const section = element("section", { className: "tool-selection", children: [
    element("h3", { text: "Allowed Tool Calls" }),
    element("div", { className: "tool-selection-list", children: rows }),
    element("div", { className: "tool-selection-footer", children: [status, saveButton] }),
  ] });
  saveButton.addEventListener("click", async () => {
    if (runActive) {
      status.textContent = "Wait for the current run to finish before changing tools.";
      return;
    }
    storedToolPermissions = normalizeToolPermissions(Object.fromEntries(
      [...section.querySelectorAll("[data-tool-permission]")]
        .map((input) => [input.dataset.toolPermission, input.checked]),
    ));
    saveButton.disabled = true;
    status.textContent = "Applying tool selection…";
    try {
      await saveUiState({ toolPermissions: storedToolPermissions });
      if (!socketService?.send({ type: "tool_permissions", permissions: storedToolPermissions })) {
        throw new Error("The harness is offline.");
      }
      status.textContent = "Tool selection applied.";
      appendLog("TOOLS", "Tool permissions updated");
    } catch (error) {
      status.textContent = error.message;
    } finally {
      saveButton.disabled = false;
    }
  });
  return section;
};

const createMcpSettings = () => {
  let configContent = "";
  const status = element("p", { className: "tool-selection-status", text: "Loading MCP servers…" });
  const serverList = element("div", { className: "mcp-server-list" });
  const typeInput = element("select", { children: [
    element("option", { text: "Remote MCP", attrs: { value: "remote" } }),
    element("option", { text: "Local stdio MCP", attrs: { value: "stdio" } }),
  ] });
  const labelInput = element("input", { attrs: { type: "text", placeholder: "Server label" } });
  const urlInput = element("input", { attrs: { type: "url", placeholder: "https://example.com/mcp" } });
  const commandInput = element("input", { attrs: { type: "text", placeholder: "Command, e.g. node" } });
  const argsInput = element("input", { attrs: { type: "text", placeholder: "Arguments separated by spaces" } });
  const cwdInput = element("input", { attrs: { type: "text", placeholder: "Working directory (optional)" } });
  const remoteField = element("label", { children: [element("span", { text: "Server URL" }), urlInput] });
  const stdioFields = [
    element("label", { children: [element("span", { text: "Command" }), commandInput] }),
    element("label", { children: [element("span", { text: "Arguments" }), argsInput] }),
    element("label", { children: [element("span", { text: "Working directory" }), cwdInput] }),
  ];
  const addButton = element("button", { className: "tool-selection-save", text: "Add server", attrs: { type: "button" } });

  const saveMcpContent = async (content) => {
    if (runActive) throw new Error("Wait for the current run to finish before changing MCP servers.");
    await saveConfig(content);
    configContent = content;
    socketService?.send({ type: "reload_tools" });
    appendLog("MCP", "Server configuration updated");
  };

  const renderServers = () => {
    serverList.replaceChildren();
    const blocks = mcpBlocks(configContent);
    if (!blocks.length) {
      serverList.append(element("p", { className: "step-prompt-modal-status", text: "No MCP servers configured." }));
      return;
    }
    blocks.forEach((block) => {
      const toggle = element("button", {
        className: `mcp-server-toggle ${block.enabled ? "enabled" : ""}`,
        text: block.enabled ? "On" : "Off",
        attrs: { type: "button", "aria-pressed": String(block.enabled) },
      });
      toggle.addEventListener("click", async () => {
        toggle.disabled = true;
        status.textContent = `${block.enabled ? "Disabling" : "Enabling"} ${block.label}…`;
        try {
          await saveMcpContent(setToolBlockEnabled(configContent, block, !block.enabled));
          renderServers();
          status.textContent = `${block.label} ${block.enabled ? "disabled" : "enabled"}.`;
        } catch (error) {
          status.textContent = error.message;
        } finally {
          toggle.disabled = false;
        }
      });
      serverList.append(element("article", { className: "mcp-server-row", children: [
        element("div", { children: [
          element("strong", { text: block.label }),
          element("small", { text: `${block.type} · ${block.detail}` }),
        ] }),
        toggle,
      ] }));
    });
  };

  const updateTypeFields = () => {
    const remote = typeInput.value === "remote";
    remoteField.hidden = !remote;
    stdioFields.forEach((field) => { field.hidden = remote; });
  };

  typeInput.addEventListener("change", updateTypeFields);
  addButton.addEventListener("click", async () => {
    const label = labelInput.value.trim();
    if (!/^[A-Za-z0-9_-]+$/.test(label)) {
      status.textContent = "Label may contain only letters, numbers, _ or -.";
      return;
    }
    let snippet;
    if (typeInput.value === "remote") {
      const url = urlInput.value.trim();
      if (!url) { status.textContent = "Server URL is required."; return; }
      snippet = `[[mcp.servers]]\nserver_label = "${quoteToml(label)}"\nserver_url = "${quoteToml(url)}"\nrequire_approval = "always"`;
    } else {
      const command = commandInput.value.trim();
      if (!command) { status.textContent = "Command is required."; return; }
      const args = argsInput.value.split(/\s+/).filter(Boolean).map((arg) => `"${quoteToml(arg)}"`).join(", ");
      const cwd = cwdInput.value.trim();
      snippet = `[mcp_servers.${label}]\ncommand = "${quoteToml(command)}"\nargs = [${args}]${cwd ? `\ncwd = "${quoteToml(cwd)}"` : ""}\nmessage_format = "content-length"`;
    }
    addButton.disabled = true;
    status.textContent = "Adding MCP server…";
    try {
      const prefix = configContent.trimEnd();
      await saveMcpContent(`${prefix}${prefix ? "\n\n" : ""}${snippet}\n`);
      labelInput.value = ""; urlInput.value = ""; commandInput.value = ""; argsInput.value = ""; cwdInput.value = "";
      renderServers();
      status.textContent = `${label} added.`;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      addButton.disabled = false;
    }
  });

  const form = element("div", { className: "mcp-add-form", children: [
    element("label", { children: [element("span", { text: "Server type" }), typeInput] }),
    element("label", { children: [element("span", { text: "Label" }), labelInput] }),
    remoteField,
    ...stdioFields,
    addButton,
  ] });
  const section = element("section", { className: "tool-selection mcp-settings", children: [
    element("h3", { text: "MCP Server Configuration" }),
    serverList,
    element("h4", { text: "Add server" }),
    form,
    status,
  ] });
  updateTypeFields();
  loadConfig().then((payload) => {
    configContent = payload.content || "";
    renderServers();
    status.textContent = payload.exists ? "MCP configuration loaded." : "No MCP configuration file yet.";
  }).catch((error) => { status.textContent = error.message; });
  return section;
};

const renderStepPrompts = (config) => {
  promptModalContent.replaceChildren();
  for (const key of config.keys) {
    const prompt = systemPromptsByKey?.get(key);
    if (!prompt) continue;
    const editor = element("textarea", {
      className: "step-prompt-editor",
      attrs: { spellcheck: "false", "aria-label": `Edit ${prompt.title}` },
    });
    editor.value = prompt.content;
    const status = element("span", { className: "step-prompt-save-status" });
    const saveButton = element("button", {
      className: "step-prompt-save",
      text: "Save prompt",
      attrs: { type: "button" },
    });
    saveButton.addEventListener("click", async () => {
      if (runActive) {
        status.textContent = "Wait for the current run to finish.";
        return;
      }
      saveButton.disabled = true;
      status.textContent = "Saving…";
      try {
        await saveSystemPrompt(key, editor.value);
        prompt.content = editor.value;
        socketService?.send({ type: "provider_settings", ...modelSettings });
        status.textContent = "Saved";
        appendLog("PROMPT", `${prompt.title} updated`);
      } catch (error) {
        status.textContent = error.message;
      } finally {
        saveButton.disabled = false;
      }
    });
    promptModalContent.append(element("article", { children: [
      element("h3", { text: prompt.title }),
      editor,
      element("footer", { className: "step-prompt-actions", children: [status, saveButton] }),
    ] }));
  }
  if (!promptModalContent.childElementCount) {
    promptModalContent.append(element("p", { className: "step-prompt-modal-status", text: "No prompt is configured for this step." }));
  }
  if (config.showToolSettings) promptModalContent.append(createToolSettings());
  if (config.showMcpSettings) promptModalContent.append(createMcpSettings());
};

async function openStepPrompt(unit) {
  const config = stepPromptConfig.get(unit);
  if (!config) return;
  promptModalTitle.textContent = `${config.title} Prompts`;
  promptModalStep.textContent = "System instructions used by this harness step. Changes apply to subsequent runs.";
  promptModalContent.replaceChildren(element("p", {
    className: "step-prompt-modal-status",
    text: "Loading system prompts…",
  }));
  if (!stepPromptModal.open) stepPromptModal.showModal();

  try {
    systemPromptsRequest ||= loadSystemPrompts().then((prompts) => {
      systemPromptsByKey = new Map(prompts.map((prompt) => [prompt.key, prompt]));
    });
    await systemPromptsRequest;
    renderStepPrompts(config);
  } catch (error) {
    systemPromptsRequest = null;
    promptModalContent.replaceChildren(element("p", {
      className: "step-prompt-modal-status step-prompt-modal-error",
      text: error.message,
    }));
  }
}

closePromptModal.addEventListener("click", () => stepPromptModal.close());
stepPromptModal.addEventListener("click", (event) => {
  if (event.target === stepPromptModal) stepPromptModal.close();
});

const modelProviderInput = element("select", { attrs: { id: "rigModelProvider" }, children: [
  element("option", { text: "OpenAI", attrs: { value: "openai" } }),
  element("option", { text: "Ollama", attrs: { value: "ollama" } }),
  element("option", { text: "Custom", attrs: { value: "custom" } }),
] });
const modelNameInput = element("select", { attrs: { id: "rigModelName" } });
const modelBaseUrlInput = element("input", { attrs: { id: "rigModelBaseUrl", type: "url", placeholder: "Provider base URL" } });
const modelApiKeyInput = element("input", { attrs: { id: "rigModelApiKey", type: "password", placeholder: "API key", autocomplete: "off" } });
const modelConfigStatus = element("p", { className: "model-config-status", text: "Choose a provider and model." });
const refreshModelListButton = element("button", { text: "Refresh models", attrs: { type: "button" } });
const saveModelConfigButton = element("button", { className: "model-config-save", text: "Apply model", attrs: { type: "button" } });
const closeModelConfigButton = element("button", { className: "step-prompt-modal-close", text: "×", attrs: { type: "button", "aria-label": "Close model configuration" } });
const modelConfigModal = element("dialog", {
  className: "step-prompt-modal model-config-modal",
  attrs: { "aria-labelledby": "modelConfigTitle" },
  children: [element("section", { className: "step-prompt-modal-panel", children: [
    element("header", { children: [
      element("h2", { text: "Model Configuration", attrs: { id: "modelConfigTitle" } }),
      closeModelConfigButton,
    ] }),
    element("div", { className: "model-config-fields", children: [
      element("label", { children: [element("span", { text: "Provider" }), modelProviderInput] }),
      element("label", { children: [element("span", { text: "Model" }), modelNameInput] }),
      element("label", { children: [element("span", { text: "Base URL" }), modelBaseUrlInput] }),
      element("label", { className: "model-api-key-field", children: [element("span", { text: "API key" }), modelApiKeyInput] }),
    ] }),
    modelConfigStatus,
    element("footer", { children: [refreshModelListButton, saveModelConfigButton] }),
  ] })],
});
document.body.append(modelConfigModal);

const defaultModelForProvider = (provider) => {
  if (provider === "ollama") return "llama3.1";
  if (provider === "custom") return "custom-model";
  return "gpt-5.1-codex";
};

const setModelOptions = (models = [], selected = "") => {
  const value = selected || defaultModelForProvider(modelProviderInput.value);
  const options = [...new Set([value, ...models].filter(Boolean))];
  modelNameInput.replaceChildren(...options.map((model) => element("option", {
    text: model,
    attrs: { value: model },
  })));
  modelNameInput.value = value;
};

const currentModelForm = () => ({
  provider: modelProviderInput.value,
  model: modelNameInput.value,
  baseUrl: modelBaseUrlInput.value.trim(),
  apiKey: modelApiKeyInput.value.trim(),
});

const updateModelProviderFields = () => {
  const provider = modelProviderInput.value;
  modelApiKeyInput.closest("label").hidden = provider === "ollama";
  modelBaseUrlInput.placeholder = provider === "ollama"
    ? "http://localhost:11434"
    : provider === "custom" ? "http://localhost:8000/v1" : "https://api.openai.com/v1";
};

const refreshModelOptions = async () => {
  refreshModelListButton.disabled = true;
  modelConfigStatus.textContent = "Loading available models…";
  try {
    const current = currentModelForm();
    const payload = await loadProviderModels(current);
    setModelOptions(payload.models || [], current.model);
    modelConfigStatus.textContent = `${payload.models?.length || 0} models loaded.`;
  } catch (error) {
    modelConfigStatus.textContent = error.message;
  } finally {
    refreshModelListButton.disabled = false;
  }
};

async function openModelConfig() {
  modelProviderInput.value = modelSettings.provider;
  setModelOptions([], modelSettings.model);
  modelBaseUrlInput.value = modelSettings.baseUrl;
  modelApiKeyInput.value = modelSettings.apiKey;
  modelConfigStatus.textContent = "Choose a provider and model.";
  updateModelProviderFields();
  if (!modelConfigModal.open) modelConfigModal.showModal();
  await refreshModelOptions();
}

modelProviderInput.addEventListener("change", () => {
  setModelOptions([], defaultModelForProvider(modelProviderInput.value));
  updateModelProviderFields();
  refreshModelOptions();
});
refreshModelListButton.addEventListener("click", refreshModelOptions);
closeModelConfigButton.addEventListener("click", () => modelConfigModal.close());
modelConfigModal.addEventListener("click", (event) => {
  if (event.target === modelConfigModal) modelConfigModal.close();
});
saveModelConfigButton.addEventListener("click", async () => {
  if (runActive) {
    modelConfigStatus.textContent = "Wait for the current run to finish before changing models.";
    return;
  }
  modelSettings = currentModelForm();
  saveModelConfigButton.disabled = true;
  modelConfigStatus.textContent = "Applying model…";
  try {
    await saveUiState({ providerSettings: modelSettings });
    if (!socketService?.send({ type: "provider_settings", ...modelSettings })) {
      throw new Error("The harness is offline.");
    }
    modelEngine.setModel(modelSettings.model);
    runModelValue.textContent = modelSettings.model;
    appendLog("MODEL", `${modelSettings.provider} · ${modelSettings.model}`);
    modelConfigModal.close();
  } catch (error) {
    modelConfigStatus.textContent = error.message;
  } finally {
    saveModelConfigButton.disabled = false;
  }
});

const visitedHarnessStages = new Set();
let activeHarnessStage = null;

const setHarnessStage = (stageName) => {
  if (stageName === "input") visitedHarnessStages.clear();
  if (activeHarnessStage && activeHarnessStage !== stageName) {
    visitedHarnessStages.add(activeHarnessStage);
  }
  activeHarnessStage = stageName;
  const activeIndex = harnessStages.findIndex(({ name }) => name === stageName);
  const activeUnitIndex = activeIndex >= 0
    ? signalUnits.indexOf(harnessStages[activeIndex].units[0])
    : -1;
  signalConnectors.forEach((wire, index) => {
    wire.classList.toggle("signal-processed", activeUnitIndex >= 0 && index < activeUnitIndex);
  });
  harnessStages.forEach(({ name, units }, index) => {
    units.forEach((unit) => {
      unit.classList.toggle("process-active", index === activeIndex);
      unit.classList.toggle("process-complete", visitedHarnessStages.has(name));
      unit.classList.remove("process-error");
      if (index === activeIndex) unit.setAttribute("aria-current", "step");
      else unit.removeAttribute("aria-current");
    });
  });
};

const setHarnessError = () => {
  signalUnits.forEach((unit) => {
    if (unit.classList.contains("process-active")) unit.classList.add("process-error");
    unit.classList.remove("process-active");
    unit.removeAttribute("aria-current");
  });
  activeHarnessStage = null;
};

const resetHarnessDisplay = () => {
  visitedHarnessStages.clear();
  activeHarnessStage = null;
  signalConnectors.forEach((wire) => wire.classList.remove("signal-processed"));
  signalUnits.forEach((unit) => {
    unit.classList.remove("process-active", "process-complete", "process-error");
    unit.removeAttribute("aria-current");
  });
};

const rigContainer = document.querySelector("#rigContainer");
rigContainer.classList.add("rig");
rigContainer.setAttribute("role", "region");
rigContainer.setAttribute("aria-label", "Workflow signal chain");

const chainViewport = element("div", { className: "rig-chain-viewport" });
const rigChain = element("div", { className: "rig-chain" });
chainViewport.append(rigChain);
rigContainer.append(chainViewport);

signalUnits.forEach((unit, index) => {
  rigChain.append(unit);
  if (index < signalUnits.length - 1) {
    const wire = connector("jack");
    signalConnectors.push(wire);
    rigChain.append(wire);
  }
});

const fitRigToViewport = () => {
  rigChain.style.transform = "none";
  const naturalWidth = rigChain.scrollWidth;
  const naturalHeight = rigChain.scrollHeight;
  const styles = getComputedStyle(rigContainer);
  const availableWidth = rigContainer.clientWidth
    - parseFloat(styles.paddingLeft)
    - parseFloat(styles.paddingRight);
  const availableHeight = rigContainer.clientHeight
    - parseFloat(styles.paddingTop)
    - parseFloat(styles.paddingBottom);
  const scale = Math.min(1, availableWidth / naturalWidth, availableHeight / naturalHeight);

  chainViewport.style.width = `${naturalWidth * scale}px`;
  chainViewport.style.height = `${naturalHeight * scale}px`;
  rigChain.style.transform = `scale(${scale})`;
};

requestAnimationFrame(fitRigToViewport);
new ResizeObserver(fitRigToViewport).observe(rigContainer);

const promptInput = element("input", {
  className: "prompt-input",
  attrs: {
    type: "text",
    id: "userPrompt",
    placeholder: "Enter a prompt for the harness…",
    "aria-label": "User prompt",
    autocomplete: "off",
  },
});

const chatOutput = element("div", {
  className: "rig-chat-output",
  attrs: {
    role: "log",
    "aria-live": "polite",
    "aria-label": "Prompt conversation",
  },
  children: [element("p", {
    className: "rig-chat-empty",
    text: "Send a prompt to begin the conversation.",
  })],
});

const promptPanel = element("section", {
  className: "rig-workspace-panel prompt-window",
  attrs: { "aria-labelledby": "promptWindowTitle" },
  children: [
    element("h2", { text: "CONVERSATION", attrs: { id: "promptWindowTitle" } }),
    chatOutput,
    promptInput,
  ],
});

const logOutput = element("div", {
  className: "log-output",
  attrs: { role: "log", "aria-live": "polite", "aria-label": "Harness activity log" },
  children: [
    element("p", { children: [
      element("time", { text: "[SOCKET]" }),
      element("span", { text: " Connecting to harness…" }),
    ] }),
    element("p", { children: [
      element("time", { text: "[PROMPT]" }),
      element("span", { text: " Waiting for connection" }),
    ] }),
  ],
});

const liveStatus = element("span", { className: "log-live log-connecting", text: "● CONNECTING" });

const logPanel = element("aside", {
  className: "rig-workspace-panel log-window",
  attrs: { "aria-labelledby": "logWindowTitle" },
  children: [
    element("div", { className: "log-heading", children: [
      element("h2", { text: "LIVE LOG", attrs: { id: "logWindowTitle" } }),
      liveStatus,
    ] }),
    logOutput,
  ],
});

const workspace = element("section", {
  className: "rig-workspace",
  attrs: { "aria-label": "Prompt and harness log" },
  children: [promptPanel, logPanel],
});

rigContainer.insertAdjacentElement("afterend", workspace);

let sessionId = crypto.randomUUID();
let conversation = [];
let sessions = [];
let activeRigSession = null;
let sessionSaveQueue = Promise.resolve();
let socketService;
let runActive = false;
let streamingText = "";
let streamingBody = null;
let reconnectTimer = null;
let promptWorkspace = ".";
let modelSettings = { provider: "openai", model: "gpt-5.1-codex", baseUrl: "", apiKey: "" };
let storedToolPermissions = normalizeToolPermissions();
let inputTokens = 0;
let outputTokens = 0;
let promptStartedAt = 0;
let promptTimer = null;
let workspaceBrowserRoot = null;
let workspacePickerRoot = null;
let workspacePickerParent = null;
let pendingWorkspacePath = null;
let editingFilePath = null;

const persistRigSessions = () => {
  if (!activeRigSession) return;
  activeRigSession.messages = conversation;
  activeRigSession.workspace = promptWorkspace;
  activeRigSession.updatedAt = Date.now();
  sessionSaveQueue = sessionSaveQueue
    .then(() => saveUiState({ sessions, activeSessionId: sessionId }))
    .catch((error) => appendLog("HISTORY", `Save failed: ${error.message}`, "log-error"));
};

const formatElapsed = (milliseconds) => {
  const totalTenths = Math.floor(milliseconds / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${totalTenths % 10}`;
};

const updateElapsed = () => {
  if (promptStartedAt) runTimeValue.textContent = formatElapsed(performance.now() - promptStartedAt);
};

const startPromptTimer = () => {
  window.clearInterval(promptTimer);
  promptStartedAt = performance.now();
  runTimeValue.textContent = "00:00.0";
  harnessRunDisplay.classList.add("is-running");
  promptTimer = window.setInterval(updateElapsed, 100);
};

const stopPromptTimer = () => {
  if (promptStartedAt) updateElapsed();
  window.clearInterval(promptTimer);
  promptTimer = null;
  promptStartedAt = 0;
  harnessRunDisplay.classList.remove("is-running");
};

const updateTokenMeters = () => {
  const relativeMaximum = Math.max(1, inputTokens, outputTokens);
  inputChannel.setTokenCount(inputTokens, relativeMaximum);
  outputChannel.setTokenCount(outputTokens, relativeMaximum);
  runTokensValue.textContent = (inputTokens + outputTokens).toLocaleString();
  const tokenTotal = inputTokens + outputTokens;
  setHeaderSignalLevel(tokenTotal ? Math.min(12, 3 + Math.ceil(Math.log10(tokenTotal + 1) * 3)) : (runActive ? 2 : 0));
};

const addResponseUsage = (response = {}) => {
  const usage = response.usage || {};
  inputTokens += Number(usage.input_tokens ?? usage.prompt_tokens ?? 0) || 0;
  outputTokens += Number(usage.output_tokens ?? usage.completion_tokens ?? 0) || 0;
  updateTokenMeters();
};

const appendLog = (type, message, className = "") => {
  const item = element("p", {
    className,
    children: [
      element("time", { text: `[${type}]` }),
      element("span", { text: ` ${message}` }),
    ],
  });
  logOutput.append(item);
  logOutput.scrollTop = logOutput.scrollHeight;
  return item;
};

const selectWorkspace = async (path) => {
  if (!path) return;
  promptWorkspace = path;
  workspaceInput.value = path;
  filesWorkspaceLabel.textContent = path;
  socketService?.send({ type: "reset", sessionId });
  appendLog("WORKSPACE", path);
  persistRigSessions();
  await refreshWorkspaceTree();
};

async function openWorkspaceFile(node) {
  editingFilePath = node.path;
  fileEditorTitle.textContent = node.name;
  fileEditorPath.textContent = node.path;
  fileEditorContent.value = "";
  fileEditorContent.disabled = true;
  saveFileEditorButton.disabled = true;
  fileEditorStatus.textContent = "Loading…";
  fileEditorDialog.showModal();
  try {
    const content = await loadWorkspaceFile(promptWorkspace, node.path);
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

async function persistWorkspaceFile() {
  if (!editingFilePath) return;
  saveFileEditorButton.disabled = true;
  fileEditorStatus.textContent = "Saving…";
  try {
    await saveWorkspaceFile(promptWorkspace, editingFilePath, fileEditorContent.value);
    fileEditorStatus.textContent = "Saved";
    appendLog("FILE", `${editingFilePath} saved`);
    await refreshWorkspaceTree();
  } catch (error) {
    fileEditorStatus.textContent = error.message;
  } finally {
    saveFileEditorButton.disabled = false;
  }
}

async function refreshWorkspaceTree() {
  filesWorkspaceLabel.textContent = promptWorkspace;
  workspaceTreeElement.replaceChildren(element("p", { className: "workspaceTreeStatus", text: "Loading files…" }));
  try {
    const payload = await loadWorkspaceTree(promptWorkspace);
    workspaceBrowserRoot = payload.root;
    workspaceTreeElement.replaceChildren();
    renderWorkspaceNodes(payload.tree || [], workspaceTreeElement, {
      onOpenFile: openWorkspaceFile,
      onSelectFolder: selectWorkspace,
    });
  } catch (error) {
    workspaceTreeElement.replaceChildren(element("p", { className: "workspaceTreeStatus", text: error.message }));
  }
}

const chooseWorkspacePickerPath = (path) => {
  pendingWorkspacePath = path;
  workspacePickerPath.textContent = path;
  workspacePickerTree.querySelectorAll(".workspacePickerOption").forEach((option) => {
    option.classList.toggle("selected", option.dataset.path === path);
  });
};

async function loadWorkspacePickerRoot(rootPath) {
  parentWorkspacePickerButton.disabled = true;
  workspacePickerTree.replaceChildren(element("p", { className: "workspaceTreeStatus", text: "Loading folders…" }));
  const payload = await loadWorkspaceTree(rootPath);
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
  workspacePickerDialog.showModal();
  try {
    await loadWorkspacePickerRoot(workspaceBrowserRoot || promptWorkspace);
  } catch (error) {
    workspacePickerPath.textContent = error.message;
  }
}

fileExplorer.addEventListener("refresh-workspace", refreshWorkspaceTree);
fileExplorer.addEventListener("choose-workspace", openWorkspacePicker);
fileExplorer.addEventListener("focus-prompt", () => promptInput.focus());
workspacePickerModal.addEventListener("workspace-picker-parent", () => {
  if (workspacePickerParent) loadWorkspacePickerRoot(workspacePickerParent);
});
workspacePickerModal.addEventListener("workspace-picker-confirm", async () => {
  if (!pendingWorkspacePath) return;
  workspacePickerDialog.close();
  await selectWorkspace(pendingWorkspacePath);
});
fileEditorModal.addEventListener("save-workspace-file", persistWorkspaceFile);

const setExplorerVisible = (visible) => {
  document.querySelector(".app").classList.toggle("explorer-hidden", !visible);
  explorerToggle.setAttribute("aria-pressed", String(visible));
  explorerToggle.title = visible ? "Hide file explorer" : "Show file explorer";
  explorerToggle.setAttribute("aria-label", explorerToggle.title);
  localStorage.setItem("ai-harness.rigExplorerVisible", String(visible));
  requestAnimationFrame(fitRigToViewport);
};

explorerToggle.addEventListener("click", () => {
  setExplorerVisible(document.querySelector(".app").classList.contains("explorer-hidden"));
});

const setHistoryVisible = (visible) => {
  document.querySelector(".app").classList.toggle("history-hidden", !visible);
  historyToggle.setAttribute("aria-pressed", String(visible));
  historyToggle.title = visible ? "Hide conversation history" : "Show conversation history";
  historyToggle.setAttribute("aria-label", historyToggle.title);
  localStorage.setItem("ai-harness.rigHistoryVisible", String(visible));
  requestAnimationFrame(fitRigToViewport);
};

historyToggle.addEventListener("click", () => {
  setHistoryVisible(document.querySelector(".app").classList.contains("history-hidden"));
});

const setConnectionState = (state, label) => {
  liveStatus.className = `log-live log-${state}`;
  liveStatus.textContent = `● ${label}`;
  promptInput.disabled = state !== "online" || runActive;
};

const setRunActive = (active) => {
  runActive = active;
  headerSignalMeter.classList.toggle("is-active", active);
  if (active && Number(headerSignalMeter.getAttribute("aria-valuenow")) === 0) setHeaderSignalLevel(2);
  promptInput.disabled = active || !socketService?.isOpen;
  if (!active && socketService?.isOpen) promptInput.focus();
};

const scrollChatToEnd = () => {
  chatOutput.scrollTop = chatOutput.scrollHeight;
};

const appendChatMessage = (role, text, className = "") => {
  chatOutput.querySelector(".rig-chat-empty")?.remove();
  const body = element("div", { className: "rig-chat-message-body" });
  appendMessageText(body, text);
  const message = element("article", {
    className: `rig-chat-message rig-chat-message-${role} ${className}`.trim(),
    children: [body],
  });
  chatOutput.append(message);
  appendConversationHistory(role, text, message);
  scrollChatToEnd();
  return body;
};

function appendConversationHistory(role, text, messageElement) {
  historyList.querySelector(".conversation-history-empty")?.remove();
  const item = element("button", {
    className: `conversation-history-item history-${role}`,
    attrs: { type: "button", title: text },
    children: [
      element("strong", { text: role === "user" ? "YOU" : "HARNESS" }),
      element("span", { text: text.replace(/\s+/g, " ").trim() }),
    ],
  });
  item.addEventListener("click", () => {
    messageElement.scrollIntoView({ behavior: "smooth", block: "center" });
    messageElement.classList.add("history-target");
    window.setTimeout(() => messageElement.classList.remove("history-target"), 900);
  });
  historyList.append(item);
  const count = historyList.querySelectorAll(".conversation-history-item").length;
  historyCount.textContent = `${count} message${count === 1 ? "" : "s"}`;
  historyList.scrollTop = historyList.scrollHeight;
}

const beginStream = () => {
  streamingText = "";
  chatOutput.querySelector(".rig-chat-empty")?.remove();
  streamingBody = element("div", { className: "rig-chat-message-body" });
  chatOutput.append(element("article", {
    className: "rig-chat-message rig-chat-message-agent rig-chat-message-streaming",
    children: [streamingBody],
  }));
  appendLog("STREAM", "Answer started");
  scrollChatToEnd();
};

const appendStream = (text) => {
  if (!streamingBody) beginStream();
  streamingText += text;
  streamingBody.textContent = streamingText;
  scrollChatToEnd();
};

const finishStream = (text = "") => {
  const finalText = text || streamingText;
  if (!streamingBody && finalText) beginStream();
  if (streamingBody) {
    streamingBody.replaceChildren();
    appendMessageText(streamingBody, finalText);
    const message = streamingBody.closest(".rig-chat-message");
    message?.classList.remove("rig-chat-message-streaming");
    if (finalText && message) appendConversationHistory("agent", finalText, message);
  }
  if (finalText) {
    conversation.push({ role: "agent", text: finalText });
    persistRigSessions();
  }
  streamingBody = null;
  streamingText = "";
  scrollChatToEnd();
  stopPromptTimer();
  setRunActive(false);
};

const handleSocketMessage = (payload) => {
  if (payload.type === "ready") {
    modelEngine.setModel(payload.model);
    runModelValue.textContent = payload.model || "—";
    appendLog("READY", `${payload.provider} · ${payload.model}`);
    return;
  }
  if (payload.type === "provider_settings") {
    modelEngine.setModel(payload.model);
    runModelValue.textContent = payload.model || "—";
    appendLog("MODEL", payload.model || "Model updated");
    return;
  }
  if (payload.type === "info") {
    appendLog("INFO", payload.message || "Harness update");
    return;
  }
  if (payload.type === "tool") {
    setHarnessStage(payload.name === "mcp_approval_request" ? "mcp" : "tool");
    appendLog("TOOL", `${payload.name}${payload.args ? ` ${JSON.stringify(payload.args)}` : ""}`);
    return;
  }
  if (payload.type === "approval_request") {
    setHarnessStage("mcp");
    appendLog("APPROVAL", payload.description || "Tool approval requested");
    const approved = window.confirm(`Allow this tool action?\n\n${payload.description || ""}`);
    socketService.send({
      type: "approval_response",
      requestId: payload.requestId,
      description: payload.description,
      approved,
    });
    return;
  }
  if (payload.type === "approval") {
    setHarnessStage("mcp");
    appendLog("APPROVAL", payload.approved ? "Approved" : "Denied");
    return;
  }
  if (payload.type === "agent_event") {
    const eventType = payload.event?.type;
    if (eventType === "start") setHarnessStage("input");
    else if (["turn", "response"].includes(eventType)) setHarnessStage("model");
    else if (["tool_start", "tool_result"].includes(eventType)) setHarnessStage("tool");
    else if (["mcp_call", "approval_request", "approval_response"].includes(eventType)) setHarnessStage("mcp");
    else if (eventType === "validation") setHarnessStage("validation");
    else if (eventType === "final") setHarnessStage("response");
    if (eventType === "turn") addResponseUsage(payload.event.serverResponse);
    appendLog("HARNESS", describeAgentEvent(payload.event));
    return;
  }
  if (payload.type === "answer_start") {
    setHarnessStage("response");
    beginStream();
    return;
  }
  if (payload.type === "answer_delta") {
    appendStream(payload.text || "");
    return;
  }
  if (payload.type === "done") {
    finishStream(payload.text || streamingText);
    setHarnessStage("output");
    appendLog("DONE", "Run completed");
    return;
  }
  if (payload.type === "error") {
    setHarnessError();
    appendLog("ERROR", payload.error || "Harness error", "log-error");
    appendChatMessage("agent", payload.error || "Harness error", "rig-chat-message-error");
    conversation.push({ role: "agent", text: payload.error || "Harness error" });
    persistRigSessions();
    streamingBody = null;
    streamingText = "";
    stopPromptTimer();
    setRunActive(false);
  }
};

const connect = () => {
  window.clearTimeout(reconnectTimer);
  setConnectionState("connecting", "CONNECTING");
  socketService = new SocketService({
    onOpen() {
      setConnectionState("online", "LIVE");
      appendLog("SOCKET", "Connected");
      socketService.send({ type: "provider_settings", ...modelSettings });
      socketService.send({ type: "tool_permissions", permissions: storedToolPermissions });
      promptInput.focus();
    },
    onClose() {
      stopPromptTimer();
      setRunActive(false);
      setConnectionState("offline", "OFFLINE");
      appendLog("SOCKET", "Disconnected; reconnecting…");
      reconnectTimer = window.setTimeout(connect, 1500);
    },
    onError() {
      setConnectionState("error", "ERROR");
      appendLog("ERROR", "WebSocket connection failed", "log-error");
    },
    onMessage: handleSocketMessage,
  });
  socketService.connect();
};

const submitPrompt = () => {
  if (!promptInput.value.trim() || runActive || !socketService?.isOpen) return false;
  const prompt = promptInput.value.trim();
  const history = conversation.slice(-20);
  inputTokens = 0;
  outputTokens = 0;
  updateTokenMeters();
  conversation.push({ role: "user", text: prompt });
  if (activeRigSession && (!activeRigSession.title || activeRigSession.title === "New chat" || activeRigSession.title === "AI Harness Session")) {
    activeRigSession.title = titleFromPrompt(prompt);
  }
  persistRigSessions();
  runPromptsValue.textContent = String(conversation.filter((message) => message.role === "user").length);
  runModelValue.textContent = modelSettings.model || runModelValue.textContent;
  startPromptTimer();
  setHarnessStage("input");
  appendChatMessage("user", prompt);
  appendLog("INPUT", prompt);
  promptInput.value = "";
  setRunActive(true);
  const sent = socketService.send({
    type: "prompt",
    prompt,
    sessionId,
    history,
    images: [],
    workspace: promptWorkspace,
  });
  if (!sent) {
    appendLog("ERROR", "Prompt could not be sent", "log-error");
    stopPromptTimer();
    setRunActive(false);
  }
  return sent;
};

promptInput.disabled = true;
promptInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  submitPrompt();
});

playButton.addEventListener("click", submitPrompt);

stopButton.addEventListener("click", () => {
  if (!runActive) return;
  appendLog("STOP", "Run stopped by user");
  if (streamingText) finishStream(streamingText);
  else {
    stopPromptTimer();
    setRunActive(false);
  }
  socketService?.socket?.close(1000, "Stopped by user");
});

rewindButton.addEventListener("click", () => {
  if (runActive) return;
  conversation.length = 0;
  if (activeRigSession) activeRigSession.title = "New chat";
  chatOutput.replaceChildren(element("p", {
    className: "rig-chat-empty",
    text: "Send a prompt to begin the conversation.",
  }));
  historyList.replaceChildren(element("p", { className: "conversation-history-empty", text: "No messages yet." }));
  historyCount.textContent = "0 messages";
  runPromptsValue.textContent = "0";
  runTokensValue.textContent = "0";
  inputTokens = 0;
  outputTokens = 0;
  updateTokenMeters();
  resetHarnessDisplay();
  socketService?.send({ type: "reset", sessionId });
  persistRigSessions();
  appendLog("RESET", "Conversation rewound");
  promptInput.focus();
});

recordButton.addEventListener("click", () => {
  const recording = recordButton.getAttribute("aria-pressed") !== "true";
  recordButton.setAttribute("aria-pressed", String(recording));
  recordButton.title = recording ? "Disable recording" : "Enable recording";
  recordButton.setAttribute("aria-label", recordButton.title);
  appendLog("RECORD", recording ? "Recording enabled" : "Recording disabled");
});

const initializePromptStream = async () => {
  setExplorerVisible(localStorage.getItem("ai-harness.rigExplorerVisible") !== "false");
  setHistoryVisible(localStorage.getItem("ai-harness.rigHistoryVisible") !== "false");
  try {
    const [health, state] = await Promise.all([loadHealth(), loadUiState()]);
    sessions = Array.isArray(state.sessions) && state.sessions.length
      ? state.sessions.map((session) => ({
        ...session,
        messages: Array.isArray(session.messages) ? session.messages : [],
        events: Array.isArray(session.events) ? session.events : [],
        workspace: session.workspace || health.workspace || ".",
      }))
      : [createSession("AI Harness Session", health.workspace || ".")];
    activeRigSession = sessions.find((session) => session.id === state.activeSessionId) || sessions[0];
    sessionId = activeRigSession.id;
    conversation = activeRigSession.messages;
    promptWorkspace = activeRigSession.workspace || health.workspace || ".";
    for (const message of conversation) {
      appendChatMessage(message.role, message.text || "");
    }
    runPromptsValue.textContent = String(conversation.filter((message) => message.role === "user").length);
    const selectedProvider = Array.isArray(state.providers)
      ? state.providers.find((provider) => provider.selected)
      : null;
    const stored = selectedProvider || state.providerSettings;
    if (stored) {
      modelSettings = {
        provider: stored.type || stored.provider || "openai",
        model: stored.model || defaultModelForProvider(stored.type || stored.provider),
        baseUrl: stored.baseUrl || "",
        apiKey: stored.apiKey || "",
      };
      modelEngine.setModel(modelSettings.model);
      runModelValue.textContent = modelSettings.model;
    }
    storedToolPermissions = normalizeToolPermissions(state.toolPermissions);
  } catch (error) {
    appendLog("WARN", `Using default workspace: ${error.message}`);
  }
  workspaceInput.value = promptWorkspace;
  await refreshWorkspaceTree();
  connect();
};

initializePromptStream();
