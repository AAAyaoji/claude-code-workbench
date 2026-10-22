import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, History } from 'lucide-react'
import type { GitCommit, GitFileChange } from '../types'
import { useI18n } from '../I18nContext'
import ConfirmDialog from './ConfirmDialog'
import styles from './GitHistoryPanel.module.css'

interface GitHistoryPanelProps {
  projectPath: string
  onSwitchSuccess: () => void
}

export default function GitHistoryPanel({ projectPath, onSwitchSuccess }: GitHistoryPanelProps) {
  const { t } = useI18n()
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [selectedCommit, setSelectedCommit] = useState<GitCommit | null>(null)
  const [commitFiles, setCommitFiles] = useState<GitFileChange[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileDiff, setFileDiff] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [switchTarget, setSwitchTarget] = useState<GitCommit | null>(null)
  const [dirtyFiles, setDirtyFiles] = useState<GitFileChange[]>([])
  const [workingDiff, setWorkingDiff] = useState('')
  const [showWorkingDiff, setShowWorkingDiff] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    window.api
      .getGitLog(projectPath)
      .then(setCommits)
      .catch(() => setError(t('git.loadError')))
      .finally(() => setLoading(false))
  }, [projectPath, t])

  useEffect(() => {
    load()
  }, [load])

  async function selectCommit(c: GitCommit) {
    setSelectedCommit(c)
    setSelectedFile(null)
    setFileDiff('')
    try {
      setCommitFiles(await window.api.getGitCommitFiles(projectPath, c.hash))
    } catch {
      setCommitFiles([])
    }
  }

  async function selectFile(file: string) {
    setSelectedFile(file)
    if (!selectedCommit) return
    try {
      setFileDiff(await window.api.getGitFileDiff(projectPath, selectedCommit.hash, file))
    } catch {
      setFileDiff('')
    }
  }

  async function requestSwitch(c: GitCommit) {
    const status = await window.api.getGitStatus(projectPath)
    if (status.changed > 0) {
      // 有未提交修改,阻止
      try {
        setDirtyFiles(await window.api.getGitChangedFiles(projectPath))
      } catch {
        setDirtyFiles([])
      }
    } else {
      // 干净,二次确认
      setSwitchTarget(c)
    }
  }

  async function confirmSwitch() {
    if (!switchTarget) return
    try {
      await window.api.checkoutCommit(projectPath, switchTarget.hash)
      setSwitchTarget(null)
      setSelectedCommit(null)
      setCommitFiles([])
      setSelectedFile(null)
      onSwitchSuccess()
      load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setError(`${t('git.switchFailed')}: ${msg}`)
      setSwitchTarget(null)
      onSwitchSuccess()
    }
  }

  async function viewChanges() {
    try {
      setWorkingDiff(await window.api.getGitWorkingDiff(projectPath))
      setShowWorkingDiff(true)
    } catch {
      setWorkingDiff('')
    }
  }

  function statusLabel(s: string): string {
    if (s.includes('A')) return 'A'
    if (s.includes('D')) return 'D'
    if (s.includes('R')) return 'R'
    if (s.includes('C')) return 'C'
    return 'M'
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <History size={15} />
        <span className={styles.title}>{t('git.history')}</span>
        <button type="button" className={styles.refresh} onClick={load} disabled={loading} title={t('common.refresh')}>
          <RefreshCw size={13} />
        </button>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      {loading ? (
        <div className={styles.muted}>{t('common.loading')}</div>
      ) : commits.length === 0 ? (
        <div className={styles.muted}>{t('git.noCommits')}</div>
      ) : (
        <div className={styles.body}>
          <ul className={styles.commitList}>
            {commits.map((c) => (
              <li
                key={c.hash}
                className={selectedCommit?.hash === c.hash ? `${styles.commit} ${styles.commitActive}` : styles.commit}
                onClick={() => selectCommit(c)}
              >
                <span className={styles.commitHash}>{c.shortHash}</span>
                <div className={styles.commitInfo}>
                  <span className={styles.commitSubject}>{c.subject}</span>
                  <span className={styles.commitMeta}>
                    {c.date} · {c.author}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {selectedCommit ? (
            <div className={styles.detail}>
              <div className={styles.detailHead}>
                <span className={styles.detailHash}>{selectedCommit.hash}</span>
                <button type="button" className={styles.switchBtn} onClick={() => requestSwitch(selectedCommit)}>
                  {t('git.switch')}
                </button>
              </div>

              <div className={styles.filesTitle}>{t('git.files')}</div>
              {commitFiles.length === 0 ? (
                <div className={styles.muted}>{t('git.noCommits')}</div>
              ) : (
                <ul className={styles.fileList}>
                  {commitFiles.map((f) => (
                    <li
                      key={f.file}
                      className={selectedFile === f.file ? `${styles.file} ${styles.fileActive}` : styles.file}
                      onClick={() => selectFile(f.file)}
                    >
                      <span className={styles.fileStatus} data-status={statusLabel(f.status)}>
                        {statusLabel(f.status)}
                      </span>
                      <span className={styles.fileName}>{f.file}</span>
                    </li>
                  ))}
                </ul>
              )}

              {selectedFile ? (
                <div className={styles.diffBlock}>
                  <div className={styles.filesTitle}>{t('git.diff')}</div>
                  <pre className={styles.diff}>{fileDiff || '(空 diff)'}</pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {/* 阻止切换:有未提交修改 */}
      {dirtyFiles.length > 0 ? (
        <div className={styles.dirtyBlock}>
          <div className={styles.dirtyTitle}>{t('git.dirtyTitle')}</div>
          <div className={styles.dirtyDesc}>{t('git.dirtyDesc')}</div>
          <ul className={styles.fileList}>
            {dirtyFiles.map((f) => (
              <li key={f.file} className={styles.file}>
                <span className={styles.fileStatus} data-status={statusLabel(f.status)}>
                  {statusLabel(f.status)}
                </span>
                <span className={styles.fileName}>{f.file}</span>
              </li>
            ))}
          </ul>
          {showWorkingDiff ? <pre className={styles.diff}>{workingDiff}</pre> : null}
          <div className={styles.dirtyActions}>
            <button type="button" className={styles.viewBtn} onClick={viewChanges}>
              {t('git.viewChanges')}
            </button>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => {
                setDirtyFiles([])
                setShowWorkingDiff(false)
              }}
            >
              {t('git.cancel')}
            </button>
          </div>
        </div>
      ) : null}

      {/* 二次确认 */}
      <ConfirmDialog
        open={switchTarget !== null}
        title={t('git.switchConfirmTitle')}
        description={
          switchTarget
            ? `${t('git.switchConfirmDesc')}\n\n${switchTarget.subject}\n${switchTarget.date} · ${switchTarget.hash}`
            : ''
        }
        confirmLabel={t('git.switch')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmSwitch}
        onCancel={() => setSwitchTarget(null)}
      />
    </div>
  )
}
