export function printPdf(title: string, bodyHtml: string): void {
  const win = window.open('', '_blank', 'width=794,height=1123')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet"/>
  <style>
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
    <h1>🔧 كراج التل الأخضر</h1>
    <h2>${title}</h2>
  </div>
  ${bodyHtml}
  <div class="footer">تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG-u-nu-latn', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</div>
</body></html>`)
  win.document.close()
  win.onload = () => { win.print(); win.addEventListener('afterprint', () => win.close()) }
}
