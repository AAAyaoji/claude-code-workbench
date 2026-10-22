import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface GitStatus {
  isRepo: boolean
  branch: string | null
  /** 变更文件数(修改/新增/删除等,不含未跟踪) */
  changed: number
  /** 未跟踪文件数 */
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

function run(projectPath: string, args: string[], timeout = 10000): Promise<string> {
  return execFileAsync('git', ['-C', projectPath, ...args], {
    timeout,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024
  }).then(({ stdout }) => stdout)
}

/**
 * 只读查询项目的 Git 状态。
 * 使用 execFile + 数组参数,不经过 shell,项目路径不会被 shell 解释或注入。
 */
export async function getGitStatus(projectPath: string): Promise<GitStatus> {
  // 1. 判断是否为 git 仓库
  try {
    await run(projectPath, ['rev-parse', '--is-inside-work-tree'])
  } catch {
    return { isRepo: false, branch: null, changed: 0, untracked: 0, error: null }
  }

  // 2. 当前分支
  let branch: string | null = null
  try {
    branch = (await run(projectPath, ['branch', '--show-current'])).trim() || null
  } catch {
    branch = null
  }

  // 3. 工作区状态
  let changed = 0
  let untracked = 0
  try {
    const stdout = await run(projectPath, ['status', '--porcelain'])
    for (const line of stdout.split(/\r?\n/)) {
      if (line.length < 2) continue
      if (line[0] === '?' && line[1] === '?') {
        untracked++
      } else {
        changed++
      }
    }
  } catch (err) {
    return {
      isRepo: true,
      branch,
      changed: 0,
      untracked: 0,
      error: err instanceof Error ? err.message : String(err)
    }
  }

  return { isRepo: true, branch, changed, untracked, error: null }
}

/** 当前工作区变化文件列表(只读,含状态与文件名) */
export async function getGitChangedFiles(projectPath: string): Promise<GitFileChange[]> {
  const stdout = await run(projectPath, ['status', '--porcelain'])
  const files: GitFileChange[] = []
  for (const line of stdout.split(/\r?\n/)) {
    if (line.length < 3) continue
    const status = line.slice(0, 2).trim() || 'M'
    const file = line.slice(3)
    files.push({ status, file })
  }
  return files
}

/** 历史提交列表(只读) */
export async function getGitLog(projectPath: string, limit = 50): Promise<GitCommit[]> {
  const stdout = await run(projectPath, [
    'log',
    '--format=%H%x1f%h%x1f%an%x1f%ad%x1f%s',
    '--date=short',
    `-n`,
    String(limit)
  ])
  const commits: GitCommit[] = []
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) continue
    const parts = line.split('\x1f')
    if (parts.length < 5) continue
    commits.push({
      hash: parts[0],
      shortHash: parts[1],
      author: parts[2],
      date: parts[3],
      subject: parts.slice(4).join('\x1f')
    })
  }
  return commits
}

/** 某次提交涉及的文件变化列表(只读) */
export async function getGitCommitFiles(projectPath: string, commit: string): Promise<GitFileChange[]> {
  const stdout = await run(projectPath, ['show', '--name-status', '--format=', commit])
  const files: GitFileChange[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^([MADRC])\t(.+)$/)
    if (m) files.push({ status: m[1], file: m[2] })
  }
  return files
}

/** 某文件在某次提交中的 diff(只读) */
export async function getGitFileDiff(projectPath: string, commit: string, file: string): Promise<string> {
  return run(projectPath, ['show', commit, '--', file])
}

/** 工作区 + 暂存区相对 HEAD 的 diff(只读,用于「查看修改」) */
export async function getGitWorkingDiff(projectPath: string): Promise<string> {
  return run(projectPath, ['diff', 'HEAD'])
}

/** 切换到指定历史提交(detached HEAD)。切换前强制检查工作区干净 */
export async function checkoutCommit(projectPath: string, commit: string): Promise<void> {
  const status = await getGitStatus(projectPath)
  if (!status.isRepo) throw new Error('不是 Git 仓库')
  if (status.changed > 0) {
    throw new Error('工作区存在未提交的修改,无法切换')
  }
  await run(projectPath, ['checkout', commit], 30000)
}
