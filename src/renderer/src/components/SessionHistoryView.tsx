import { useEffect, useState } from 'react'
import { ArrowLeft, Play } from 'lucide-react'
import type { SessionInfo, HistoryMessage } from '../types'
import { useI18n } from '../I18nContext'
import styles from './SessionHistoryView.module.css'

interface SessionHistoryViewProps {
  session: SessionInfo
  onBack: () => void
  onResume: () => void
}

export default function SessionHistoryView({ session, onBack, onResume }: SessionHistoryViewProps) {
  const { t } = useI18n()
  const [messages, setMessages] = useState<HistoryMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session.projectPath) {
      setLoading(false)
      setError(t('history.missingFile'))
      return
    }
    window.api
      .getSessionHistory(session.projectPath, session.sessionId)
      .then(setMessages)
      .catch(() => setError(t('history.loadError')))
      .finally(() => setLoading(false))
  }, [session, t])

  function formatTime(ts: string | null): string {
    if (!ts) return ''
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString()
  }

  const canResume = session.projectPath !== null

  return (
    <div className={styles.view}>
      <header className={styles.header}>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          <ArrowLeft size={15} />
          {t('history.back')}
        </button>
        <div className={styles.headerInfo}>
          <span className={styles.title}>{session.title ?? t('sessions.untitled')}</span>
          <span className={styles.badge}>{t('history.title')}</span>
        </div>
        <button type="button" className={styles.resumeBtn} onClick={onResume} disabled={!canResume}>
          <Play size={15} />
          {canResume ? t('history.resume') : t('history.resumeUnavailable')}
        </button>
      </header>

      <div className={styles.messages}>
        {loading ? (
          <div className={styles.empty}>{t('common.loading')}</div>
        ) : error ? (
          <div className={styles.empty}>{error}</div>
        ) : messages.length === 0 ? (
          <div className={styles.empty}>{t('history.empty')}</div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? styles.userRow : styles.assistantRow}>
              <div className={m.role === 'user' ? styles.userBubble : styles.assistantBubble}>
                <div className={styles.msgText}>{m.text}</div>
                {m.timestamp ? <div className={styles.msgTime}>{formatTime(m.timestamp)}</div> : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
