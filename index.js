#!/usr/bin/env node

import path from "node:path";
import readline from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./lib/env.js";
import { OpenAIClient } from "./lib/openai.js";
import { CodingAgent } from "./lib/agent.js";
import { createTools } from "./lib/tools.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(__dirname, ".env"));

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
  /help          Show this help
  /clear         Start a new model conversation
  /model NAME    Change the model
  /status        Show current configuration
  /exit          Quit

Flags:
  --yes, -y      Approve all tool calls
  --model NAME   Select a model
  --prompt TEXT  Run once without interactive mode
  --help, -h     Show help
`);
}

function parseArgs(argv) {
  const result = { approveAll: false, model: null, prompt: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--yes" || arg === "-y") result.approveAll = true;
    else if (arg === "--help" || arg === "-h") result.help = true;
    else if (arg === "--model") result.model = argv[++i];
    else if (arg === "--prompt" || arg === "-p") result.prompt = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required. Set it in the environment or .env.");
  }

  const root = process.cwd();
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const approve = async (description) => {
    if (args.approveAll) return true;
    if (!stdin.isTTY) return false;
    const answer = await rl.question(
      `${colors.cyan}?${colors.reset} Approve ${description}? [y/N] `,
    );
    return /^(y|yes)$/i.test(answer.trim());
  };

  const client = new OpenAIClient({
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL,
  });
  const tools = createTools({ root, approve });
  const agent = new CodingAgent({
    client,
    tools,
    model: args.model || process.env.OPENAI_MODEL || "gpt-5.1-codex",
    root,
    onTool: ({ name, args: toolArgs }) => {
      const detail = toolArgs.path || toolArgs.command || "";
      stdout.write(
        `${colors.dim}tool: ${name}${detail ? ` (${detail})` : ""}${colors.reset}\n`,
      );
    },
  });

  const runPrompt = async (prompt) => {
    stdout.write(`${colors.dim}thinking...${colors.reset}\n`);
    const answer = await agent.run(prompt);
    stdout.write(`\n${answer}\n\n`);
  };

  if (args.prompt) {
    await runPrompt(args.prompt);
    rl.close();
    return;
  }

  stdout.write(
    `${colors.bold}AI Coding Harness${colors.reset} ${colors.dim}` +
      `(${agent.model}, ${root})${colors.reset}\nType /help for commands.\n\n`,
  );

  while (true) {
    const input = (await rl.question(`${colors.cyan}>${colors.reset} `)).trim();
    if (!input) continue;
    if (input === "/exit" || input === "/quit") break;
    if (input === "/help") {
      printHelp();
      continue;
    }
    if (input === "/clear") {
      agent.reset();
      stdout.write("Conversation cleared.\n");
      continue;
    }
    if (input === "/status") {
      stdout.write(`model: ${agent.model}\nroot: ${root}\napprove all: ${args.approveAll}\n`);
      continue;
    }
    if (input.startsWith("/model ")) {
      agent.model = input.slice(7).trim();
      agent.reset();
      stdout.write(`Model changed to ${agent.model}; conversation cleared.\n`);
      continue;
    }
    if (input.startsWith("/")) {
      stdout.write("Unknown command. Type /help.\n");
      continue;
    }

    try {
      await runPrompt(input);
    } catch (error) {
      stderr.write(`${colors.red}Error: ${error.message}${colors.reset}\n`);
    }
  }

  rl.close();
}

main().catch((error) => {
  stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
});
