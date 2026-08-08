import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createUiStateStore } from "../lib/ui-state.js";

test("SQLite UI state store persists and updates allowed values", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-harness-ui-state-"));
  const databasePath = path.join(directory, "state.sqlite");
  const store = createUiStateStore(databasePath);

  store.set({ sessions: [{ id: "one" }], sidebarCollapsed: true, sidebarWidth: 388 });
  store.set({ sidebarCollapsed: false, ignored: "value" });
  assert.deepEqual(store.getAll(), {
    sessions: [{ id: "one" }],
    sidebarCollapsed: false,
    sidebarWidth: 388,
  });
  store.close();

  const reopened = createUiStateStore(databasePath);
  assert.deepEqual(reopened.getAll().sessions, [{ id: "one" }]);
  reopened.close();
  fs.rmSync(directory, { recursive: true });
});

test("SQLite UI state store rejects writes without known keys", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-harness-ui-state-"));
  const store = createUiStateStore(path.join(directory, "state.sqlite"));
  assert.throws(() => store.set({ unknown: true }), /No valid UI state keys/);
  store.close();
  fs.rmSync(directory, { recursive: true });
});
