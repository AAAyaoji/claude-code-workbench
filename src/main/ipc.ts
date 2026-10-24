import { app, ipcMain, dialog, BrowserWindow } from 'electron'
import { ClaudeSession } from './claude/ClaudeSession'
import { registerSession, getSession, unregisterSession } from './sessionRegistry'
import { rebuildTray } from './tray'
import { addProject, listProjects, addSession, listSessions, touchSession, deleteSession, getSetting, setSetting } from './db'
import type { ProjectRow, SessionRow } from './db'
import { listSkills } from './skills'
import type { SkillInfo } from './skills'
import { listMcpServers } from './mcp'
import type { McpServerInfo } from './mcp'
import { getGitStatus, getGitLog, getGitCommitFiles, getGitFileDiff, getGitWorkingDiff, getGitChangedFiles, checkoutCommit } from './git'
import type { GitStatus, GitCommit, GitFileChange } from './git'
import { selectAvatarImage, setAvatar, resetAvatar, getAvatarDataUrl } from './avatar'
import type { AvatarKind } from './avatar'
import { getProject, deleteProject } from './db'
import { isDangerousPath, deleteProjectFolder } from './projectDelete'
import { readSessionHistory, sessionFileExists } from './history'
import type { HistoryMessage } from './history'

export interface AppInfo {
  version: string
  platform: string
}

interface ClaudeStartArgs {
  cwd: string
  projectId?: number
  resumeSessionId?: string
}

/**
 * 注册所有 IPC 处理器。渲染进程只能通过 preload 暴露的白名单接口间接调用。
 * 数据库操作只发生在主进程(经 db.ts 数据访问层),不暴露数据库对象给渲染进程。
 */
export function registerIpcHandlers(): void {
  ipcMain.handle('app:get-info', (): AppInfo => {
    return {
      version: app.getVersion(),
      platform: process.platform
    }
  })

  // 选择本地目录(用于添加项目)
  ipcMain.handle('project:select-directory', async (): Promise<string | null> => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: '选择项目目录',
      properties: ['openDirectory']
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  // 项目持久化
  ipcMain.handle('project:list', (): ProjectRow[] => listProjects())

  ipcMain.handle('project:add', (_event, args: { name: string; path: string }): ProjectRow => {
    if (!args || typeof args.path !== 'string' || args.path.length === 0) {
      throw new Error('无效的项目路径')
    }
    const name =
      typeof args.name === 'string' && args.name.length > 0
        ? args.name
        : args.path.split(/[\\/]/).filter(Boolean).pop() ?? args.path
    return addProject(name, args.path)
  })

  // 从工作台移除项目(只删数据库记录,不删磁盘文件夹)
  ipcMain.handle('project:remove', (_event, args: { id: number }): void => {
    if (!args || typeof args.id !== 'number' || !Number.isInteger(args.id)) {
      throw new Error('无效的项目 ID')
    }
    const deleted = deleteProject(args.id)
    if (!deleted) throw new Error('项目不存在')
  })

  // 彻底删除项目文件夹(危险:先删磁盘,成功后再删数据库记录)
  ipcMain.handle('project:delete-folder', async (_event, args: { id: number }): Promise<void> => {
    if (!args || typeof args.id !== 'number' || !Number.isInteger(args.id)) {
      throw new Error('无效的项目 ID')
    }
    const project = getProject(args.id)
    if (!project) throw new Error('项目不存在')
    if (isDangerousPath(project.path)) throw new Error('拒绝删除危险路径')
    await deleteProjectFolder(project.path)
    deleteProject(project.id)
  })

  // 会话列表
  ipcMain.handle('session:list', (): SessionRow[] => listSessions())

  // 读取会话历史(只读,从 Claude Code 原始 .jsonl)
  ipcMain.handle('session:history', (_event, args: { projectPath: string; sessionId: string }): HistoryMessage[] => {
    if (!args || typeof args.projectPath !== 'string' || typeof args.sessionId !== 'string') return []
    return readSessionHistory(args.projectPath, args.sessionId)
  })

  // 删除会话记录(只删工作台数据库,保留 Claude Code 原始 .jsonl)
  ipcMain.handle('session:delete', (_event, args: { id: number }): void => {
    if (!args || typeof args.id !== 'number' || !Number.isInteger(args.id)) {
      throw new Error('无效的会话 ID')
    }
    const deleted = deleteSession(args.id)
    if (!deleted) throw new Error('会话不存在')
  })

  // Skills 列表(全局 + 项目级)
  ipcMain.handle('skills:list', (): SkillInfo[] => {
    const projects = listProjects().map((p) => ({ name: p.name, path: p.path }))
    return listSkills(projects)
  })

  // MCP Server 列表(用户级 + 项目级)
  ipcMain.handle('mcp:list', (): McpServerInfo[] => {
    const projects = listProjects().map((p) => ({ name: p.name, path: p.path }))
    return listMcpServers(projects)
  })

  // Git 状态(只读)
  ipcMain.handle('git:status', async (_event, args: { path: string }): Promise<GitStatus> => {
    if (!args || typeof args.path !== 'string' || args.path.length === 0) {
      return { isRepo: false, branch: null, changed: 0, untracked: 0, error: '无效的项目路径' }
    }
    return getGitStatus(args.path)
  })

  // Git 历史提交列表(只读)
  ipcMain.handle('git:log', async (_event, args: { path: string }): Promise<GitCommit[]> => {
    if (!args || typeof args.path !== 'string') return []
    return getGitLog(args.path)
  })

  // 某次提交的文件变化(只读)
  ipcMain.handle('git:commit-files', async (_event, args: { path: string; commit: string }): Promise<GitFileChange[]> => {
    if (!args || typeof args.path !== 'string' || typeof args.commit !== 'string') return []
    return getGitCommitFiles(args.path, args.commit)
  })

  // 某文件在某提交中的 diff(只读)
  ipcMain.handle('git:file-diff', async (_event, args: { path: string; commit: string; file: string }): Promise<string> => {
    if (!args || typeof args.path !== 'string' || typeof args.commit !== 'string' || typeof args.file !== 'string') {
      return ''
    }
    return getGitFileDiff(args.path, args.commit, args.file)
  })

  // 工作区 diff(只读,用于「查看修改」)
  ipcMain.handle('git:working-diff', async (_event, args: { path: string }): Promise<string> => {
    if (!args || typeof args.path !== 'string') return ''
    return getGitWorkingDiff(args.path)
  })

  // 工作区变化文件列表(只读)
  ipcMain.handle('git:changed-files', async (_event, args: { path: string }): Promise<GitFileChange[]> => {
    if (!args || typeof args.path !== 'string') return []
    return getGitChangedFiles(args.path)
  })

  // 切换到历史提交(写操作,主进程强制检查工作区干净)
  ipcMain.handle('git:checkout', async (_event, args: { path: string; commit: string }): Promise<void> => {
    if (!args || typeof args.path !== 'string' || typeof args.commit !== 'string') {
      throw new Error('无效参数')
    }
    await checkoutCommit(args.path, args.commit)
  })

  // 设置读取/写入
  ipcMain.handle('settings:get', (_event, args: { key: string }): string | null => {
    if (!args || typeof args.key !== 'string') return null
    return getSetting(args.key)
  })

  ipcMain.handle('settings:set', (_event, args: { key: string; value: string }): void => {
    if (!args || typeof args.key !== 'string' || typeof args.value !== 'string') return
    setSetting(args.key, args.value)
    if (args.key === 'language') rebuildTray()
  })

  // 头像
  ipcMain.handle('avatar:select', (): Promise<string | null> => selectAvatarImage())

  ipcMain.handle('avatar:get', (_event, args: { kind: AvatarKind }): Promise<string | null> => {
    return getAvatarDataUrl(args?.kind === 'claude' ? 'claude' : 'user')
  })

  ipcMain.handle('avatar:set', (_event, args: { kind: AvatarKind; path: string }): Promise<string | null> => {
    if (!args || typeof args.path !== 'string' || args.path.length === 0) return Promise.resolve(null)
    return setAvatar(args.kind === 'claude' ? 'claude' : 'user', args.path)
  })

  ipcMain.handle('avatar:reset', (_event, args: { kind: AvatarKind }): Promise<void> => {
    return resetAvatar(args?.kind === 'claude' ? 'claude' : 'user')
  })

  // 启动 Claude Code 会话
  ipcMain.handle('claude:start', async (event, args: ClaudeStartArgs): Promise<{ sessionId: string }> => {
    if (!args || typeof args.cwd !== 'string' || args.cwd.length === 0) {
      throw new Error('无效的项目目录')
    }

    // 恢复会话前先校验原始 .jsonl 历史文件是否存在,避免对无效 sessionId 发起 --resume
    if (args.resumeSessionId) {
      if (!sessionFileExists(args.cwd, args.resumeSessionId)) {
        throw new Error('会话历史文件不存在,无法恢复')
      }
    }

    const win = BrowserWindow.fromWebContents(event.sender)
    const session = new ClaudeSession({
      cwd: args.cwd,
      resumeSessionId: args.resumeSessionId,
      onEvent: (ev) => {
        if (win && !win.isDestroyed()) win.webContents.send('claude:event', ev)
      },
      onExit: () => {
        if (session.id) unregisterSession(session.id)
      }
    })

    const sessionId = await session.start()
    registerSession(sessionId, session)

    // 持久化会话记录:恢复会话则刷新时间,新会话则插入
    if (args.resumeSessionId) {
      touchSession(args.resumeSessionId)
    } else {
      addSession(sessionId, args.projectId ?? null, null)
    }

    return { sessionId }
  })

  // 发送消息
  ipcMain.handle('claude:send', (_event, args: { sessionId: string; text: string }): void => {
    const session = getSession(args?.sessionId)
    if (!session) throw new Error('会话不存在')
    session.send(args.text)
  })

  // 中断当前回合(进程与会话保留,可继续发送消息)
  ipcMain.handle('claude:interrupt', (_event, args: { sessionId: string }): void => {
    const session = getSession(args?.sessionId)
    if (!session) throw new Error('会话不存在')
    session.interrupt()
  })

  // 终止进程(强制 kill,兜底用)
  ipcMain.handle('claude:stop', (_event, args: { sessionId: string }): void => {
    const session = getSession(args?.sessionId)
    if (!session) throw new Error('会话不存在')
    session.stop()
    unregisterSession(args.sessionId)
  })

  // 结束会话(优雅退出)
  ipcMain.handle('claude:end', (_event, args: { sessionId: string }): void => {
    const session = getSession(args?.sessionId)
    if (!session) throw new Error('会话不存在')
    session.end()
  })
}
