import { DatabaseSync } from "node:sqlite";

const ALLOWED_KEYS = new Set([
  "sessions",
  "sidebarCollapsed",
  "sidebarWidth",
  "streamWidth",
  "providerSettings",
  "toolPermissions",
]);

export function createUiStateStore(databasePath) {
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS ui_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT
  `);
  const readAll = database.prepare("SELECT key, value FROM ui_state");
  const upsert = database.prepare(`
    INSERT INTO ui_state (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  return {
    getAll() {
      return Object.fromEntries(readAll.all().flatMap(({ key, value }) => {
        try {
          return [[key, JSON.parse(value)]];
        } catch {
          return [];
        }
      }));
    },
    set(values) {
      const entries = Object.entries(values || {}).filter(([key]) => ALLOWED_KEYS.has(key));
      if (entries.length === 0) throw new Error("No valid UI state keys were provided.");
      database.exec("BEGIN IMMEDIATE");
      try {
        const now = Date.now();
        for (const [key, value] of entries) upsert.run(key, JSON.stringify(value), now);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    close() {
      database.close();
    },
  };
}
