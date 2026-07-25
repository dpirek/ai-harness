import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadMcpTools } from "../lib/mcp.js";

test("loads MCP servers from env JSON", async () => {
  const tools = await loadMcpTools({
    env: {
      AI_HARNESS_MCP_SERVERS: JSON.stringify({
        servers: [{
          server_label: "docs",
          server_url: "https://example.com/mcp",
          headers: { Authorization: "Bearer ${MCP_TOKEN}" },
          allowed_tools: ["search"],
        }],
      }),
      MCP_TOKEN: "secret",
    },
  });

  assert.deepEqual(tools, [{
    type: "mcp",
    server_label: "docs",
    server_url: "https://example.com/mcp",
    headers: { Authorization: "Bearer secret" },
    allowed_tools: ["search"],
    require_approval: "always",
  }]);
});

test("loads MCP servers from top-level env JSON array", async () => {
  const tools = await loadMcpTools({
    env: {
      AI_HARNESS_MCP_SERVERS: JSON.stringify([{
        server_label: "docs",
        server_url: "https://example.com/mcp",
      }]),
    },
  });

  assert.deepEqual(tools, [{
    type: "mcp",
    server_label: "docs",
    server_url: "https://example.com/mcp",
    require_approval: "always",
  }]);
});

test("loads MCP servers from workspace config", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-harness-mcp-"));
  await fs.mkdir(path.join(root, ".ai-harness"));
  await fs.writeFile(
    path.join(root, ".ai-harness/config.toml"),
    `
[[mcp.servers]]
server_label = "gmail"
connector_id = "connector_gmail"
authorization = "\${GMAIL_TOKEN}"
require_approval = "never"

[mcp.servers.headers]
X-Client = "ai-harness"
`,
  );

  const tools = await loadMcpTools({
    root,
    env: { GMAIL_TOKEN: "oauth-token" },
  });

  assert.deepEqual(tools, [{
    type: "mcp",
    server_label: "gmail",
    connector_id: "connector_gmail",
    authorization: "oauth-token",
    headers: { "X-Client": "ai-harness" },
    require_approval: "never",
  }]);
});

test("loads multiple MCP servers from workspace config", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-harness-mcp-"));
  await fs.mkdir(path.join(root, ".ai-harness"));
  await fs.writeFile(
    path.join(root, ".ai-harness/config.toml"),
    `
[[mcp.servers]]
server_label = "docs"
server_url = "https://example.com/mcp"
allowed_tools = ["search", "fetch"]

[[mcp.servers]]
server_label = "drive"
connector_id = "connector_googledrive"
authorization = "\${DRIVE_TOKEN}"
`,
  );

  const tools = await loadMcpTools({
    root,
    env: { DRIVE_TOKEN: "drive-token" },
  });

  assert.deepEqual(tools, [{
    type: "mcp",
    server_label: "docs",
    server_url: "https://example.com/mcp",
    allowed_tools: ["search", "fetch"],
    require_approval: "always",
  }, {
    type: "mcp",
    server_label: "drive",
    connector_id: "connector_googledrive",
    authorization: "drive-token",
    require_approval: "always",
  }]);
});

test("loads local stdio MCP servers from Codex-style workspace config", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-harness-mcp-"));
  await fs.mkdir(path.join(root, ".ai-harness"));
  const serverPath = path.join(root, "mock-mcp.js");
  await fs.writeFile(
    serverPath,
    `
let buffer = Buffer.alloc(0);
function send(message) {
  const payload = JSON.stringify(message);
  process.stdout.write(\`Content-Length: \${Buffer.byteLength(payload)}\\r\\n\\r\\n\${payload}\`);
}
function handle(message) {
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "mock", version: "1" } } });
  } else if (message.method === "tools/list") {
    send({ jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "lookup", description: "Lookup a value.", inputSchema: { type: "object", properties: { id: { type: "string" } } } }] } });
  } else if (message.method === "tools/call") {
    send({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: \`value:\${message.params.arguments.id}\` }] } });
  }
}
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const headerEnd = buffer.indexOf("\\r\\n\\r\\n");
    if (headerEnd === -1) return;
    const header = buffer.slice(0, headerEnd).toString("utf8");
    const length = Number(header.match(/content-length:\\s*(\\d+)/i)[1]);
    const start = headerEnd + 4;
    const end = start + length;
    if (buffer.length < end) return;
    handle(JSON.parse(buffer.slice(start, end).toString("utf8")));
    buffer = buffer.slice(end);
  }
});
`,
  );
  await fs.writeFile(
    path.join(root, ".ai-harness/config.toml"),
    `
[mcp_servers.mock]
command = "${process.execPath}"
args = ["${serverPath}"]
require_approval = "never"
`,
  );

  const messages = [];
  const tools = await loadMcpTools({
    root,
    env: {},
    onInfo(message) {
      messages.push(message);
    },
  });

  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "mock__lookup");
  assert.equal(tools[0].strict, false);
  assert.deepEqual(await tools[0].execute({ id: "42" }), {
    content: [{ type: "text", text: "value:42" }],
  });
  assert.deepEqual(messages, [
    "Connecting MCP server mock.",
    "Connected MCP server mock.",
    "Loading tools from MCP server mock.",
    "Using MCP server mock.lookup.",
  ]);
});

test("treats empty workspace config as no MCP servers", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-harness-mcp-"));
  await fs.mkdir(path.join(root, ".ai-harness"));
  await fs.writeFile(
    path.join(root, ".ai-harness/config.toml"),
    `
# No MCP servers configured.
`,
  );

  const tools = await loadMcpTools({ root, env: {} });

  assert.deepEqual(tools, []);
});

test("rejects invalid MCP server targets", async () => {
  await assert.rejects(
    () => loadMcpTools({
      env: {
        AI_HARNESS_MCP_SERVERS: JSON.stringify({
          servers: [{
            server_label: "bad",
            server_url: "https://example.com/mcp",
            connector_id: "connector_gmail",
          }],
        }),
      },
    }),
    /exactly one of server_url or connector_id/,
  );
});
