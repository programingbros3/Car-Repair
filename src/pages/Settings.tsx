import { useState } from 'react'
import ConfirmDialog from '../components/ConfirmDialog'
import { dbService } from '../services/db'
import { showError } from '../utils/notify'

/* ════════════════════════════════════════
   Settings — النسخ الاحتياطي واستعادة البيانات
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
      // التطبيق سيُعاد تشغيله تلقائياً — هذا الكود لن يُنفَّذ عادةً
    } catch (err) {
      showError('فشل استيراد النسخة الاحتياطية', err)
      setImporting(false)
    }
  }

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
