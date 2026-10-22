/** 会话事件(渲染进程侧),与 preload/types.ts、主进程 claude/types.ts 结构一致 */
export type SessionEvent =
  | {
      type: 'init'
      sessionId: string
      cwd: string
      model: string
      tools: string[]
      permissionMode: string
    }
  | { type: 'assistant_text'; sessionId: string; text: string }
  | { type: 'tool_use'; sessionId: string; toolId: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; sessionId: string; toolId: string; isError: boolean; content: string }
  | { type: 'result'; sessionId: string; stopReason: string; costUsd: number }
  | { type: 'exited'; sessionId: string; code: number | null }

export interface Project {
  id: number
  name: string
  path: string
}

export interface SessionInfo {
  id: number
  sessionId: string
  projectId: number | null
  title: string | null
  createdAt: string
  updatedAt: string
  projectName: string | null
  projectPath: string | null
}

export interface SkillInfo {
  name: string
  description: string
  scope: 'global' | 'project' | 'plugin'
  projectName: string | null
  pluginName: string | null
  marketplace: string | null
  path: string
  source: string
  locked: boolean
}

export interface McpServerInfo {
  name: string
  scope: 'global' | 'project'
  projectName: string | null
  transport: string
  command: string | null
  url: string | null
  status: string
}

export interface GitStatus {
  isRepo: boolean
  branch: string | null
  changed: number
  untracked: number
  error: string | null
}

export interface GitCommit {
  hash: string
  shortHash: string
  subject: string
  author: string
  date: string
}

export interface GitFileChange {
  status: string
  file: string
}

export type AvatarKind = 'user' | 'claude'
