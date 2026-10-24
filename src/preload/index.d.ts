import type { WorkbenchApi } from './types'

declare global {
  interface Window {
    api: WorkbenchApi
  }
}

export type { SessionEvent, AppInfo, ClaudeStartArgs, Project, SessionInfo, HistoryMessage, SkillInfo, McpServerInfo, GitStatus, GitCommit, GitFileChange, AvatarKind } from './types'
