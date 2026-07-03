// ════════════════════════════════════════════════════════════════════════
// electron-stub.mjs — بديل تجريبي لوحدة "electron" أثناء محاكاة الاختبار فقط.
// يلتقط كل معالجات ipcMain.handle في Map ويوفّر invoke() لاستدعائها كما يفعل
// الـ renderer الحقيقي — فيُختبر كامل الـ backend عبر قنوات IPC الفعلية.
// خارج مسار الإنتاج تماماً؛ لا يُحزَّم مع التطبيق.
// ════════════════════════════════════════════════════════════════════════

const handlers = new Map()

let userDataDir = process.env.SIM_USERDATA || process.cwd()

export const app = {
  getPath: () => userDataDir,
  getAppPath: () => process.env.SIM_APPPATH || process.cwd(),
  isPackaged: false,
  relaunch: () => {},
  exit: () => {},
  quit: () => {},
  on: () => {},
  whenReady: () => Promise.resolve(),
  getName: () => 'garage-sim',
}

export const ipcMain = {
  handle: (channel, fn) => { handlers.set(channel, fn) },
  on: () => {},
  removeHandler: (channel) => handlers.delete(channel),
}

export const dialog = {
  showSaveDialog: async () => ({ canceled: true, filePath: undefined }),
  showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
}

export class BrowserWindow {
  constructor() {}
  loadURL() {}
  loadFile() {}
  on() {}
  static getAllWindows() { return [] }
}

export const shell = { openPath: async () => '' }
export const nativeImage = { createFromPath: () => ({}) }

export const __handlers = handlers

// يستدعي قناة IPC كما يفعل الـ renderer، ويفكّ غلاف { success, data }.
export async function invoke(channel, ...args) {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`لا يوجد معالج للقناة: ${channel}`)
  const res = await fn({}, ...args)
  if (res && res.success === false) throw new Error(res.error)
  return res ? res.data : undefined
}

export default { app, ipcMain, dialog, BrowserWindow, shell, nativeImage }
