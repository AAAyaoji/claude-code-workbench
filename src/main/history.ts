import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface HistoryMessage {
  role: 'user' | 'assistant'
  text: string
  timestamp: string | null
}

/** Claude Code 会话文件路径编码:把 : / \ 替换为 - */
function encodePath(p: string): string {
  return p.replace(/[:\/\\]/g, '-')
}

/** 判断某个会话的原始 .jsonl 历史文件是否存在(用于恢复前校验,不读取内容) */
export function sessionFileExists(projectPath: string, sessionId: string): boolean {
  if (!projectPath || !sessionId) return false
  const file = join(homedir(), '.claude', 'projects', encodePath(projectPath), `${sessionId}.jsonl`)
  return existsSync(file)
}

/**
 * 读取 Claude Code 原始会话历史(.jsonl)。
 * 只提取用户消息与 Claude 文本回复,忽略 thinking / tool_use / 元数据行。
 * 只读,不修改、不删除原始文件。
 */
export function readSessionHistory(projectPath: string, sessionId: string): HistoryMessage[] {
  if (!projectPath || !sessionId) return []
  const file = join(homedir(), '.claude', 'projects', encodePath(projectPath), `${sessionId}.jsonl`)

  let content: string
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    return [] // 历史文件不存在
  }

  const messages: HistoryMessage[] = []
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(line)
    } catch {
      continue // 跳过无法解析的行
    }

    const type = obj.type
    const message = obj.message as Record<string, unknown> | undefined

    if (type === 'user' && message && message.role === 'user') {
      const text = extractText(message.content)
      if (text) {
        messages.push({ role: 'user', text, timestamp: (obj.timestamp as string) ?? null })
      }
    } else if (type === 'assistant' && message) {
      const text = extractText(message.content)
      if (text) {
        messages.push({ role: 'assistant', text, timestamp: (obj.timestamp as string) ?? null })
      }
    }
  }
  return messages
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((b) => b && typeof b === 'object' && (b as Record<string, unknown>).type === 'text')
      .map((b) => String((b as Record<string, unknown>).text ?? ''))
      .join('\n')
      .trim()
  }
  return ''
}
