import { useCallback, useEffect, useState } from 'react'
import { MessageSquare, Trash2 } from 'lucide-react'
import type { SessionInfo } from '../types'
import { useI18n } from '../I18nContext'
import ConfirmDialog from '../components/ConfirmDialog'
import SessionHistoryView from '../components/SessionHistoryView'
import styles from './SessionsView.module.css'

interface SessionsViewProps {
  onResume: (session: SessionInfo) => void
}

export default function SessionsView({ onResume }: SessionsViewProps) {
  const { t } = useI18n()
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<SessionInfo | null>(null)
  const [error, setError] = useState('')
  const [viewing, setViewing] = useState<SessionInfo | null>(null)

  const load = useCallback(() => {
    window.api
      .listSessions()
      .then((list) => {
        setSessions(list)
        setError('')
      })
      .catch(() => setError(t('sessions.loadError')))
      .finally(() => setLoading(false))
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await window.api.deleteSession(deleteTarget.id)
      setDeleteTarget(null)
      load()
    } catch {
      setError(t('sessions.deleteFailed'))
      setDeleteTarget(null)
    }
  }

  if (viewing) {
    return (
      <SessionHistoryView
        session={viewing}
        onBack={() => setViewing(null)}
        onResume={() => onResume(viewing)}
      />
    )
  }

  return (
    <div className={styles.view}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('nav.sessions')}</h1>
        <p className={styles.subtitle}>{t('sessions.subtitle')}</p>
      </header>

      {error ? <div className={styles.error}>{error}</div> : null}

      {loading ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>{t('common.loading')}</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>{t('sessions.emptyTitle')}</div>
          <p className={styles.emptyText}>{t('sessions.emptyDesc')}</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {sessions.map((s) => {
            return (
              <li key={s.id} className={styles.item} onClick={() => setViewing(s)}>
                <MessageSquare size={16} className={styles.itemIcon} />
                <div className={styles.itemInfo}>
                  <span className={styles.itemTitle}>{s.title ?? t('sessions.untitled')}</span>
                  <span className={styles.itemMeta}>
                    {s.projectName ?? t('sessions.deletedProject')} · {s.updatedAt}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.deleteBtn}
                  title={t('sessions.deleteTitle')}
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteTarget(s)
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('sessions.deleteTitle')}
        description={
          deleteTarget
            ? `${deleteTarget.title ?? t('sessions.untitled')}\n${deleteTarget.projectName ?? t('sessions.deletedProject')}\n${deleteTarget.sessionId}`
            : ''
        }
        confirmLabel={t('sessions.deleteConfirm')}
        cancelLabel={t('common.cancel')}
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
