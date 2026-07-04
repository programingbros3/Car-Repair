/* ════════════════════════════════════════════════════════════════════════
   license.ts — ربط التطبيق بجهاز واحد فقط (Hardware ID Lock)
   ───────────────────────────────────────────────────────────────────────
   أول مرة يشتغل فيها التطبيق، ياخذ معرف فريد للجهاز (HWID) ويخزّنه
   موقّعاً (HMAC) في app_settings. كل مرة بعدها، يتحقق إن الجهاز الحالي
   يطابق المخزَّن. لو الملف اتنسخ لجهاز تاني، الـ HWID يختلف والتحقق يفشل.
════════════════════════════════════════════════════════════════════════ */
import { machineIdSync } from 'node-machine-id'
import crypto from 'node:crypto'
import type Database from 'better-sqlite3'

type DB = Database.Database

// ⚠️ غيّر هذا النص لأي شي عشوائي معقد وخاص فيك — لا تشاركه مع أحد
const LICENSE_SECRET = 'ضع-هون-نص-عشوائي-طويل-خاص-فيك-2026'

const KEYS = {
    boundHwid: 'license_bound_hwid',
    signature: 'license_signature',
} as const

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

function getCurrentHwid(): string {
    return machineIdSync(true) // hashed = true, أكثر أمانًا وثباتًا
}

/**
 * يُستدعى مرة عند كل إطلاق (بعد initDB مباشرة، مثل ensurePasswordSeeded).
 * يرجّع true لو الجهاز مصرّح له، false لو مش مصرّح (يجب إغلاق التطبيق).
 */
export function verifyOrBindDevice(db: DB): boolean {
    const currentHwid = getCurrentHwid()
    const boundHwid = getSetting(db, KEYS.boundHwid)
    const storedSignature = getSetting(db, KEYS.signature)

    // أول تشغيل — لا يوجد جهاز مربوط بعد، نربط هذا الجهاز تلقائياً
    if (!boundHwid || !storedSignature) {
        setSetting(db, KEYS.boundHwid, currentHwid)
        setSetting(db, KEYS.signature, sign(currentHwid))
        return true
    }

    // تحقق إن التوقيع سليم (ما تم التلاعب بالقيمة يدوياً في قاعدة البيانات)
    const expectedSignature = sign(boundHwid)
    if (storedSignature !== expectedSignature) {
        return false // تم العبث بالبيانات
    }

    // تحقق إن الجهاز الحالي هو نفس الجهاز المربوط
    return boundHwid === currentHwid
}