import * as SQLite from 'expo-sqlite';
import type {
  ChatMessage,
  Conversation,
  JarvisProject,
  JarvisSettings,
  MemoryRecord,
  ProjectStep,
  OnlineChatRecord,
} from './types';
import { createId } from '@/lib/utils/ids';
import { SCHEMA_STEPS, SCHEMA_VERSION } from './schema';

const DB_NAME = 'jarvis.db';
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export const DEFAULT_SETTINGS: JarvisSettings = {
  language: 'en',
  defaultMode: 'fast',
  approvedMemoryEnabled: true,
  autoSpeak: false,
  handsFreeEnabled: true,
  wakeWord: 'jarvis',
  ownerProfile: 'Keep explanations simple and direct. Prefer voice-first interaction, local-first operation, free tools where practical, and clear next actions. This assistant is optimized for the ASUS ROG Phone 8 Pro.',
  contextSize: 4096,
  batchSize: 512,
  threads: 6,
  gpuLayers: 99,
  adaptiveRuntime: true,
  onlineFreeOnly: true,
  // Off by default: a network voice sounds better but stops working the moment
  // the phone loses signal, and JARVIS is local-first.
  ttsAllowNetworkVoice: false,
  // Off by default: enabling it lets a question leave the phone.
  cloudFallbackEnabled: false,
  floatingOrbEnabled: false,
  // Off by default: 351 MB should never start downloading on mobile data unasked.
  neuralVoiceEnabled: false,
  chargeReminderEnabled: true,
  chargeReminderLevel: 0.2,
};

export { SCHEMA_STEPS, SCHEMA_VERSION } from './schema';

export interface DatabaseDiagnostics {
  schemaVersion: number;
  expectedSchemaVersion: number;
  /** Whether ON DELETE CASCADE is actually being enforced on this connection. */
  foreignKeysEnforced: boolean;
  journalMode: string;
}

let diagnostics: DatabaseDiagnostics | null = null;

/**
 * Real values read back from the open connection, or null before the database
 * is opened. Diagnostics must never assert a pragma took effect without having
 * read it back.
 */
export function getDatabaseDiagnostics(): DatabaseDiagnostics | null {
  return diagnostics ? { ...diagnostics } : null;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  // These are per-connection and must be set outside a transaction, so they are
  // applied before any migration step runs.
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = versionRow?.user_version ?? 0;

  for (let version = current + 1; version <= SCHEMA_VERSION; version += 1) {
    const step = SCHEMA_STEPS[version - 1];
    if (!step) throw new Error(`SCHEMA_STEP_MISSING_${version}`);
    await db.execAsync(step);
    // user_version does not accept a bound parameter, and `version` is a
    // loop-bound integer, never caller input.
    await db.execAsync(`PRAGMA user_version = ${version};`);
  }

  const appliedRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const fkRow = await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
  const journalRow = await db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode');

  diagnostics = {
    schemaVersion: appliedRow?.user_version ?? 0,
    expectedSchemaVersion: SCHEMA_VERSION,
    foreignKeysEnforced: fkRow?.foreign_keys === 1,
    journalMode: journalRow?.journal_mode ?? 'unknown',
  };
}

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await migrate(db);
      return db;
    });
  }
  return dbPromise;
}

export async function loadSettings(): Promise<JarvisSettings> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', 'app');
  if (!row) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(row.value) as Partial<JarvisSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: JarvisSettings): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    'app',
    JSON.stringify(settings),
  );
}

export async function listMemories(): Promise<MemoryRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM memories ORDER BY pinned DESC, updated_at DESC');
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    type: row.type,
    source: row.source,
    approved: Boolean(row.approved),
    pinned: Boolean(row.pinned),
    tags: JSON.parse(row.tags_json ?? '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function upsertMemory(memory: MemoryRecord): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO memories (id,title,body,type,source,approved,pinned,tags_json,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, body=excluded.body, type=excluded.type,
       source=excluded.source, approved=excluded.approved, pinned=excluded.pinned,
       tags_json=excluded.tags_json, updated_at=excluded.updated_at`,
    memory.id,
    memory.title,
    memory.body,
    memory.type,
    memory.source,
    memory.approved ? 1 : 0,
    memory.pinned ? 1 : 0,
    JSON.stringify(memory.tags),
    memory.createdAt,
    memory.updatedAt,
  );
}

export async function deleteMemory(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM memories WHERE id = ?', id);
}

export async function listProjects(): Promise<JarvisProject[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM projects ORDER BY status = \'active\' DESC, updated_at DESC');
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    objective: row.objective,
    status: row.status,
    lastCompletedStep: row.last_completed_step ?? undefined,
    nextAction: row.next_action ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function upsertProject(project: JarvisProject): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO projects (id,name,objective,status,last_completed_step,next_action,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, objective=excluded.objective,
       status=excluded.status, last_completed_step=excluded.last_completed_step,
       next_action=excluded.next_action, updated_at=excluded.updated_at`,
    project.id,
    project.name,
    project.objective,
    project.status,
    project.lastCompletedStep ?? null,
    project.nextAction ?? null,
    project.createdAt,
    project.updatedAt,
  );
}

export async function listProjectSteps(projectId: string): Promise<ProjectStep[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM project_steps WHERE project_id = ? ORDER BY sequence ASC', projectId);
  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    sequence: row.sequence,
    description: row.description,
    status: row.status,
    result: row.result ?? undefined,
    error: row.error ?? undefined,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
  }));
}

export async function upsertProjectStep(step: ProjectStep): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO project_steps (id,project_id,sequence,description,status,result,error,started_at,finished_at)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET sequence=excluded.sequence, description=excluded.description,
       status=excluded.status, result=excluded.result, error=excluded.error,
       started_at=excluded.started_at, finished_at=excluded.finished_at`,
    step.id,
    step.projectId,
    step.sequence,
    step.description,
    step.status,
    step.result ?? null,
    step.error ?? null,
    step.startedAt ?? null,
    step.finishedAt ?? null,
  );
}


export async function deleteProject(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM projects WHERE id = ?', id);
}

export async function updateConversationTitle(id: string, title: string): Promise<void> {
  const clean = title.trim();
  if (!clean) return;
  const db = await getDb();
  await db.runAsync(
    'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?',
    clean.slice(0, 120),
    Date.now(),
    id,
  );
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM conversations WHERE id = ?', id);
}

export async function createConversation(title = 'New conversation'): Promise<Conversation> {
  const db = await getDb();
  const now = Date.now();
  const conversation: Conversation = { id: createId('conv'), title, createdAt: now, updatedAt: now };
  await db.runAsync('INSERT INTO conversations (id,title,created_at,updated_at) VALUES (?,?,?,?)', conversation.id, conversation.title, now, now);
  return conversation;
}

export async function listConversations(): Promise<Conversation[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM conversations ORDER BY updated_at DESC');
  return rows.map((row) => ({ id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at }));
}

export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC', conversationId);
  return rows.map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    mode: row.mode ?? undefined,
    metrics: row.metrics_json ? JSON.parse(row.metrics_json) : undefined,
  }));
}

export async function addMessage(message: ChatMessage): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO messages (id,conversation_id,role,content,created_at,mode,metrics_json) VALUES (?,?,?,?,?,?,?)',
    message.id,
    message.conversationId,
    message.role,
    message.content,
    message.createdAt,
    message.mode ?? null,
    message.metrics ? JSON.stringify(message.metrics) : null,
  );
  await db.runAsync('UPDATE conversations SET updated_at = ? WHERE id = ?', Date.now(), message.conversationId);
}

export async function eraseAllJarvisData(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM tool_runs;
    DELETE FROM messages;
    DELETE FROM conversations;
    DELETE FROM project_steps;
    DELETE FROM projects;
    DELETE FROM memories;
    DELETE FROM settings;
  `);
}

export async function recordToolRun(run: {
  id: string;
  tool: string;
  ok: boolean;
  startedAt: number;
  finishedAt: number;
  data?: unknown;
  error?: string;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO tool_runs (id,tool,ok,started_at,finished_at,data_json,error) VALUES (?,?,?,?,?,?,?)',
    run.id,
    run.tool,
    run.ok ? 1 : 0,
    run.startedAt,
    run.finishedAt,
    run.data === undefined ? null : JSON.stringify(run.data),
    run.error ?? null,
  );
}

export async function listRecentToolRuns(limit = 50): Promise<Array<{
  id: string;
  tool: string;
  ok: boolean;
  startedAt: number;
  finishedAt: number;
  data?: unknown;
  error?: string;
}>> {
  const db = await getDb();
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM tool_runs ORDER BY started_at DESC LIMIT ?',
    safeLimit,
  );
  return rows.map((row) => ({
    id: row.id,
    tool: row.tool,
    ok: Boolean(row.ok),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    data: row.data_json ? JSON.parse(row.data_json) : undefined,
    error: row.error ?? undefined,
  }));
}

export async function listOnlineMessages(limit = 80): Promise<OnlineChatRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM online_messages ORDER BY created_at ASC LIMIT ?',
    Math.max(1, Math.min(limit, 500)),
  );
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    modelId: row.model_id ?? undefined,
    createdAt: row.created_at,
  }));
}

export async function addOnlineMessage(message: OnlineChatRecord): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO online_messages (id, role, content, model_id, created_at) VALUES (?, ?, ?, ?, ?)',
    message.id,
    message.role,
    message.content,
    message.modelId ?? null,
    message.createdAt,
  );
}

export async function clearOnlineMessages(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM online_messages');
}
