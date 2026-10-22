import { useCallback, useEffect, useRef, useState } from 'react'
import { User, Boxes } from 'lucide-react'
import type { SessionEvent } from '../types'
import { useI18n } from '../I18nContext'
import styles from './ChatView.module.css'

type Status = 'connecting' | 'ready' | 'busy' | 'ended'

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
  const sessionIdRef = useRef<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const append = useCallback((m: ChatMessage) => setMessages((prev) => [...prev, m]), [])

  const patchTool = useCallback((toolId: string, patch: Partial<Extract<ChatMessage, { kind: 'tool' }>>) => {
    setMessages((prev) =>
      prev.map((m) => (m.kind === 'tool' && m.toolId === toolId ? { ...m, ...patch } : m))
    )
  }, [])

  useEffect(() => {
    const unsubscribe = window.api.claude.onEvent((ev: SessionEvent) => {
      switch (ev.type) {
        case 'init':
          setStatus('ready')
          append({ kind: 'system', text: t('chat.model', { model: ev.model }) })
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
          setStatus('ended')
          append({ kind: 'system', text: t('chat.sessionEnded') })
          break
      }
    })

    window.api.claude
      .start({ cwd: projectPath, projectId, resumeSessionId })
      .then(({ sessionId }) => {
        setSessionId(sessionId)
        sessionIdRef.current = sessionId
        setStatus('ready')
      })
      .catch((err: Error) => {
        setStatus('ended')
        append({ kind: 'error', text: t('chat.startFailed', { msg: err.message }) })
      })

    return () => {
      unsubscribe()
      if (sessionIdRef.current) window.api.claude.stop(sessionIdRef.current)
    }
  }, [projectPath, projectId, resumeSessionId, append, patchTool, t])

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

  function stop() {
    if (!sessionIdRef.current) return
    window.api.claude.stop(sessionIdRef.current)
  }

  function exit() {
    if (sessionIdRef.current) window.api.claude.stop(sessionIdRef.current)
    onExit()
  }

  const canSend = status === 'ready' && input.trim().length > 0

  const statusText =
    status === 'connecting'
      ? t('chat.statusConnecting')
      : status === 'busy'
        ? t('chat.statusBusy')
        : status === 'ended'
          ? t('chat.statusEnded')
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
          <button type="button" className={styles.ghostBtn} onClick={stop} disabled={status !== 'busy' && status !== 'ready'}>
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
