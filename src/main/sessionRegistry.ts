import type { ClaudeSession } from './claude/ClaudeSession'

/** 活跃会话注册表。供 IPC 与托盘查询当前是否有运行中的 Claude 会话。 */
const sessions = new Map<string, ClaudeSession>()

export function registerSession(id: string, session: ClaudeSession): void {
  sessions.set(id, session)
}

export function getSession(id: string): ClaudeSession | undefined {
  return sessions.get(id)
}

export function unregisterSession(id: string): void {
  sessions.delete(id)
}

export function hasActiveSessions(): boolean {
  return sessions.size > 0
}
