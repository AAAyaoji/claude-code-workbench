import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

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

/** 读取全局 + 项目级 + Plugin 提供的 Skills(只读,不修改任何文件) */
export function listSkills(projects: { name: string; path: string }[]): SkillInfo[] {
  const result: SkillInfo[] = []

  // 全局
  collectSkills(join(homedir(), '.claude', 'skills'), 'global', null, result)

  // 项目级
  for (const p of projects) {
    collectSkills(join(p.path, '.claude', 'skills'), 'project', p.name, result)
  }

  // Plugin 提供的 Skills
  collectPluginSkills(result)

  return result
}

function collectSkills(
  dir: string,
  scope: 'global' | 'project',
  projectName: string | null,
  out: SkillInfo[]
): void {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return // 目录不存在,忽略
  }

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    const skillDir = join(dir, entry.name)
    const skillMd = join(skillDir, 'SKILL.md')
    if (!existsSync(skillMd)) continue

    let name = entry.name
    let description = ''
    try {
      const { name: n, description: d } = parseFrontmatter(readFileSync(skillMd, 'utf8'))
      if (n) name = n
      if (d) description = d
    } catch {
      // 解析失败时保留目录名
    }

    const source = entry.isSymbolicLink() ? 'cli' : 'local'

    out.push({
      name,
      description,
      scope,
      projectName,
      pluginName: null,
      marketplace: null,
      path: skillDir,
      source,
      locked: false
    })
  }
}

/** 读取已安装 Plugin 提供的 Skills(installed_plugins.json + installPath/skills) */
function collectPluginSkills(out: SkillInfo[]): void {
  const installedPath = join(homedir(), '.claude', 'plugins', 'installed_plugins.json')
  let installed: { plugins?: Record<string, unknown> }
  try {
    installed = JSON.parse(readFileSync(installedPath, 'utf8'))
  } catch {
    return // 无插件或读取失败
  }

  const plugins = installed.plugins ?? {}
  for (const [pluginId, entries] of Object.entries(plugins)) {
    // pluginId 形如 "plugin@marketplace"
    const atIdx = pluginId.indexOf('@')
    const pluginName = atIdx === -1 ? pluginId : pluginId.slice(0, atIdx)
    const marketplace = atIdx === -1 ? null : pluginId.slice(atIdx + 1)

    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      const installPath = (entry as { installPath?: string }).installPath
      if (typeof installPath !== 'string' || installPath.length === 0) continue
      const skillsDir = join(installPath, 'skills')
      collectPluginSkillDir(skillsDir, pluginName, marketplace, out)
    }
  }
}

function collectPluginSkillDir(
  dir: string,
  pluginName: string,
  marketplace: string | null,
  out: SkillInfo[]
): void {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return // 该 plugin 无 skills 目录
  }

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    const skillDir = join(dir, entry.name)
    const skillMd = join(skillDir, 'SKILL.md')
    if (!existsSync(skillMd)) continue

    let skillName = entry.name
    let description = ''
    try {
      const { name: n, description: d } = parseFrontmatter(readFileSync(skillMd, 'utf8'))
      if (n) skillName = n
      if (d) description = d
    } catch {
      // 忽略
    }

    out.push({
      name: `${pluginName}:${skillName}`,
      description,
      scope: 'plugin',
      projectName: null,
      pluginName,
      marketplace,
      path: skillDir,
      source: 'plugin',
      locked: true
    })
  }
}

/** 解析 SKILL.md 的 YAML frontmatter(name / description),只处理单行 key: value */
function parseFrontmatter(content: string): { name?: string; description?: string } {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return {}
  const result: { name?: string; description?: string } = {}
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (key === 'name') result.name = value
    else if (key === 'description') result.description = value.replace(/^['"]|['"]$/g, '')
  }
  return result
}
