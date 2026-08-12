import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createUiStateStore } from "../lib/ui-state.js";
import { DEFAULT_SYSTEM_PROMPTS } from "../lib/system-prompts.js";

test("SQLite UI state store persists and updates allowed values", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-harness-ui-state-"));
  const databasePath = path.join(directory, "state.sqlite");
  const store = createUiStateStore(databasePath);
  const session = {
    id: "one",
    title: "First chat",
    workspace: "/workspace",
    messages: [{ role: "user", text: "Hello" }],
    events: [{ title: "Run started", timestamp: 456 }],
    tokenHistory: [{
      id: "prompt-1",
      prompt: "Hello",
      inputTokens: 12,
      outputTokens: 34,
      totalTokens: 46,
      timestamp: 789,
    }],
    updatedAt: 123,
  };

  store.set({
    sessions: [session],
    activeSessionId: "one",
    sidebarCollapsed: true,
    providerSettings: { provider: "custom", model: "model-a", baseUrl: "http://ai", apiKey: "key" },
    toolPermissions: { read_file: true, run_command: false },
  });
  store.setMcpConfig("[mcp]\nauto_approve = true");
  store.set({ sidebarCollapsed: false, ignored: "value" });
  assert.deepEqual(store.getAll(), {
    sessions: [session],
    activeSessionId: "one",
    sidebarCollapsed: false,
    providerSettings: { provider: "custom", model: "model-a", baseUrl: "http://ai", apiKey: "key" },
    providers: [{
      id: "custom", name: "custom", type: "custom", model: "model-a",
      baseUrl: "http://ai", apiKey: "key", selected: true,
    }],
    toolPermissions: {
      list_files: true,
      read_file: true,
      write_file: true,
      search_files: true,
      curl: true,
      run_command: false,
    },
  });
  store.close();

  const reopened = createUiStateStore(databasePath);
  assert.deepEqual(reopened.getAll().sessions, [session]);
  assert.equal(reopened.getMcpConfig(), "[mcp]\nauto_approve = true");
  reopened.close();
  const database = new DatabaseSync(databasePath, { readOnly: true });
  const tables = database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ).all().map(({ name }) => name);
  assert.deepEqual(tables, [
    "events", "layout", "mcp_configuration", "messages", "provider_settings", "providers", "rig_configurations", "sessions", "system_prompts", "token_usage", "tool_permissions",
  ]);
  assert.equal(database.prepare("SELECT count(*) AS count FROM system_prompts").get().count, 5);
  const eventColumns = database.prepare("SELECT name FROM pragma_table_info('events')").all().map(({ name }) => name);
  assert.ok(eventColumns.includes("input_prompt"));
  assert.ok(eventColumns.includes("server_response"));
  database.close();
  fs.rmSync(directory, { recursive: true });
});

test("SQLite UI state store rejects writes without known keys", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-harness-ui-state-"));
  const store = createUiStateStore(path.join(directory, "state.sqlite"));
  assert.throws(() => store.set({ unknown: true }), /No valid UI state keys/);
  store.close();
  fs.rmSync(directory, { recursive: true });
});

test("SQLite UI state store migrates legacy state and discards browser-only widths", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-harness-ui-state-"));
  const databasePath = path.join(directory, "state.sqlite");
  const legacy = new DatabaseSync(databasePath);
  legacy.exec("CREATE TABLE ui_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)");
  const insert = legacy.prepare("INSERT INTO ui_state VALUES (?, ?, 1)");
  insert.run("sidebarCollapsed", "true");
  insert.run("sidebarWidth", "444");
  insert.run("streamWidth", "555");
  legacy.close();

  const store = createUiStateStore(databasePath);
  assert.deepEqual(store.getAll(), {
    sidebarCollapsed: true,
    toolPermissions: {
      list_files: true,
      read_file: true,
      write_file: true,
      search_files: true,
      curl: true,
      run_command: true,
    },
  });
  store.close();
  const migrated = new DatabaseSync(databasePath, { readOnly: true });
  assert.equal(migrated.prepare(
    "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'ui_state'",
  ).get().count, 0);
  migrated.close();
  fs.rmSync(directory, { recursive: true });
});

test("SQLite UI state store migrates JSON session columns into child tables", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-harness-ui-state-"));
  const databasePath = path.join(directory, "state.sqlite");
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, workspace TEXT NOT NULL,
      messages TEXT NOT NULL, events TEXT NOT NULL, updated_at INTEGER NOT NULL,
      sort_order INTEGER NOT NULL
    ) STRICT
  `);
  legacy.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    "old", "Old chat", "/old", JSON.stringify([{ role: "agent", text: "Saved" }]),
    JSON.stringify([{ title: "Tool completed", detail: { ok: true }, timestamp: 99 }]), 88, 0,
  );
  legacy.close();

  const store = createUiStateStore(databasePath);
  assert.deepEqual(store.getAll().sessions, [{
    id: "old", title: "Old chat", workspace: "/old",
    messages: [{ role: "agent", text: "Saved" }],
    events: [{ title: "Tool completed", detail: { ok: true }, timestamp: 99 }],
    tokenHistory: [],
    updatedAt: 88,
  }]);
  store.close();
  const migrated = new DatabaseSync(databasePath, { readOnly: true });
  assert.equal(migrated.prepare("SELECT count(*) AS count FROM messages").get().count, 1);
  assert.equal(migrated.prepare("SELECT count(*) AS count FROM events").get().count, 1);
  assert.equal(migrated.prepare(
    "SELECT count(*) AS count FROM sqlite_master WHERE name = 'sessions_legacy_json'",
  ).get().count, 0);
  migrated.close();
  fs.rmSync(directory, { recursive: true });
});

test("SQLite UI state store migrates the single-provider schema", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-harness-ui-state-"));
  const databasePath = path.join(directory, "state.sqlite");
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE providers (
      provider TEXT PRIMARY KEY, base_url TEXT NOT NULL, api_key TEXT NOT NULL, updated_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE provider_settings (
      id INTEGER PRIMARY KEY, provider TEXT NOT NULL, model TEXT NOT NULL, updated_at INTEGER NOT NULL
    ) STRICT;
    INSERT INTO providers VALUES ('openai', 'https://api.openai.com/v1', 'secret', 1);
    INSERT INTO provider_settings VALUES (1, 'openai', 'gpt-test', 1);
  `);
  legacy.close();

  const store = createUiStateStore(databasePath);
  assert.deepEqual(store.getAll().providers, [{
    id: "openai", name: "openai", type: "openai", model: "gpt-test",
    baseUrl: "https://api.openai.com/v1", apiKey: "secret", selected: true,
  }]);
  store.close();
  fs.rmSync(directory, { recursive: true });
});

test("SQLite UI state store exposes and updates selected providers directly", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-harness-ui-state-"));
  const store = createUiStateStore(path.join(directory, "state.sqlite"));

  store.set({
    providers: [
      {
        id: "openai-prod",
        name: "OpenAI Prod",
        type: "openai",
        model: "gpt-prod",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "openai-key",
        selected: true,
      },
      {
        id: "ollama-local",
        name: "Ollama Local",
        type: "ollama",
        model: "llama3.1",
        baseUrl: "http://localhost:11434",
        apiKey: "",
        selected: false,
      },
    ],
  });

  assert.equal(store.getProviders().length, 2);
  assert.deepEqual(store.getSelectedProvider(), {
    id: "openai-prod",
    name: "OpenAI Prod",
    type: "openai",
    model: "gpt-prod",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "openai-key",
    selected: true,
  });

  const next = store.setSelectedProvider("ollama-local");
  assert.deepEqual(next, {
    id: "ollama-local",
    name: "Ollama Local",
    type: "ollama",
    model: "llama3.1",
    baseUrl: "http://localhost:11434",
    apiKey: "",
    selected: true,
  });
  assert.equal(store.getAll().providerSettings.provider, "ollama");
  assert.throws(() => store.setSelectedProvider("missing"), /Unknown provider: missing/);

  store.close();
  fs.rmSync(directory, { recursive: true });
});

test("SQLite UI state store persists rig configurations and syncs the active snapshot", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-harness-ui-state-"));
  const store = createUiStateStore(path.join(directory, "state.sqlite"));

  const presetA = {
    id: "preset-a",
    name: "Microphone",
    componentState: {
      inputSource: "microphone",
      modelDisplay: "engine",
      effects: { composer: true, tools: true, mcp: true, validation: true },
    },
    systemPrompts: {
      ...DEFAULT_SYSTEM_PROMPTS,
      agent_instructions: "Agent prompt A",
    },
    providerSettings: {
      provider: "openai",
      model: "gpt-5.1-codex",
      baseUrl: "",
      apiKey: "openai-key",
    },
    toolPermissions: {
      list_files: true,
      read_file: true,
      write_file: true,
      search_files: true,
      curl: true,
      run_command: true,
    },
    mcpConfig: "[[mcp.servers]]\nserver_label = \"alpha\"\nserver_url = \"https://alpha.example/mcp\"",
    selected: false,
  };
  const presetB = {
    id: "preset-b",
    name: "Keyboard",
    componentState: {
      inputSource: "keyboard",
      modelDisplay: "synth",
      effects: { composer: false, tools: true, mcp: false, validation: true },
    },
    systemPrompts: {
      ...DEFAULT_SYSTEM_PROMPTS,
      agent_instructions: "Agent prompt B",
      validation_reminder: "Validate preset B",
    },
    providerSettings: {
      provider: "ollama",
      model: "llama3.2",
      baseUrl: "http://localhost:11434",
      apiKey: "",
    },
    toolPermissions: {
      list_files: true,
      read_file: false,
      write_file: true,
      search_files: false,
      curl: true,
      run_command: false,
    },
    mcpConfig: "[mcp_servers.beta]\ncommand = \"node\"\nargs = [\"server.js\"]",
    selected: true,
  };

  const saved = store.setRigConfigurations([presetA, presetB], "preset-b");
  assert.equal(saved.activeConfigurationId, "preset-b");
  assert.equal(saved.configurations.length, 2);
  assert.deepEqual(
    saved.configurations.find((configuration) => configuration.id === "preset-b")?.componentState,
    presetB.componentState,
  );
  assert.equal(store.getMcpConfig(), presetB.mcpConfig);
  assert.equal(store.getSystemPrompts().agent_instructions, "Agent prompt B");
  assert.equal(store.getSystemPrompts().validation_reminder, "Validate preset B");
  assert.deepEqual(store.getAll().providerSettings, presetB.providerSettings);
  assert.deepEqual(store.getAll().toolPermissions, presetB.toolPermissions);
  assert.deepEqual(
    store.getRigConfigurations().configurations.find((configuration) => configuration.id === "preset-b")?.componentState,
    presetB.componentState,
  );
  assert.deepEqual(
    store.getRigConfigurations().configurations.find((configuration) => configuration.id === "preset-b")?.providerSettings,
    presetB.providerSettings,
  );

  store.setSystemPrompt("agent_instructions", "Agent prompt B2");
  assert.equal(
    store.getRigConfigurations().configurations.find((configuration) => configuration.id === "preset-b")?.systemPrompts.agent_instructions,
    "Agent prompt B2",
  );

  store.setMcpConfig("[mcp_servers.gamma]\ncommand = \"uvx\"");
  assert.equal(
    store.getRigConfigurations().configurations.find((configuration) => configuration.id === "preset-b")?.mcpConfig,
    "[mcp_servers.gamma]\ncommand = \"uvx\"",
  );

  store.set({
    toolPermissions: {
      list_files: false,
      read_file: false,
      write_file: true,
      search_files: true,
      curl: false,
      run_command: false,
    },
  });
  assert.deepEqual(
    store.getRigConfigurations().configurations.find((configuration) => configuration.id === "preset-b")?.toolPermissions,
    {
      list_files: false,
      read_file: false,
      write_file: true,
      search_files: true,
      curl: false,
      run_command: false,
    },
  );

  store.set({
    providerSettings: {
      provider: "custom",
      model: "custom-model-v2",
      baseUrl: "http://localhost:8000/v1",
      apiKey: "custom-key",
    },
  });
  assert.deepEqual(
    store.getRigConfigurations().configurations.find((configuration) => configuration.id === "preset-b")?.providerSettings,
    {
      provider: "custom",
      model: "custom-model-v2",
      baseUrl: "http://localhost:8000/v1",
      apiKey: "custom-key",
    },
  );

  store.close();
  const reopened = createUiStateStore(path.join(directory, "state.sqlite"));
  assert.deepEqual(
    reopened.getRigConfigurations().configurations.find((configuration) => configuration.id === "preset-b")?.componentState,
    presetB.componentState,
  );
  assert.deepEqual(
    reopened.getRigConfigurations().configurations.find((configuration) => configuration.id === "preset-b")?.providerSettings,
    {
      provider: "custom",
      model: "custom-model-v2",
      baseUrl: "http://localhost:8000/v1",
      apiKey: "custom-key",
    },
  );
  reopened.close();
  fs.rmSync(directory, { recursive: true });
});
