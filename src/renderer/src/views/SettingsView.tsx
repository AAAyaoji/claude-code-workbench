import { useEffect, useState } from 'react'
import { Moon, Sun, User, Boxes } from 'lucide-react'
import { useI18n, type Lang } from '../I18nContext'
import type { AvatarKind } from '../types'
import styles from './SettingsView.module.css'

interface SettingsViewProps {
  theme: 'dark' | 'light'
  onThemeChange: (theme: 'dark' | 'light') => void
  lang: Lang
  onLanguageChange: (lang: Lang) => void
  minimizeToTray: boolean
  onMinimizeToTrayChange: (value: boolean) => void
  avatarUser: string | null
  avatarClaude: string | null
  onAvatarChange: (kind: AvatarKind) => void
  onAvatarReset: (kind: AvatarKind) => void
}

interface AboutInfo {
  version: string
  platform: string
}

export default function SettingsView({
  theme,
  onThemeChange,
  lang,
  onLanguageChange,
  minimizeToTray,
  onMinimizeToTrayChange,
  avatarUser,
  avatarClaude,
  onAvatarChange,
  onAvatarReset
}: SettingsViewProps) {
  const { t } = useI18n()
  const [info, setInfo] = useState<AboutInfo | null>(null)

  useEffect(() => {
    window.api
      .getAppInfo()
      .then(setInfo)
      .catch(() => {})
  }, [])

  return (
    <div className={styles.view}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('nav.settings')}</h1>
        <p className={styles.subtitle}>{t('settings.subtitle')}</p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('settings.theme')}</h2>
        <div className={styles.optionRow}>
          <button
            type="button"
            className={theme === 'dark' ? `${styles.optionBtn} ${styles.optionBtnActive}` : styles.optionBtn}
            onClick={() => onThemeChange('dark')}
          >
            <Moon size={15} />
            {t('settings.themeDark')}
          </button>
          <button
            type="button"
            className={theme === 'light' ? `${styles.optionBtn} ${styles.optionBtnActive}` : styles.optionBtn}
            onClick={() => onThemeChange('light')}
          >
            <Sun size={15} />
            {t('settings.themeLight')}
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('settings.language')}</h2>
        <div className={styles.optionRow}>
          <button
            type="button"
            className={lang === 'zh' ? `${styles.optionBtn} ${styles.optionBtnActive}` : styles.optionBtn}
            onClick={() => onLanguageChange('zh')}
          >
            {t('settings.languageZh')}
          </button>
          <button
            type="button"
            className={lang === 'en' ? `${styles.optionBtn} ${styles.optionBtnActive}` : styles.optionBtn}
            onClick={() => onLanguageChange('en')}
          >
            {t('settings.languageEn')}
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('settings.behavior')}</h2>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={minimizeToTray}
            onChange={(e) => onMinimizeToTrayChange(e.target.checked)}
          />
          <span>{t('settings.minimizeToTray')}</span>
        </label>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Avatar</h2>
        <div className={styles.avatarRow}>
          <div className={styles.avatarItem}>
            <div className={styles.avatarPreview}>
              {avatarUser ? (
                <img className={styles.avatarImg} src={avatarUser} alt="user avatar" />
              ) : (
                <User size={28} className={styles.avatarDefault} />
              )}
            </div>
            <span className={styles.avatarLabel}>{t('settings.avatarUser')}</span>
            <div className={styles.avatarActions}>
              <button type="button" className={styles.smallBtn} onClick={() => onAvatarChange('user')}>
                {t('settings.avatarChange')}
              </button>
              <button type="button" className={styles.smallBtn} onClick={() => onAvatarReset('user')}>
                {t('settings.avatarReset')}
              </button>
            </div>
          </div>

          <div className={styles.avatarItem}>
            <div className={styles.avatarPreview}>
              {avatarClaude ? (
                <img className={styles.avatarImg} src={avatarClaude} alt="claude avatar" />
              ) : (
                <Boxes size={28} className={styles.avatarDefault} />
              )}
            </div>
            <span className={styles.avatarLabel}>{t('settings.avatarClaude')}</span>
            <div className={styles.avatarActions}>
              <button type="button" className={styles.smallBtn} onClick={() => onAvatarChange('claude')}>
                {t('settings.avatarChange')}
              </button>
              <button type="button" className={styles.smallBtn} onClick={() => onAvatarReset('claude')}>
                {t('settings.avatarReset')}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('settings.about')}</h2>
        <p className={styles.aboutText}>
          {t('settings.version')} {info ? `v${info.version}` : '…'}
          <br />
          {t('settings.platform')} {info ? info.platform : '…'}
        </p>
      </section>
    </div>
  )
}
