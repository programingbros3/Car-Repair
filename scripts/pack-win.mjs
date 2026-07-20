// ════════════════════════════════════════════════════════════════════════
// pack-win.mjs — خطوة تحزيم مُثبّت ويندوز (NSIS) ضمن npm run build:win.
//
// لماذا سكربت منفصل بدل electron-builder مباشرةً؟ الوصول المُتحكَّم به للمجلدات
// (Controlled Folder Access) مُفعّل على أجهزة التطوير هنا، وهو يمنع makensis.exe
// من الكتابة داخل مجلد Documents المحمي — حيث يقع مسار الإخراج الافتراضي
// (../Car-Repair-release). فتنهار خطوة إنشاء المُثبّت بـ:
//   __uninstaller-nsis-*.exe -> no files found / ERR_ELECTRON_BUILDER_CANNOT_EXECUTE
//
// الحل: نوجّه الإخراج إلى %LOCALAPPDATA%\Car-Repair-release\<version> (غير محمي
// بـ CFA، وخارج مساحة عمل VS Code فلا يقفل .asar أيضاً) عبر تجاوز
// directories.output — بلا صلاحيات admin وبلا تغيير أي إعداد أمني.
//
// يستدعي CLI الخاص بـ electron-builder عبر Node مباشرةً (بلا صدفة) فيمرَّر المسار
// المطلق كوسيط واحد سليم حتى لو حوى مسافات، ويبقى تجاوز الإعداد يُدمَج فوق
// electron-builder.json5 تماماً كأمر السطر --config.directories.output.
// ════════════════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import os from 'node:os'

const require = createRequire(import.meta.url)
const pkg = require('../package.json')

// مدخل CLI لـ electron-builder (يُقرأ من bin ديناميكياً — غير مرتبط بإصدار)
const ebPkgPath = require.resolve('electron-builder/package.json')
const binRel = require('electron-builder/package.json').bin['electron-builder']
const cli = path.join(path.dirname(ebPkgPath), binRel)

// مسار إخراج خارج المجلدات المحمية بـ CFA
const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
const output = path.join(base, 'Car-Repair-release', pkg.version)

const res = spawnSync(process.execPath, [cli, '--win', `--config.directories.output=${output}`], {
  stdio: 'inherit',
})

if ((res.status ?? 1) === 0) {
  console.log(`\n📦 اكتمل البناء. المُثبّت والنسخة المحمولة في:\n   ${output}`)
}
process.exit(res.status ?? 1)
