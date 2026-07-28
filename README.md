# AI Coding Harness

A small Codex-style terminal coding agent written with Node.js built-ins only.
It uses the OpenAI Responses API and can inspect files, search code, write files,
and run commands inside the current workspace.

## Requirements

- Node.js 20 or newer
- An OpenAI API key

No `npm install` is required.

## Configure

Create `.env`:

```env
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-5.1-codex
```

`OPENAI_BASE_URL` is optional.

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
and final answers. By default, file writes and shell commands are denied from
the web UI because there is no interactive terminal approval prompt. Set
`AI_HARNESS_WEB_APPROVE=true` only when you want the web server to approve those
mutating tool calls automatically.

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
