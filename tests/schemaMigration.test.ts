/**
 * Runs the real migration SQL against a real SQLite engine.
 *
 * expo-sqlite cannot load under Node, but the SQL itself is the thing worth
 * proving: that it parses, that re-running it is safe, that the version
 * counter advances exactly once per step, and that ON DELETE CASCADE actually
 * protects against orphaned rows. node:sqlite is the same SQLite engine, so a
 * pass here is real evidence rather than a restatement of the source.
 */
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_STEPS, SCHEMA_VERSION } from '@/lib/storage/schema';

/** Mirrors the production migrate() control flow. */
function migrate(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = ON;');
  const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  for (let version = current + 1; version <= SCHEMA_VERSION; version += 1) {
    const step = SCHEMA_STEPS[version - 1];
    if (!step) throw new Error(`SCHEMA_STEP_MISSING_${version}`);
    db.exec(step);
    db.exec(`PRAGMA user_version = ${version};`);
  }
}

function userVersion(db: DatabaseSync): number {
  return (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
}

describe('schema migration', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
  });

  it('declares exactly one step per schema version', () => {
    expect(SCHEMA_STEPS).toHaveLength(SCHEMA_VERSION);
  });

  it('applies cleanly to a fresh database and records the version', () => {
    migrate(db);
    expect(userVersion(db)).toBe(SCHEMA_VERSION);
  });

  it('creates every table the app reads and writes', () => {
    migrate(db);
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name);

    for (const table of [
      'settings',
      'memories',
      'projects',
      'project_steps',
      'conversations',
      'messages',
      'tool_runs',
      'online_messages',
    ]) {
      expect(names).toContain(table);
    }
  });

  it('is idempotent: a second run is a no-op and preserves existing rows', () => {
    migrate(db);
    db.prepare(
      'INSERT INTO projects (id, name, objective, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('p1', 'Build APK', 'Ship JARVIS', 'active', 1, 1);

    migrate(db);

    expect(userVersion(db)).toBe(SCHEMA_VERSION);
    const rows = db.prepare('SELECT id FROM projects').all();
    expect(rows).toHaveLength(1);
  });

  it('adopts a pre-versioning database without dropping its data', () => {
    // A build before user_version existed: tables present, version still 0.
    db.exec(SCHEMA_STEPS[0]!);
    expect(userVersion(db)).toBe(0);
    db.prepare(
      'INSERT INTO memories (id, title, body, type, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run('m1', 'Owner note', 'Remember this', 'note', 'manual', 1, 1);

    migrate(db);

    expect(userVersion(db)).toBe(SCHEMA_VERSION);
    expect(db.prepare('SELECT id FROM memories').all()).toHaveLength(1);
  });

  it('cascades project deletion to its steps so no orphans survive', () => {
    migrate(db);
    db.prepare(
      'INSERT INTO projects (id, name, objective, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('p1', 'Build APK', 'Ship JARVIS', 'active', 1, 1);
    db.prepare(
      'INSERT INTO project_steps (id, project_id, sequence, description, status) VALUES (?, ?, ?, ?, ?)',
    ).run('s1', 'p1', 1, 'Fix the build', 'pending');

    db.prepare('DELETE FROM projects WHERE id = ?').run('p1');

    expect(db.prepare('SELECT id FROM project_steps').all()).toHaveLength(0);
  });

  it('cascades conversation deletion to its messages', () => {
    migrate(db);
    db.prepare('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
      'c1',
      'Chat',
      1,
      1,
    );
    db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('msg1', 'c1', 'user', 'hello', 1);

    db.prepare('DELETE FROM conversations WHERE id = ?').run('c1');

    expect(db.prepare('SELECT id FROM messages').all()).toHaveLength(0);
  });

  it('rejects a step that references a missing project', () => {
    migrate(db);
    expect(() =>
      db
        .prepare('INSERT INTO project_steps (id, project_id, sequence, description, status) VALUES (?, ?, ?, ?, ?)')
        .run('s1', 'does-not-exist', 1, 'orphan', 'pending'),
    ).toThrow();
  });
});
