/**
 * 规范化的会话事件(主进程 → 渲染进程)。
 * 主进程把 Claude Code 的原始 stream-json 事件解析并归一化为以下结构,
 * 渲染进程无需理解底层协议。
 */
export type SessionEvent =
  | {
      type: 'init'
      sessionId: string
      cwd: string
      model: string
      tools: string[]
      permissionMode: string
    }
  | { type: 'assistant_text'; sessionId: string; text: string }
  | { type: 'tool_use'; sessionId: string; toolId: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; sessionId: string; toolId: string; isError: boolean; content: string }
  | { type: 'result'; sessionId: string; stopReason: string; costUsd: number }
  | { type: 'exited'; sessionId: string; code: number | null; error?: string }
