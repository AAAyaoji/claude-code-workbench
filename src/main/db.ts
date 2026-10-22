import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { join } from 'path'

/**
 * 数据访问层。数据库只在 Electron 主进程操作,渲染进程通过 IPC 间接访问。
 * 不在此处存储任何认证凭证 / API Key。
 */

let db: DatabaseSync | null = null

export interface ProjectRow {
  id: number
  name: string
  path: string
}

export interface SessionRow {
  id: number
  sessionId: string
  projectId: number | null
  title: string | null
  createdAt: string
  updatedAt: string
  projectName: string | null
  projectPath: string | null
}

/** 初始化数据库(userData 目录下的 workbench.db) */
export function initDb(): void {
  if (db) return
  const dbPath = join(app.getPath('userData'), 'workbench.db')
  db = new DatabaseSync(dbPath)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

function getDb(): DatabaseSync {
  if (!db) throw new Error('数据库未初始化')
  return db
}

// ---- projects ----

/** 添加项目;路径重复时忽略插入并返回已存在的记录 */
export function addProject(name: string, path: string): ProjectRow {
  const d = getDb()
  d.prepare('INSERT OR IGNORE INTO projects (name, path) VALUES (?, ?)').run(name, path)
  const row = d.prepare('SELECT id, name, path FROM projects WHERE path = ?').get(path) as
    | Record<string, unknown>
    | undefined
  if (!row) throw new Error('添加项目失败')
  return { id: Number(row.id), name: String(row.name), path: String(row.path) }
}

export function listProjects(): ProjectRow[] {
  const d = getDb()
  const rows = d
    .prepare('SELECT id, name, path FROM projects ORDER BY created_at DESC, id DESC')
    .all() as Record<string, unknown>[]
  return rows.map((r) => ({ id: Number(r.id), name: String(r.name), path: String(r.path) }))
}

export function getProject(id: number): ProjectRow | null {
  const d = getDb()
  const row = d.prepare('SELECT id, name, path FROM projects WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined
  return row ? { id: Number(row.id), name: String(row.name), path: String(row.path) } : null
}

/** 删除项目记录(含关联 session,避免孤儿记录)。返回是否删除成功 */
export function deleteProject(id: number): boolean {
  const d = getDb()
  // 外键约束未开启,需显式先删关联 session
  d.prepare('DELETE FROM sessions WHERE project_id = ?').run(id)
  const info = d.prepare('DELETE FROM projects WHERE id = ?').run(id)
  return Number(info.changes) > 0
}

// ---- sessions ----

export function addSession(sessionId: string, projectId: number | null, title: string | null): void {
  const d = getDb()
  d.prepare('INSERT INTO sessions (session_id, project_id, title) VALUES (?, ?, ?)').run(
    sessionId,
    projectId,
    title
  )
}

export function listSessions(): SessionRow[] {
  const d = getDb()
  const rows = d
    .prepare(
      `SELECT s.id, s.session_id AS sessionId, s.project_id AS projectId, s.title,
              s.created_at AS createdAt, s.updated_at AS updatedAt,
              p.name AS projectName, p.path AS projectPath
       FROM sessions s
       LEFT JOIN projects p ON p.id = s.project_id
       ORDER BY s.updated_at DESC, s.id DESC`
    )
    .all() as Record<string, unknown>[]
  return rows.map((r) => ({
    id: Number(r.id),
    sessionId: String(r.sessionId),
    projectId: r.projectId === null ? null : Number(r.projectId),
    title: r.title === null ? null : String(r.title),
    createdAt: String(r.createdAt),
    updatedAt: String(r.updatedAt),
    projectName: r.projectName === null ? null : String(r.projectName),
    projectPath: r.projectPath === null ? null : String(r.projectPath)
  }))
}

/** 更新会话的最后活动时间(恢复会话时调用) */
export function touchSession(sessionId: string): void {
  const d = getDb()
  d.prepare("UPDATE sessions SET updated_at = datetime('now') WHERE session_id = ?").run(sessionId)
}

/** 删除会话记录(只删工作台数据库,不碰 Claude Code 的 .jsonl 文件)。返回是否删除成功 */
export function deleteSession(id: number): boolean {
  const d = getDb()
  const info = d.prepare('DELETE FROM sessions WHERE id = ?').run(id)
  return Number(info.changes) > 0
}

// ---- settings ----

export function getSetting(key: string): string | null {
  const d = getDb()
  const row = d.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | Record<string, unknown>
    | undefined
  return row ? String(row.value) : null
}

export function setSetting(key: string, value: string): void {
  const d = getDb()
  d.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}
