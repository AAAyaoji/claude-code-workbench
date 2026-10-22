import { rm } from 'fs/promises'
import { resolve, parse } from 'path'
import { homedir } from 'os'
import { app } from 'electron'

function normalize(p: string): string {
  return p.toLowerCase().replace(/[\\/]+$/, '')
}

/** 判断路径是否为危险位置(磁盘根目录、用户主目录、工作台自身/数据目录) */
export function isDangerousPath(p: string): boolean {
  const target = normalize(resolve(p))
  const protectedPaths = [
    normalize(homedir()),
    normalize(app.getAppPath()),
    normalize(app.getPath('userData'))
  ]
  for (const protectedPath of protectedPaths) {
    if (target === protectedPath) return true
  }
  // 磁盘根目录(如 C:\ / D:\)
  const root = normalize(parse(target).root)
  if (target === root) return true
  return false
}

/** 递归删除项目文件夹。目录不存在或删除失败时抛错(不静默) */
export async function deleteProjectFolder(path: string): Promise<void> {
  await rm(path, { recursive: true, force: false })
}
