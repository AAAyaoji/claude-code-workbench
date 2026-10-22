import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Globe, Folder, Puzzle, Lock } from 'lucide-react'
import type { SkillInfo } from '../types'
import { useI18n } from '../I18nContext'
import Button from '../components/ui/Button'
import styles from './SkillsView.module.css'

export default function SkillsView() {
  const { t } = useI18n()
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    window.api
      .listSkills()
      .then(setSkills)
      .catch(() => setError(t('skills.loadError')))
      .finally(() => setLoading(false))
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  function sourceLabel(source: string): string {
    if (source === 'cli') return t('skills.sourceCli')
    if (source === 'local') return t('skills.sourceLocal')
    return t('skills.sourcePlugin')
  }

  return (
    <div className={styles.view}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('nav.skills')}</h1>
        <p className={styles.subtitle}>{t('skills.subtitle')}</p>
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
      ) : skills.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>{t('skills.emptyTitle')}</div>
          <p className={styles.emptyText}>{t('skills.emptyDesc')}</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {skills.map((s, i) => {
            const Icon = s.scope === 'global' ? Globe : s.scope === 'project' ? Folder : Puzzle
            const scopeLabel =
              s.scope === 'global'
                ? t('skills.scopeGlobal')
                : s.scope === 'project'
                  ? t('skills.scopeProject', { name: s.projectName ?? '' })
                  : t('skills.scopePlugin', { name: s.pluginName ?? '' })
            return (
              <li key={`${s.scope}-${s.path}-${i}`} className={styles.item}>
                <div className={styles.itemIcon}>
                  <Icon size={16} />
                </div>
                <div className={styles.itemInfo}>
                  <div className={styles.itemHead}>
                    <span className={styles.itemName}>{s.name}</span>
                    <span className={styles.badgeScope} data-scope={s.scope}>
                      {scopeLabel}
                    </span>
                    {s.locked ? (
                      <span className={styles.badgeLocked}>
                        <Lock size={11} />
                        {t('skills.lockedByPlugin')}
                      </span>
                    ) : null}
                    <span className={styles.badgeSource}>{sourceLabel(s.source)}</span>
                  </div>
                  <p className={styles.itemDesc}>{s.description || t('skills.noDesc')}</p>
                  <span className={styles.itemPath}>{s.path}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
