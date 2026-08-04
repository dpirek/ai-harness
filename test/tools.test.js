import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createTools } from "../lib/tools.js";

test("file tools stay inside the workspace", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-harness-"));
  const tools = createTools({ root, approve: async () => true });
  const write = tools.find((tool) => tool.name === "write_file");
  const read = tools.find((tool) => tool.name === "read_file");

  const writeResult = await write.execute({
    path: "src/example.js",
    content: "line one\nline two\n",
  });
  const result = await read.execute({
    path: "src/example.js",
    start_line: 2,
    end_line: 2,
  });
  assert.equal(writeResult.verified, true);
  assert.equal(result.content, "line two");
  await assert.rejects(() => read.execute({
    path: "../outside",
    start_line: null,
    end_line: null,
  }), /outside the workspace/);
});

test("curl tool only allows HTTP URLs", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-harness-"));
  const tools = createTools({ root, approve: async () => true });
  const curl = tools.find((tool) => tool.name === "curl");

  assert.ok(curl);
  await assert.rejects(() => curl.execute({ url: "file:///etc/passwd" }), /only allows/);
});

test("run_command is approval-gated and runs in the configured workspace", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-command-test-"));
  const deniedTools = createTools({ root, approve: async () => false });
  const denied = await deniedTools.find((tool) => tool.name === "run_command").execute({
    command: "pwd",
    timeout_ms: null,
  });
  assert.deepEqual(denied, { ok: false, error: "User denied command." });

  const allowedTools = createTools({ root, approve: async () => true });
  const result = await allowedTools.find((tool) => tool.name === "run_command").execute({
    command: "pwd && ls",
    timeout_ms: null,
  });
  assert.equal(result.ok, true);
  assert.equal(result.stdout.trim(), await fs.realpath(root));
});
