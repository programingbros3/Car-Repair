import { app, BrowserWindow, dialog } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { initDB, getDB } from '../src/database'
import { registerIpcHandlers } from './ipc-handlers'
import { maybeRunAutoBackupOnStartup, runAutoBackupOnQuit } from './auto-backup'
import { ensurePasswordSeeded } from './auth'
import { verifyOrBindDevice } from './license'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  initDB()

  // القفل الأمني: يتجاوز تلقائياً في وضع التطوير (npm run dev)
  // ويشتغل فعلياً فقط في النسخة النهائية (exe) المسلَّمة للعميل
  if (!VITE_DEV_SERVER_URL && !verifyOrBindDevice(getDB())) {
    dialog.showErrorBox(
      'غير مصرح',
      'هذا البرنامج غير مصرح له بالعمل على هذا الجهاز. تواصل مع المطوّر.'
    )
    app.quit()
    return
  }

  ensurePasswordSeeded(getDB())
  registerIpcHandlers(getDB())
  maybeRunAutoBackupOnStartup(getDB())
  createWindow()
})

app.on('before-quit', () => {
  runAutoBackupOnQuit(getDB())
})