/* ════════════════════════════════════════════════════════════════════════
   notify.ts — رسائل الخطأ الموحّدة للواجهة
   ───────────────────────────────────────────────────────────────────────
   تُستدعى عند فشل أي عملية IPC/قاعدة بيانات، لمنع الفشل الصامت.
════════════════════════════════════════════════════════════════════════ */

/** يعرض رسالة خطأ بسيطة للمستخدم. */
export function showError(message: string, err?: unknown): void {
  const detail = err instanceof Error ? err.message : err ? String(err) : ''
  // eslint-disable-next-line no-alert
  alert(detail ? `${message}\n${detail}` : message)
  if (err) console.error(message, err)
}
