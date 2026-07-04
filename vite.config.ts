import { defineConfig } from 'vite'
import path from 'node:path'
import fs from 'node:fs'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

/* H4: سر الترخيص يُحقَن وقت البناء ولا يعيش في الكود المصدري.
   الأولوية: متغيّر البيئة GARAGE_LICENSE_SECRET ← ملف electron/.license-secret
   (كلاهما مُستبعَد من git). في التطوير فقط (بلا أي منهما) يُستخدم سر بديل
   واضح — لا يؤثر لأن القفل الأمني معطّل أصلاً في npm run dev. بناء الإنتاج
   بلا سر يطبع تحذيراً صريحاً. */
function resolveLicenseSecret(): string {
  const fromEnv = process.env.GARAGE_LICENSE_SECRET?.trim()
  if (fromEnv) return fromEnv

  const secretFile = path.join(__dirname, 'electron', '.license-secret')
  if (fs.existsSync(secretFile)) {
    const fromFile = fs.readFileSync(secretFile, 'utf-8').trim()
    if (fromFile) return fromFile
  }

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '\n⚠️  GARAGE_LICENSE_SECRET غير مضبوط ولا يوجد electron/.license-secret — ' +
      'بناء الإنتاج سيستخدم سراً بديلاً غير آمن. اضبط السر قبل التسليم.\n',
    )
  }
  return 'DEV_ONLY_INSECURE_LICENSE_SECRET_do_not_ship'
}

const LICENSE_SECRET = resolveLicenseSecret()
const licenseDefine = { __LICENSE_SECRET__: JSON.stringify(LICENSE_SECRET) }

// https://vitejs.dev/config/
export default defineConfig({
  define: licenseDefine,
  plugins: [
    react(),
    electron({
      main: {
        // Shortcut of `build.lib.entry`.
        entry: 'electron/main.ts',
        vite: { define: licenseDefine },
      },
      preload: {
        // Shortcut of `build.rollupOptions.input`.
        // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
        input: path.join(__dirname, 'electron/preload.ts'),
        vite: { define: licenseDefine },
      },
      // Ployfill the Electron and Node.js API for Renderer process.
      // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
      // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
      renderer: process.env.NODE_ENV === 'test'
        // https://github.com/electron-vite/vite-plugin-electron-renderer/issues/78#issuecomment-2053600808
        ? undefined
        : {},
    }),
  ],
})
