import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import { initDb, closeDb, getSetting } from './db'
import { setupTray, isQuittingNow, showMainWindow } from './tray'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // 安全边界:渲染进程与 preload 的 JS 上下文隔离,且渲染进程无 Node 能力
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // 关闭窗口 → 最小化到系统托盘(默认开启;除非正在真正退出,或设置中关闭了该行为)
  mainWindow.on('close', (e) => {
    if (!isQuittingNow() && getSetting('minimizeToTray') !== 'false') {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  // 外部链接交给系统浏览器,不在应用内打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // dev 模式加载 Vite dev server,生产模式加载打包产物
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 单实例锁:必须在 app.whenReady() 之前调用
const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  // 已有实例在运行,立即退出本实例,不创建窗口/托盘/数据库连接
  app.quit()
} else {
  // 用户再次启动时,唤起已有实例的窗口(显示/最小化/隐藏到托盘均恢复并聚焦)
  app.on('second-instance', () => {
    showMainWindow()
  })

  app.whenReady().then(() => {
    initDb()
    registerIpcHandlers()
    createWindow()
    if (mainWindow) setupTray(mainWindow)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('will-quit', () => {
    closeDb()
  })

  // 所有窗口关闭时退出(Windows/Linux);macOS 保留应用
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
