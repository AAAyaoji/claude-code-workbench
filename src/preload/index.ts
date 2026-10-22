import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { ClaudeStartArgs, SessionEvent, WorkbenchApi, AvatarKind } from './types'

/**
 * 白名单 API:渲染进程唯一能触碰的主进程能力入口。
 * 不暴露 ipcRenderer 本身或任何 Node 内置模块。
 */
const api: WorkbenchApi = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  selectDirectory: () => ipcRenderer.invoke('project:select-directory'),
  listProjects: () => ipcRenderer.invoke('project:list'),
  addProject: (name: string, path: string) => ipcRenderer.invoke('project:add', { name, path }),
  removeProject: (id: number) => ipcRenderer.invoke('project:remove', { id }),
  deleteProjectFolder: (id: number) => ipcRenderer.invoke('project:delete-folder', { id }),
  listSessions: () => ipcRenderer.invoke('session:list'),
  deleteSession: (id: number) => ipcRenderer.invoke('session:delete', { id }),
  listSkills: () => ipcRenderer.invoke('skills:list'),
  listMcpServers: () => ipcRenderer.invoke('mcp:list'),
  getGitStatus: (path: string) => ipcRenderer.invoke('git:status', { path }),
  getGitLog: (path: string) => ipcRenderer.invoke('git:log', { path }),
  getGitCommitFiles: (path: string, commit: string) => ipcRenderer.invoke('git:commit-files', { path, commit }),
  getGitFileDiff: (path: string, commit: string, file: string) =>
    ipcRenderer.invoke('git:file-diff', { path, commit, file }),
  getGitWorkingDiff: (path: string) => ipcRenderer.invoke('git:working-diff', { path }),
  getGitChangedFiles: (path: string) => ipcRenderer.invoke('git:changed-files', { path }),
  checkoutCommit: (path: string, commit: string) => ipcRenderer.invoke('git:checkout', { path, commit }),
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', { key }),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('settings:set', { key, value }),
  avatar: {
    select: () => ipcRenderer.invoke('avatar:select'),
    get: (kind: AvatarKind) => ipcRenderer.invoke('avatar:get', { kind }),
    set: (kind: AvatarKind, path: string) => ipcRenderer.invoke('avatar:set', { kind, path }),
    reset: (kind: AvatarKind) => ipcRenderer.invoke('avatar:reset', { kind })
  },
  claude: {
    start: (args: ClaudeStartArgs) => ipcRenderer.invoke('claude:start', args),
    send: (sessionId: string, text: string) => ipcRenderer.invoke('claude:send', { sessionId, text }),
    stop: (sessionId: string) => ipcRenderer.invoke('claude:stop', { sessionId }),
    end: (sessionId: string) => ipcRenderer.invoke('claude:end', { sessionId }),
    onEvent: (callback: (event: SessionEvent) => void) => {
      const listener = (_event: IpcRendererEvent, ev: SessionEvent): void => callback(ev)
      ipcRenderer.on('claude:event', listener)
      return () => {
        ipcRenderer.removeListener('claude:event', listener)
      }
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
