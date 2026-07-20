// ════════════════════════════════════════════════════════════════════════
// run-verify.mjs — مشغّل مؤتمت لـ verify-integrity.ts بأمر واحد
// (npm run verify:integrity). خارج مسار الإنتاج تماماً؛ لا يُحزَّم مع التطبيق.
//
// لماذا هذا المشغّل؟ الملف verify-integrity.ts مكتوب بـ TypeScript ويستعمل
// better-sqlite3 (وحدة native). على أجهزة التطوير غالباً يختلف إصدار Node النظام
// (ABI) عن الإصدار الذي بُنيت له الوحدة (Electron)، فلا يعمل تشغيلها المباشر عبر
// `node`. هذا المشغّل يحلّها آلياً ودائماً بلا أي خطوة يدوية:
//   1) يجمّع verify-integrity.ts + تبعياته بـ esbuild في ملف ESM مؤقّت،
//      مع توجيه "electron" إلى الـ stub، وإبقاء better-sqlite3 خارجياً (native).
//   2) يشغّل الحزمة عبر Electron كـ Node (ELECTRON_RUN_AS_NODE) — فيطابق ABI
//      الوحدة — مع NODE_PATH نحو node_modules المشروع كي تُحلّ الوحدة الأصلية.
//
// قاعدة البيانات: افتراضياً القاعدة الحقيقية للتطبيق (نفس مسار الإنتاج)، ويمكن
// تجاوزها بتمرير GARAGE_DB_PATH للتشغيل على نسخة اختبارية بدلاً منها. الفحوص
// قراءة فقط (وترقية البنية idempotent كما تفعل عند كل إقلاع للتطبيق).
// ════════════════════════════════════════════════════════════════════════
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

const require = createRequire(import.meta.url)
const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(scriptsDir, '..')
const nodeModules = path.join(repo, 'node_modules')

// ── مسار قاعدة الإنتاج الافتراضي (نفس ما يحسبه Electron: appData/<appName>/garage.db) ──
function defaultProductionDbPath() {
  const appName = require(path.join(repo, 'package.json')).name // 'car-repair-shop'
  const appData =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'))
  return path.join(appData, appName, 'garage.db')
}

const dbPath = process.env.GARAGE_DB_PATH || defaultProductionDbPath()

// ── (1) تجميع الملف في حزمة ESM مؤقّتة ──
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garage-verify-'))
const bundle = path.join(tmpDir, 'verify.mjs')

await build({
  entryPoints: [path.join(scriptsDir, 'verify-integrity.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: bundle,
  // native addon يُحمَّل عبر createRequire وقت التشغيل — يبقى خارج الحزمة
  external: ['better-sqlite3', 'bindings'],
  // "electron" → نفس ملف الـ stub الذي يستورده verify-integrity مباشرةً (نسخة واحدة، Map واحد)
  alias: { electron: path.join(scriptsDir, 'electron-stub.mjs') },
  logLevel: 'warning',
})

// ── (2) التشغيل عبر Electron كـ Node ──
const electronPath = require('electron') // مسار تنفيذي Electron
const res = spawnSync(electronPath, [bundle], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_PATH: nodeModules,
    SIM_APPPATH: repo,          // لقراءة electron/schema.sql
    GARAGE_DB_PATH: dbPath,     // القاعدة الحقيقية افتراضياً أو ما مرّره المستخدم
  },
})

// تنظيف الحزمة المؤقّتة
try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* تجاهل */ }

process.exit(res.status ?? 1)
