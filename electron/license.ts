/* ════════════════════════════════════════════════════════════════════════
   license.ts — ربط التطبيق بجهاز واحد فقط (Hardware ID Lock)
   ───────────────────────────────────────────────────────────────────────
   أول مرة يشتغل فيها التطبيق، ياخذ معرف فريد للجهاز (HWID) ويخزّنه
   موقّعاً (HMAC) في app_settings. كل مرة بعدها، يتحقق إن الجهاز الحالي
   يطابق المخزَّن. لو الملف اتنسخ لجهاز تاني، الـ HWID يختلف والتحقق يفشل.

   H4 — الحماية ضد إعادة الربط بحذف صفوف الترخيص من قاعدة البيانات:
   بالتوازي مع صفوف app_settings، تُكتب "علامة خارجية" في مكانين خارج
   garage.db (سجل ويندوز Registry + ملف مخفي في userData). عند الإقلاع، إذا
   اختفت صفوف القاعدة لكن العلامة الخارجية موجودة ⇒ ليست "أول تشغيل" بل قاعدة
   مُعبَث بها أو منسوخة ⇒ يُحظر التطبيق بدل إعادة الربط تلقائياً.
════════════════════════════════════════════════════════════════════════ */
import { machineIdSync } from 'node-machine-id'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { execFileSync } from 'node:child_process'
import type Database from 'better-sqlite3'

type DB = Database.Database

/* H4: سر الترخيص يُحقَن وقت البناء عبر define في vite.config.ts (من متغيّر البيئة
   GARAGE_LICENSE_SECRET أو ملف electron/.license-secret المُستبعَدَين من git).
   __LICENSE_SECRET__ ثابت نصّي يستبدله المُجمِّع بالقيمة الفعلية. */
declare const __LICENSE_SECRET__: string
const LICENSE_SECRET =
  typeof __LICENSE_SECRET__ !== 'undefined'
    ? __LICENSE_SECRET__
    : (process.env.GARAGE_LICENSE_SECRET ?? 'DEV_ONLY_INSECURE_LICENSE_SECRET_do_not_ship')

const KEYS = {
    boundHwid: 'license_bound_hwid',
    signature: 'license_signature',
} as const

// H4: مسار العلامة الخارجية (سجل ويندوز + ملف مخفي)
const REGISTRY_PATH = 'HKCU\\Software\\GreenLineGarage'
const REGISTRY_VALUE = 'lic'

function getSetting(db: DB, key: string): string | null {
    const row = db.prepare(`SELECT value FROM app_settings WHERE key=?`).get(key) as { value: string } | undefined
    return row ? row.value : null
}

function setSetting(db: DB, key: string, value: string): void {
    db.prepare(`
    INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}

function sign(hwid: string): string {
    return crypto.createHmac('sha256', LICENSE_SECRET).update(hwid).digest('hex')
}

function getCurrentHwid(): string | null {
    try {
        return machineIdSync(true) // hashed = true, أكثر أمانًا وثباتًا
    } catch (err) {
        console.error('تعذّرت قراءة معرّف الجهاز (HWID):', err)
        return null
    }
}

/* ── H4: العلامة الخارجية (خارج garage.db) ─────────────────────────────────
   نخزّن التوقيع في مكانين مستقلّين عن قاعدة البيانات: ملف مخفي في userData
   وقيمة في سجل ويندوز. أي منهما كافٍ لاكتشاف "قاعدة بلا صفوف ترخيص لكن سبق
   تفعيلها على هذا الجهاز". كل عمليات النظام محاطة بـ try/catch — غياب إحدى
   العلامتين (صلاحيات/نظام غير ويندوز) لا يعطّل التطبيق. */
function externalMarkFilePath(): string {
    return path.join(app.getPath('userData'), '.glg-lic')
}

function readExternalMark(): string | null {
    // 1) الملف المخفي
    try {
        const p = externalMarkFilePath()
        if (fs.existsSync(p)) {
            const v = fs.readFileSync(p, 'utf-8').trim()
            if (v) return v
        }
    } catch { /* تجاهل */ }

    // 2) سجل ويندوز
    if (process.platform === 'win32') {
        try {
            const out = execFileSync('reg', ['query', REGISTRY_PATH, '/v', REGISTRY_VALUE], {
                encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'],
            })
            const m = out.match(/REG_SZ\s+([0-9a-f]+)/i)
            if (m) return m[1]
        } catch { /* القيمة غير موجودة أو تعذّر الوصول */ }
    }

    return null
}

function writeExternalMark(signature: string): void {
    // 1) الملف المخفي
    try {
        fs.writeFileSync(externalMarkFilePath(), signature, { encoding: 'utf-8' })
    } catch { /* تجاهل فشل الكتابة */ }

    // 2) سجل ويندوز
    if (process.platform === 'win32') {
        try {
            execFileSync('reg', ['add', REGISTRY_PATH, '/v', REGISTRY_VALUE, '/t', 'REG_SZ', '/d', signature, '/f'], {
                stdio: 'ignore',
            })
        } catch { /* تجاهل فشل الكتابة */ }
    }
}

export type LicenseCheckResult = 'ok' | 'blocked' | 'hwid_error'

/**
 * يُستدعى مرة عند كل إطلاق (بعد initDB مباشرة، مثل ensurePasswordSeeded).
 * 'ok'         → الجهاز مصرّح له (أو أول تشغيل: رُبط الآن)
 * 'blocked'    → غير مصرّح (جهاز مختلف، تلاعب بالبيانات، أو حذف صفوف الترخيص
 *                مع بقاء العلامة الخارجية) — يُغلق التطبيق
 * 'hwid_error' → تعذّرت قراءة معرّف الجهاز — يستمر التطبيق مع تحذير واضح
 *                (fail-open: تعطيل عميل شرعي أسوأ من تعطيل ناسخ محتمل)
 */
export function verifyOrBindDevice(db: DB): LicenseCheckResult {
    const currentHwid = getCurrentHwid()
    if (currentHwid === null) return 'hwid_error'

    const boundHwid = getSetting(db, KEYS.boundHwid)
    const storedSignature = getSetting(db, KEYS.signature)
    const expectedForCurrent = sign(currentHwid)

    // لا يوجد ربط في قاعدة البيانات — قد يكون أول تشغيل فعلي، أو قاعدة عُبِث بها
    if (!boundHwid || !storedSignature) {
        const externalMark = readExternalMark()
        if (externalMark) {
            // سبق تفعيل هذا الجهاز والعلامة الخارجية باقية، لكن صفوف القاعدة أُزيلت
            // ⇒ إذا كانت العلامة لنفس هذا الجهاز نعيد بناء الصفوف (تعافٍ مشروع من
            //   حذف عرضي)، وإلا فهي قاعدة منسوخة من جهاز آخر ⇒ حظر.
            if (externalMark === expectedForCurrent) {
                setSetting(db, KEYS.boundHwid, currentHwid)
                setSetting(db, KEYS.signature, expectedForCurrent)
                return 'ok'
            }
            return 'blocked'
        }

        // أول تشغيل حقيقي — نربط هذا الجهاز في القاعدة وفي العلامة الخارجية معاً
        setSetting(db, KEYS.boundHwid, currentHwid)
        setSetting(db, KEYS.signature, expectedForCurrent)
        writeExternalMark(expectedForCurrent)
        return 'ok'
    }

    // تحقق إن التوقيع سليم (ما تم التلاعب بالقيمة يدوياً في قاعدة البيانات)
    const expectedSignature = sign(boundHwid)
    if (storedSignature !== expectedSignature) {
        return 'blocked' // تم العبث بالبيانات
    }

    // تحقق إن الجهاز الحالي هو نفس الجهاز المربوط
    if (boundHwid !== currentHwid) return 'blocked'

    // الجهاز مطابق — نضمن وجود العلامة الخارجية (تعافٍ إن حُذفت وحدها)
    if (readExternalMark() !== expectedForCurrent) writeExternalMark(expectedForCurrent)
    return 'ok'
}
