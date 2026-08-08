AI Coding Harness - Overview

What it is
- A small, dependency-free terminal coding agent built with Node.js core modules only.
- Talks to the OpenAI Responses API and can read/search/write files and run commands strictly inside the current workspace.

Key capabilities
- list_files: browse the workspace
- read_file / write_file: view and modify text files (with confirmation by default)
- search_files: regex search across the repo with sensible limits
- run_command: execute shell commands for inspection, builds, or tests (with confirmation)
- Conversation state: supports multi-turn tool calls until a final answer is produced

Requirements
- Node.js 22.5+ (the web UI uses the built-in `node:sqlite` module)
- OPENAI_API_KEY
- No npm install required

Configuration (.env)
- OPENAI_API_KEY=your_api_key
- OPENAI_MODEL=gpt-5.1-codex (or another compatible model)
- OPENAI_BASE_URL=optional_custom_endpoint

How to run
- Interactive:        node index.js
- One-off task:       node index.js --prompt "Your instruction"
- Auto-approve tools: node index.js --yes

CLI commands (interactive)
- /help, /clear, /model <name>, /status, /exit

Safety and boundaries
- All tool paths are restricted to the directory where the harness is launched.
- File writes and command executions require approval unless --yes is used.
- The agent avoids destructive actions and reports only what it actually ran.

Project structure
- index.js        CLI entry point and REPL
- lib/env.js      Minimal .env loader
- lib/openai.js   Thin OpenAI Responses API client
- lib/agent.js    Turn-based coding agent with tool calling
- lib/tools.js    Workspace-safe tools (fs + shell)
- test/*          Node.js tests for the agent and tools

Testing
- Run: node --test

License
- MIT
