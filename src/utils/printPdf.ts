import tajawal400 from '@fontsource/tajawal/400.css?inline'
import tajawal700 from '@fontsource/tajawal/700.css?inline'
import { dbService } from '../services/db'

/* H3: كل قيمة مصدرها المستخدم (اسم زبون، ملاحظة، اسم قطعة…) يجب أن تمرّ من هنا
   قبل حقنها في HTML الطباعة — وإلا نفّذت نافذة الطباعة أي وسوم/سكربتات مكتوبة
   داخل البيانات (حقن HTML مخزَّن). تُستخدم في printPdf نفسها وفي كل المستدعين. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function printPdf(title: string, bodyHtml: string): Promise<void> {
  let garageName = 'اسم الكراج'
  let garageLogo = ''
  try {
    const identity = await dbService.garageIdentity.get()
    if (identity.garage_name.trim()) garageName = identity.garage_name.trim()
    if (identity.garage_logo.trim()) garageLogo = identity.garage_logo.trim()
  } catch { /* fallback to default */ }

  const win = window.open('', '_blank', 'width=794,height=1123')
  if (!win) return
  const logoHtml = garageLogo
    ? `<img src="${escapeHtml(garageLogo)}" alt="${escapeHtml(garageName)}" style="max-height:56px;max-width:180px;object-fit:contain;display:block;margin:0 auto 6px;"/>`
    : ''
  win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeHtml(title)}</title>
  <style>
    ${tajawal400}
    ${tajawal700}
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Tajawal',sans-serif; direction:rtl; padding:20mm; color:#213547; font-size:13px; }
    .header { text-align:center; margin-bottom:24px; border-bottom:2px solid #1E2A38; padding-bottom:12px; }
    .header h1 { font-size:22px; color:#1E2A38; }
    .header h2 { font-size:15px; color:#555; margin-top:4px; }
    .detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:16px; }
    .detail-item label { font-size:11px; color:#888; display:block; margin-bottom:2px; }
    .detail-item span { font-weight:600; color:#1E2A38; }
    table { width:100%; border-collapse:collapse; margin-top:16px; }
    th { background:#1E2A38; color:#fff; padding:8px 10px; text-align:right; font-size:12px; }
    td { padding:7px 10px; border-bottom:1px solid #eee; font-size:12px; }
    tr:nth-child(even) td { background:#f8fafc; }
    .amount-in { color:#27ae60; font-weight:700; }
    .amount-out { color:#E74C3C; font-weight:700; }
    .footer { margin-top:32px; text-align:center; font-size:11px; color:#aaa; border-top:1px solid #eee; padding-top:12px; }
    @page { size:A4; margin:0; }
    @media print { body { padding:15mm; } }
  </style>
</head>
<body>
  <div class="header">
    ${logoHtml}
    <h1>${garageLogo ? '' : '🔧 '}${escapeHtml(garageName)}</h1>
    <h2>${escapeHtml(title)}</h2>
  </div>
  ${bodyHtml}
  <div class="footer">تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG-u-nu-latn', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</div>
</body></html>`)
  win.document.close()
  win.onload = () => { win.print(); win.addEventListener('afterprint', () => win.close()) }
}
