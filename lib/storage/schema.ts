/**
 * Schema definition for the JARVIS local database.
 *
 * Deliberately free of any expo-sqlite or React Native import so the exact
 * SQL that ships can be executed against a real SQLite engine under Node in
 * tests. A migration that is only asserted about, never run, is not verified.
 */

/**
 * Current schema version. Bump this and append a step to SCHEMA_STEPS whenever
 * the schema changes.
 *
 * `CREATE TABLE IF NOT EXISTS` alone cannot evolve an existing install: it
 * silently does nothing when the table is already there, so a later added
 * column would never appear on a device that already has data. Versioning with
 * PRAGMA user_version lets each release apply only the steps a given device is
 * missing, which is what keeps owner data intact across upgrades.
 */
export const SCHEMA_VERSION = 1;

/**
 * Step N migrates a database at version N-1 up to version N. Step 1 is the
 * baseline schema and is written to be safe on a device that already has these
 * tables from a pre-versioning build, so existing installs adopt version 1
 * without losing anything.
 *
 * Every future step must be additive (ALTER TABLE ADD COLUMN, CREATE TABLE,
 * CREATE INDEX). Never drop or rewrite a table holding owner data.
 */
export const SCHEMA_STEPS: string[] = [
  `

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      approved INTEGER NOT NULL DEFAULT 1,
      pinned INTEGER NOT NULL DEFAULT 0,
      tags_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      objective TEXT NOT NULL,
      status TEXT NOT NULL,
      last_completed_step TEXT,
      next_action TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_steps (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      started_at INTEGER,
      finished_at INTEGER,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      mode TEXT,
      metrics_json TEXT,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tool_runs (
      id TEXT PRIMARY KEY NOT NULL,
      tool TEXT NOT NULL,
      ok INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER NOT NULL,
      data_json TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS online_messages (
      id TEXT PRIMARY KEY NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model_id TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_project_steps_project
      ON project_steps(project_id, sequence);
    CREATE INDEX IF NOT EXISTS idx_tool_runs_started
      ON tool_runs(started_at DESC);
  `,
];
