import test from "node:test";
import assert from "node:assert/strict";
import { mcpBlocks, quoteToml, setToolBlockEnabled } from "../public/lib/mcp-config.js";
import { defaultProviderSettings, normalizeToolPermissions } from "../public/lib/settings.js";
import { promptHistoryFromSessions, titleFromPrompt } from "../public/lib/sessions.js";

test("browser settings helpers provide normalized defaults", () => {
  assert.equal(defaultProviderSettings().provider, "openai");
  assert.equal(normalizeToolPermissions({ run_command: false }).run_command, false);
  assert.equal(normalizeToolPermissions({ run_command: false }).read_file, true);
});

test("session helpers derive titles and unique prompt history", () => {
  assert.equal(titleFromPrompt("  a   compact title  "), "a compact title");
  assert.equal(titleFromPrompt("x".repeat(40)), `${"x".repeat(34)}...`);
  assert.deepEqual(promptHistoryFromSessions([
    { messages: [{ role: "user", text: "first" }, { role: "assistant", text: "reply" }] },
    { messages: [{ role: "user", text: "second" }, { role: "user", text: "first" }] },
  ]), ["second", "first"]);
});

test("browser MCP config helpers parse and toggle server blocks", () => {
  const config = `[[mcp.servers]]
server_label = "docs"
server_url = "https://example.com/mcp"`;
  const [block] = mcpBlocks(config);

  assert.equal(block.label, "docs");
  assert.equal(block.enabled, true);
  assert.match(setToolBlockEnabled(config, block, false), /^# \[\[mcp\.servers\]\]/);
  assert.equal(quoteToml('a\\b"c'), 'a\\\\b\\"c');
});
