export interface AppInfo {
  version: string
  platform: string
}

export interface ClaudeStartArgs {
  cwd: string
  projectId?: number
  resumeSessionId?: string
}

/** 会话事件(主进程归一化后推送),与主进程 claude/types.ts、渲染进程 types.ts 结构一致 */
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

export interface AvatarApi {
  select: () => Promise<string | null>
  get: (kind: AvatarKind) => Promise<string | null>
  set: (kind: AvatarKind, path: string) => Promise<string | null>
  reset: (kind: AvatarKind) => Promise<void>
}

export interface ClaudeApi {
  start: (args: ClaudeStartArgs) => Promise<{ sessionId: string }>
  send: (sessionId: string, text: string) => Promise<void>
  stop: (sessionId: string) => Promise<void>
  end: (sessionId: string) => Promise<void>
  onEvent: (callback: (event: SessionEvent) => void) => () => void
}

export interface WorkbenchApi {
  getAppInfo: () => Promise<AppInfo>
  selectDirectory: () => Promise<string | null>
  listProjects: () => Promise<Project[]>
  addProject: (name: string, path: string) => Promise<Project>
  removeProject: (id: number) => Promise<void>
  deleteProjectFolder: (id: number) => Promise<void>
  listSessions: () => Promise<SessionInfo[]>
  deleteSession: (id: number) => Promise<void>
  listSkills: () => Promise<SkillInfo[]>
  listMcpServers: () => Promise<McpServerInfo[]>
  getGitStatus: (path: string) => Promise<GitStatus>
  getGitLog: (path: string) => Promise<GitCommit[]>
  getGitCommitFiles: (path: string, commit: string) => Promise<GitFileChange[]>
  getGitFileDiff: (path: string, commit: string, file: string) => Promise<string>
  getGitWorkingDiff: (path: string) => Promise<string>
  getGitChangedFiles: (path: string) => Promise<GitFileChange[]>
  checkoutCommit: (path: string, commit: string) => Promise<void>
  getSetting: (key: string) => Promise<string | null>
  setSetting: (key: string, value: string) => Promise<void>
  avatar: AvatarApi
  claude: ClaudeApi
}
