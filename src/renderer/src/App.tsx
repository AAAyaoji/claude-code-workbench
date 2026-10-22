import { useEffect, useMemo, useState } from 'react'
import Sidebar, { type ViewId } from './components/Sidebar'
import ProjectsView from './views/ProjectsView'
import SessionsView from './views/SessionsView'
import SkillsView from './views/SkillsView'
import McpView from './views/McpView'
import SettingsView from './views/SettingsView'
import ChatView from './views/ChatView'
import { I18nContext, type Lang } from './I18nContext'
import { translate } from './i18n'
import type { Project, SessionInfo, AvatarKind } from './types'
import styles from './App.module.css'

interface ChatTarget {
  projectName: string
  projectPath: string
  projectId?: number
  resumeSessionId?: string
}

export default function App() {
  const [view, setView] = useState<ViewId>('projects')
  const [chatTarget, setChatTarget] = useState<ChatTarget | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [lang, setLang] = useState<Lang>('zh')
  const [avatarUser, setAvatarUser] = useState<string | null>(null)
  const [avatarClaude, setAvatarClaude] = useState<string | null>(null)
  const [minimizeToTray, setMinimizeToTray] = useState(true)

  useEffect(() => {
    window.api
      .getSetting('theme')
      .then((v) => {
        const t = v === 'light' ? 'light' : 'dark'
        setTheme(t)
        applyTheme(t)
      })
      .catch(() => {})

    window.api
      .getSetting('language')
      .then((v) => {
        setLang(v === 'en' ? 'en' : 'zh')
      })
      .catch(() => {})

    window.api.avatar.get('user').then(setAvatarUser).catch(() => {})
    window.api.avatar.get('claude').then(setAvatarClaude).catch(() => {})

    window.api
      .getSetting('minimizeToTray')
      .then((v) => setMinimizeToTray(v !== 'false'))
      .catch(() => {})
  }, [])

  const i18nValue = useMemo(
    () => ({ lang, t: (key: string, params?: Record<string, string | number>) => translate(lang, key, params) }),
    [lang]
  )

  function applyTheme(t: 'dark' | 'light') {
    if (t === 'light') {
      document.documentElement.setAttribute('data-theme', 'light')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }

  function handleThemeChange(t: 'dark' | 'light') {
    setTheme(t)
    applyTheme(t)
    window.api.setSetting('theme', t)
  }

  function handleLanguageChange(l: Lang) {
    setLang(l)
    window.api.setSetting('language', l)
  }

  async function handleAvatarChange(kind: AvatarKind) {
    const path = await window.api.avatar.select()
    if (!path) return
    try {
      const dataUrl = await window.api.avatar.set(kind, path)
      if (kind === 'user') setAvatarUser(dataUrl)
      else setAvatarClaude(dataUrl)
    } catch {
      // 失败时保留原头像,静默(可在 Settings 页提示,Stage 1 先保持简单)
    }
  }

  async function handleAvatarReset(kind: AvatarKind) {
    await window.api.avatar.reset(kind)
    if (kind === 'user') setAvatarUser(null)
    else setAvatarClaude(null)
  }

  function handleMinimizeToTrayChange(v: boolean) {
    setMinimizeToTray(v)
    window.api.setSetting('minimizeToTray', v ? 'true' : 'false')
  }

  function startProject(project: Project) {
    setChatTarget({
      projectName: project.name,
      projectPath: project.path,
      projectId: project.id
    })
  }

  function resumeSession(session: SessionInfo) {
    if (!session.projectPath) return
    setChatTarget({
      projectName:
        session.projectName ?? session.projectPath.split(/[\\/]/).filter(Boolean).pop() ?? '会话',
      projectPath: session.projectPath,
      projectId: session.projectId ?? undefined,
      resumeSessionId: session.sessionId
    })
  }

  function renderView() {
    switch (view) {
      case 'projects':
        return <ProjectsView onStart={startProject} />
      case 'sessions':
        return <SessionsView onResume={resumeSession} />
      case 'skills':
        return <SkillsView />
      case 'mcp':
        return <McpView />
      case 'settings':
        return (
          <SettingsView
            theme={theme}
            onThemeChange={handleThemeChange}
            lang={lang}
            onLanguageChange={handleLanguageChange}
            minimizeToTray={minimizeToTray}
            onMinimizeToTrayChange={handleMinimizeToTrayChange}
            avatarUser={avatarUser}
            avatarClaude={avatarClaude}
            onAvatarChange={handleAvatarChange}
            onAvatarReset={handleAvatarReset}
          />
        )
    }
  }

  function handleSelect(id: ViewId) {
    setChatTarget(null)
    setView(id)
  }

  return (
    <I18nContext.Provider value={i18nValue}>
      <div className={styles.app}>
        <Sidebar active={view} onSelect={handleSelect} />
        <main className={styles.content}>
          {chatTarget ? (
            <ChatView
              projectName={chatTarget.projectName}
              projectPath={chatTarget.projectPath}
              projectId={chatTarget.projectId}
              resumeSessionId={chatTarget.resumeSessionId}
              avatarUser={avatarUser}
              avatarClaude={avatarClaude}
              onExit={() => setChatTarget(null)}
            />
          ) : (
            renderView()
          )}
        </main>
      </div>
    </I18nContext.Provider>
  )
}
