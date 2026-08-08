# AI Coding Harness

A small Codex-style terminal coding agent written with Node.js built-ins only.
It uses the OpenAI Responses API and can inspect files, search code, write files,
and run commands inside the current workspace.

## Requirements

- Node.js 22.5 or newer (the web UI uses the built-in `node:sqlite` module)
- An OpenAI API key when using the OpenAI provider

No `npm install` is required.

## Configure

For the web UI, add one or more providers in Settings and select the active one
with its checkbox. Provider credentials are stored in the local `providers`
SQLite table; per-provider model and selection data live in `provider_settings`. A `.env` file is
not required. The web server reads the OpenAI key from SQLite. Process environment
variables remain supported for CLI configuration and non-secret web defaults such
as `OPENAI_MODEL` and `OPENAI_BASE_URL`.

For Ollama:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1
```

For a custom OpenAI-compatible server:

```env
AI_PROVIDER=custom
CUSTOM_AI_BASE_URL=http://localhost:8000/v1
CUSTOM_AI_MODEL=custom-model
CUSTOM_AI_API_KEY=optional_bearer_token
```

The web Settings panel can also switch between OpenAI, Ollama, and Custom. Provider
changes apply to new in-memory agent sessions; active browser chat history is
sent back as context after refresh.

The web MCP Configuration panel stores MCP server entries in the SQLite
`mcp_configuration` table. Existing `.ai-harness/config.toml` content is imported
automatically once when the table is empty.
Web UI state, conversations, and stream history are stored in `db/ui-state.sqlite`.
The `db/` directory is local runtime data and is excluded from Git.
The System prompts panel edits the SQLite-backed agent instructions, workspace
context, tool contract, and validation reminder. New databases are seeded with
safe defaults; changes apply to newly created in-memory agent sessions.
It can add remote MCP or local stdio MCP servers and turn existing server blocks
on or off by commenting/uncommenting their TOML block. Local stdio MCP tools are
available to OpenAI and Ollama; remote MCP server definitions are passed through
to providers that support hosted MCP tool calls.

The built-in Tools panel also controls each local capability independently. Workspace
listing, reading, writing, searching, HTTP fetches, and commands are enabled by default. Enable
**Run commands** to expose `run_command` for workspace commands such as `ls`, builds,
and tests; disable it to remove that tool from the model entirely. An enabled built-in
tool is authorized for that browser session and does not show a second approval prompt.

## Run

Interactive mode:

```sh
node index.js
```

Web interface:

```sh
npm run web
```

Then open `http://localhost:3000`. Set `PORT` to choose a different port.
The browser uses `/ws` to stream model turns, tool calls, approval decisions,
and final answers. Each browser chat stores its own workspace directory; local
file tools and commands for that chat are rooted there and reject paths outside
it. The web Tools settings authorize enabled built-in file and command operations.
MCP calls retain their separately configured approval behavior; set
`AI_HARNESS_WEB_APPROVE=true` to automatically approve MCP calls that reach the
web approval callback.

Single task:

```sh
node index.js --prompt "Add tests for the parser"
```

Approve every requested file write and command:

```sh
node index.js --yes
```

By default, the harness asks before writing files or executing commands. Reads and
searches are allowed automatically. All tool paths are restricted to the directory
where the harness was launched.

## MCP servers

The harness can expose remote MCP servers to the Responses API. Add
`.ai-harness/config.toml` in the workspace:

```toml
[mcp]
auto_approve = true # optional: default MCP calls to require_approval = "never"

[[mcp.servers]]
server_label = "docs"
server_url = "https://example.com/mcp"
allowed_tools = ["search"]
require_approval = "always" # optional per-server override

[mcp.servers.headers]
Authorization = "Bearer ${MCP_TOKEN}"
```

Each MCP server must set exactly one of `server_url` or `connector_id`. Built-in
connector IDs such as `connector_gmail` are supported when you provide an OAuth
token in `authorization`. `${ENV_VAR}` placeholders are expanded from the
environment. You can also set `AI_HARNESS_MCP_SERVERS` to JSON containing either
`mcp.servers` or `servers`.

Local stdio MCP servers can use Codex-style config:

```toml
[mcp_servers.ou_znamky]
command = "node"
args = ["/path/to/server.js"]
cwd = "/path/to/server"
message_format = "content-length" # or "json-lines"
```

MCP tool calls require approval by default. Set `[mcp] auto_approve = true` to
default MCP servers to `require_approval = "never"`, or set `require_approval`
per server. Auto-approve only MCP servers and tools you trust.

## Test

```sh
node --test
```
