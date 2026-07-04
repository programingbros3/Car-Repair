import { useEffect, useState } from 'react'
import ConfirmDialog from '../components/ConfirmDialog'
import PasswordInput from '../components/PasswordInput'
import { dbService } from '../services/db'
import { showError } from '../utils/notify'
import type { AutoBackupSettings, AutoBackupStatus, AutoLockSettings, ActivityLogRow, VatSettings } from '../db/types'

/* ════════════════════════════════════════
   Settings — النسخ الاحتياطي (يدوي) + النسخ الاحتياطي التلقائي
   + الأمان: تغيير كلمة السر / القفل التلقائي عند الخمول / سجل النشاط
════════════════════════════════════════ */
export default function Settings() {
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
      if (filePath) setExportMsg(`تم الحفظ في: ${filePath}`)
    } catch (err) {
      showError('فشل تصدير النسخة الاحتياطية', err)
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
      showError('فشل استيراد النسخة الاحتياطية', err)
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
        showError('تعذّر تحميل إعدادات النسخ الاحتياطي التلقائي', err)
      } finally {
        setAutoLoaded(true)
      }
    })()
  }, [])

  const applySettings = (settings: AutoBackupSettings) => {
    setAutoFolder(settings.folder)
    setAutoEnabled(settings.enabled)
    setAutoKeepCount(settings.keepCount)
  }

  const persistAutoSettings = async (updates: Partial<AutoBackupSettings>) => {
    setAutoSaving(true)
    try {
      const settings = await dbService.autoBackup.updateSettings(updates)
      applySettings(settings)
    } catch (err) {
      showError('فشل حفظ إعدادات النسخ الاحتياطي التلقائي', err)
    } finally {
      setAutoSaving(false)
    }
  }

  const handlePickFolder = async () => {
    try {
      const folder = await dbService.autoBackup.pickFolder()
      if (folder) await persistAutoSettings({ folder })
    } catch (err) {
      showError('فشل اختيار المجلد', err)
    }
  }

  const handleToggleEnabled = (checked: boolean) => {
    setAutoEnabled(checked)
    void persistAutoSettings({ enabled: checked })
  }

  const handleKeepCountBlur = () => {
    void persistAutoSettings({ keepCount: autoKeepCount })
  }

  const handleRunNow = async () => {
    setAutoRunning(true)
    setAutoRunMsg(null)
    try {
      const result = await dbService.autoBackup.runNow()
      const status = await dbService.autoBackup.getStatus()
      setAutoStatus(status)
      setAutoRunMsg(result.success ? `تم الحفظ في: ${result.filePath}` : `فشلت المحاولة: ${result.error}`)
    } catch (err) {
      showError('فشل تنفيذ النسخة الاحتياطية التلقائية', err)
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
    if (newPassword.length < 6) { setPasswordErr('كلمة السر الجديدة يجب أن تكون 6 أحرف على الأقل'); return }
    if (newPassword !== confirmPassword) { setPasswordErr('كلمة السر الجديدة غير متطابقة مع التأكيد'); return }
    setChangingPassword(true)
    try {
      await dbService.auth.changePassword(oldPassword, newPassword)
      setPasswordMsg('تم تغيير كلمة السر بنجاح')
      setOldPassword(''); setNewPassword(''); setConfirmPassword('')
    } catch (err) {
      setPasswordErr(err instanceof Error ? err.message : 'فشل تغيير كلمة السر')
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
        showError('تعذّر تحميل إعدادات القفل التلقائي', err)
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
      showError('فشل حفظ إعدادات القفل التلقائي', err)
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
        showError('تعذّر تحميل إعدادات الضريبة', err)
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
      showError('فشل حفظ إعدادات الضريبة', err)
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
        showError('تعذّر تحميل سجل النشاط', err)
      } finally {
        setActivityLoaded(true)
      }
    })()
  }, [])

  const formatLogDate = (iso: string) => new Date(iso).toLocaleString('ar-EG-u-nu-latn', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })

  const actionLabel = (t: string) => (t === 'update' ? 'تعديل' : t === 'delete' ? 'حذف' : t === 'deliver' ? 'تسليم' : t === 'lock' ? 'تثبيت وقفل' : t)

  const ENTITY_LABELS: Record<string, string> = {
    maintenance_invoice: 'فاتورة صيانة',
    direct_sale_invoice: 'فاتورة بيع مباشر',
    supplier_invoice: 'فاتورة مورد',
    daily_expense: 'مصروف يومي',
    employee: 'موظف',
    salary_payment: 'دفعة راتب',
    warranty: 'كفالة',
    supplier_directory: 'مورد (دليل)',
    cash_audit: 'إحصاء نهاية اليوم',
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
        <h2 className="mi-section-title">النسخ الاحتياطي</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 520 }}>
          {/* تصدير */}
          <div style={rowStyle}>
            <div>
              <div style={rowTitle}>تصدير نسخة احتياطية</div>
              <div style={rowDesc}>
                يحفظ قاعدة البيانات الحالية كملف <code>.db</code> في المكان الذي تختاره
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
              {exporting ? 'جارٍ التصدير…' : 'تصدير'}
            </button>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #e8edf2', margin: 0 }} />

          {/* استيراد */}
          <div style={rowStyle}>
            <div>
              <div style={rowTitle}>استيراد نسخة احتياطية</div>
              <div style={rowDesc}>
                يستبدل قاعدة البيانات الحالية بالملف المختار ثم يُعيد تشغيل التطبيق تلقائياً.
                يُنشئ نسخة احتياطية تلقائية من القاعدة الحالية قبل الاستبدال.
              </div>
              <div style={{ marginTop: '0.4rem', fontSize: '0.82rem', color: '#E74C3C', fontWeight: 600 }}>
                تحذير: هذه العملية لا يمكن التراجع عنها
              </div>
            </div>
            <button
              className="btn btn-danger"
              style={{ flexShrink: 0 }}
              onClick={() => setShowImportDlg(true)}
              disabled={importing}
            >
              {importing ? 'جارٍ الاستيراد…' : 'استيراد'}
            </button>
          </div>
        </div>
      </div>

      {/* ── قسم منفصل تماماً: النسخ الاحتياطي التلقائي ── */}
      <div className="mi-card">
        <h2 className="mi-section-title">النسخ الاحتياطي التلقائي</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 560 }}>
          <div style={rowDesc}>
            نسخ دوري لملف قاعدة البيانات إلى مجلد تختاره (مثلاً مجلد Google Drive أو Dropbox
            المتزامن محلياً على جهازك). التطبيق لا يرفع أي شيء بنفسه للسحابة — فقط ينسخ الملف
            محلياً، وبرنامج المزامنة عندك يتكفّل بالرفع.
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

          {/* نسخ الآن + الحالة */}
          <div style={rowStyle}>
            <div>
              <div style={rowTitle}>نسخ الآن يدوياً لهذا المسار</div>
              <div style={rowDesc}>
                لتجربة الإعدادات فوراً دون انتظار الجدولة التلقائية
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.83rem', color: '#444' }}>
                آخر نسخة ناجحة: {formatDateTime(autoStatus?.lastSuccessAt ?? null)}
              </div>
              {autoStatus?.lastStatus && (
                <div style={autoStatus.lastStatus === 'success' ? statusOk : statusFail}>
                  {autoStatus.lastStatus === 'success'
                    ? `آخر محاولة (${formatDateTime(autoStatus.lastRunAt)}): نجحت`
                    : `آخر محاولة (${formatDateTime(autoStatus.lastRunAt)}): فشلت — ${autoStatus.lastError ?? ''}`}
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
              {autoRunning ? 'جارٍ النسخ…' : 'نسخ الآن يدوياً'}
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

      {/* ── قسم جديد: القفل التلقائي عند الخمول ── */}
      <div className="mi-card">
        <h2 className="mi-section-title">القفل التلقائي عند الخمول</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 520 }}>
          <div style={rowStyle}>
            <div>
              <div style={rowTitle}>تفعيل القفل التلقائي</div>
              <div style={rowDesc}>يُعاد عرض شاشة كلمة السر تلقائياً بعد فترة خمول بلا أي حركة</div>
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
              <div style={rowTitle}>مدة الخمول (بالدقائق)</div>
              <div style={rowDesc}>عدد دقائق عدم الحركة قبل القفل التلقائي</div>
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

      {/* ── قسم جديد: الضريبة (VAT) — اختيارية، معطّلة افتراضياً ── */}
      <div className="mi-card">
        <h2 className="mi-section-title">الضريبة (VAT)</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 520 }}>
          <div style={rowStyle}>
            <div>
              <div style={rowTitle}>تفعيل الضريبة</div>
              <div style={rowDesc}>عند التفعيل تظهر الضريبة المحسوبة تلقائياً في مودالات تفاصيل الفواتير والإيصالات المطبوعة. عند التعطيل لا يظهر أي شيء متعلق بالضريبة في أي مكان.</div>
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
                  <div style={rowDesc}>النسبة المئوية المطبَّقة على المجموع بعد الخصم (الضريبة الرسمية في فلسطين 16%).</div>
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

      {/* ── قسم جديد: سجل النشاط (قراءة فقط) ── */}
      <div className="mi-card">
        <h2 className="mi-section-title">سجل النشاط</h2>
        <div style={rowDesc}>سجل قراءة فقط لآخر عمليات التعديل والحذف الحساسة (آخر 200 عملية) — لغرض المراجعة.</div>

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
                <tr><td colSpan={4} style={{ textAlign: 'center', color: '#999' }}>لا يوجد نشاط مسجَّل بعد</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showImportDlg && (
        <ConfirmDialog
          title="تأكيد استيراد النسخة الاحتياطية"
          message="ستُستبدل قاعدة البيانات الحالية بالكامل وسيُعاد تشغيل التطبيق. سيتم حفظ نسخة احتياطية تلقائية من البيانات الحالية. هل أنت متأكد؟"
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
