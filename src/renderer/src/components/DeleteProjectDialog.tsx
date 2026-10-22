import { useEffect, useState } from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import styles from './DeleteProjectDialog.module.css'

interface DeleteProjectDialogProps {
  open: boolean
  title: string
  projectName: string
  projectPath: string
  gitDirty: boolean
  warningText: string
  pathLabel: string
  gitDirtyText: string
  placeholder: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export default function DeleteProjectDialog({
  open,
  title,
  projectName,
  projectPath,
  gitDirty,
  warningText,
  pathLabel,
  gitDirtyText,
  placeholder,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel
}: DeleteProjectDialogProps) {
  const [value, setValue] = useState('')

  useEffect(() => {
    if (open) setValue('')
  }, [open])

  const canConfirm = value === projectName

  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.overlay} />
        <AlertDialog.Content className={styles.content}>
          <AlertDialog.Title className={styles.title}>{title}</AlertDialog.Title>
          <AlertDialog.Description className={styles.warning}>{warningText}</AlertDialog.Description>
          <div className={styles.path}>
            {pathLabel} <span className={styles.pathValue}>{projectPath}</span>
          </div>
          {gitDirty ? <div className={styles.gitDirty}>{gitDirtyText}</div> : null}
          <input
            className={styles.input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
          />
          <div className={styles.actions}>
            <AlertDialog.Cancel asChild>
              <button type="button" className={styles.cancelBtn}>
                {cancelLabel}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                className={styles.dangerBtn}
                disabled={!canConfirm}
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
