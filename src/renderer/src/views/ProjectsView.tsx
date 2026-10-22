import { useCallback, useEffect, useState } from 'react'
import { FolderPlus, Play, Folder, GitBranch, RefreshCw } from 'lucide-react'
import type { Project, GitStatus } from '../types'
import { useI18n } from '../I18nContext'
import Button from '../components/ui/Button'
import ConfirmDialog from '../components/ConfirmDialog'
import DeleteProjectDialog from '../components/DeleteProjectDialog'
import GitHistoryPanel from '../components/GitHistoryPanel'
import styles from './ProjectsView.module.css'

interface ProjectsViewProps {
  onStart: (project: Project) => void
}

export default function ProjectsView({ onStart }: ProjectsViewProps) {
  const { t } = useI18n()
  const [projects, setProjects] = useState<Project[]>([])
  const [selected, setSelected] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null)
  const [gitLoading, setGitLoading] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<Project | null>(null)
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<Project | null>(null)
  const [deleteFolderDirty, setDeleteFolderDirty] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    window.api
      .listProjects()
      .then((list) => {
        setProjects(list)
        setError('')
      })
      .catch(() => setError(t('projects.loadError')))
      .finally(() => setLoading(false))
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  const loadGit = useCallback(async (path: string) => {
    setGitLoading(true)
    try {
      setGitStatus(await window.api.getGitStatus(path))
    } catch {
      setGitStatus({ isRepo: false, branch: null, changed: 0, untracked: 0, error: 'error' })
    } finally {
      setGitLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selected) loadGit(selected.path)
    else setGitStatus(null)
  }, [selected, loadGit])

  async function addProject() {
    const dir = await window.api.selectDirectory()
    if (!dir) return
    const name = dir.split(/[\\/]/).filter(Boolean).pop() ?? dir
    try {
      const project = await window.api.addProject(name, dir)
      setProjects((prev) => (prev.some((p) => p.id === project.id) ? prev : [...prev, project]))
      setSelected(project)
    } catch {
      setError(t('projects.addError'))
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return
    try {
      await window.api.removeProject(removeTarget.id)
      setRemoveTarget(null)
      setSelected(null)
      load()
    } catch {
      setError(t('projects.removeFailed'))
      setRemoveTarget(null)
    }
  }

  async function openDeleteFolder() {
    if (!selected) return
    try {
      const status = await window.api.getGitStatus(selected.path)
      setDeleteFolderDirty(status.isRepo && (status.changed > 0 || status.untracked > 0))
    } catch {
      setDeleteFolderDirty(false)
    }
    setDeleteFolderTarget(selected)
  }

  async function confirmDeleteFolder() {
    if (!deleteFolderTarget) return
    try {
      await window.api.deleteProjectFolder(deleteFolderTarget.id)
      setDeleteFolderTarget(null)
      setSelected(null)
      load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setError(`${t('projects.deleteFailed')}${msg ? `: ${msg}` : ''}`)
      setDeleteFolderTarget(null)
    }
  }

  function renderGitStatus() {
    if (!selected) return null
    if (gitLoading && !gitStatus) {
      return (
        <div className={styles.gitPanel}>
          <span className={styles.gitMuted}>{t('projects.gitLoading')}</span>
        </div>
      )
    }
    if (!gitStatus) return null

    return (
      <div className={styles.gitPanel}>
        <div className={styles.gitHeader}>
          <GitBranch size={15} />
          <span className={styles.gitTitle}>{t('projects.gitTitle')}</span>
          <button
            type="button"
            className={styles.gitRefresh}
            onClick={() => loadGit(selected.path)}
            disabled={gitLoading}
            title={t('common.refresh')}
          >
            <RefreshCw size={13} />
          </button>
        </div>
        {gitStatus.error ? (
          <span className={styles.gitError}>{gitStatus.error}</span>
        ) : !gitStatus.isRepo ? (
          <span className={styles.gitMuted}>{t('projects.gitNotRepo')}</span>
        ) : (
          <div className={styles.gitInfo}>
            <span className={styles.gitBranch}>{gitStatus.branch ?? t('projects.gitNoBranch')}</span>
            <span className={styles.gitMuted}>
              {t('projects.gitChanged', { changed: gitStatus.changed, untracked: gitStatus.untracked })}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={styles.view}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('nav.projects')}</h1>
        <p className={styles.subtitle}>{t('projects.subtitle')}</p>
      </header>

      <div className={styles.toolbar}>
        <Button variant="primary" onClick={addProject}>
          <FolderPlus size={15} />
          {t('projects.add')}
        </Button>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      {loading ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>{t('common.loading')}</p>
        </div>
      ) : projects.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>{t('projects.emptyTitle')}</div>
          <p className={styles.emptyText}>{t('projects.emptyDesc')}</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {projects.map((p) => {
            const isSelected = selected?.id === p.id
            return (
              <li
                key={p.id}
                className={isSelected ? `${styles.item} ${styles.itemSelected}` : styles.item}
                onClick={() => setSelected(p)}
              >
                <Folder size={16} className={styles.itemIcon} />
                <div className={styles.itemInfo}>
                  <span className={styles.itemName}>{p.name}</span>
                  <span className={styles.itemPath}>{p.path}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {selected ? (
        <div className={styles.launch}>
          {renderGitStatus()}
          {gitStatus?.isRepo ? (
            <GitHistoryPanel projectPath={selected.path} onSwitchSuccess={() => loadGit(selected.path)} />
          ) : null}
          <Button variant="primary" onClick={() => onStart(selected)}>
            <Play size={15} />
            {t('projects.start')}
          </Button>
          <div className={styles.dangerActions}>
            <button type="button" className={styles.removeBtn} onClick={() => setRemoveTarget(selected)}>
              {t('projects.removeTitle')}
            </button>
            <button type="button" className={styles.deleteFolderBtn} onClick={openDeleteFolder}>
              {t('projects.deleteFolderTitle')}
            </button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={removeTarget !== null}
        title={t('projects.removeTitle')}
        description={t('projects.removeDesc')}
        confirmLabel={t('projects.removeConfirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />

      <DeleteProjectDialog
        open={deleteFolderTarget !== null}
        title={t('projects.deleteFolderTitle')}
        projectName={deleteFolderTarget?.name ?? ''}
        projectPath={deleteFolderTarget?.path ?? ''}
        gitDirty={deleteFolderDirty}
        warningText={t('projects.deleteFolderWarning')}
        pathLabel={t('projects.deleteFolderPath')}
        gitDirtyText={t('projects.deleteFolderGitDirty')}
        placeholder={t('projects.deleteFolderPlaceholder')}
        confirmLabel={t('projects.deleteFolderConfirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmDeleteFolder}
        onCancel={() => setDeleteFolderTarget(null)}
      />
    </div>
  )
}
