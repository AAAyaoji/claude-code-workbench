import { useCallback, useEffect, useRef, useState } from 'react'
import { User, Boxes } from 'lucide-react'
import type { SessionEvent } from '../types'
import { useI18n } from '../I18nContext'
import styles from './ChatView.module.css'

type Status = 'connecting' | 'ready' | 'busy' | 'stopped' | 'ended' | 'failed'

type ChatMessage =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | {
      kind: 'tool'
      toolId: string
      name: string
      input: string
      status: 'running' | 'done' | 'error'
      result?: string
    }
  | { kind: 'system'; text: string }
  | { kind: 'error'; text: string }

interface ChatViewProps {
  projectName: string
  projectPath: string
  projectId?: number
  resumeSessionId?: string
  avatarUser: string | null
  avatarClaude: string | null
  onExit: () => void
}

export default function ChatView({
  projectName,
  projectPath,
  projectId,
  resumeSessionId,
  avatarUser,
  avatarClaude,
  onExit
}: ChatViewProps) {
  const { t } = useI18n()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('connecting')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')

  // 当前会话身份:恢复会话在挂载时即已知;新建会话等 start 返回后再填入。
  // 事件监听据此过滤,避免旧进程事件串到新会话。
  const sessionIdRef = useRef<string | null>(resumeSessionId ?? null)
  const stoppedByUserRef = useRef(false)
  const endedRef = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // 始终指向最新的翻译函数,避免把 t 放进 effect 依赖导致语言切换重启会话。
  const tRef = useRef(t)
  tRef.current = t

  const append = useCallback((m: ChatMessage) => setMessages((prev) => [...prev, m]), [])

  const patchTool = useCallback(
    (toolId: string, patch: Partial<Extract<ChatMessage, { kind: 'tool' }>>) => {
      setMessages((prev) =>
        prev.map((m) => (m.kind === 'tool' && m.toolId === toolId ? { ...m, ...patch } : m))
      )
    },
    []
  )

  useEffect(() => {
    let cancelled = false

    const handleEvent = (ev: SessionEvent): void => {
      switch (ev.type) {
        case 'init':
          // init 只补充模型信息,不改动 busy/ready 状态(避免发送后状态被错误重置为就绪)
          append({ kind: 'system', text: tRef.current('chat.model', { model: ev.model }) })
          break
        case 'assistant_text':
          append({ kind: 'assistant', text: ev.text })
          break
        case 'tool_use':
          append({
            kind: 'tool',
            toolId: ev.toolId,
            name: ev.name,
            input: JSON.stringify(ev.input),
            status: 'running'
          })
          break
        case 'tool_result':
          patchTool(ev.toolId, {
            status: ev.isError ? 'error' : 'done',
            result: ev.content
          })
          break
        case 'result':
          setStatus('ready')
          break
        case 'exited':
          if (stoppedByUserRef.current) {
            // 用户主动终止
            setStatus('stopped')
            append({ kind: 'system', text: tRef.current('chat.stoppedHint') })
          } else if (ev.code === 0) {
            // 正常结束
            setStatus('ended')
            append({ kind: 'system', text: tRef.current('chat.sessionEnded') })
          } else {
            // 异常退出 / 恢复失败:给出真实(已脱敏)原因,未知则明示
            setStatus('failed')
            const detail = ev.error?.trim() || tRef.current('chat.unknownError')
            const text = resumeSessionId
              ? tRef.current('chat.resumeFailed', { msg: detail })
              : tRef.current('chat.sessionCrashed', { msg: detail })
            append({ kind: 'error', text })
          }
          break
      }
    }

    const unsubscribe = window.api.claude.onEvent((ev: SessionEvent) => {
      if (cancelled) return
      const current = sessionIdRef.current
      // 只有当前会话身份已确定、且事件确实属于当前会话时才处理
      if (!current || ev.sessionId !== current) return
      handleEvent(ev)
    })

    // 恢复会话:加载原始 JSONL 历史,作为消息前缀展示
    if (resumeSessionId) {
      window.api
        .getSessionHistory(projectPath, resumeSessionId)
        .then((history) => {
          if (cancelled || history.length === 0) return
          const historyMsgs: ChatMessage[] = history.map((h) => ({
            kind: h.role === 'user' ? 'user' : 'assistant',
            text: h.text
          }))
          // 历史放前面,不覆盖可能已到达的实时消息,避免顺序错乱
          setMessages((prev) => [...historyMsgs, ...prev])
        })
        .catch(() => {
          // 历史加载失败不阻塞启动;恢复失败由 CLI 退出事件另行暴露
        })
    }

    window.api.claude
      .start({ cwd: projectPath, projectId, resumeSessionId })
      .then(({ sessionId: sid }) => {
        if (cancelled) return
        sessionIdRef.current = sid
        setSessionId(sid)
        // 启动期间用户已退出:立即停止刚启动的进程,避免孤儿进程
        if (endedRef.current) {
          window.api.claude.stop(sid).catch(() => {})
          return
        }
        setStatus('ready')
      })
      .catch((err: Error) => {
        if (cancelled) return
        setStatus('failed')
        const text = resumeSessionId
          ? tRef.current('chat.resumeFailed', { msg: err.message })
          : tRef.current('chat.startFailed', { msg: err.message })
        append({ kind: 'error', text })
      })

    return () => {
      cancelled = true
      unsubscribe()
      // 主动退出走 claude:end(优雅);切换会话 / 应用关闭等场景在此兜底停止进程。
      if (!endedRef.current && sessionIdRef.current) {
        window.api.claude.stop(sessionIdRef.current).catch(() => {})
      }
    }
  }, [projectPath, projectId, resumeSessionId, append, patchTool])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function send() {
    const text = input.trim()
    if (!text || !sessionIdRef.current || status !== 'ready') return
    append({ kind: 'user', text })
    setInput('')
    setStatus('busy')
    window.api.claude.send(sessionIdRef.current, text).catch((err: Error) => {
      append({ kind: 'error', text: t('chat.sendFailed', { msg: err.message }) })
      setStatus('ready')
    })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  // 中断:停止当前回合,保留 CLI 进程与会话,之后可继续发送消息
  function stop() {
    const sid = sessionIdRef.current
    if (!sid) return
    append({ kind: 'system', text: t('chat.interrupting') })
    window.api.claude.interrupt(sid).catch(() => {
      // interrupt 不可用(旧 CLI 或会话已不存在)时回退为终止进程
      stoppedByUserRef.current = true
      window.api.claude.stop(sid).catch(() => {})
    })
  }

  // 退出会话:优雅关闭当前 CLI 进程,保留历史与恢复能力
  function exit() {
    endedRef.current = true
    if (sessionIdRef.current) {
      window.api.claude.end(sessionIdRef.current).catch(() => {})
    }
    onExit()
  }

  const canSend = status === 'ready' && input.trim().length > 0

  const statusText =
    status === 'connecting'
      ? t('chat.statusConnecting')
      : status === 'busy'
        ? t('chat.statusBusy')
        : status === 'stopped'
          ? t('chat.statusStopped')
          : status === 'ended'
            ? t('chat.statusEnded')
            : status === 'failed'
              ? t('chat.statusFailed')
              : t('chat.statusReady')

  return (
    <div className={styles.chat}>
      <header className={styles.header}>
        <div className={styles.headerInfo}>
          <span className={styles.projectName}>{projectName}</span>
          <span className={styles.statusBadge} data-status={status}>
            {statusText}
          </span>
          {sessionId ? <span className={styles.sessionId}>{sessionId}</span> : null}
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={stop}
            disabled={status !== 'busy'}
          >
            {t('chat.stop')}
          </button>
          <button type="button" className={styles.ghostBtn} onClick={exit}>
            {t('chat.exit')}
          </button>
        </div>
      </header>

      <div className={styles.messages}>
        {messages.map((m, i) => {
          if (m.kind === 'user') {
            return (
              <div key={i} className={styles.userRow}>
                <div className={styles.userBubble}>{m.text}</div>
                {avatarUser ? (
                  <img className={styles.avatar} src={avatarUser} alt="user" />
                ) : (
                  <User size={18} className={styles.avatarDefault} />
                )}
              </div>
            )
          }
          if (m.kind === 'assistant') {
            return (
              <div key={i} className={styles.assistantRow}>
                {avatarClaude ? (
                  <img className={styles.avatar} src={avatarClaude} alt="claude" />
                ) : (
                  <Boxes size={18} className={styles.avatarDefault} />
                )}
                <div className={styles.assistantBubble}>{m.text}</div>
              </div>
            )
          }
          if (m.kind === 'tool') {
            return (
              <div key={i} className={styles.toolRow}>
                <div className={styles.toolCard} data-status={m.status}>
                  <div className={styles.toolHead}>
                    <span className={styles.toolName}>{m.name}</span>
                    <span className={styles.toolStatus}>
                      {m.status === 'running'
                        ? t('chat.toolRunning')
                        : m.status === 'error'
                          ? t('chat.toolError')
                          : t('chat.toolDone')}
                    </span>
                  </div>
                  <code className={styles.toolInput}>{m.input}</code>
                  {m.result ? <pre className={styles.toolResult}>{m.result}</pre> : null}
                </div>
              </div>
            )
          }
          if (m.kind === 'error') {
            return (
              <div key={i} className={styles.errorRow}>
                {m.text}
              </div>
            )
          }
          return (
            <div key={i} className={styles.systemRow}>
              {m.text}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <footer className={styles.composer}>
        <textarea
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={status === 'connecting' ? t('chat.connecting') : t('chat.placeholder')}
          rows={2}
        />
        <button type="button" className={styles.sendBtn} onClick={send} disabled={!canSend}>
          {t('chat.send')}
        </button>
      </footer>
    </div>
  )
}
