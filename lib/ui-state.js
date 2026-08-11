import { DatabaseSync } from "node:sqlite";
import { DEFAULT_SYSTEM_PROMPTS, SYSTEM_PROMPT_TITLES } from "./system-prompts.js";

const ALLOWED_KEYS = new Set([
  "sessions",
  "activeSessionId",
  "sidebarCollapsed",
  "providerSettings",
  "providers",
  "toolPermissions",
]);

export function createUiStateStore(databasePath) {
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  const sessionColumns = database.prepare(
    "SELECT name FROM pragma_table_info('sessions')",
  ).all().map(({ name }) => name);
  if (sessionColumns.includes("messages") || sessionColumns.includes("events")) {
    database.exec("ALTER TABLE sessions RENAME TO sessions_legacy_json");
  }
  const providerColumns = database.prepare(
    "SELECT name FROM pragma_table_info('providers')",
  ).all().map(({ name }) => name);
  if (providerColumns.includes("provider") && !providerColumns.includes("id")) {
    database.exec(`
      ALTER TABLE providers RENAME TO providers_legacy_single;
      ALTER TABLE provider_settings RENAME TO provider_settings_legacy_single;
    `);
  }

  database.exec(`

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      workspace TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      sort_order INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS messages (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      message_order INTEGER NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      images TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY (session_id, message_order)
    ) STRICT, WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS events (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      event_order INTEGER NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      input_prompt TEXT,
      server_response TEXT,
      timestamp INTEGER NOT NULL,
      PRIMARY KEY (session_id, event_order)
    ) STRICT, WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS token_usage (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      prompt_order INTEGER NOT NULL,
      prompt_id TEXT NOT NULL,
      prompt_text TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      total_tokens INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      PRIMARY KEY (session_id, prompt_order)
    ) STRICT, WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS layout (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      active_session_id TEXT,
      sidebar_collapsed INTEGER NOT NULL DEFAULT 0 CHECK (sidebar_collapsed IN (0, 1))
    ) STRICT;

    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('openai', 'ollama', 'custom')),
      base_url TEXT NOT NULL DEFAULT '',
      api_key TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS provider_settings (
      provider_id TEXT PRIMARY KEY REFERENCES providers(id) ON DELETE CASCADE,
      model TEXT NOT NULL DEFAULT '',
      selected INTEGER NOT NULL DEFAULT 0 CHECK (selected IN (0, 1)),
      updated_at INTEGER NOT NULL
    ) STRICT;

    CREATE UNIQUE INDEX IF NOT EXISTS one_selected_provider
      ON provider_settings(selected) WHERE selected = 1;

    CREATE TABLE IF NOT EXISTS tool_permissions (
      name TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1))
    ) STRICT;

    CREATE TABLE IF NOT EXISTS mcp_configuration (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      content TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS system_prompts (
      key TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT;

    INSERT OR IGNORE INTO layout (id, sidebar_collapsed) VALUES (1, 0);
  `);
  const seedPrompt = database.prepare(
    "INSERT OR IGNORE INTO system_prompts (key, title, content, updated_at) VALUES (?, ?, ?, ?)",
  );
  for (const [key, content] of Object.entries(DEFAULT_SYSTEM_PROMPTS)) {
    seedPrompt.run(key, SYSTEM_PROMPT_TITLES[key], content, Date.now());
  }

  const eventColumns = database.prepare(
    "SELECT name FROM pragma_table_info('events')",
  ).all().map(({ name }) => name);
  if (!eventColumns.includes("input_prompt")) database.exec("ALTER TABLE events ADD COLUMN input_prompt TEXT");
  if (!eventColumns.includes("server_response")) database.exec("ALTER TABLE events ADD COLUMN server_response TEXT");

  const replaceSession = database.prepare(`
    INSERT INTO sessions (id, title, workspace, updated_at, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertMessage = database.prepare(`
    INSERT INTO messages (session_id, message_order, role, text, images) VALUES (?, ?, ?, ?, ?)
  `);
  const insertEvent = database.prepare(`
    INSERT INTO events
      (session_id, event_order, title, detail, input_prompt, server_response, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTokenUsage = database.prepare(`
    INSERT INTO token_usage
      (session_id, prompt_order, prompt_id, prompt_text, input_tokens, output_tokens, total_tokens, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateActiveSession = database.prepare(
    "UPDATE layout SET active_session_id = ? WHERE id = 1",
  );
  const updateSidebar = database.prepare(
    "UPDATE layout SET sidebar_collapsed = ? WHERE id = 1",
  );
  const upsertProvider = database.prepare(`
    INSERT INTO providers (id, name, type, base_url, api_key, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type,
      base_url = excluded.base_url, api_key = excluded.api_key, updated_at = excluded.updated_at
  `);
  const updateProviderSettings = database.prepare(`
    INSERT INTO provider_settings (provider_id, model, selected, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(provider_id) DO UPDATE SET model = excluded.model,
      selected = excluded.selected, updated_at = excluded.updated_at
  `);
  const upsertPermission = database.prepare(`
    INSERT INTO tool_permissions (name, enabled) VALUES (?, ?)
    ON CONFLICT(name) DO UPDATE SET enabled = excluded.enabled
  `);

  function writeValues(values) {
    const entries = Object.entries(values || {}).filter(([key]) => ALLOWED_KEYS.has(key));
    if (entries.length === 0) throw new Error("No valid UI state keys were provided.");
    const now = Date.now();
    if (Object.hasOwn(values, "sessions")) {
      database.exec("DELETE FROM sessions");
      for (const [index, session] of (Array.isArray(values.sessions) ? values.sessions : []).entries()) {
        replaceSession.run(
          String(session.id),
          String(session.title || "New chat"),
          String(session.workspace || "."),
          Number(session.updatedAt) || now,
          index,
        );
        for (const [messageOrder, message] of (Array.isArray(session.messages) ? session.messages : []).entries()) {
          insertMessage.run(
            String(session.id), messageOrder, String(message.role || "user"), String(message.text || ""),
            JSON.stringify(Array.isArray(message.images) ? message.images : []),
          );
        }
        for (const [eventOrder, event] of (Array.isArray(session.events) ? session.events : []).entries()) {
          const eventDetail = event.detail && typeof event.detail === "object"
            ? { ...event.detail }
            : event.detail;
          const inputPrompt = eventDetail?.inputPrompt;
          const serverResponse = eventDetail?.serverResponse;
          if (eventDetail && typeof eventDetail === "object") {
            delete eventDetail.inputPrompt;
            delete eventDetail.serverResponse;
          }
          insertEvent.run(
            String(session.id), eventOrder, String(event.title || "Event"),
            eventDetail === undefined ? null : JSON.stringify(eventDetail),
            inputPrompt === undefined ? null : JSON.stringify(inputPrompt),
            serverResponse === undefined ? null : JSON.stringify(serverResponse),
            Number(event.timestamp) || now,
          );
        }
        for (const [promptOrder, entry] of (Array.isArray(session.tokenHistory) ? session.tokenHistory : []).entries()) {
          const inputTokens = Math.max(0, Number(entry.inputTokens) || 0);
          const outputTokens = Math.max(0, Number(entry.outputTokens) || 0);
          insertTokenUsage.run(
            String(session.id),
            promptOrder,
            String(entry.id || `${session.id}-${promptOrder}`),
            String(entry.prompt || ""),
            inputTokens,
            outputTokens,
            Math.max(0, Number(entry.totalTokens) || (inputTokens + outputTokens)),
            Number(entry.timestamp) || now,
          );
        }
      }
    }
    if (Object.hasOwn(values, "activeSessionId")) {
      updateActiveSession.run(values.activeSessionId == null ? null : String(values.activeSessionId));
    }
    if (Object.hasOwn(values, "sidebarCollapsed")) {
      updateSidebar.run(values.sidebarCollapsed === true ? 1 : 0);
    }
    if (Array.isArray(values.providers)) {
      database.exec("DELETE FROM provider_settings; DELETE FROM providers");
      for (const item of values.providers) {
        const id = String(item.id);
        upsertProvider.run(id, String(item.name || item.type || "Provider"), String(item.type || "openai"),
          String(item.baseUrl || ""), String(item.apiKey || ""), now);
        updateProviderSettings.run(id, String(item.model || ""), item.selected === true ? 1 : 0, now);
      }
    } else if (values.providerSettings && typeof values.providerSettings === "object") {
      const settings = values.providerSettings;
      const provider = String(settings.provider || "openai");
      database.exec("UPDATE provider_settings SET selected = 0");
      upsertProvider.run(provider, provider, provider, String(settings.baseUrl || ""), String(settings.apiKey || ""), now);
      updateProviderSettings.run(provider, String(settings.model || ""), 1, now);
    }
    if (values.toolPermissions && typeof values.toolPermissions === "object") {
      for (const [name, enabled] of Object.entries(values.toolPermissions)) {
        upsertPermission.run(name, enabled === true ? 1 : 0);
      }
    }
  }

  const legacyProvidersTable = database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'providers_legacy_single'",
  ).get();
  if (legacyProvidersTable) {
    const legacyProviders = database.prepare(`
      SELECT p.provider AS id, p.provider AS name, p.provider AS type, p.base_url, p.api_key,
        ps.model, CASE WHEN ps.id = 1 THEN 1 ELSE 0 END AS selected
      FROM providers_legacy_single p
      LEFT JOIN provider_settings_legacy_single ps ON ps.provider = p.provider
    `).all().map((row) => ({ ...row, baseUrl: row.base_url, apiKey: row.api_key, selected: row.selected === 1 }));
    database.exec("BEGIN IMMEDIATE");
    try {
      writeValues({ providers: legacyProviders });
      database.exec("DROP TABLE provider_settings_legacy_single; DROP TABLE providers_legacy_single");
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  const legacySessionsTable = database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sessions_legacy_json'",
  ).get();
  if (legacySessionsTable) {
    const sessions = database.prepare(`
      SELECT id, title, workspace, messages, events, updated_at, sort_order
      FROM sessions_legacy_json ORDER BY sort_order
    `).all().map((row) => ({
      id: row.id,
      title: row.title,
      workspace: row.workspace,
      messages: JSON.parse(row.messages),
      events: JSON.parse(row.events),
      updatedAt: row.updated_at,
    }));
    database.exec("BEGIN IMMEDIATE");
    try {
      writeValues({ sessions });
      database.exec("DROP TABLE sessions_legacy_json");
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  const legacyTable = database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ui_state'",
  ).get();
  if (legacyTable) {
    const legacyState = Object.fromEntries(
      database.prepare("SELECT key, value FROM ui_state").all().flatMap(({ key, value }) => {
        try { return [[key, JSON.parse(value)]]; } catch { return []; }
      }),
    );
    const migratable = Object.fromEntries(
      Object.entries(legacyState).filter(([key]) => ALLOWED_KEYS.has(key)),
    );
    database.exec("BEGIN IMMEDIATE");
    try {
      if (Object.keys(migratable).length > 0) writeValues(migratable);
      database.exec("DROP TABLE ui_state");
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  return {
    getAll() {
      const readMessages = database.prepare(`
        SELECT role, text, images FROM messages WHERE session_id = ? ORDER BY message_order
      `);
      const readEvents = database.prepare(`
        SELECT title, detail, input_prompt, server_response, timestamp
        FROM events WHERE session_id = ? ORDER BY event_order
      `);
      const readTokenUsage = database.prepare(`
        SELECT prompt_id, prompt_text, input_tokens, output_tokens, total_tokens, timestamp
        FROM token_usage WHERE session_id = ? ORDER BY prompt_order
      `);
      const sessions = database.prepare(`
        SELECT id, title, workspace, updated_at FROM sessions ORDER BY sort_order
      `).all().map((row) => ({
        id: row.id,
        title: row.title,
        workspace: row.workspace,
        messages: readMessages.all(row.id).map((message) => {
          const images = JSON.parse(message.images);
          return { role: message.role, text: message.text, ...(images.length > 0 ? { images } : {}) };
        }),
        events: readEvents.all(row.id).map((event) => {
          const detail = event.detail === null ? undefined : JSON.parse(event.detail);
          if (event.input_prompt !== null || event.server_response !== null) {
            const restored = detail && typeof detail === "object" ? detail : {};
            if (event.input_prompt !== null) restored.inputPrompt = JSON.parse(event.input_prompt);
            if (event.server_response !== null) restored.serverResponse = JSON.parse(event.server_response);
            return { title: event.title, detail: restored, timestamp: event.timestamp };
          }
          return { title: event.title, ...(detail === undefined ? {} : { detail }), timestamp: event.timestamp };
        }),
        tokenHistory: readTokenUsage.all(row.id).map((entry) => ({
          id: entry.prompt_id,
          prompt: entry.prompt_text,
          inputTokens: entry.input_tokens,
          outputTokens: entry.output_tokens,
          totalTokens: entry.total_tokens,
          timestamp: entry.timestamp,
        })),
        updatedAt: row.updated_at,
      }));
      const layout = database.prepare(
        "SELECT active_session_id, sidebar_collapsed FROM layout WHERE id = 1",
      ).get();
      const providers = database.prepare(`
        SELECT p.id, p.name, p.type, p.base_url, p.api_key, ps.model, ps.selected
        FROM providers p JOIN provider_settings ps ON ps.provider_id = p.id
        ORDER BY ps.selected DESC, p.name
      `).all().map((row) => ({ id: row.id, name: row.name, type: row.type, model: row.model,
        baseUrl: row.base_url, apiKey: row.api_key, selected: row.selected === 1 }));
      const provider = providers.find((item) => item.selected);
      const permissions = database.prepare("SELECT name, enabled FROM tool_permissions").all();
      return {
        ...(sessions.length > 0 ? { sessions } : {}),
        ...(layout?.active_session_id ? { activeSessionId: layout.active_session_id } : {}),
        sidebarCollapsed: layout?.sidebar_collapsed === 1,
        ...(provider ? { providerSettings: {
          provider: provider.type,
          model: provider.model,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
        } } : {}),
        ...(providers.length > 0 ? { providers } : {}),
        ...(permissions.length > 0 ? { toolPermissions: Object.fromEntries(
          permissions.map(({ name, enabled }) => [name, enabled === 1]),
        ) } : {}),
      };
    },
    set(values) {
      database.exec("BEGIN IMMEDIATE");
      try {
        writeValues(values);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    close() {
      database.close();
    },
    getMcpConfig() {
      return database.prepare("SELECT content FROM mcp_configuration WHERE id = 1").get()?.content;
    },
    setMcpConfig(content) {
      database.prepare(`
        INSERT INTO mcp_configuration (id, content, updated_at) VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
      `).run(String(content), Date.now());
    },
    getSystemPrompts() {
      return Object.fromEntries(database.prepare(
        "SELECT key, content FROM system_prompts ORDER BY key",
      ).all().map(({ key, content }) => [key, content]));
    },
    getSystemPromptRows() {
      return database.prepare("SELECT key, title, content FROM system_prompts ORDER BY title").all();
    },
    setSystemPrompt(key, content) {
      const result = database.prepare(
        "UPDATE system_prompts SET content = ?, updated_at = ? WHERE key = ?",
      ).run(String(content), Date.now(), String(key));
      if (result.changes === 0) throw new Error("Unknown system prompt.");
    },
  };
}
