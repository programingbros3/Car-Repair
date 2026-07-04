/* ════════════════════════════════════════════════════════════════════════
   reset-password.mjs — أداة المطوّر لإعادة تعيين كلمة سر منسية
   ───────────────────────────────────────────────────────────────────────
   ⚠️  للمطوّر فقط — لا تُسلَّم للعميل ولا تُحزَّم مع التطبيق.

   تحذف hash كلمة السر (وحالة القفل المؤقت) من app_settings. عند التشغيل
   التالي يعرض التطبيق شاشة «تعيين كلمة السر» ليختار العميل كلمة جديدة.
   لا تمسّ صفوف الترخيص (license_%) ولا أي بيانات مالية.

   التشغيل (يتطلّب better-sqlite3 مبنيّاً لنفس إصدار Node المُشغِّل):
     node scripts/reset-password.mjs "/path/to/garage.db"
   إن لم يُمرَّر مسار، يستخدم مسار userData الافتراضي لهذا المستخدم.
════════════════════════════════════════════════════════════════════════ */
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

const APP_FOLDER = 'car-repair-shop'
const KEYS = ['app_password_hash', 'auth_failed_attempts', 'auth_lockout_until', 'auth_lockout_level']

function defaultDbPath() {
  const base = process.platform === 'win32'
    ? path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), APP_FOLDER)
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support', APP_FOLDER)
      : path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), APP_FOLDER)
  return path.join(base, 'garage.db')
}

const dbPath = process.argv[2] ?? defaultDbPath()
console.log('── إعادة تعيين كلمة السر (أداة المطوّر) ──')
console.log('قاعدة البيانات:', dbPath)

if (!fs.existsSync(dbPath)) { console.error('\n✗ لم يُعثَر على قاعدة البيانات.'); process.exit(1) }

const db = new Database(dbPath)
const del = db.prepare(`DELETE FROM app_settings WHERE key = ?`)
let removed = 0
db.transaction(() => { for (const k of KEYS) removed += del.run(k).changes })()
db.close()

console.log(`\n✓ حُذف ${removed} صف (كلمة السر + حالة القفل).`)
console.log('✔ افتح التطبيق — ستظهر شاشة «تعيين كلمة السر» ليضع العميل كلمة جديدة.')
