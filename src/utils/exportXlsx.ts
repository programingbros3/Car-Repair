import * as XLSX from 'xlsx'

/**
 * تصدير البيانات إلى ملف Excel حقيقي (.xlsx) عبر مكتبة SheetJS.
 *
 * بنفس فلسفة exportToCsv (تنزيل مباشر في المتصفح عبر Blob بدون خادم) لكنه
 * يُنتج ملف xlsx حقيقياً وليس CSV بامتداد مختلف.
 *
 * قرار التصميم — الأرقام مقابل النصوص:
 * - الأرقام (number) تُكتب في الخلايا كأرقام حقيقية (نوع الخلية 'n') لكي تعمل
 *   معادلات Excel عليها مباشرة (SUM/AVG…) إن احتاجها المستخدم.
 * - التواريخ تصل من المُستدعي كنصوص عربية مقروءة جاهزة (نفس النصوص التي يمرّرها
 *   لـ exportToCsv) فتبقى كما هي نصاً — لا تُحوَّل إلى تسلسل تاريخ Excel لأنها
 *   قد تكون بصيغ مختلفة (YYYY-MM-DD، اسم شهر عربي…) لا تُحلَّل بشكل موحّد، والنص
 *   المقروء أنسب هنا وأكثر مطابقةً لسلوك CSV.
 */
export function exportToXlsx(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
  sheetName = 'تقرير',
): void {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])

  const wb = XLSX.utils.book_new()
  // اتجاه الورقة من اليمين لليسار ليطابق واجهة التطبيق العربية
  wb.Workbook = { Views: [{ RTL: true }] }
  // أسماء أوراق Excel محدودة بـ 31 حرفاً
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
