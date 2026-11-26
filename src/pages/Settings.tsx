import { useEffect, useState } from 'react'
import ConfirmDialog from '../components/ConfirmDialog'
import PasswordInput from '../components/PasswordInput'
import { dbService } from '../services/db'
import { showError, toSimpleError } from '../utils/notify'
import type { AutoBackupSettings, AutoBackupStatus, AutoLockSettings, ActivityLogRow, VatSettings } from '../db/types'

/* ════════════════════════════════════════
   Settings — النسخ الاحتياطي (يدوي) + النسخ الاحتياطي التلقائي
   + الأمان: تغيير كلمة السر / القفل التلقائي عند الخمول / سجل النشاط
════════════════════════════════════════ */
export default function Settings() {
  /* ════════════════════════════════════════
     هوية الكراج (الاسم والشعار)
  ════════════════════════════════════════ */
  const [garageName, setGarageName]         = useState('')
  const [garageLogo, setGarageLogo]         = useState('')
  const [identityLoaded, setIdentityLoaded] = useState(false)
  const [identitySaving, setIdentitySaving] = useState(false)
  const [identityMsg, setIdentityMsg]       = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const identity = await dbService.garageIdentity.get()
        setGarageName(identity.garage_name)
        setGarageLogo(identity.garage_logo)
      } catch (err) {
        showError('ما قدرنا نحمّل اسم وشعار الكراج', err)
      } finally {
        setIdentityLoaded(true)
      }
    })()
  }, [])

  const handleSaveGarageName = async () => {
    setIdentitySaving(true)
    setIdentityMsg(null)
    try {
      const updated = await dbService.garageIdentity.update({ garage_name: garageName })
      setGarageName(updated.garage_name)
      setIdentityMsg('تم حفظ اسم الكراج')
    } catch (err) {
      showError('ما قدرنا نحفظ اسم الكراج', err)
    } finally {
      setIdentitySaving(false)
    }
  }

  const handlePickGarageLogo = async () => {
    setIdentitySaving(true)
    setIdentityMsg(null)
    try {
      const res = (await window.ipcRenderer.invoke('garageIdentity:pickLogo')) as {
        success: boolean
        data?: string | null
        error?: string
      }
      if (!res.success) throw new Error(res.error || 'ما قدرنا نختار الشعار')
      if (!res.data) return
      const updated = await dbService.garageIdentity.update({ garage_logo: res.data })
      setGarageLogo(updated.garage_logo)
      setIdentityMsg('تم حفظ شعار الكراج')
    } catch (err) {
      showError('ما قدرنا نحفظ الشعار', err)
    } finally {
      setIdentitySaving(false)
    }
  }

  const [exporting, setExporting]       = useState(false)
  const [exportMsg, setExportMsg]       = useState<string | null>(null)
  const [showImportDlg, setShowImportDlg] = useState(false)
  const [importing, setImporting]       = useState(false)

  /* ── تصدير نسخة احتياطية ── */
  const handleExport = async () => {
    setExporting(true)
    setExportMsg(null)
    try {
      const filePath = await dbService.backup.export()
      if (filePath) setExportMsg(`تم حفظ النسخة الاحتياطية في: ${filePath}`)
    } catch (err) {
      showError('ما قدرنا نحفظ النسخة الاحتياطية', err)
    } finally {
      setExporting(false)
    }
  }

  /* ── استيراد نسخة احتياطية (بعد التأكيد بكلمة السر) ── */
  const handleImportConfirm = async () => {
    setShowImportDlg(false)
    setImporting(true)
    try {
      await dbService.backup.import()
      // إذا وصلنا هنا = المستخدم ألغى اختيار الملف (عند النجاح الفعلي يُعاد تشغيل التطبيق)
      setImporting(false)
    } catch (err) {
      showError('ما قدرنا نسترجع النسخة الاحتياطية', err)
      setImporting(false)
    }
  }

  /* ════════════════════════════════════════
     النسخ الاحتياطي التلقائي
  ════════════════════════════════════════ */
  const [autoLoaded, setAutoLoaded]   = useState(false)
  const [autoFolder, setAutoFolder]   = useState<string | null>(null)
  const [autoEnabled, setAutoEnabled] = useState(false)
  const [autoKeepCount, setAutoKeepCount] = useState(14)
  const [autoStatus, setAutoStatus]   = useState<AutoBackupStatus | null>(null)
  const [autoSaving, setAutoSaving]   = useState(false)
  const [autoRunning, setAutoRunning] = useState(false)
  const [autoRunMsg, setAutoRunMsg]   = useState<string | null>(null)
  const [secondaryFolderText, setSecondaryFolderText] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const [settings, status] = await Promise.all([
          dbService.autoBackup.getSettings(),
          dbService.autoBackup.getStatus(),
        ])
        applySettings(settings)
        setAutoStatus(status)
      } catch (err) {
        showError('ما قدرنا نحمّل إعدادات النسخ الاحتياطي التلقائي', err)
      } finally {
        setAutoLoaded(true)
      }
    })()
  }, [])

  const applySettings = (settings: AutoBackupSettings) => {
    setAutoFolder(settings.folder)
    setAutoEnabled(settings.enabled)
    setAutoKeepCount(settings.keepCount)
    setSecondaryFolderText(settings.secondaryFolder ?? '')
  }

  const persistAutoSettings = async (updates: Partial<AutoBackupSettings>) => {
    setAutoSaving(true)
    try {
      const settings = await dbService.autoBackup.updateSettings(updates)
      applySettings(settings)
    } catch (err) {
      showError('ما قدرنا نحفظ إعدادات النسخ الاحتياطي التلقائي', err)
    } finally {
      setAutoSaving(false)
    }
  }

  const handlePickFolder = async () => {
    try {
      const folder = await dbService.autoBackup.pickFolder()
      if (folder) await persistAutoSettings({ folder })
    } catch (err) {
      showError('ما قدرنا نختار المجلد', err)
    }
  }

  const handleToggleEnabled = (checked: boolean) => {
    setAutoEnabled(checked)
    void persistAutoSettings({ enabled: checked })
  }

  const handleKeepCountBlur = () => {
    void persistAutoSettings({ keepCount: autoKeepCount })
  }

  const handleSecondaryFolderBlur = () => {
    void persistAutoSettings({ secondaryFolder: secondaryFolderText.trim() || null })
  }

  const handlePickSecondaryFolder = async () => {
    try {
      const folder = await dbService.autoBackup.pickFolder()
      if (folder) await persistAutoSettings({ secondaryFolder: folder })
    } catch (err) {
      showError('ما قدرنا نختار المجلد', err)
    }
  }

  const handleRunNow = async () => {
    setAutoRunning(true)
    setAutoRunMsg(null)
    try {
      const result = await dbService.autoBackup.runNow()
      const status = await dbService.autoBackup.getStatus()
      setAutoStatus(status)
      let msg = result.success ? `تم الحفظ في: ${result.filePath}` : `ما زبطت المحاولة: ${toSimpleError(result.error, 'صار خطأ غير متوقع')}`
      if (result.success && result.secondaryStatus === 'success') msg += ' — وانحفظت كمان في المجلد الثاني'
      if (result.success && result.secondaryStatus === 'failed') msg += ` — تنبيه: ما قدرنا نحفظ في المجلد الثاني (${toSimpleError(result.secondaryError, 'تأكد من المجلد')})`
      setAutoRunMsg(msg)
    } catch (err) {
      showError('ما قدرنا نعمل النسخة الاحتياطية التلقائية', err)
    } finally {
      setAutoRunning(false)
    }
  }

  const formatDateTime = (iso: string | null) => {
    if (!iso) return 'لم تُنفَّذ أي نسخة بعد'
    return new Date(iso).toLocaleString('ar-EG-u-nu-latn', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  }

  /* ════════════════════════════════════════
     تغيير كلمة السر
  ════════════════════════════════════════ */
  const [oldPassword, setOldPassword]         = useState('')
  const [newPassword, setNewPassword]         = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordMsg, setPasswordMsg]         = useState<string | null>(null)
  const [passwordErr, setPasswordErr]         = useState<string | null>(null)

  const handleChangePassword = async () => {
    setPasswordMsg(null)
    setPasswordErr(null)
    if (newPassword.length < 6) { setPasswordErr('كلمة السر الجديدة لازم تكون 6 أحرف على الأقل'); return }
    if (newPassword !== confirmPassword) { setPasswordErr('كلمتين السر الجداد مش متطابقتين'); return }
    setChangingPassword(true)
    try {
      await dbService.auth.changePassword(oldPassword, newPassword)
      setPasswordMsg('تم تغيير كلمة السر')
      setOldPassword(''); setNewPassword(''); setConfirmPassword('')
    } catch (err) {
      console.error('فشل تغيير كلمة السر:', err)
      setPasswordErr(toSimpleError(err, 'ما قدرنا نغيّر كلمة السر'))
    } finally {
      setChangingPassword(false)
    }
  }

  /* ════════════════════════════════════════
     القفل التلقائي عند الخمول
  ════════════════════════════════════════ */
  const [lockLoaded, setLockLoaded]   = useState(false)
  const [lockEnabled, setLockEnabled] = useState(true)
  const [lockMinutes, setLockMinutes] = useState(10)
  const [lockSaving, setLockSaving]   = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const settings = await dbService.auth.getAutoLockSettings()
        setLockEnabled(settings.enabled)
        setLockMinutes(settings.minutes)
      } catch (err) {
        showError('ما قدرنا نحمّل إعدادات القفل التلقائي', err)
      } finally {
        setLockLoaded(true)
      }
    })()
  }, [])

  const persistLockSettings = async (updates: Partial<AutoLockSettings>) => {
    setLockSaving(true)
    try {
      const settings = await dbService.auth.updateAutoLockSettings(updates)
      setLockEnabled(settings.enabled)
      setLockMinutes(settings.minutes)
    } catch (err) {
      showError('ما قدرنا نحفظ إعدادات القفل التلقائي', err)
    } finally {
      setLockSaving(false)
    }
  }

  /* ════════════════════════════════════════
     الضريبة (VAT) — اختيارية، معطّلة افتراضياً
  ════════════════════════════════════════ */
  const [vatLoaded, setVatLoaded]   = useState(false)
  const [vatEnabled, setVatEnabled] = useState(false)
  const [vatRate, setVatRate]       = useState(16)
  const [vatSaving, setVatSaving]   = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const settings = await dbService.vat.getSettings()
        setVatEnabled(settings.enabled)
        setVatRate(settings.rate)
      } catch (err) {
        showError('ما قدرنا نحمّل إعدادات الضريبة', err)
      } finally {
        setVatLoaded(true)
      }
    })()
  }, [])

  const persistVatSettings = async (updates: Partial<VatSettings>) => {
    setVatSaving(true)
    try {
      const settings = await dbService.vat.updateSettings(updates)
      setVatEnabled(settings.enabled)
      setVatRate(settings.rate)
    } catch (err) {
      showError('ما قدرنا نحفظ إعدادات الضريبة', err)
    } finally {
      setVatSaving(false)
    }
  }

  /* ════════════════════════════════════════
     سجل النشاط
  ════════════════════════════════════════ */
  const [activityLog, setActivityLog]     = useState<ActivityLogRow[]>([])
  const [activityLoaded, setActivityLoaded] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        setActivityLog(await dbService.activityLog.getAll(200))
      } catch (err) {
        showError('ما قدرنا نحمّل سجل التعديلات والحذف', err)
      } finally {
        setActivityLoaded(true)
      }
    })()
  }, [])

  const formatLogDate = (iso: string) => new Date(iso).toLocaleString('ar-EG-u-nu-latn', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })

  const actionLabel = (t: string) => (t === 'update' ? 'تعديل' : t === 'delete' ? 'حذف' : t === 'deliver' ? 'تسليم' : t === 'lock' ? 'تثبيت وقفل' : t === 'payment' ? 'دفعة' : t)

  const ENTITY_LABELS: Record<string, string> = {
    maintenance_invoice: 'فاتورة صيانة',
    direct_sale_invoice: 'فاتورة بيع مباشر',
    supplier_invoice: 'فاتورة مورد',
    daily_expense: 'مصروف يومي',
    employee: 'موظف',
    salary_payment: 'دفعة راتب',
    warranty: 'كفالة',
    supplier_directory: 'مورد (دليل)',
    cash_audit: 'حساب آخر اليوم',
    supplier_bulk_payment: 'دفعة على الحساب لمورد',
  }
  const entityLabel = (t: string) => ENTITY_LABELS[t] ?? t

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">الإعدادات</h1>
      </div>

      <div className="mi-card">
        <h2 className="mi-section-title">هوية الكراج</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 520 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {garageLogo && (
              <img
                src={garageLogo}
                alt={garageName || 'اسم الكراج'}
                style={{ maxHeight: 48, maxWidth: 120, objectFit: 'contain', borderRadius: 6, border: '1px solid #e8edf2', padding: 4, background: '#fff' }}
              />
            )}
            <div>
              <div style={rowTitle}>{garageName.trim() || 'اسم الكراج'}</div>
              <div style={rowDesc}>{garageLogo ? 'الشعار مفعّل' : 'لم يتم تعيين شعار بعد'}</div>
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #e8edf2', margin: 0 }} />

          <div style={rowStyle}>
            <div style={{ flex: 1 }}>
              <div style={rowTitle}>اسم الكراج</div>
              <input
                type="text"
                style={textInputStyle}
                placeholder="اسم الكراج"
                value={garageName}
                disabled={!identityLoaded || identitySaving}
                onChange={e => setGarageName(e.target.value)}
              />
            </div>
            <button
              className="btn btn-primary"
              style={{ flexShrink: 0, alignSelf: 'flex-end' }}
              onClick={handleSaveGarageName}
              disabled={!identityLoaded || identitySaving}
            >
              {identitySaving ? 'جارٍ الحفظ…' : 'حفظ'}
            </button>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #e8edf2', margin: 0 }} />

          <div style={rowStyle}>
            <div>
              <div style={rowTitle}>شعار الكراج</div>
              <div style={rowDesc}>اختر صورة شعار الكراج من جهازك</div>
            </div>
            <button
              className="btn btn-secondary"
              style={{ flexShrink: 0 }}
              onClick={handlePickGarageLogo}
              disabled={!identityLoaded || identitySaving}
            >
              اختيار شعار
            </button>
          </div>

          {identityMsg && <div style={successMsg}>{identityMsg}</div>}
        </div>
      </div>

      <div className="mi-card">
        <h2 className="mi-section-title">النسخ الاحتياطي</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 520 }}>
          {/* تصدير */}
          <div style={rowStyle}>
            <div>
              <div style={rowTitle}>حفظ نسخة احتياطية</div>
              <div style={rowDesc}>
                يحفظ كل بيانات الكراج في ملف نسخة احتياطية بالمكان اللي تختاره
              </div>
              {exportMsg && (
                <div style={successMsg}>{exportMsg}</div>
              )}
            </div>
            <button
              className="btn btn-primary"
              style={{ flexShrink: 0 }}
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? 'جاري الحفظ…' : 'حفظ نسخة'}
            </button>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #e8edf2', margin: 0 }} />

          {/* استيراد */}
          <div style={rowStyle}>
            <div>
              <div style={rowTitle}>استرجاع نسخة احتياطية</div>
              <div style={rowDesc}>
                يبدّل بيانات الكراج الحالية بالملف اللي تختاره ويعيد تشغيل البرنامج.
                البرنامج بحفظ نسخة احتياطية تلقائية قبل ما يبدّل البيانات.
              </div>
              <div style={{ marginTop: '0.4rem', fontSize: '0.82rem', color: '#E74C3C', fontWeight: 600 }}>
                تحذير: هذه الخطوة ما بتقدر تتراجع عنها
              </div>
            </div>
            <button
              className="btn btn-danger"
              style={{ flexShrink: 0 }}
              onClick={() => setShowImportDlg(true)}
              disabled={importing}
            >
              {importing ? 'جاري الاسترجاع…' : 'استرجاع'}
            </button>
          </div>
        </div>
      </div>

      {/* ── قسم منفصل تماماً: النسخ الاحتياطي التلقائي ── */}
      <div className="mi-card">
        <h2 className="mi-section-title">النسخ الاحتياطي التلقائي</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 560 }}>
          <div style={rowDesc}>
            حفظ نسخة من بيانات الكراج تلقائياً داخل مجلد تختاره على جهازك (مثلاً مجلد Google Drive أو Dropbox).
            البرنامج بنسخ الملف للمجلد فقط.
          </div>

          {/* المجلد */}
          <div style={rowStyle}>
            <div>
              <div style={rowTitle}>مجلد النسخ التلقائي</div>
              <div style={{ ...rowDesc, wordBreak: 'break-all' }}>
                {autoFolder ?? 'لم يتم تحديد مجلد بعد'}
              </div>
            </div>
            <button
              className="btn btn-secondary"
              style={{ flexShrink: 0 }}
              onClick={handlePickFolder}
              disabled={!autoLoaded || autoSaving}
            >
              اختيار مجلد…
            </button>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #e8edf2', margin: 0 }} />

          {/* التفعيل */}
          <div style={rowStyle}>
            <div>
              <div style={rowTitle}>تفعيل النسخ التلقائي</div>
              <div style={rowDesc}>
                عند التفعيل، تُنفَّذ نسخة تلقائية بالخلفية عند تشغيل التطبيق (إذا مرّ يوم كامل
                على آخر نسخة ناجحة) وعند إغلاقه.
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0, cursor: 'pointer' }}>
              <input
                type="checkbox"
                className="mi-checkbox"
                checked={autoEnabled}
                disabled={!autoLoaded || autoSaving}
                onChange={e => handleToggleEnabled(e.target.checked)}
              />
              <span style={{ fontSize: '0.86rem', color: '#444' }}>{autoEnabled ? 'مفعّل' : 'معطّل'}</span>
            </label>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #e8edf2', margin: 0 }} />

          {/* عدد النسخ المحتفظ بها */}
          <div style={rowStyle}>
            <div>
              <div style={rowTitle}>عدد النسخ المحتفظ بها</div>
              <div style={rowDesc}>
                عند تجاوز هذا العدد، تُحذف أقدم نسخة تلقائية تلقائياً من المجلد المحدد
              </div>
            </div>
            <input
              type="number"
              min={1}
              style={{ ...numberInputStyle, flexShrink: 0 }}
              value={autoKeepCount}
              disabled={!autoLoaded || autoSaving}
              onChange={e => setAutoKeepCount(Number(e.target.value) || 1)}
              onBlur={handleKeepCountBlur}
            />
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #e8edf2', margin: 0 }} />

          {/* المسار الثاني (اختياري) */}
          <div style={rowStyle}>
            <div style={{ flex: 1 }}>
              <div style={rowTitle}>مجلد نسخ احتياطي ثاني (اختياري)</div>
              <div style={rowDesc}>
                مجلد إضافي بتنسخ فيه نفس النسخة (مثلاً مجلد مزامنة أو فلاشة). اتركه فاضي لو ما بدك إياه.
              </div>
              <input
                type="text"
                dir="ltr"
                style={textInputStyle}
                placeholder="اختياري: اكتب مسار المجلد أو اختاره من الزر"
                value={secondaryFolderText}
                disabled={!autoLoaded || autoSaving}
                onChange={e => setSecondaryFolderText(e.target.value)}
                onBlur={handleSecondaryFolderBlur}
              />
              <div style={{ marginTop: '0.5rem', fontSize: '0.83rem', color: '#444' }}>
                آخر نسخة للمجلد الثاني:{' '}
                {secondaryFolderText.trim() === '' ? (
                  <span style={{ color: '#999' }}>غير مفعّل</span>
                ) : autoStatus?.secondaryLastStatus === 'success' ? (
                  <span style={{ color: '#1a7a45', fontWeight: 600 }}>
                    نجحت ({formatDateTime(autoStatus.secondaryLastSuccessAt)})
                  </span>
                ) : autoStatus?.secondaryLastStatus === 'failed' ? (
                  <span style={{ color: '#E74C3C', fontWeight: 600, wordBreak: 'break-all' }}>
                    ما زبطت — تأكد من المجلد{autoStatus.secondaryLastError ? ` (${toSimpleError(autoStatus.secondaryLastError, 'المجلد مش متاح')})` : ''}
                  </span>
                ) : (
                  <span style={{ color: '#999' }}>لسا ما انعملت ولا نسخة</span>
                )}
              </div>
            </div>
            <button
              className="btn btn-secondary"
              style={{ flexShrink: 0 }}
              onClick={handlePickSecondaryFolder}
              disabled={!autoLoaded || autoSaving}
            >
              اختيار مجلد…
            </button>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #e8edf2', margin: 0 }} />

          {/* نسخ الآن + الحالة */}
          <div style={rowStyle}>
            <div>
              <div style={rowTitle}>نسخ الآن يدوياً</div>
              <div style={rowDesc}>
                عشان تجرّب الحفظ فوراً بدون انتظار
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.83rem', color: '#444' }}>
                آخر نسخة ناجحة: {formatDateTime(autoStatus?.lastSuccessAt ?? null)}
              </div>
              {autoStatus?.lastStatus && (
                <div style={autoStatus.lastStatus === 'success' ? statusOk : statusFail}>
                  {autoStatus.lastStatus === 'success'
                    ? `آخر محاولة (${formatDateTime(autoStatus.lastRunAt)}): نجحت`
                    : `آخر محاولة (${formatDateTime(autoStatus.lastRunAt)}): ما زبطت — ${toSimpleError(autoStatus.lastError, 'صار خطأ')}`}
                </div>
              )}
              {autoRunMsg && <div style={successMsg}>{autoRunMsg}</div>}
            </div>
            <button
              className="btn btn-primary"
              style={{ flexShrink: 0 }}
              onClick={handleRunNow}
              disabled={!autoLoaded || autoRunning}
            >
              {autoRunning ? 'جاري النسخ…' : 'نسخ الآن يدوياً'}
            </button>
          </div>
        </div>
      </div>

      {/* ── قسم جديد: تغيير كلمة السر ── */}
      <div className="mi-card">
        <h2 className="mi-section-title">تغيير كلمة السر</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 420 }}>
          <label className="mi-field">
            <span>كلمة السر الحالية</span>
            <PasswordInput value={oldPassword} onChange={setOldPassword} placeholder="كلمة السر الحالية" />
          </label>
          <label className="mi-field">
            <span>كلمة السر الجديدة</span>
            <PasswordInput value={newPassword} onChange={setNewPassword} placeholder="6 أحرف على الأقل" />
          </label>
          <label className="mi-field">
            <span>تأكيد كلمة السر الجديدة</span>
            <PasswordInput value={confirmPassword} onChange={setConfirmPassword} placeholder="أعد كتابة كلمة السر الجديدة" />
          </label>
          {passwordErr && <span className="mi-err">{passwordErr}</span>}
          {passwordMsg && <div style={successMsg}>{passwordMsg}</div>}
          <button
            className="btn btn-primary"
            style={{ alignSelf: 'flex-start' }}
            onClick={handleChangePassword}
            disabled={changingPassword || !oldPassword || !newPassword || !confirmPassword}
          >
            {changingPassword ? 'جارٍ الحفظ…' : 'حفظ كلمة السر الجديدة'}
          </button>
        </div>
      </div>

      {/* ── قسم جديد: القفل التلقائي ── */}
      <div className="mi-card">
        <h2 className="mi-section-title">القفل التلقائي</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 520 }}>
          <div style={rowStyle}>
            <div>
              <div style={rowTitle}>تفعيل القفل التلقائي</div>
              <div style={rowDesc}>يقفل البرنامج بشاشة كلمة السر تلقائياً لو تركته بدون استخدام لفترة</div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0, cursor: 'pointer' }}>
              <input
                type="checkbox"
                className="mi-checkbox"
                checked={lockEnabled}
                disabled={!lockLoaded || lockSaving}
                onChange={e => { setLockEnabled(e.target.checked); void persistLockSettings({ enabled: e.target.checked }) }}
              />
              <span style={{ fontSize: '0.86rem', color: '#444' }}>{lockEnabled ? 'مفعّل' : 'معطّل'}</span>
            </label>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #e8edf2', margin: 0 }} />

          <div style={rowStyle}>
            <div>
              <div style={rowTitle}>المدة قبل القفل (بالدقائق)</div>
              <div style={rowDesc}>كم دقيقة بدون استخدام وبعدها يقفل البرنامج</div>
            </div>
            <input
              type="number"
              min={1}
              style={{ ...numberInputStyle, flexShrink: 0 }}
              value={lockMinutes}
              disabled={!lockLoaded || lockSaving}
              onChange={e => setLockMinutes(Number(e.target.value) || 1)}
              onBlur={() => persistLockSettings({ minutes: lockMinutes })}
            />
          </div>
        </div>
      </div>

      {/* ── قسم جديد: الضريبة — اختيارية، معطّلة افتراضياً ── */}
      <div className="mi-card">
        <h2 className="mi-section-title">الضريبة</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 520 }}>
          <div style={rowStyle}>
            <div>
              <div style={rowTitle}>تفعيل الضريبة</div>
              <div style={rowDesc}>لو مفعّلة تنحسب الضريبة تلقائياً وتظهر في الفواتير المطبوعة وتفاصيل الفواتير. ولو معطّلة ما بتظهر بأي مكان.</div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0, cursor: 'pointer' }}>
              <input
                type="checkbox"
                className="mi-checkbox"
                checked={vatEnabled}
                disabled={!vatLoaded || vatSaving}
                onChange={e => { setVatEnabled(e.target.checked); void persistVatSettings({ enabled: e.target.checked }) }}
              />
              <span style={{ fontSize: '0.86rem', color: '#444' }}>{vatEnabled ? 'مفعّلة' : 'معطّلة'}</span>
            </label>
          </div>

          {vatEnabled && (
            <>
              <hr style={{ border: 'none', borderTop: '1px solid #e8edf2', margin: 0 }} />

              <div style={rowStyle}>
                <div>
                  <div style={rowTitle}>نسبة الضريبة (%)</div>
                  <div style={rowDesc}>النسبة اللي تنحسب على المجموع بعد الخصم (مثلاً 16%).</div>
                </div>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  style={{ ...numberInputStyle, flexShrink: 0 }}
                  value={vatRate}
                  disabled={!vatLoaded || vatSaving}
                  onChange={e => setVatRate(Number(e.target.value) || 0)}
                  onBlur={() => persistVatSettings({ rate: vatRate })}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── قسم جديد: سجل التعديلات والحذف (قراءة فقط) ── */}
      <div className="mi-card">
        <h2 className="mi-section-title">سجل التعديلات والحذف</h2>
        <div style={rowDesc}>يعرض آخر 200 حركة تعديل أو حذف صارت في البرنامج للمراجعة.</div>

        <div className="mi-table-wrap" style={{ marginTop: '1rem' }}>
          <table className="mi-table">
            <thead>
              <tr><th>التاريخ</th><th>العملية</th><th>النوع</th><th>التفاصيل</th></tr>
            </thead>
            <tbody>
              {activityLog.map(row => (
                <tr key={row.id}>
                  <td>{formatLogDate(row.created_at)}</td>
                  <td>{actionLabel(row.action_type)}</td>
                  <td>{entityLabel(row.entity_type)}</td>
                  <td>{row.details ?? '—'}</td>
                </tr>
              ))}
              {activityLoaded && activityLog.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: '#999' }}>ما في حركات مسجّلة بعد</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showImportDlg && (
        <ConfirmDialog
          title="تأكيد استرجاع النسخة الاحتياطية"
          message="رح تتبدّل كل بيانات البرنامج بالنسخة اللي اخترتها ويعيد تشغيل البرنامج. (البرنامج بحفظ نسخة أمان تلقائية قبل التبديل). بدك تكمل؟"
          requirePassword={true}
          onConfirm={handleImportConfirm}
          onCancel={() => setShowImportDlg(false)}
        />
      )}
    </div>
  )
}

/* ── Inline styles ── */
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start',
  justifyContent: 'space-between', gap: '1.5rem',
}

const rowTitle: React.CSSProperties = {
  fontWeight: 600, fontSize: '0.97rem', color: '#1E2A38', marginBottom: '0.3rem',
}

const rowDesc: React.CSSProperties = {
  fontSize: '0.86rem', color: '#666', lineHeight: 1.5,
}

const successMsg: React.CSSProperties = {
  marginTop: '0.5rem', padding: '0.45rem 0.75rem',
  background: '#d4f5e3', border: '1px solid #a8e6c0',
  borderRadius: 6, fontSize: '0.83rem', color: '#1a7a45',
  wordBreak: 'break-all',
}

const statusOk: React.CSSProperties = {
  marginTop: '0.4rem', fontSize: '0.82rem', color: '#1a7a45', fontWeight: 600,
}

const statusFail: React.CSSProperties = {
  marginTop: '0.4rem', fontSize: '0.82rem', color: '#E74C3C', fontWeight: 600,
  wordBreak: 'break-all',
}

const numberInputStyle: React.CSSProperties = {
  width: 80, padding: '0.5rem 0.65rem', border: '1px solid #ddd',
  borderRadius: 6, background: '#fafafa', fontSize: '0.92rem',
  textAlign: 'center', outline: 'none',
}

const textInputStyle: React.CSSProperties = {
  width: '100%', marginTop: '0.5rem', padding: '0.5rem 0.65rem',
  border: '1px solid #ddd', borderRadius: 6, background: '#fafafa',
  fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box',
}
