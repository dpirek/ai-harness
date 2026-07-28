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

  await write.execute({ path: "src/example.js", content: "line one\nline two\n" });
  const result = await read.execute({
    path: "src/example.js",
    start_line: 2,
    end_line: 2,
  });
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
