import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Server } from 'lucide-react'
import type { McpServerInfo } from '../types'
import { useI18n } from '../I18nContext'
import Button from '../components/ui/Button'
import styles from './McpView.module.css'

export default function McpView() {
  const { t } = useI18n()
  const [servers, setServers] = useState<McpServerInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    window.api
      .listMcpServers()
      .then(setServers)
      .catch(() => setError(t('mcp.loadError')))
      .finally(() => setLoading(false))
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className={styles.view}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('nav.mcp')}</h1>
        <p className={styles.subtitle}>{t('mcp.subtitle')}</p>
      </header>

      <div className={styles.toolbar}>
        <Button variant="secondary" onClick={load} disabled={loading}>
          <RefreshCw size={15} />
          {t('common.refresh')}
        </Button>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      {loading ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>{t('common.loading')}</p>
        </div>
      ) : servers.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>{t('mcp.emptyTitle')}</div>
          <p className={styles.emptyText}>{t('mcp.emptyDesc')}</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {servers.map((s, i) => (
            <li key={`${s.scope}-${s.name}-${i}`} className={styles.item}>
              <div className={styles.itemIcon}>
                <Server size={16} />
              </div>
              <div className={styles.itemInfo}>
                <div className={styles.itemHead}>
                  <span className={styles.itemName}>{s.name}</span>
                  <span className={styles.badgeScope} data-scope={s.scope}>
                    {s.scope === 'global'
                      ? t('mcp.scopeGlobal')
                      : t('mcp.scopeProject', { name: s.projectName ?? '' })}
                  </span>
                  <span className={styles.badgeTransport}>{s.transport}</span>
                  <span className={styles.badgeStatus}>{t('mcp.statusUnknown')}</span>
                </div>
                {s.command ? (
                  <code className={styles.itemCmd}>command: {s.command}</code>
                ) : s.url ? (
                  <code className={styles.itemCmd}>url: {s.url}</code>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
