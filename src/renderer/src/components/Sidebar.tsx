import { useEffect, useState } from 'react'
import { Folder, MessageSquare, Sparkles, Server, Settings, Boxes } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useI18n } from '../I18nContext'
import styles from './Sidebar.module.css'

export type ViewId = 'projects' | 'sessions' | 'skills' | 'mcp' | 'settings'

interface NavItem {
  id: ViewId
  labelKey: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { id: 'projects', labelKey: 'nav.projects', icon: Folder },
  { id: 'sessions', labelKey: 'nav.sessions', icon: MessageSquare },
  { id: 'skills', labelKey: 'nav.skills', icon: Sparkles },
  { id: 'mcp', labelKey: 'nav.mcp', icon: Server },
  { id: 'settings', labelKey: 'nav.settings', icon: Settings }
]

interface SidebarProps {
  active: ViewId
  onSelect: (id: ViewId) => void
}

export default function Sidebar({ active, onSelect }: SidebarProps) {
  const { t } = useI18n()
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.api
      .getAppInfo()
      .then((info) => setVersion(info.version))
      .catch(() => {
        /* 主进程不可用时不阻塞界面 */
      })
  }, [])

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <Boxes size={18} className={styles.brandIcon} />
        <div className={styles.brandText}>
          <span className={styles.brandName}>Workbench</span>
          <span className={styles.brandSub}>Claude Code</span>
        </div>
      </div>

      <nav className={styles.nav}>
        {NAV_ITEMS.map(({ id, labelKey, icon: Icon }) => {
          const isActive = id === active
          return (
            <button
              key={id}
              type="button"
              className={isActive ? `${styles.item} ${styles.itemActive}` : styles.item}
              onClick={() => onSelect(id)}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={16} strokeWidth={1.75} />
              <span>{t(labelKey)}</span>
            </button>
          )
        })}
      </nav>

      <div className={styles.footer}>
        {version ? <span className={styles.version}>v{version}</span> : null}
      </div>
    </aside>
  )
}
