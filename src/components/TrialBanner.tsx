import { useState } from 'react'
import type { LicenseStatus } from '../db/types'

/* ════════════════════════════════════════
   TrialBanner — شريط أعلى الشاشة للفترة التجريبية أو تنبيه HWID
   ────────────────────────────────────────
   • خلال 7 أيام: "نسخة تجريبية - باقي X أيام" + زر اختياري للتفعيل المبكر
   • عند تعذّر قراءة HWID: شريط تحذير غير معطِّل (لا يُقفل العميل)
════════════════════════════════════════ */
type TrialBannerProps = {
  licenseStatus: LicenseStatus
  onOpenActivate: () => void
}

export default function TrialBanner({ licenseStatus, onOpenActivate }: TrialBannerProps) {
  const [hwidWarnDismissed, setHwidWarnDismissed] = useState(false)

  if (licenseStatus.status === 'trial') {
    const days = Math.max(1, licenseStatus.daysRemaining)
    const label = `نسخة تجريبية - باقي ${days} ${days === 1 ? 'يوم' : 'أيام'}`
    return (
      <div className="trial-banner trial-banner--info" role="status">
        <span className="trial-banner-text">{label}</span>
        <button type="button" className="trial-banner-btn" onClick={onOpenActivate}>
          تفعيل النسخة
        </button>
      </div>
    )
  }

  if (licenseStatus.status === 'hwid_error' && !hwidWarnDismissed) {
    return (
      <div className="trial-banner trial-banner--warn" role="alert">
        <span className="trial-banner-text">
          تنبيه: تعذّرت قراءة معرّف الجهاز (HWID) للتحقق من الترخيص — البرنامج يعمل بشكل طبيعي
        </span>
        <button
          type="button"
          className="trial-banner-close"
          onClick={() => setHwidWarnDismissed(true)}
          aria-label="إغلاق التنبيه"
        >
          ×
        </button>
      </div>
    )
  }

  return null
}
