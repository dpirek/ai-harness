import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorkspaceTree } from "../lib/workspace-tree.js";

test("workspace tree reserves sibling folders before descending", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-harness-tree-"));
  try {
    const heavy = path.join(root, "a-heavy");
    await fs.mkdir(heavy);
    await fs.mkdir(path.join(root, "z-visible"));
    await Promise.all(Array.from({ length: 5 }, (_, index) => (
      fs.writeFile(path.join(heavy, `file-${index}.txt`), "")
    )));

    const tree = await createWorkspaceTree(root, { limit: 3 });
    assert.deepEqual(tree.map((node) => node.name), ["a-heavy", "z-visible"]);
    assert.equal(tree[0].children.length, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
