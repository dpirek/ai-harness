import GuitarEffect from "/components/guitar-effect.js";
import CassettePlayer from "/components/cassette-player.js";
import ModelEngine from "/components/model-engine.js";
import Microphone from "/components/microphone.js";
import MidiKeyboard from "/components/midi-keyboard.js";
import WhisperModel from "/components/whisper-model.js";
import RigIO from "/components/rig-io.js";
import WorkspacePanel from "/components/workspace-panel.js";
import "/components/modals/file-editor-modal.js";
import "/components/modals/workspace-picker-modal.js";
import { appendEvent, describeAgentEvent } from "/lib/event-rendering.js";
import { codeLanguageLabel, renderFilePreview } from "/lib/file-utils.js";
import { harnessWaveIcon, liveLogIcon, presetsIcon, workspaceExplorerIcon } from "/lib/icons.js";
import { appendMessageText } from "/lib/message-rendering.js";
import { mcpBlocks, quoteToml, setToolBlockEnabled } from "/lib/mcp-config.js";
import { normalizeToolPermissions } from "/lib/settings.js";
import { createSession, titleFromPrompt } from "/lib/sessions.js";
import { renderWorkspaceNodes, renderWorkspacePicker } from "/lib/workspace-rendering.js";
import { loadConfig, loadHealth, loadProviderModels, loadSystemPrompts, saveConfig, saveSystemPrompt } from "/services/settings-api.js";
import { loadUiState, saveUiState } from "/services/ui-state-api.js";
import {
  loadWorkspaceFile,
  loadWorkspaceTree,
  saveWorkspaceFile,
  saveWorkspaceRecording,
  transcribeWorkspaceRecording,
} from "/services/workspace-api.js";
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

const app = document.querySelector(".app");
const EXPLORER_VISIBLE_STORAGE_KEY = "ai-harness.rigExplorerVisible";
const HISTORY_VISIBLE_STORAGE_KEY = "ai-harness.rigHistoryVisible";
const LOG_VISIBLE_STORAGE_KEY = "ai-harness.rigLogVisible";
const PRESETS_VISIBLE_STORAGE_KEY = "ai-harness.rigPresetsVisible";
const initialExplorerVisible = localStorage.getItem(EXPLORER_VISIBLE_STORAGE_KEY) === "true";
const initialHistoryVisible = localStorage.getItem(HISTORY_VISIBLE_STORAGE_KEY) === "true";
const initialPresetsVisible = localStorage.getItem(PRESETS_VISIBLE_STORAGE_KEY) === "true";
app.classList.add("ui-initializing");
app.classList.toggle("explorer-hidden", !initialExplorerVisible);
app.classList.toggle("history-hidden", !initialHistoryVisible);
app.classList.toggle("presets-hidden", !initialPresetsVisible);

const runTimeValue = element("strong", { text: "00:00.0" });
const runModelValue = element("strong", { text: "—" });
const runTokensValue = element("strong", { text: "0" });
const runPromptsValue = element("strong", { text: "0" });
const displaySegment = (label, value, className = "") => element("div", {
  className: `harness-display-segment ${className}`.trim(),
  children: [
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
    displaySegment("elapsed", runTimeValue, "display-time"),
    displaySegment("model", runModelValue, "display-model"),
    displaySegment("tokens", runTokensValue, "display-tokens"),
    displaySegment("prompts", runPromptsValue, "display-prompts"),
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
const rewindButton = transportButton("transport-rewind", "◀◀", "Clear conversation history");
const stopButton = transportButton("transport-stop", "■", "Stop current run");
const playButton = transportButton("transport-play", "▶", "Send prompt");
const recordButton = transportButton("transport-record", "●", "Record microphone (hold ⌘1)");
recordButton.setAttribute("aria-pressed", "false");
const transportControls = element("div", {
  className: "transport-controls",
  attrs: { role: "group", "aria-label": "Harness transport controls" },
  children: [rewindButton, stopButton, playButton, recordButton],
});
const topbarBrand = document.querySelector(".topbar .brand");
topbarBrand.prepend(harnessWaveIcon());
topbarBrand.after(transportControls);

const explorerToggle = element("button", {
  className: "explorer-toggle",
  attrs: {
    type: "button",
    title: initialExplorerVisible ? "Hide file explorer" : "Show file explorer",
    "aria-label": initialExplorerVisible ? "Hide file explorer" : "Show file explorer",
    "aria-pressed": String(initialExplorerVisible),
  },
  children: [workspaceExplorerIcon()],
});

const historyToggle = element("button", {
  className: "explorer-toggle history-toggle",
  text: "◷",
  attrs: {
    type: "button",
    title: initialHistoryVisible ? "Hide conversation history" : "Show conversation history",
    "aria-label": initialHistoryVisible ? "Hide conversation history" : "Show conversation history",
    "aria-pressed": String(initialHistoryVisible),
  },
});
const presetsToggle = element("button", {
  className: "explorer-toggle presets-toggle",
  attrs: {
    type: "button",
    title: initialPresetsVisible ? "Hide presets" : "Show presets",
    "aria-label": initialPresetsVisible ? "Hide presets" : "Show presets",
    "aria-pressed": String(initialPresetsVisible),
  },
  children: [presetsIcon()],
});
const logToggle = document.querySelector(".topbar .log-toggle");
logToggle.replaceChildren(liveLogIcon());
const toolbarButtonGroup = element("div", {
  className: "toolbar-button-group",
  attrs: { role: "group", "aria-label": "Workspace controls" },
  children: [explorerToggle, historyToggle, presetsToggle, logToggle],
});
document.querySelector(".topbar .toolbar").append(toolbarButtonGroup);
const topbar = document.querySelector(".topbar");
topbar.append(headerSignalMeter);

const positionHeaderSignalMeter = () => {
  headerSignalMeter.style.removeProperty("width");
  headerSignalMeter.style.removeProperty("left");
};

requestAnimationFrame(positionHeaderSignalMeter);
window.addEventListener("resize", positionHeaderSignalMeter);
new ResizeObserver(positionHeaderSignalMeter).observe(topbar);

const fileExplorer = new WorkspacePanel();
fileExplorer.classList.add("rig-file-explorer");
app.append(fileExplorer);
const historyList = element("div", {
  className: "conversation-history-list",
  children: [element("p", { className: "conversation-history-empty", text: "No conversations yet." })],
});
const historyCount = element("span", { text: "0 conversations" });
const newConversationButton = element("button", {
  className: "conversation-history-create",
  attrs: {
    type: "button",
    title: "New conversation",
    "aria-label": "New conversation",
  },
  children: [element("span", { text: "+", attrs: { "aria-hidden": "true" } })],
});
const conversationHistory = element("aside", {
  className: "rig-conversation-history",
  attrs: { "aria-label": "Conversation history" },
  children: [
    element("header", { children: [
      element("div", { children: [element("h2", { text: "Conversation" }), historyCount] }),
      newConversationButton,
    ] }),
    historyList,
  ],
});
app.append(conversationHistory);
const presetsList = element("div", { className: "presets-list" });
const presetsPanel = element("aside", {
  className: "rig-presets",
  attrs: { "aria-labelledby": "presetsWindowTitle" },
  children: [
    element("header", { children: [
      element("div", { children: [
        element("h2", { text: "Presets", attrs: { id: "presetsWindowTitle" } }),
        element("span", { text: "Prompt shortcuts" }),
      ] }),
    ] }),
    presetsList,
  ],
});
app.append(presetsPanel);
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
const fileEditorLanguage = fileEditorModal.querySelector("#fileEditorLanguage");
const fileEditorPreviewCode = fileEditorModal.querySelector("#fileEditorPreviewCode");
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

const toggleInputSourceWithKeyboard = (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  toggleInputSource();
};
const microphone = new Microphone({
  title: "Microphone",
  subtitle: "Capture",
  handlers: {
    click: () => toggleInputSource(),
    keydown: toggleInputSourceWithKeyboard,
  },
});
const midiKeyboard = new MidiKeyboard({
  handlers: {
    click: () => toggleInputSource(),
    keydown: toggleInputSourceWithKeyboard,
  },
});
const whisperModel = new WhisperModel({
  handlers: {
    click: (event) => openStepPrompt(event.currentTarget),
    keydown: openPromptWithKeyboard,
  },
});
const inputChannel = createChannel({ title: "INPUT", tokenCount: 0, signalLevel: 0, direction: "input", color: "#e84431" });
const inputComposer = createEffect({ color: "#e84431", icon: "wave", title: "Input", subtitle: "Composer", step: "composer" });
const modelEngine = createEngine();
const toolOrchestrator = createEffect({ color: "#8a3abd", icon: "tools", title: "Tool", subtitle: "Orchestrator", step: "tools" });
const mcpServers = createEffect({ color: "#168b83", icon: "server-rig", title: "MCP", subtitle: "Servers", step: "mcp" });
const outputValidator = createEffect({ color: "#dca813", icon: "clip", title: "Evaluator", subtitle: "Suite", step: "validation" });
const responseRenderer = new CassettePlayer({
  handlers: {
    click: (event) => openStepPrompt(event.currentTarget),
    keydown: openPromptWithKeyboard,
  },
});
const outputChannel = createChannel({ title: "OUTPUT", tokenCount: 0, signalLevel: 0, direction: "output", color: "#2479cf" });

const signalUnits = [
  microphone,
  whisperModel,
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
const guitarEffects = [inputComposer, toolOrchestrator, mcpServers, outputValidator];

const disabledEffectSteps = () => guitarEffects
  .filter((effect) => !effect.enabled)
  .map((effect) => effect.dataset.step);

const EFFECT_STATES_STORAGE_KEY = "ai-harness.rigEffectStatesByConversation";
let effectStatesByConversation = {};
try {
  effectStatesByConversation = JSON.parse(localStorage.getItem(EFFECT_STATES_STORAGE_KEY) || "{}");
} catch {
  localStorage.removeItem(EFFECT_STATES_STORAGE_KEY);
}

const applyConversationEffectStates = (conversationId) => {
  const states = effectStatesByConversation[conversationId] || {};
  guitarEffects.forEach((effect) => effect.setEnabled(states[effect.dataset.step] !== false, false));
};

document.addEventListener("effect-toggle", (event) => {
  const states = Object.fromEntries(guitarEffects.map((effect) => [effect.dataset.step, effect.enabled]));
  effectStatesByConversation[sessionId] = states;
  localStorage.setItem(EFFECT_STATES_STORAGE_KEY, JSON.stringify(effectStatesByConversation));
  appendLog("FLOW", `${event.detail.step} ${event.detail.enabled ? "enabled" : "bypassed"}`);
  if (activeHarnessStage) setHarnessStage(activeHarnessStage);
});

const harnessStages = [
  { name: "capture", units: [microphone] },
  { name: "transcription", units: [whisperModel] },
  { name: "input", units: [inputChannel, inputComposer] },
  { name: "model", units: [modelEngine] },
  { name: "tool", units: [toolOrchestrator] },
  { name: "mcp", units: [mcpServers] },
  { name: "validation", units: [outputValidator] },
  { name: "response", units: [responseRenderer] },
  { name: "output", units: [outputChannel] },
];

const stepPromptConfig = new Map([
  [microphone, { title: "Microphone Input", keys: ["agent_instructions"] }],
  [midiKeyboard, { title: "MIDI Keyboard Input", keys: ["agent_instructions"] }],
  [whisperModel, {
    title: "Whisper Transcription",
    keys: [],
    renderInfo: () => [
      element("article", { className: "step-info-panel", children: [
        element("div", { className: "step-info-panel-header", children: [
          element("h3", { text: "Model information" }),
          element("span", { className: "step-info-panel-badge", text: "Transcription" }),
        ] }),
        element("div", { className: "step-info-panel-body", children: [
          element("dl", { className: "step-info-grid", children: [
            element("div", { className: "step-info-row", children: [
              element("dt", { text: "Model" }),
              element("dd", { text: "whisper-1" }),
            ] }),
            element("div", { className: "step-info-row", children: [
              element("dt", { text: "Endpoint" }),
              element("dd", { children: [element("code", { text: "POST /v1/audio/transcriptions" })] }),
            ] }),
          ] }),
          element("div", { className: "step-link-pills", children: [
            element("a", {
              className: "step-link-pill",
              text: "Whisper model page",
              attrs: {
                href: "https://developers.openai.com/api/docs/models/whisper-1",
                target: "_blank",
                rel: "noreferrer",
              },
            }),
            element("a", {
              className: "step-link-pill",
              text: "Audio API reference",
              attrs: {
                href: "https://developers.openai.com/api/reference/audio",
                target: "_blank",
                rel: "noreferrer",
              },
            }),
          ] }),
        ] }),
      ] }),
      element("section", { className: "step-modal-callout", children: [
        element("strong", { text: "No transcription prompt configured" }),
        element("p", { text: "This harness currently sends recordings to whisper-1 without a prompt." }),
      ] }),
    ],
    suppressEmptyPromptMessage: true,
  }],
  [inputChannel, {
    title: "Input Token History",
    modalTitle: "Input Token History",
    modalDescription: "Per-prompt token usage for the active conversation. This history is persisted in SQLite.",
    keys: [],
    renderInfo: () => createTokenHistorySections("input"),
    suppressEmptyPromptMessage: true,
  }],
  [inputComposer, { title: "Input Composer", keys: ["prompt_refinement"] }],
  [modelEngine, { title: "Model Engine", keys: ["agent_instructions"] }],
  [toolOrchestrator, { title: "Tool Orchestrator", keys: ["tool_contract"], showToolSettings: true }],
  [mcpServers, { title: "MCP Servers", keys: ["tool_contract"], showMcpSettings: true }],
  [outputValidator, { title: "Output Validation", keys: ["validation_reminder"] }],
  [responseRenderer, { title: "Tape Player", keys: ["workspace_context"] }],
  [outputChannel, {
    title: "Output Token History",
    modalTitle: "Output Token History",
    modalDescription: "Per-prompt token usage for the active conversation. This history is persisted in SQLite.",
    keys: [],
    renderInfo: () => createTokenHistorySections("output"),
    suppressEmptyPromptMessage: true,
  }],
]);

const presetShortcuts = [
  { title: "Whisper", description: "Transcription model and API details", unit: whisperModel },
  { title: "Input Composer", description: "Prompt refinement preset", unit: inputComposer },
  { title: "Model Engine", description: "Agent instructions and model behavior", unit: modelEngine },
  { title: "Tool Orchestrator", description: "Tool routing contract and permissions", unit: toolOrchestrator },
  { title: "MCP Servers", description: "MCP presets and server configuration", unit: mcpServers },
  { title: "Output Validation", description: "Validation reminder and checks", unit: outputValidator },
  { title: "Tape Player", description: "Workspace context preset", unit: responseRenderer },
];

const renderPresetShortcuts = () => {
  presetsList.replaceChildren(...presetShortcuts.map((preset) => {
    const button = element("button", {
      className: "preset-shortcut",
      attrs: {
        type: "button",
        title: preset.title,
        "aria-label": preset.title,
      },
      children: [
        element("strong", { text: preset.title }),
        element("span", { text: preset.description }),
      ],
    });
    button.addEventListener("click", () => openStepPrompt(preset.unit));
    return button;
  }));
};
renderPresetShortcuts();

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
  if (config.showToolSettings) promptModalContent.append(createToolSettings());
  if (config.showMcpSettings) promptModalContent.append(createMcpSettings());
  if (typeof config.renderInfo === "function") {
    const infoSections = config.renderInfo();
    const items = Array.isArray(infoSections) ? infoSections : [infoSections];
    promptModalContent.append(...items.filter(Boolean));
  }
  let renderedPromptCount = 0;
  for (const key of config.keys) {
    const prompt = systemPromptsByKey?.get(key);
    if (!prompt) continue;
    renderedPromptCount += 1;
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
  if (renderedPromptCount === 0 && !config.suppressEmptyPromptMessage) {
    promptModalContent.append(element("p", {
      className: "step-prompt-modal-status",
      text: config.emptyPromptText || "No prompt is configured for this step.",
    }));
  }
};

async function openStepPrompt(unit) {
  const config = stepPromptConfig.get(unit);
  if (!config) return;
  promptModalTitle.textContent = config.modalTitle || `${config.title} Prompts`;
  promptModalStep.textContent = config.modalDescription || "System instructions used by this harness step. Changes apply to subsequent runs.";
  promptModalContent.replaceChildren(element("p", {
    className: "step-prompt-modal-status",
    text: "Loading system prompts…",
  }));
  if (!stepPromptModal.open) stepPromptModal.showModal();

  if (!(config.keys?.length) && !config.showToolSettings && !config.showMcpSettings) {
    renderStepPrompts(config);
    return;
  }

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
let outputGlowTimer = null;

const clearOutputGlowTimer = () => {
  window.clearTimeout(outputGlowTimer);
  outputGlowTimer = null;
};

const setHarnessStage = (stageName) => {
  if (stageName !== "output") clearOutputGlowTimer();
  if (stageName === "capture" || (stageName === "input" && activeHarnessStage !== "transcription")) visitedHarnessStages.clear();
  if (activeHarnessStage && activeHarnessStage !== stageName) {
    visitedHarnessStages.add(activeHarnessStage);
  }
  let activeIndex = harnessStages.findIndex(({ name }) => name === stageName);
  while (activeIndex >= 0 && activeIndex < harnessStages.length &&
    harnessStages[activeIndex].units.every((unit) => unit instanceof GuitarEffect && !unit.enabled)) {
    visitedHarnessStages.add(harnessStages[activeIndex].name);
    activeIndex += 1;
  }
  activeHarnessStage = harnessStages[activeIndex]?.name || stageName;
  const activeUnitIndex = activeIndex >= 0
    ? signalUnits.indexOf(harnessStages[activeIndex].units[0])
    : -1;
  signalConnectors.forEach((wire, index) => {
    wire.classList.toggle("signal-processed", activeUnitIndex >= 0 && index < activeUnitIndex);
  });
  harnessStages.forEach(({ name, units }, index) => {
    units.forEach((unit) => {
      const unitEnabled = !(unit instanceof GuitarEffect) || unit.enabled;
      unit.classList.toggle("process-active", index === activeIndex && unitEnabled);
      unit.classList.toggle("process-complete", visitedHarnessStages.has(name) && unitEnabled);
      unit.classList.remove("process-error");
      if (index === activeIndex) unit.setAttribute("aria-current", "step");
      else unit.removeAttribute("aria-current");
    });
  });
};

const setHarnessError = () => {
  clearOutputGlowTimer();
  signalUnits.forEach((unit) => {
    if (unit.classList.contains("process-active")) unit.classList.add("process-error");
    unit.classList.remove("process-active");
    unit.removeAttribute("aria-current");
  });
  activeHarnessStage = null;
};

const resetHarnessDisplay = () => {
  clearOutputGlowTimer();
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

const renderSignalChain = () => {
  rigChain.replaceChildren();
  signalConnectors.length = 0;
  signalUnits.forEach((unit, index) => {
    rigChain.append(unit);
    if (index < signalUnits.length - 1) {
      const wire = connector(index === 0 ? "jack input-source-jack" : "jack");
      signalConnectors.push(wire);
      rigChain.append(wire);
    }
  });
};
renderSignalChain();

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
  const horizontalOffset = Math.max(0, (availableWidth - (naturalWidth * scale)) / 2);

  rigChain.style.transform = `translateX(${horizontalOffset}px) scale(${scale})`;
};

requestAnimationFrame(fitRigToViewport);
new ResizeObserver(fitRigToViewport).observe(rigContainer);

let activeInputSource = microphone;
const INPUT_SOURCE_STORAGE_KEY = "ai-harness.rigInputSource";
const setPromptFooterMode = (microphoneSelected) => {
  promptFooter.classList.remove("input-microphone", "input-keyboard");
  promptFooter.classList.add(microphoneSelected ? "input-microphone" : "input-keyboard");
  audioRecordingIndicator.hidden = !microphoneSelected;
  promptInput.hidden = microphoneSelected;
};

function toggleInputSource() {
  if (activeInputSource === microphone && microphoneRecorder?.state === "recording") {
    appendLog("INPUT", "Stop the microphone recording before switching input sources");
    return;
  }
  const nextSource = activeInputSource === microphone ? midiKeyboard : microphone;
  if (nextSource === midiKeyboard) signalUnits.splice(0, 2, midiKeyboard);
  else signalUnits.splice(0, 1, microphone, whisperModel);
  activeInputSource = nextSource;
  renderSignalChain();
  if (activeHarnessStage === "input") setHarnessStage("input");
  appendLog("INPUT", nextSource === microphone ? "Microphone selected" : "MIDI keyboard selected");
  setPromptFooterMode(nextSource === microphone);
  localStorage.setItem(INPUT_SOURCE_STORAGE_KEY, nextSource === microphone ? "microphone" : "keyboard");
  requestAnimationFrame(fitRigToViewport);
  nextSource.focus();
}

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
promptInput.hidden = true;

const audioWaveBars = Array.from({ length: 48 }, () => element("i", {
  className: "audio-track-bar",
  attrs: { "aria-hidden": "true" },
}));
const audioTrackStatus = element("strong", { text: "Ready to record" });
const audioTrackTime = element("time", { text: "00:00.0", attrs: { datetime: "PT0S" } });
const audioTrackRecordButton = element("button", {
  className: "audio-track-record-button",
  text: "●",
  attrs: {
    type: "button",
    title: "Start microphone recording",
    "aria-label": "Start microphone recording",
    "aria-pressed": "false",
  },
});
const audioRecordingIndicator = element("div", {
  className: "audio-recording-track is-ready",
  attrs: { role: "group", "aria-label": "Microphone recording controls" },
  children: [
    element("span", { className: "audio-track-record-dot", attrs: { "aria-hidden": "true" } }),
    element("span", { className: "audio-track-meta", children: [audioTrackStatus, audioTrackTime] }),
    element("span", { className: "audio-track-waveform", attrs: { "aria-hidden": "true" }, children: audioWaveBars }),
    audioTrackRecordButton,
  ],
});

const promptFooter = element("footer", {
  className: "prompt-footer",
  children: [audioRecordingIndicator, promptInput],
});
setPromptFooterMode(true);

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
    promptFooter,
  ],
});

const logOutput = element("ol", {
  className: "log-output",
  attrs: { role: "log", "aria-live": "polite", "aria-label": "Harness activity log" },
});

const liveStatus = element("span", { className: "log-live log-connecting", text: "● CONNECTING" });

const liveLogPanel = element("aside", {
  className: "rig-live-log",
  attrs: { "aria-labelledby": "logWindowTitle" },
  children: [
    element("header", { children: [
      element("div", { children: [
        element("h2", { text: "Live Log", attrs: { id: "logWindowTitle" } }),
        liveStatus,
      ] }),
    ] }),
    logOutput,
  ],
});
app.append(liveLogPanel);

const workspaceResizeHandle = element("div", {
  className: "rig-workspace-resize-handle",
  attrs: {
    role: "separator",
    tabindex: "0",
    "aria-label": "Resize prompt workspace",
    "aria-orientation": "horizontal",
    title: "Drag to resize the prompt workspace",
  },
  children: [element("span", { attrs: { "aria-hidden": "true" } })],
});

const workspace = element("section", {
  className: "rig-workspace",
  attrs: { "aria-label": "Prompt workspace" },
  children: [workspaceResizeHandle, promptPanel],
});

rigContainer.insertAdjacentElement("afterend", workspace);

const WORKSPACE_HEIGHT_STORAGE_KEY = "ai-harness.rigWorkspaceHeight";
const setWorkspaceHeight = (requestedHeight, persist = true) => {
  const app = document.querySelector(".app");
  const bottomPadding = parseFloat(getComputedStyle(app).paddingBottom) || 0;
  const maxHeight = Math.max(220, app.clientHeight - bottomPadding - 126);
  const height = Math.round(Math.max(220, Math.min(maxHeight, requestedHeight)));
  app.style.setProperty("--rig-workspace-height", `${height}px`);
  app.classList.add("workspace-resized");
  workspaceResizeHandle.setAttribute("aria-valuenow", String(height));
  workspaceResizeHandle.setAttribute("aria-valuemin", "220");
  workspaceResizeHandle.setAttribute("aria-valuemax", String(Math.round(maxHeight)));
  if (persist) localStorage.setItem(WORKSPACE_HEIGHT_STORAGE_KEY, String(height));
  requestAnimationFrame(fitRigToViewport);
};

workspaceResizeHandle.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const startY = event.clientY;
  const startHeight = workspace.getBoundingClientRect().height;
  workspaceResizeHandle.setPointerCapture(event.pointerId);
  document.body.classList.add("resizing-rig-workspace");
  const resize = (moveEvent) => setWorkspaceHeight(startHeight + startY - moveEvent.clientY, false);
  const finish = (upEvent) => {
    workspaceResizeHandle.removeEventListener("pointermove", resize);
    workspaceResizeHandle.removeEventListener("pointerup", finish);
    workspaceResizeHandle.removeEventListener("pointercancel", finish);
    document.body.classList.remove("resizing-rig-workspace");
    if (workspaceResizeHandle.hasPointerCapture(upEvent.pointerId)) workspaceResizeHandle.releasePointerCapture(upEvent.pointerId);
    setWorkspaceHeight(workspace.getBoundingClientRect().height);
  };
  workspaceResizeHandle.addEventListener("pointermove", resize);
  workspaceResizeHandle.addEventListener("pointerup", finish);
  workspaceResizeHandle.addEventListener("pointercancel", finish);
});

workspaceResizeHandle.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  const delta = event.key === "ArrowUp" ? 20 : -20;
  setWorkspaceHeight(workspace.getBoundingClientRect().height + delta);
});

window.addEventListener("resize", () => {
  if (document.querySelector(".app").classList.contains("workspace-resized")) {
    setWorkspaceHeight(workspace.getBoundingClientRect().height, false);
  }
});

let sessionId = crypto.randomUUID();
let conversation = [];
let sessions = [];
let activeRigSession = null;
let sessionSaveQueue = Promise.resolve();
let socketService;
let runActive = false;
let runPaused = false;
let runPauseRequested = false;
let streamingText = "";
let streamingBody = null;
let reconnectTimer = null;
let promptWorkspace = ".";
let modelSettings = { provider: "openai", model: "gpt-5.1-codex", baseUrl: "", apiKey: "" };
let storedToolPermissions = normalizeToolPermissions();
let inputTokens = 0;
let outputTokens = 0;
let currentPromptTokenEntryId = null;
let pendingVoicePrompt = "";
let promptStartedAt = 0;
let promptTimer = null;
let workspaceBrowserRoot = null;
let workspacePickerRoot = null;
let workspacePickerParent = null;
let pendingWorkspacePath = null;
let editingFilePath = null;

const updateFileEditorPreview = (filePath, content) => {
  const language = renderFilePreview(fileEditorPreviewCode, content, { filePath });
  fileEditorLanguage.textContent = codeLanguageLabel(language || "plaintext");
};

const updateTransportButtonState = () => {
  if (runActive) {
    const continueMode = runPaused || runPauseRequested;
    playButton.title = continueMode ? "Continue current run" : "Run in progress";
    playButton.setAttribute("aria-label", playButton.title);
    playButton.disabled = !continueMode;
    stopButton.title = runPaused ? "Run paused" : runPauseRequested ? "Pausing current run…" : "Pause current run";
    stopButton.setAttribute("aria-label", stopButton.title);
    stopButton.disabled = runPaused || runPauseRequested;
    return;
  }
  playButton.title = "Send prompt";
  playButton.setAttribute("aria-label", playButton.title);
  playButton.disabled = false;
  stopButton.title = "Pause current run";
  stopButton.setAttribute("aria-label", stopButton.title);
  stopButton.disabled = true;
};

const setRunPausedState = ({ paused = false, pauseRequested = false } = {}) => {
  runPaused = paused;
  runPauseRequested = pauseRequested;
  updateTransportButtonState();
};

const normalizeTokenHistoryEntry = (entry = {}, index = 0) => {
  const inputCount = Math.max(0, Number(entry.inputTokens) || 0);
  const outputCount = Math.max(0, Number(entry.outputTokens) || 0);
  return {
    id: String(entry.id || `token-${index}`),
    prompt: String(entry.prompt || ""),
    inputTokens: inputCount,
    outputTokens: outputCount,
    totalTokens: Math.max(0, Number(entry.totalTokens) || (inputCount + outputCount)),
    timestamp: Number(entry.timestamp) || Date.now(),
  };
};

const ensureActiveSessionTokenHistory = () => {
  if (!activeRigSession) return [];
  if (!Array.isArray(activeRigSession.tokenHistory)) activeRigSession.tokenHistory = [];
  return activeRigSession.tokenHistory;
};

const currentSessionTokenHistory = () => (
  Array.isArray(activeRigSession?.tokenHistory)
    ? activeRigSession.tokenHistory.map((entry, index) => normalizeTokenHistoryEntry(entry, index))
    : []
);

const getTokenHistoryTotals = (history = currentSessionTokenHistory()) => history.reduce((totals, entry) => ({
  prompts: totals.prompts + 1,
  inputTokens: totals.inputTokens + entry.inputTokens,
  outputTokens: totals.outputTokens + entry.outputTokens,
  totalTokens: totals.totalTokens + entry.totalTokens,
}), {
  prompts: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
});

const formatTokenCount = (value) => Math.max(0, Number(value) || 0).toLocaleString();

function createTokenHistorySections(focus = "all") {
  const history = currentSessionTokenHistory();
  const totals = getTokenHistoryTotals(history);
  const summary = element("section", {
    className: "token-history-panel",
    children: [
      element("div", { className: "token-history-panel-header", children: [
        element("div", { children: [
          element("h3", { text: "Conversation totals" }),
          element("p", { text: "Aggregated usage for the active conversation." }),
        ] }),
        element("span", {
          className: `token-history-focus-badge token-history-focus-${focus}`,
          text: focus === "input" ? "Viewing input" : focus === "output" ? "Viewing output" : "Viewing totals",
        }),
      ] }),
      element("div", { className: "token-history-summary", children: [
        element("article", { className: "token-history-summary-card", children: [
          element("small", { text: "Prompts" }),
          element("strong", { text: String(totals.prompts) }),
        ] }),
        element("article", { className: "token-history-summary-card", children: [
          element("small", { text: "Input tokens" }),
          element("strong", { text: formatTokenCount(totals.inputTokens) }),
        ] }),
        element("article", { className: "token-history-summary-card", children: [
          element("small", { text: "Output tokens" }),
          element("strong", { text: formatTokenCount(totals.outputTokens) }),
        ] }),
        element("article", { className: "token-history-summary-card", children: [
          element("small", { text: "Conversation total" }),
          element("strong", { text: formatTokenCount(totals.totalTokens) }),
        ] }),
      ] }),
    ],
  });

  if (!history.length) {
    return [
      summary,
      element("section", { className: "step-modal-callout step-modal-callout-empty", children: [
        element("strong", { text: "No token history recorded yet" }),
        element("p", { text: "Send a prompt in the current conversation to start collecting persisted token usage." }),
      ] }),
    ];
  }

  const table = element("table", {
    className: `token-history-table${focus === "input" ? " token-history-focus-input" : focus === "output" ? " token-history-focus-output" : ""}`,
    children: [
      element("thead", { children: [element("tr", { children: [
        element("th", { text: "#" }),
        element("th", { text: "Prompt" }),
        element("th", { text: "Input" }),
        element("th", { text: "Output" }),
        element("th", { text: "Total" }),
      ] })] }),
      element("tbody", { children: history.map((entry, index) => element("tr", {
        children: [
          element("td", { text: String(index + 1) }),
          element("td", { children: [element("code", { text: entry.prompt || "—" })] }),
          element("td", { text: formatTokenCount(entry.inputTokens) }),
          element("td", { text: formatTokenCount(entry.outputTokens) }),
          element("td", { text: formatTokenCount(entry.totalTokens) }),
        ],
      })) }),
    ],
  });

  return [
    summary,
    element("section", { className: "token-history-table-panel", children: [
      element("div", { className: "token-history-table-toolbar", children: [
        element("div", { children: [
          element("h3", { text: "Per-prompt history" }),
          element("p", { text: "Each submitted prompt is stored with its input, output, and total token usage." }),
        ] }),
      ] }),
      element("div", { className: "token-history-table-wrap", children: [table] }),
    ] }),
  ];
}

const startPromptTokenHistoryEntry = (prompt) => {
  const history = ensureActiveSessionTokenHistory();
  const entry = normalizeTokenHistoryEntry({
    id: crypto.randomUUID(),
    prompt,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    timestamp: Date.now(),
  }, history.length);
  history.push(entry);
  currentPromptTokenEntryId = entry.id;
};

const getCurrentPromptTokenEntry = () => (
  ensureActiveSessionTokenHistory().find((entry) => entry.id === currentPromptTokenEntryId) || null
);

const updateCurrentPromptTokenHistory = ({ inputDelta = 0, outputDelta = 0 } = {}) => {
  const entry = getCurrentPromptTokenEntry();
  if (!entry) return;
  entry.inputTokens = Math.max(0, Number(entry.inputTokens) || 0) + Math.max(0, Number(inputDelta) || 0);
  entry.outputTokens = Math.max(0, Number(entry.outputTokens) || 0) + Math.max(0, Number(outputDelta) || 0);
  entry.totalTokens = entry.inputTokens + entry.outputTokens;
  entry.timestamp = Date.now();
};

const finalizeCurrentPromptTokenHistory = () => {
  const entry = getCurrentPromptTokenEntry();
  if (entry) {
    entry.totalTokens = Math.max(0, Number(entry.inputTokens) || 0) + Math.max(0, Number(entry.outputTokens) || 0);
    entry.timestamp = Date.now();
  }
  currentPromptTokenEntryId = null;
};

const discardCurrentPromptTokenHistory = () => {
  if (!activeRigSession || !currentPromptTokenEntryId) return;
  activeRigSession.tokenHistory = ensureActiveSessionTokenHistory()
    .filter((entry) => entry.id !== currentPromptTokenEntryId);
  currentPromptTokenEntryId = null;
};

const persistRigSessions = () => {
  if (!activeRigSession) return;
  activeRigSession.messages = conversation;
  activeRigSession.tokenHistory = currentSessionTokenHistory();
  activeRigSession.workspace = promptWorkspace;
  activeRigSession.updatedAt = Date.now();
  renderConversationList();
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
  responseRenderer.setTokenCount(outputTokens);
  runTokensValue.textContent = (inputTokens + outputTokens).toLocaleString();
};

const addResponseUsage = (response = {}) => {
  const usage = response.usage || {};
  const inputDelta = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0) || 0;
  const outputDelta = Number(usage.output_tokens ?? usage.completion_tokens ?? 0) || 0;
  inputTokens += inputDelta;
  outputTokens += outputDelta;
  updateCurrentPromptTokenHistory({ inputDelta, outputDelta });
  updateTokenMeters();
  persistRigSessions();
};

const appendLog = (type, message, detailOrClassName = undefined, className = "") => {
  const detail = typeof detailOrClassName === "string"
    ? { channel: type, message }
    : detailOrClassName ?? { channel: type, message };
  const itemClassName = typeof detailOrClassName === "string"
    ? detailOrClassName
    : className;
  return appendEvent(logOutput, {
    title: message,
    detail,
    timestamp: Date.now(),
    className: itemClassName,
  });
};

appendLog("SOCKET", "Connecting to harness…", { channel: "SOCKET", state: "connecting" });
appendLog("PROMPT", "Waiting for connection", { channel: "PROMPT", state: "idle" });

const selectWorkspace = async (path) => {
  if (!path) return;
  promptWorkspace = path;
  workspaceInput.value = path;
  filesWorkspaceLabel.textContent = path;
  socketService?.send({ type: "reset", sessionId });
  appendLog("WORKSPACE", path, { channel: "WORKSPACE", path });
  persistRigSessions();
  await refreshWorkspaceTree();
};

async function openWorkspaceFile(node) {
  editingFilePath = node.path;
  fileEditorTitle.textContent = node.name;
  fileEditorPath.textContent = node.path;
  fileEditorContent.value = "";
  updateFileEditorPreview(node.path, "");
  fileEditorContent.disabled = true;
  saveFileEditorButton.disabled = true;
  fileEditorStatus.textContent = "Loading…";
  fileEditorDialog.showModal();
  try {
    const content = await loadWorkspaceFile(promptWorkspace, node.path);
    if (editingFilePath !== node.path || !fileEditorDialog.open) return;
    fileEditorContent.value = content;
    updateFileEditorPreview(node.path, content);
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
    appendLog("FILE", `${editingFilePath} saved`, { channel: "FILE", path: editingFilePath, action: "saved" });
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
fileEditorContent.addEventListener("input", () => {
  updateFileEditorPreview(editingFilePath, fileEditorContent.value);
});

const setExplorerVisible = (visible) => {
  app.classList.toggle("explorer-hidden", !visible);
  explorerToggle.setAttribute("aria-pressed", String(visible));
  explorerToggle.title = visible ? "Hide file explorer" : "Show file explorer";
  explorerToggle.setAttribute("aria-label", explorerToggle.title);
  localStorage.setItem(EXPLORER_VISIBLE_STORAGE_KEY, String(visible));
  requestAnimationFrame(fitRigToViewport);
};

explorerToggle.addEventListener("click", () => {
  setExplorerVisible(app.classList.contains("explorer-hidden"));
});

const setHistoryVisible = (visible) => {
  app.classList.toggle("history-hidden", !visible);
  historyToggle.setAttribute("aria-pressed", String(visible));
  historyToggle.title = visible ? "Hide conversation history" : "Show conversation history";
  historyToggle.setAttribute("aria-label", historyToggle.title);
  localStorage.setItem(HISTORY_VISIBLE_STORAGE_KEY, String(visible));
  requestAnimationFrame(fitRigToViewport);
};

historyToggle.addEventListener("click", () => {
  setHistoryVisible(app.classList.contains("history-hidden"));
});

const setLogVisible = (visible) => {
  app.classList.toggle("log-hidden", !visible);
  logToggle.setAttribute("aria-pressed", String(visible));
  logToggle.title = visible ? "Hide live log" : "Show live log";
  logToggle.setAttribute("aria-label", logToggle.title);
  localStorage.setItem(LOG_VISIBLE_STORAGE_KEY, String(visible));
  requestAnimationFrame(fitRigToViewport);
};

logToggle.addEventListener("click", () => {
  setLogVisible(app.classList.contains("log-hidden"));
});

const setPresetsVisible = (visible) => {
  app.classList.toggle("presets-hidden", !visible);
  presetsToggle.setAttribute("aria-pressed", String(visible));
  presetsToggle.title = visible ? "Hide presets" : "Show presets";
  presetsToggle.setAttribute("aria-label", presetsToggle.title);
  localStorage.setItem(PRESETS_VISIBLE_STORAGE_KEY, String(visible));
  requestAnimationFrame(fitRigToViewport);
};

presetsToggle.addEventListener("click", () => {
  setPresetsVisible(app.classList.contains("presets-hidden"));
});

const setConnectionState = (state, label) => {
  liveStatus.className = `log-live log-${state}`;
  liveStatus.textContent = `● ${label}`;
  promptInput.disabled = state !== "online" || runActive;
  if (state !== "online") setRunPausedState();
};

const setRunActive = (active) => {
  runActive = active;
  if (!active) setRunPausedState();
  promptInput.disabled = active || !socketService?.isOpen;
  if (!active && socketService?.isOpen) promptInput.focus();
  if (!active && pendingVoicePrompt && socketService?.isOpen) {
    promptInput.value = pendingVoicePrompt;
    pendingVoicePrompt = "";
    requestAnimationFrame(() => submitPrompt());
  }
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
  scrollChatToEnd();
  return body;
};

function renderConversationMessages() {
  chatOutput.replaceChildren();
  if (!conversation.length) {
    chatOutput.append(element("p", {
      className: "rig-chat-empty",
      text: "Send a prompt to begin the conversation.",
    }));
    return;
  }
  for (const message of conversation) {
    appendChatMessage(message.role, message.text || "");
  }
}

function renderConversationList() {
  historyList.replaceChildren();
  if (!sessions.length) {
    historyList.append(element("p", { className: "conversation-history-empty", text: "No conversations yet." }));
    historyCount.textContent = "0 conversations";
    return;
  }
  const orderedSessions = [...sessions].sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
  for (const session of orderedSessions) {
    const previewSource = [...(session.messages || [])].reverse().find((message) => message?.text?.trim());
    const preview = previewSource?.text?.replace(/\s+/g, " ").trim() || session.workspace || "No messages yet.";
    const item = element("button", {
      className: `conversation-history-item${session.id === sessionId ? " active" : ""}`,
      attrs: {
        type: "button",
        title: session.title || "New chat",
        "aria-pressed": String(session.id === sessionId),
      },
      children: [
        element("strong", { text: session.title || "New chat" }),
        element("span", { text: preview }),
      ],
    });
    item.addEventListener("click", () => switchRigSession(session.id));
    historyList.append(item);
  }
  historyCount.textContent = `${sessions.length} conversation${sessions.length === 1 ? "" : "s"}`;
}

function switchRigSession(nextSessionId) {
  if (runActive || nextSessionId === sessionId) return;
  const nextSession = sessions.find((session) => session.id === nextSessionId);
  if (!nextSession) return;
  persistRigSessions();
  activeRigSession = nextSession;
  sessionId = nextSession.id;
  applyConversationEffectStates(sessionId);
  conversation = Array.isArray(nextSession.messages) ? nextSession.messages : [];
  activeRigSession.tokenHistory = Array.isArray(nextSession.tokenHistory)
    ? nextSession.tokenHistory.map((entry, index) => normalizeTokenHistoryEntry(entry, index))
    : [];
  currentPromptTokenEntryId = null;
  promptWorkspace = nextSession.workspace || promptWorkspace;
  workspaceInput.value = promptWorkspace;
  filesWorkspaceLabel.textContent = promptWorkspace;
  runPromptsValue.textContent = String(conversation.filter((message) => message.role === "user").length);
  renderConversationMessages();
  renderConversationList();
  resetHarnessDisplay();
  refreshWorkspaceTree();
  socketService?.send({ type: "reset", sessionId });
  persistRigSessions();
}

function createRigConversation() {
  if (runActive) return;
  persistRigSessions();
  const nextSession = createSession("New chat", promptWorkspace);
  nextSession.messages = [];
  nextSession.events = [];
  nextSession.tokenHistory = [];
  nextSession.workspace = promptWorkspace;
  nextSession.updatedAt = Date.now();
  sessions = [nextSession, ...sessions];
  activeRigSession = nextSession;
  sessionId = nextSession.id;
  applyConversationEffectStates(sessionId);
  conversation = nextSession.messages;
  currentPromptTokenEntryId = null;
  runPromptsValue.textContent = "0";
  runTokensValue.textContent = "0";
  inputTokens = 0;
  outputTokens = 0;
  updateTokenMeters();
  resetHarnessDisplay();
  renderConversationMessages();
  renderConversationList();
  socketService?.send({ type: "reset", sessionId });
  persistRigSessions();
  appendLog("RESET", "New conversation created");
  promptInput.focus();
}

newConversationButton.addEventListener("click", createRigConversation);

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
  }
  finalizeCurrentPromptTokenHistory();
  if (finalText) {
    conversation.push({ role: "agent", text: finalText });
  }
  persistRigSessions();
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
    appendLog("READY", `${payload.provider} · ${payload.model}`, payload);
    return;
  }
  if (payload.type === "provider_settings") {
    modelEngine.setModel(payload.model);
    runModelValue.textContent = payload.model || "—";
    appendLog("MODEL", payload.model || "Model updated", payload);
    return;
  }
  if (payload.type === "info") {
    appendLog("INFO", payload.message || "Harness update", payload);
    return;
  }
  if (payload.type === "tool") {
    setHarnessStage(payload.name === "mcp_approval_request" ? "mcp" : "tool");
    appendLog("TOOL", payload.name || "Tool event", payload);
    return;
  }
  if (payload.type === "approval_request") {
    setHarnessStage("mcp");
    appendLog("APPROVAL", payload.description || "Tool approval requested", payload);
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
    appendLog("APPROVAL", payload.approved ? "Approved" : "Denied", payload);
    return;
  }
  if (payload.type === "agent_event") {
    const eventType = payload.event?.type;
    if (["composer_start", "composer_complete", "start"].includes(eventType)) setHarnessStage("input");
    else if (["turn", "response"].includes(eventType)) setHarnessStage("model");
    else if (["tool_start", "tool_result"].includes(eventType)) setHarnessStage("tool");
    else if (["mcp_call", "approval_request", "approval_response"].includes(eventType)) setHarnessStage("mcp");
    else if (eventType === "validation") setHarnessStage("validation");
    else if (eventType === "final") setHarnessStage("response");
    if (eventType === "turn") addResponseUsage(payload.event.serverResponse);
    if (eventType === "composer_complete") addResponseUsage({ usage: payload.event.usage });
    appendLog("HARNESS", describeAgentEvent(payload.event), payload.event);
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
    clearOutputGlowTimer();
    outputGlowTimer = window.setTimeout(() => {
      outputGlowTimer = null;
      outputChannel.classList.remove("process-active");
      outputChannel.classList.add("process-complete");
      outputChannel.removeAttribute("aria-current");
      if (activeHarnessStage === "output") activeHarnessStage = null;
    }, 5000);
    appendLog("DONE", "Run completed", payload);
    return;
  }
  if (payload.type === "run_pause_requested") {
    setRunPausedState({ pauseRequested: true });
    appendLog("STOP", "Pause requested");
    return;
  }
  if (payload.type === "run_paused") {
    setRunPausedState({ paused: true });
    appendLog("STOP", "Run paused");
    return;
  }
  if (payload.type === "run_resumed") {
    setRunPausedState();
    appendLog("PLAY", "Run resumed");
    return;
  }
  if (payload.type === "error") {
    setHarnessError();
    appendLog("ERROR", payload.error || "Harness error", payload, "log-error");
    appendChatMessage("agent", payload.error || "Harness error", "rig-chat-message-error");
    conversation.push({ role: "agent", text: payload.error || "Harness error" });
    finalizeCurrentPromptTokenHistory();
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
      appendLog("SOCKET", "Connected", { channel: "SOCKET", state: "online" });
      socketService.send({ type: "provider_settings", ...modelSettings });
      socketService.send({ type: "tool_permissions", permissions: storedToolPermissions });
      promptInput.focus();
    },
    onClose() {
      stopPromptTimer();
      setRunActive(false);
      setConnectionState("offline", "OFFLINE");
      appendLog("SOCKET", "Disconnected; reconnecting…", { channel: "SOCKET", state: "offline", reconnecting: true });
      reconnectTimer = window.setTimeout(connect, 1500);
    },
    onError() {
      setConnectionState("error", "ERROR");
      appendLog("ERROR", "WebSocket connection failed", { channel: "SOCKET", state: "error" }, "log-error");
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
  startPromptTokenHistoryEntry(prompt);
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
  const bypassedSteps = disabledEffectSteps();
  if (bypassedSteps.length) appendLog("BYPASS", bypassedSteps.join(", "));
  promptInput.value = "";
  setRunActive(true);
  const sent = socketService.send({
    type: "prompt",
    prompt,
    sessionId,
    history,
    images: [],
    workspace: promptWorkspace,
    disabledSteps: bypassedSteps,
  });
  if (!sent) {
    discardCurrentPromptTokenHistory();
    appendLog("ERROR", "Prompt could not be sent", "log-error");
    persistRigSessions();
    stopPromptTimer();
    setRunActive(false);
  }
  return sent;
};

const resumePromptRun = () => {
  if (!runActive || (!runPaused && !runPauseRequested)) return false;
  const sent = socketService?.send({ type: "resume", sessionId });
  if (sent) {
    appendLog("PLAY", "Continue requested");
  }
  return sent;
};

promptInput.disabled = true;
promptInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  submitPrompt();
});

playButton.addEventListener("click", () => {
  if (runActive) {
    resumePromptRun();
    return;
  }
  submitPrompt();
});

stopButton.addEventListener("click", () => {
  if (!runActive || runPaused || runPauseRequested) return;
  const sent = socketService?.send({ type: "pause", sessionId });
  if (sent) {
    setRunPausedState({ pauseRequested: true });
  }
});

rewindButton.addEventListener("click", () => {
  if (runActive) return;
  const nextSession = createSession("New chat", promptWorkspace);
  nextSession.messages = [];
  nextSession.events = [];
  nextSession.tokenHistory = [];
  nextSession.workspace = promptWorkspace;
  nextSession.updatedAt = Date.now();
  sessions = [nextSession];
  activeRigSession = nextSession;
  sessionId = nextSession.id;
  conversation = nextSession.messages;
  currentPromptTokenEntryId = null;
  effectStatesByConversation = {};
  localStorage.setItem(EFFECT_STATES_STORAGE_KEY, JSON.stringify(effectStatesByConversation));
  applyConversationEffectStates(sessionId);
  renderConversationMessages();
  renderConversationList();
  runPromptsValue.textContent = "0";
  runTokensValue.textContent = "0";
  inputTokens = 0;
  outputTokens = 0;
  updateTokenMeters();
  resetHarnessDisplay();
  socketService?.send({ type: "reset", sessionId });
  persistRigSessions();
  appendLog("RESET", "Conversation history cleared");
  promptInput.focus();
});

let microphoneRecorder = null;
let microphoneStream = null;
let microphoneAudioContext = null;
let microphoneMeterFrame = null;
let microphoneChunks = [];
let audioRecordingStartedAt = 0;
let audioRecordingTimer = null;

const formatRecordingTime = (milliseconds) => {
  const tenths = Math.floor(milliseconds / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths % 10}`;
};

const setAudioTrackState = (state, label) => {
  audioRecordingIndicator.className = `audio-recording-track is-${state}`;
  audioTrackStatus.textContent = label;
  audioTrackRecordButton.disabled = state === "processing";
  if (state !== "recording") {
    window.clearInterval(audioRecordingTimer);
    audioRecordingTimer = null;
  }
};

const startAudioTrackTimer = () => {
  audioRecordingStartedAt = performance.now();
  audioTrackTime.textContent = "00:00.0";
  window.clearInterval(audioRecordingTimer);
  audioRecordingTimer = window.setInterval(() => {
    const elapsed = performance.now() - audioRecordingStartedAt;
    audioTrackTime.textContent = formatRecordingTime(elapsed);
    audioTrackTime.setAttribute("datetime", `PT${(elapsed / 1000).toFixed(1)}S`);
  }, 100);
};

const setRecordingButtonState = (recording, label = recording ? "Stop and save recording" : "Record microphone (hold ⌘1)") => {
  recordButton.setAttribute("aria-pressed", String(recording));
  recordButton.title = label;
  recordButton.setAttribute("aria-label", label);
  audioTrackRecordButton.setAttribute("aria-pressed", String(recording));
  audioTrackRecordButton.textContent = recording ? "■" : "●";
  audioTrackRecordButton.title = recording ? "Stop and save recording" : "Start microphone recording";
  audioTrackRecordButton.setAttribute("aria-label", audioTrackRecordButton.title);
};

const stopMicrophoneMeter = () => {
  if (microphoneMeterFrame) cancelAnimationFrame(microphoneMeterFrame);
  microphoneMeterFrame = null;
  microphoneAudioContext?.close();
  microphoneAudioContext = null;
  microphoneStream?.getTracks().forEach((track) => track.stop());
  microphoneStream = null;
  headerSignalMeter.classList.remove("is-active");
  setHeaderSignalLevel(0);
};

const monitorMicrophoneLevel = (stream) => {
  headerSignalMeter.classList.add("is-active");
  setHeaderSignalLevel(0);
  microphoneAudioContext = new AudioContext();
  const analyser = microphoneAudioContext.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = .72;
  microphoneAudioContext.createMediaStreamSource(stream).connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);
  const update = () => {
    analyser.getByteTimeDomainData(samples);
    let energy = 0;
    for (const sample of samples) energy += ((sample - 128) / 128) ** 2;
    const rms = Math.sqrt(energy / samples.length);
    const voiceLevel = rms < .012 ? 0 : Math.ceil((rms - .012) * 45);
    setHeaderSignalLevel(Math.min(12, voiceLevel));
    microphoneMeterFrame = requestAnimationFrame(update);
  };
  update();
};

const finishMicrophoneRecording = async () => {
  const mimeType = microphoneRecorder?.mimeType || "audio/webm";
  const blob = new Blob(microphoneChunks, { type: mimeType });
  microphoneRecorder = null;
  microphoneChunks = [];
  stopMicrophoneMeter();
  setRecordingButtonState(false, "Saving microphone recording…");
  setAudioTrackState("processing", "Saving audio…");
  recordButton.disabled = true;
  try {
    const result = await saveWorkspaceRecording(promptWorkspace, blob);
    appendLog("RECORD", `Saved ${result.relativePath} (${result.size.toLocaleString()} bytes)`);
    await refreshWorkspaceTree();
    setRecordingButtonState(false, "Transcribing microphone recording…");
    setAudioTrackState("processing", "Transcribing with Whisper…");
    appendLog("WHISPER", "Transcribing recording with whisper-1…");
    setHarnessStage("transcription");
    const transcription = await transcribeWorkspaceRecording(promptWorkspace, result.path);
    promptInput.value = transcription.text;
    appendLog("WHISPER", `Transcribed: ${transcription.text}`);
    if (runActive || !socketService?.isOpen) {
      pendingVoicePrompt = transcription.text;
      appendLog("PROMPT", "Voice prompt queued until the harness is ready");
    } else {
      submitPrompt();
    }
  } catch (error) {
    setAudioTrackState("error", "Recording failed");
    appendLog("ERROR", error.message, "log-error");
  } finally {
    recordButton.disabled = false;
    setRecordingButtonState(false);
    if (!audioRecordingIndicator.classList.contains("is-error")) setAudioTrackState("ready", "Ready to record");
  }
};

const startMicrophoneRecording = async () => {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    appendLog("ERROR", "Microphone recording is not supported by this browser.", "log-error");
    return;
  }
  try {
    if (activeInputSource !== microphone) toggleInputSource();
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferredTypes = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"];
    const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
    microphoneChunks = [];
    microphoneRecorder = new MediaRecorder(microphoneStream, mimeType ? { mimeType } : undefined);
    microphoneRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) microphoneChunks.push(event.data);
    });
    microphoneRecorder.addEventListener("stop", finishMicrophoneRecording, { once: true });
    microphoneRecorder.start(1000);
    monitorMicrophoneLevel(microphoneStream);
    setHarnessStage("capture");
    setRecordingButtonState(true);
    setAudioTrackState("recording", "Recording audio");
    startAudioTrackTimer();
    appendLog("RECORD", "Microphone recording started");
  } catch (error) {
    stopMicrophoneMeter();
    setRecordingButtonState(false);
    setAudioTrackState("error", "Microphone unavailable");
    appendLog("ERROR", `Microphone unavailable: ${error.message}`, "log-error");
  }
};

recordButton.addEventListener("click", async () => {
  if (microphoneRecorder?.state === "recording") {
    setAudioTrackState("processing", "Finishing recording…");
    microphoneRecorder.stop();
    return;
  }
  await startMicrophoneRecording();
});

audioTrackRecordButton.addEventListener("click", () => recordButton.click());

let recordHotkeyHeld = false;

const stopHotkeyRecording = () => {
  recordHotkeyHeld = false;
  if (microphoneRecorder?.state !== "recording") return;
  setAudioTrackState("processing", "Finishing recording…");
  microphoneRecorder.stop();
};

window.addEventListener("keydown", async (event) => {
  if (!event.metaKey || event.code !== "Digit1") return;
  event.preventDefault();
  if (event.repeat || recordHotkeyHeld) return;
  recordHotkeyHeld = true;
  if (!microphoneRecorder) await startMicrophoneRecording();
  if (!recordHotkeyHeld) stopHotkeyRecording();
});

window.addEventListener("keyup", (event) => {
  if (!recordHotkeyHeld || (event.code !== "Digit1" && event.key !== "Meta")) return;
  event.preventDefault();
  stopHotkeyRecording();
});

window.addEventListener("blur", () => {
  if (recordHotkeyHeld) stopHotkeyRecording();
});

const initializePromptStream = async () => {
  const storedInputSource = localStorage.getItem(INPUT_SOURCE_STORAGE_KEY);
  if (storedInputSource === "keyboard" && activeInputSource !== midiKeyboard) toggleInputSource();
  requestAnimationFrame(() => setPromptFooterMode(activeInputSource === microphone));
  setExplorerVisible(localStorage.getItem(EXPLORER_VISIBLE_STORAGE_KEY) === "true");
  setHistoryVisible(localStorage.getItem(HISTORY_VISIBLE_STORAGE_KEY) === "true");
  setLogVisible(localStorage.getItem(LOG_VISIBLE_STORAGE_KEY) !== "false");
  setPresetsVisible(localStorage.getItem(PRESETS_VISIBLE_STORAGE_KEY) === "true");
  const storedWorkspaceHeight = Number(localStorage.getItem(WORKSPACE_HEIGHT_STORAGE_KEY));
  if (Number.isFinite(storedWorkspaceHeight) && storedWorkspaceHeight > 0) {
    setWorkspaceHeight(storedWorkspaceHeight, false);
  }
  requestAnimationFrame(() => app.classList.remove("ui-initializing"));
  try {
    const [health, state] = await Promise.all([loadHealth(), loadUiState()]);
    sessions = Array.isArray(state.sessions) && state.sessions.length
      ? state.sessions.map((session) => ({
        ...session,
        messages: Array.isArray(session.messages) ? session.messages : [],
        events: Array.isArray(session.events) ? session.events : [],
        tokenHistory: Array.isArray(session.tokenHistory)
          ? session.tokenHistory.map((entry, index) => normalizeTokenHistoryEntry(entry, index))
          : [],
        workspace: session.workspace || health.workspace || ".",
      }))
      : [createSession("AI Harness Session", health.workspace || ".")];
    activeRigSession = sessions.find((session) => session.id === state.activeSessionId) || sessions[0];
    sessionId = activeRigSession.id;
    applyConversationEffectStates(sessionId);
    conversation = activeRigSession.messages;
    promptWorkspace = activeRigSession.workspace || health.workspace || ".";
    renderConversationMessages();
    renderConversationList();
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
  renderConversationList();
  workspaceInput.value = promptWorkspace;
  await refreshWorkspaceTree();
  connect();
};

initializePromptStream();
updateTransportButtonState();
