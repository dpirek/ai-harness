#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./lib/env.js";
import { createModelClient } from "./lib/openai.js";
import { CodingAgent } from "./lib/agent.js";
import { createTools } from "./lib/tools.js";
import { loadMcpTools } from "./lib/mcp.js";
import { createUiStateStore } from "./lib/ui-state.js";
import {
  defaultBaseUrlForProvider,
  defaultModelForProvider,
  normalizeProvider,
  providerSettingsFromRecord,
  resolveProviderApiKey,
  resolveProviderSelection,
} from "./lib/provider-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(__dirname, ".env"));

// Keep terminal color support local to the CLI so the agent and tools stay
// reusable in tests or other frontends.
const colors = stdout.isTTY && !process.env.NO_COLOR
  ? {
      reset: "\x1b[0m",
      bold: "\x1b[1m",
      cyan: "\x1b[36m",
      dim: "\x1b[2m",
      red: "\x1b[31m",
    }
  : { reset: "", bold: "", cyan: "", dim: "", red: "" };

function printHelp() {
  stdout.write(`
Commands:
  /help              Show this help
  /clear             Start a new model conversation
  /model NAME        Change the model
  /providers         List saved providers from the web UI database
  /provider TARGET   Switch provider by saved id, saved name, or type
  /status            Show current configuration
  /exit              Quit

Flags:
  --yes, -y          Approve all tool calls
  --provider TARGET  Select a provider by saved id, saved name, or type
  --model NAME       Select a model
  --prompt TEXT      Run once without interactive mode
  --help, -h         Show help
`);
}

// The parser intentionally handles only a tiny set of flags. That keeps
// startup predictable and avoids pulling in a command-line dependency.
function parseArgs(argv) {
  const result = {
    approveAll: false,
    help: false,
    model: null,
    prompt: null,
    provider: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const readValue = (flag) => {
      const value = argv[++i];
      if (!value) throw new Error(`${flag} requires a value.`);
      return value;
    };
    if (arg === "--yes" || arg === "-y") result.approveAll = true;
    else if (arg === "--help" || arg === "-h") result.help = true;
    else if (arg === "--model") result.model = readValue("--model");
    else if (arg === "--provider") result.provider = readValue("--provider");
    else if (arg === "--prompt" || arg === "-p") result.prompt = readValue(arg);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

function suppressStartupInput(input) {
  if (!input.isTTY || typeof input.setRawMode !== "function") return () => {};

  const wasRaw = input.isRaw === true;
  const discard = (chunk) => {
    if (chunk.includes(3)) {
      restore();
      process.kill(process.pid, "SIGINT");
    }
  };
  const restore = () => {
    input.off("data", discard);
    if (!wasRaw) input.setRawMode(false);
    input.pause();
  };

  input.setRawMode(true);
  input.resume();
  input.on("data", discard);
  return restore;
}

function openUiStateStore(root) {
  const paths = [
    path.join(root, "db", "ui-state.sqlite"),
    path.join(root, ".ai-harness", "ui-state.sqlite"),
  ];
  const existingPath = paths.find((candidate) => fs.existsSync(candidate));
  if (!existingPath) return null;
  return { store: createUiStateStore(existingPath) };
}

function providerRuntimeState(base = {}, source = "environment") {
  const provider = normalizeProvider(base.provider || process.env.AI_PROVIDER);
  const model = typeof base.model === "string" && base.model.trim()
    ? base.model.trim()
    : defaultModelForProvider(provider);
  return {
    id: base.id ? String(base.id) : null,
    name: base.name ? String(base.name) : "",
    provider,
    model,
    baseUrl: typeof base.baseUrl === "string" && base.baseUrl.trim()
      ? base.baseUrl.trim()
      : defaultBaseUrlForProvider(provider),
    apiKey: resolveProviderApiKey(provider, base.apiKey),
    source,
  };
}

function describeProvider(state) {
  const label = state.name || state.id || state.provider;
  return `${label} (${state.provider})`;
}

function resolveConfiguredProvider({
  selector,
  savedProviders = [],
  savedSelectedProvider = null,
  modelOverride = null,
}) {
  let state;
  if (selector) {
    const selected = resolveProviderSelection(selector, savedProviders);
    state = selected.kind === "saved"
      ? providerRuntimeState({
          ...providerSettingsFromRecord(selected.provider),
          id: selected.provider.id,
          name: selected.provider.name,
        }, "provider flag")
      : providerRuntimeState({ provider: selected.providerType }, "provider flag");
  } else if (process.env.AI_PROVIDER) {
    state = providerRuntimeState({ provider: process.env.AI_PROVIDER }, "environment");
  } else if (savedSelectedProvider) {
    state = providerRuntimeState({
      ...providerSettingsFromRecord(savedSelectedProvider),
      id: savedSelectedProvider.id,
      name: savedSelectedProvider.name,
    }, "saved selection");
  } else {
    state = providerRuntimeState({ provider: "openai" }, "default");
  }

  if (modelOverride && modelOverride.trim()) state.model = modelOverride.trim();
  return state;
}

function validateProviderState(state) {
  if (state.provider === "openai" && !state.apiKey) {
    throw new Error("OpenAI requires an API key. Set it in the web Providers UI, the environment, or .env.");
  }
}

function printProviders(providers, activeProviderId) {
  if (providers.length === 0) {
    stdout.write("No saved providers found. Add one in the web UI or use /provider openai|ollama|custom.\n");
    return;
  }
  const lines = providers.map((provider) => {
    const marker = provider.id === activeProviderId ? ">" : provider.selected ? "*" : " ";
    const model = provider.model || defaultModelForProvider(normalizeProvider(provider.type));
    return `${marker} ${provider.id}  ${provider.name}  ${provider.type}  ${model}`;
  });
  stdout.write(`${lines.join("\n")}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const root = process.cwd();
  const uiState = openUiStateStore(root);
  let rl = null;

  try {
    const savedProviders = uiState?.store.getProviders() || [];
    const savedSelectedProvider = uiState?.store.getSelectedProvider() || null;
    let currentProvider = resolveConfiguredProvider({
      selector: args.provider,
      savedProviders,
      savedSelectedProvider,
      modelOverride: args.model,
    });
    validateProviderState(currentProvider);

    // Tool calls that mutate state are routed through this callback. In
    // interactive mode it asks the user; in one-shot non-TTY mode it denies
    // unless --yes was provided.
    const approve = async (description) => {
      if (args.approveAll) return true;
      if (!stdin.isTTY || !rl) return false;
      const answer = await rl.question(
        `${colors.cyan}?${colors.reset} Approve ${description}? [y/N] `,
      );
      return /^(y|yes)$/i.test(answer.trim());
    };

    const printInfo = (message) => {
      stdout.write(`${colors.dim}info: ${message}${colors.reset}\n`);
    };

    // The agent owns the model conversation. The tools own local workspace
    // effects, so the CLI can stay focused on input/output and approval prompts.
    const localTools = createTools({ root, approve });
    const restoreStartupInput = args.prompt ? () => {} : suppressStartupInput(stdin);
    let mcpTools;
    try {
      mcpTools = await loadMcpTools({ root, approve, onInfo: printInfo });
    } finally {
      restoreStartupInput();
    }
    rl = readline.createInterface({ input: stdin, output: stdout });
    const tools = [...localTools, ...mcpTools];
    const agent = new CodingAgent({
      client: createModelClient(currentProvider),
      tools,
      model: currentProvider.model,
      root,
      approve,
      onInfo: printInfo,
      onTool: ({ name, args: toolArgs }) => {
        const detail = toolArgs.path ||
          toolArgs.command ||
          (toolArgs.server_label && toolArgs.tool
            ? `${toolArgs.server_label}.${toolArgs.tool}`
            : "");
        stdout.write(
          `${colors.dim}tool: ${name}${detail ? ` (${detail})` : ""}${colors.reset}\n`,
        );
      },
    });

    const applyProvider = (nextProvider) => {
      validateProviderState(nextProvider);
      currentProvider = nextProvider;
      agent.client = createModelClient(currentProvider);
      agent.model = currentProvider.model;
      agent.reset();
    };

    const runPrompt = async (prompt) => {
      // One prompt may require multiple model/tool turns; agent.run hides that
      // loop behind a simple terminal interaction.
      stdout.write(`${colors.dim}thinking...${colors.reset}\n`);
      const answer = await agent.run(prompt);
      stdout.write(`\n${answer}\n\n`);
    };

    // If --prompt is provided, run exactly one task and exit. Otherwise drop
    // into a small REPL with slash commands handled locally.
    if (args.prompt) {
      await runPrompt(args.prompt);
      rl.close();
      return;
    }

    stdout.write(
      `${colors.bold}AI Coding Harness${colors.reset} ${colors.dim}` +
        `(${describeProvider(currentProvider)}, ${agent.model}, ${root})${colors.reset}\n` +
        "Type /help for commands.\n\n",
    );

    while (true) {
      const input = (await rl.question(`${colors.cyan}>${colors.reset} `)).trim();
      if (!input) continue;
      if (input === "/exit" || input === "/quit") break;
      try {
        if (input === "/help") {
          printHelp();
          continue;
        }
        if (input === "/clear") {
          agent.reset();
          stdout.write("Conversation cleared.\n");
          continue;
        }
        if (input === "/providers") {
          printProviders(uiState?.store.getProviders() || [], currentProvider.id);
          continue;
        }
        if (input === "/provider") {
          stdout.write(`Current provider: ${describeProvider(currentProvider)}\n`);
          continue;
        }
        if (input === "/status") {
          stdout.write(
            `provider: ${describeProvider(currentProvider)}\n` +
            `provider source: ${currentProvider.source}\n` +
            `model: ${agent.model}\n` +
            `root: ${root}\n` +
            `approve all: ${args.approveAll}\n` +
            `saved providers: ${(uiState?.store.getProviders() || []).length}\n` +
            `mcp tools: ${mcpTools.length}\n`,
          );
          continue;
        }
        if (input.startsWith("/model ")) {
          const nextModel = input.slice(7).trim();
          if (!nextModel) throw new Error("Provide a model name.");
          currentProvider = { ...currentProvider, model: nextModel };
          applyProvider(currentProvider);
          stdout.write(`Model changed to ${agent.model}; conversation cleared.\n`);
          continue;
        }
        if (input.startsWith("/provider ")) {
          const target = input.slice(10).trim();
          const selection = resolveProviderSelection(target, uiState?.store.getProviders() || []);
          const nextProvider = selection.kind === "saved"
            ? providerRuntimeState({
                ...providerSettingsFromRecord(selection.provider),
                id: selection.provider.id,
                name: selection.provider.name,
              }, "saved selection")
            : providerRuntimeState({ provider: selection.providerType }, "session override");
          applyProvider(nextProvider);
          if (selection.kind === "saved" && uiState) {
            uiState.store.setSelectedProvider(selection.provider.id);
          }
          stdout.write(`Provider changed to ${describeProvider(currentProvider)}; conversation cleared.\n`);
          continue;
        }
        if (input.startsWith("/")) {
          stdout.write("Unknown command. Type /help.\n");
          continue;
        }

        await runPrompt(input);
      } catch (error) {
        stderr.write(`${colors.red}Error: ${error.message}${colors.reset}\n`);
      }
    }

    rl.close();
  } finally {
    uiState?.store.close();
  }
}

main().catch((error) => {
  stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
});
