/* ════════════════════════════════════════════════════════════════════════
   reissue-license.mjs — أداة المطوّر لإعادة إصدار الترخيص (تغيير جهاز شرعي)
   ───────────────────────────────────────────────────────────────────────
   ⚠️  هذه الأداة للمطوّر فقط — لا تُسلَّم للعميل ولا تُحزَّم داخل التطبيق.

   الغرض: لو تعطّل جهاز العميل واشترى جهازاً جديداً (تغيير شرعي)، يفكّ هذا
   السكربت ربط الترخيص من قاعدة البيانات ويحذف "العلامة الخارجية" (الملف
   المخفي .glg-lic في userData + قيمة السجل على ويندوز). عند أول تشغيل بعدها
   يعامل التطبيق الإقلاع كأنه "أول تشغيل" فيربط نفسه بالجهاز الجديد تلقائياً.

   لا يحتاج هذا السكربت سرّ الترخيص إطلاقاً — فكّ الربط لا يتطلّب السر؛ إعادة
   الربط تتمّ داخل التطبيق نفسه على الجهاز الجديد باستخدام السر المُجمَّع فيه.

   الطريقة الآمنة الموصى بها:
     1) انقل ملف garage.db القديم إلى الجهاز الجديد (في مسار userData الجديد).
     2) شغّل هذا السكربت على الجهاز الجديد وهو يشير إلى garage.db المنقولة.
     3) افتح التطبيق على الجهاز الجديد — سيربط نفسه بالجهاز الجديد.

   التشغيل (يتطلّب better-sqlite3 مبنيّاً لنفس إصدار Node المُشغِّل — راجع
   scripts/README.md بخصوص مطابقة ABI):
     node scripts/reissue-license.mjs "/path/to/garage.db"
   إن لم يُمرَّر مسار، يستخدم مسار userData الافتراضي لهذا المستخدم.
════════════════════════════════════════════════════════════════════════ */
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

const LICENSE_KEYS = ['license_bound_hwid', 'license_signature']
const REGISTRY_PATH = 'HKCU\\Software\\GreenLineGarage'
const REGISTRY_VALUE = 'lic'
const APP_FOLDER = 'car-repair-shop' // اسم مجلّد userData (من package.json name)

function defaultUserDataDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), APP_FOLDER)
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', APP_FOLDER)
  }
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), APP_FOLDER)
}

function main() {
  const userDataDir = process.argv[2] ? path.dirname(process.argv[2]) : defaultUserDataDir()
  const dbPath = process.argv[2] ?? path.join(userDataDir, 'garage.db')

  console.log('── إعادة إصدار الترخيص (أداة المطوّر) ──')
  console.log('قاعدة البيانات :', dbPath)
  console.log('مجلّد userData :', userDataDir)

  if (!fs.existsSync(dbPath)) {
    console.error('\n✗ لم يُعثَر على قاعدة البيانات في المسار أعلاه.')
    process.exit(1)
  }

  // 1) فكّ الربط من قاعدة البيانات
  const db = new Database(dbPath)
  const del = db.prepare(`DELETE FROM app_settings WHERE key = ?`)
  let removed = 0
  const tx = db.transaction(() => { for (const k of LICENSE_KEYS) removed += del.run(k).changes })
  tx()
  db.close()
  console.log(`\n✓ حُذفت ${removed} صف(وف) ترخيص من app_settings.`)

  // 2) حذف العلامة الخارجية (الملف المخفي)
  const markFile = path.join(userDataDir, '.glg-lic')
  try {
    if (fs.existsSync(markFile)) { fs.unlinkSync(markFile); console.log('✓ حُذف الملف المخفي:', markFile) }
    else console.log('· لا يوجد ملف علامة خارجية (.glg-lic) — لا بأس.')
  } catch (e) { console.warn('! تعذّر حذف الملف المخفي:', e.message) }

  // 3) حذف قيمة السجل (ويندوز فقط)
  if (process.platform === 'win32') {
    try {
      execFileSync('reg', ['delete', REGISTRY_PATH, '/v', REGISTRY_VALUE, '/f'], { stdio: 'ignore' })
      console.log('✓ حُذفت قيمة السجل:', `${REGISTRY_PATH}\\${REGISTRY_VALUE}`)
    } catch { console.log('· لا توجد قيمة سجل (أو تعذّر حذفها) — لا بأس.') }
  }

  console.log('\n✔ تمّت إعادة الإصدار. افتح التطبيق على هذا الجهاز ليربط نفسه به عند أول تشغيل.')
}

main()
