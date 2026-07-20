// ════════════════════════════════════════════════════════════════════════
// run-bulk-test.mjs — مشغّل مؤتمت لاختبار «الدفعة العامة» بأمر واحد
// (npm run test:bulk). خارج مسار الإنتاج تماماً؛ لا يُحزَّم مع التطبيق.
//
// نفس آلية run-verify.mjs (esbuild → Electron كـ Node) لتفادي عدم توافق ABI بين
// node النظام و better-sqlite3 المبنية لـ Electron. يعمل على قاعدة تجريبية معزولة
// في os.tmpdir() (لا يمسّ قاعدة المستخدم إطلاقاً)، ثم:
//   1) يبني ويشغّل scripts/simulate-bulk-payments.ts (السيناريوهات 1–10 + التقرير).
//   2) عند نجاحها: يشغّل scripts/run-verify.mjs على نفس القاعدة (السيناريو 11 —
//      الفحوص الـ15 بما فيها الثلاثة الخاصة بالدفعة العامة).
//   3) يحذف القاعدة التجريبية المؤقّتة دائماً (لا ملفات مخلَّفة).
// كود الخروج = 0 فقط إذا نجح كلاهما.
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

// ── قاعدة تجريبية معزولة تماماً في مجلد النظام المؤقّت ──
const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'garage-bulk-'))
const dbPath = path.join(tmpBase, 'bulk-test.db')

const electronPath = require('electron') // مسار تنفيذي Electron

function cleanup() {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(dbPath + suffix, { force: true }) } catch { /* تجاهل */ }
  }
  try { fs.rmSync(tmpBase, { recursive: true, force: true }) } catch { /* تجاهل */ }
}

// ملاحظة: لا نستدعي process.exit داخل try — فهو يتخطّى finally فلا تُحذف القاعدة.
// نحسب كود الخروج، ثم ننظّف في finally، ثم نخرج بعد الكتلة.
let exitCode = 1
try {
  // ── (1) تجميع سكربت السيناريوهات في حزمة ESM مؤقّتة ──
  const bundle = path.join(tmpBase, 'bulk.mjs')
  await build({
    entryPoints: [path.join(scriptsDir, 'simulate-bulk-payments.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile: bundle,
    external: ['better-sqlite3', 'bindings'],
    alias: { electron: path.join(scriptsDir, 'electron-stub.mjs') },
    logLevel: 'warning',
  })

  console.log('\n########## (1) تشغيل سيناريوهات الدفعة العامة ##########')
  const scen = spawnSync(electronPath, [bundle], {
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_PATH: nodeModules,
      SIM_APPPATH: repo,        // لقراءة electron/schema.sql
      GARAGE_DB_PATH: dbPath,   // القاعدة التجريبية المعزولة
    },
  })

  if ((scen.status ?? 1) !== 0) {
    console.log('\n🔴 فشلت السيناريوهات — تخطّي فحص السلامة.')
    exitCode = scen.status ?? 1
  } else {
    // ── (2) فحص السلامة (نفس منطق npm run verify:integrity) على نفس القاعدة ──
    console.log('\n########## (2) فحص السلامة verify:integrity على نفس القاعدة ##########')
    const verify = spawnSync(process.execPath, [path.join(scriptsDir, 'run-verify.mjs')], {
      stdio: 'inherit',
      env: { ...process.env, GARAGE_DB_PATH: dbPath },
    })

    const okAll = (verify.status ?? 1) === 0
    console.log(okAll
      ? '\n✅ الكل نجح: سيناريوهات الدفعة العامة + الفحوص الـ15 لسلامة القاعدة.'
      : '\n🔴 نجحت السيناريوهات لكن فشل فحص السلامة (انظر أعلاه).')
    exitCode = okAll ? 0 : 1
  }
} finally {
  cleanup()
}
process.exit(exitCode)
