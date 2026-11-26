/* ════════════════════════════════════════════════════════════════════════
   notify.ts — رسائل الخطأ الموحّدة للواجهة
   ───────────────────────────────────────────────────────────────────────
   يُرسل حدث مخصص 'app-error' بدلاً من alert() الذي يجمّد التطبيق.
   ErrorToast component في App.tsx يستمع لهذا الحدث ويعرض الرسالة.
════════════════════════════════════════════════════════════════════════ */

const GENERIC_ERROR = 'صار خطأ غير متوقع، جرّب مرة ثانية'

/** يحوّل أي خطأ إلى جملة عربية بسيطة، ويبقي التفاصيل التقنية في console فقط. */
export function toSimpleError(err: unknown, fallback = GENERIC_ERROR): string {
  if (!err) return fallback
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  if (!raw.trim()) return fallback

  if (/FOREIGN KEY/i.test(raw)) return 'ما قدرنا نحذف أو نعدّل هذا لأنه مرتبط بفاتورة أو سجل ثاني'
  if (/UNIQUE/i.test(raw)) return 'هذا الرقم أو الاسم مسجّل من قبل، جرّب غيره'
  if (/SQLITE_BUSY|database is locked/i.test(raw)) return 'البرنامج مشغول شوي حالياً، استنى لحظة وجرّب مرة ثانية'

  const hasArabic = /[\u0600-\u06FF]/.test(raw)
  const looksTechnical = /TypeError|ReferenceError|SyntaxError|RangeError|SqliteError|SQLITE_|Error:|at\s+\w+\s*\(|Cannot read|undefined|is not a function|ENOENT|EACCES|EPERM/i.test(raw)
  if (hasArabic && !looksTechnical) {
    return raw
  }
  return fallback
}

/** يعرض رسالة خطأ للمستخدم عبر toast (لا يجمّد التطبيق). */
export function showError(message: string, err?: unknown): void {
  if (err !== undefined && err !== null) console.error(message, err)
  const detail = err !== undefined && err !== null ? toSimpleError(err) : ''
  const text = detail && detail !== message ? `${message}\n${detail}` : message
  window.dispatchEvent(new CustomEvent('app-error', { detail: text }))
}
