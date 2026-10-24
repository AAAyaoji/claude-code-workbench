import { spawn, type ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import type { SessionEvent } from './types'

export interface ClaudeSessionOptions {
  /** Claude Code 的工作目录(项目目录) */
  cwd: string
  /** 恢复已有会话(可选) */
  resumeSessionId?: string
  /** 事件回调(归一化后的会话事件) */
  onEvent: (event: SessionEvent) => void
  /** 进程退出回调 */
  onExit: (code: number | null) => void
}

/**
 * 管理一个 Claude Code CLI 子进程的持久会话。
 * 通过 stdin/stdout 做 JSONL 双向通信,支持多轮对话。
 */
export class ClaudeSession {
  private child: ChildProcess | null = null
  private sessionId: string | null = null
  private buffer = ''
  private emittedInit = false
  private stderrTail = ''

  constructor(private readonly opts: ClaudeSessionOptions) {}

  /** 启动子进程,spawn 成功后立即返回 sessionId(不等待 init) */
  start(): Promise<string> {
    return new Promise((resolve, reject) => {
      // --input-format stream-json 模式下,init 事件要等第一条 stdin 消息才输出。
      // 因此主动生成会话 ID 并通过 --session-id 指定,不能等 init 来拿 ID,
      // 否则启动会死锁(UI 等 init 进入就绪,而 init 等用户发消息)。
      const sessionId = this.opts.resumeSessionId ?? randomUUID()
      this.sessionId = sessionId

      const args = [
        '-p',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--verbose'
      ]
      if (this.opts.resumeSessionId) {
        args.push('--resume', this.opts.resumeSessionId)
      } else {
        args.push('--session-id', sessionId)
      }

      let settled = false

      const child = spawn('claude', args, {
        cwd: this.opts.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      })
      this.child = child

      child.stdout.on('data', (chunk: Buffer) => this.handleStdout(chunk.toString('utf8')))
      // stderr 可能含敏感信息:只保留末尾一小段用于诊断(发送前会脱敏),不落日志。
      child.stderr.on('data', (chunk: Buffer) => this.collectStderr(chunk))

      child.on('error', (err) => {
        if (!settled) {
          settled = true
          reject(err)
        }
      })

      // 子进程成功启动即视为会话就绪
      child.on('spawn', () => {
        if (!settled) {
          settled = true
          resolve(sessionId)
        }
      })

      child.on('exit', (code) => {
        this.opts.onEvent({
          type: 'exited',
          sessionId: this.sessionId ?? '',
          code,
          // 非零退出码才附带脱敏后的 stderr 摘要,帮助定位启动/恢复失败。
          error: code !== 0 ? redactSecrets(this.stderrTail) : undefined
        })
        this.opts.onExit(code)
        if (!settled) {
          settled = true
          reject(new Error('Claude Code 进程启动失败'))
        }
      })
    })
  }

  get id(): string | null {
    return this.sessionId
  }

  /** 发送一条用户消息 */
  send(text: string): void {
    if (!this.child?.stdin?.writable) throw new Error('会话未就绪')
    const message = {
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text }] }
    }
    this.child.stdin.write(JSON.stringify(message) + '\n')
  }

  /** 中断当前回合(向 stdin 发 control_request,进程与会话保留,之后可继续发消息) */
  interrupt(): void {
    if (!this.child?.stdin?.writable) return
    const frame = {
      type: 'control_request',
      request_id: `interrupt-${randomUUID()}`,
      request: { subtype: 'interrupt', reason: 'user-cancel' }
    }
    this.child.stdin.write(JSON.stringify(frame) + '\n')
  }

  /** 终止进程(强制 kill,兜底用) */
  stop(): void {
    this.child?.kill()
  }

  /** 优雅结束会话(关闭 stdin,让进程处理完退出);超时未退出则强制终止,避免残留进程 */
  end(): void {
    const child = this.child
    if (!child) return
    if (!child.stdin?.writable) {
      // stdin 已不可写,直接强制终止兜底
      child.kill()
      return
    }
    const timer = setTimeout(() => child.kill(), 3000)
    child.once('exit', () => clearTimeout(timer))
    child.stdin.end()
  }

  /** 只保留 stderr 末尾一小段(用于退出时诊断),限制长度避免无限增长 */
  private collectStderr(chunk: Buffer): void {
    const MAX = 8192
    this.stderrTail = (this.stderrTail + chunk.toString('utf8')).slice(-MAX)
  }

  private handleStdout(data: string): void {
    this.buffer += data
    let idx: number
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 1)
      if (line) this.handleLine(line)
    }
  }

  private handleLine(line: string): void {
    let obj: unknown
    try {
      obj = JSON.parse(line)
    } catch {
      return // 忽略无法解析的行,不中断整体流程
    }
    this.dispatch(obj as Record<string, never>)
  }

  private dispatch(raw: Record<string, never>): void {
    const type = raw.type as string
    const subtype = raw.subtype as string | undefined
    const sessionId = (raw.session_id as string) ?? ''

    if (type === 'system' && subtype === 'init') {
      // 实测:持久会话多轮 + 工具调用时,init 可能重复出现。只在首次 emit。
      this.sessionId = sessionId
      if (!this.emittedInit) {
        this.emittedInit = true
        this.emit({
          type: 'init',
          sessionId,
          cwd: (raw.cwd as string) ?? '',
          model: (raw.model as string) ?? '',
          tools: (raw.tools as string[]) ?? [],
          permissionMode: (raw.permissionMode as string) ?? ''
        })
      }
      return
    }

    if (type === 'assistant' && raw.message) {
      const message = raw.message as { content?: Array<Record<string, never>> }
      for (const block of message.content ?? []) {
        if (block.type === 'text') {
          this.emit({ type: 'assistant_text', sessionId, text: (block.text as string) ?? '' })
        } else if (block.type === 'tool_use') {
          this.emit({
            type: 'tool_use',
            sessionId,
            toolId: (block.id as string) ?? '',
            name: (block.name as string) ?? '',
            input: (block.input as Record<string, unknown>) ?? {}
          })
        }
      }
      return
    }

    if (type === 'user' && raw.message) {
      const message = raw.message as { content?: Array<Record<string, never>> }
      for (const block of message.content ?? []) {
        if (block.type === 'tool_result') {
          this.emit({
            type: 'tool_result',
            sessionId,
            toolId: (block.tool_use_id as string) ?? '',
            isError: Boolean(block.is_error),
            content: this.stringifyContent(block.content)
          })
        }
      }
      return
    }

    if (type === 'result') {
      this.emit({
        type: 'result',
        sessionId,
        stopReason: (raw.stop_reason as string) ?? '',
        costUsd: (raw.total_cost_usd as number) ?? 0
      })
    }
  }

  private stringifyContent(content: unknown): string {
    if (typeof content === 'string') return content
    if (content === null || content === undefined) return ''
    try {
      return JSON.stringify(content)
    } catch {
      return String(content)
    }
  }

  private emit(event: SessionEvent): void {
    this.opts.onEvent(event)
  }
}

/** 尽力脱敏 stderr 中可能出现的 API Key / Token / 认证凭证,避免把敏感信息展示到 UI */
function redactSecrets(text: string): string {
  if (!text) return ''
  return text
    .replace(/\bsk-ant-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{16,}/g, '[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(
      /\b(ANTHROPIC_AUTH_TOKEN|ANTHROPIC_API_KEY|OPENAI_API_KEY|api[_-]?key)\b[ \t]*[=:][ \t]*\S+/gi,
      '$1=[REDACTED]'
    )
    .trim()
}
