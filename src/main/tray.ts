import { Tray, Menu, nativeImage, dialog, app, BrowserWindow } from 'electron'
import { join } from 'path'
import { getSetting } from './db'
import { hasActiveSessions } from './sessionRegistry'

const LABELS = {
  zh: {
    open: '打开工作台',
    quit: '退出应用',
    tooltip: 'Claude Code 工作台',
    quitTitle: '退出确认',
    quitMessage: '仍有 Claude Code 任务在运行,退出可能中断任务。确定要退出吗?',
    cancel: '取消',
    quitConfirm: '退出'
  },
  en: {
    open: 'Open Workbench',
    quit: 'Quit',
    tooltip: 'Claude Code Workbench',
    quitTitle: 'Quit Confirmation',
    quitMessage: 'Claude Code tasks are still running. Quitting may interrupt them. Continue?',
    cancel: 'Cancel',
    quitConfirm: 'Quit'
  }
}

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let isQuitting = false

function currentLang(): 'zh' | 'en' {
  return getSetting('language') === 'en' ? 'en' : 'zh'
}

function buildMenu(): Menu {
  const L = LABELS[currentLang()]
  return Menu.buildFromTemplate([
    { label: L.open, click: () => showMainWindow() },
    { type: 'separator' },
    { label: L.quit, click: () => quitApplication() }
  ])
}

export function setupTray(win: BrowserWindow): void {
  mainWindow = win
  const icon = nativeImage.createFromPath(join(app.getAppPath(), 'build', 'tray-icon.png'))
  tray = new Tray(icon)
  tray.setToolTip(LABELS[currentLang()].tooltip)
  tray.setContextMenu(buildMenu())
  tray.on('double-click', () => showMainWindow())
}

export function showMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
  }
}

/** 真正退出应用:有活跃任务时先确认 */
export function quitApplication(): void {
  if (hasActiveSessions()) {
    const L = LABELS[currentLang()]
    const options = {
      type: 'warning' as const,
      buttons: [L.cancel, L.quitConfirm],
      defaultId: 0,
      cancelId: 0,
      title: L.quitTitle,
      message: L.quitMessage
    }
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
    const choice = win
      ? dialog.showMessageBoxSync(win, options)
      : dialog.showMessageBoxSync(options)
    if (choice !== 1) return
  }
  isQuitting = true
  app.quit()
}

/** 是否正在真正退出(用于窗口 close 事件判断是否拦截) */
export function isQuittingNow(): boolean {
  return isQuitting
}

/** 语言变化后重建托盘菜单 */
export function rebuildTray(): void {
  if (tray) {
    tray.setToolTip(LABELS[currentLang()].tooltip)
    tray.setContextMenu(buildMenu())
  }
}
