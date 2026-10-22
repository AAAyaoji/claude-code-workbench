import { app, dialog, BrowserWindow } from 'electron'
import { copyFile, readFile, unlink, mkdir } from 'fs/promises'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import { getSetting, setSetting } from './db'

export type AvatarKind = 'user' | 'claude'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

function avatarsDir(): string {
  return join(app.getPath('userData'), 'avatars')
}

function settingKey(kind: AvatarKind): string {
  return kind === 'user' ? 'avatar_user' : 'avatar_claude'
}

/** 打开图片选择对话框,返回源文件路径(不复制、不删原文件) */
export async function selectAvatarImage(): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    title: '选择图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
  })
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
}

/**
 * 复制头像到工作台 userData/avatars/ 目录,更新数据库路径,返回 data URL。
 * 先成功复制,再更新路径;失败时不改路径,保留原头像。
 */
export async function setAvatar(kind: AvatarKind, sourcePath: string): Promise<string | null> {
  const ext = extname(sourcePath).toLowerCase()
  if (!MIME[ext]) throw new Error('不支持的图片格式')

  const dir = avatarsDir()
  await mkdir(dir, { recursive: true })
  const filename = `${kind}-${randomUUID()}${ext}`
  const dest = join(dir, filename)

  await copyFile(sourcePath, dest) // 复制失败则抛错,不更新路径
  setSetting(settingKey(kind), dest)
  return toDataUrl(dest, MIME[ext])
}

/** 恢复默认头像:只删除工作台自有头像文件 + 清除路径,不碰用户原始图片 */
export async function resetAvatar(kind: AvatarKind): Promise<void> {
  const current = getSetting(settingKey(kind))
  if (current) {
    try {
      await unlink(current)
    } catch {
      // 文件可能已不存在,忽略
    }
  }
  setSetting(settingKey(kind), '')
}

/** 读取当前头像,返回 data URL(未设置返回 null) */
export async function getAvatarDataUrl(kind: AvatarKind): Promise<string | null> {
  const path = getSetting(settingKey(kind))
  if (!path) return null
  try {
    const ext = extname(path).toLowerCase()
    const mime = MIME[ext] ?? 'image/png'
    return toDataUrl(path, mime)
  } catch {
    return null
  }
}

async function toDataUrl(path: string, mime: string): Promise<string> {
  const buf = await readFile(path)
  return `data:${mime};base64,${buf.toString('base64')}`
}
