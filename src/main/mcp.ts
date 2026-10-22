import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface McpServerInfo {
  name: string
  scope: 'global' | 'project'
  projectName: string | null
  transport: string
  command: string | null
  url: string | null
  status: string
}

/**
 * 读取 MCP Server 配置(只读)。
 * 只提取 name/type/command/url 等非敏感字段,绝不读取 env/headers(可能含 token)。
 */
export function listMcpServers(projects: { name: string; path: string }[]): McpServerInfo[] {
  const result: McpServerInfo[] = []

  // 用户级 ~/.claude.json 的 mcpServers
  const claudeJsonPath = join(homedir(), '.claude.json')
  try {
    const content = JSON.parse(readFileSync(claudeJsonPath, 'utf8'))
    const servers = content.mcpServers
    if (servers && typeof servers === 'object') {
      for (const [name, cfg] of Object.entries(servers)) {
        result.push(toInfo(name, cfg as Record<string, unknown>, 'global', null))
      }
    }
  } catch {
    // 配置不存在或解析失败,忽略
  }

  // 项目级 <项目>/.mcp.json
  for (const p of projects) {
    const mcpJsonPath = join(p.path, '.mcp.json')
    try {
      if (!existsSync(mcpJsonPath)) continue
      const content = JSON.parse(readFileSync(mcpJsonPath, 'utf8'))
      const servers = content.mcpServers
      if (servers && typeof servers === 'object') {
        for (const [name, cfg] of Object.entries(servers)) {
          result.push(toInfo(name, cfg as Record<string, unknown>, 'project', p.name))
        }
      }
    } catch {
      // 忽略
    }
  }

  return result
}

function toInfo(
  name: string,
  cfg: Record<string, unknown>,
  scope: 'global' | 'project',
  projectName: string | null
): McpServerInfo {
  // 只提取非敏感字段
  const transport = typeof cfg.type === 'string' ? (cfg.type as string) : ''
  const command = typeof cfg.command === 'string' ? (cfg.command as string) : null
  const url = typeof cfg.url === 'string' ? (cfg.url as string) : null
  // 若未显式声明 type,按字段推断
  const inferredTransport = transport || (command ? 'stdio' : url ? 'http' : 'unknown')

  return {
    name,
    scope,
    projectName,
    transport: inferredTransport,
    command,
    url,
    status: 'unknown' // 连接状态需 CLI 健康检查,当前无法可靠检测,诚实标注未知
  }
}
