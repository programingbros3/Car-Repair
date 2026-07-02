/* ════════════════════════════════════════════════════════════════════════
   notify.ts — رسائل الخطأ الموحّدة للواجهة
   ───────────────────────────────────────────────────────────────────────
   يُرسل حدث مخصص 'app-error' بدلاً من alert() الذي يجمّد التطبيق.
   ErrorToast component في App.tsx يستمع لهذا الحدث ويعرض الرسالة.
════════════════════════════════════════════════════════════════════════ */

/** يعرض رسالة خطأ للمستخدم عبر toast (لا يجمّد التطبيق). */
export function showError(message: string, err?: unknown): void {
  const detail = err instanceof Error ? err.message : err ? String(err) : ''
  const text = detail ? `${message}\n${detail}` : message
  window.dispatchEvent(new CustomEvent('app-error', { detail: text }))
  if (err) console.error(message, err)
}
