<#
════════════════════════════════════════════════════════════════════════════
 reset-dev-license.ps1 — تصفير آثار الترخيص على جهاز تطوير/اختبار فقط
────────────────────────────────────────────────────────────────────────────
 ⚠️ أداة تطوير فقط — لا تُشغَّل إطلاقاً على جهاز عميل حقيقي.
 تزيل آثار قفل الجهاز (H4) المتبقية من تجارب سابقة حتى يُعامَل التشغيل
 القادم للنسخة المحزَّمة كـ"أول تشغيل حقيقي" ويُعاد ربط الجهاز من جديد.

 المصادر التي أُخذت منها الأسماء والمسارات (لا تغيّرها هنا دون تغييرها هناك):
   - electron/license.ts      → REGISTRY_PATH = HKCU\Software\GreenLineGarage
                                 REGISTRY_VALUE = lic
                                 الملف المخفي  = <userData>\.glg-lic
   - src/database.ts          → garage.db داخل <userData>
   - package.json             → name = car-repair-shop
                                 (userData الفعلي: %APPDATA%\car-repair-shop —
                                 للنسخة المحزَّمة ولوضع التطوير معاً، لأن productName
                                 غير معرَّف في package.json نفسه؛ تحقّقنا من هذا
                                 عملياً بتشغيل النسخة المحزَّمة يوم 2026-07-05)
   - electron-builder.json5   → productName = GreenLineGarage (اسم الـ exe فقط؛
                                 يُشمل مجلد %APPDATA%\GreenLineGarage احتياطاً لو
                                 أُضيف productName إلى package.json مستقبلاً)

 ما يفعله السكربت:
   1) يحذف مفتاح الريجستري HKCU\Software\GreenLineGarage بالكامل.
   2) يحذف الملف المخفي .glg-lic من مجلدَي بيانات البرنامج (إن وُجد).
   3) ينقل (rename — لا يحذف) كل مجلد بيانات موجود إلى نسخة احتياطية
      بلاحقة _OLD_BACKUP_<طابع زمني> في نفس المكان، تحسّباً للرجوع إليها.

 الاستخدام:
   npm run reset-dev-license              (مع سؤال تأكيد Y/N)
   npm run reset-dev-license -- -Force    (بدون تأكيد)
════════════════════════════════════════════════════════════════════════════
#>
[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

# ── الأسماء الفعلية كما في الكود ────────────────────────────────────────────
$RegistryPath = 'HKCU:\Software\GreenLineGarage'        # license.ts → REGISTRY_PATH
$MarkFileName = '.glg-lic'                              # license.ts → externalMarkFilePath()
$DataFolders  = @(
    (Join-Path $env:APPDATA 'car-repair-shop'),         # userData الفعلي (محزَّم + تطوير)
    (Join-Path $env:APPDATA 'GreenLineGarage')          # احتياط لو أُضيف productName لاحقاً
)

Write-Host ''
Write-Host '⚠️  تصفير آثار الترخيص — أداة تطوير/اختبار فقط' -ForegroundColor Yellow
Write-Host '   لا تستخدم هذا السكربت أبداً على جهاز عميل حقيقي!' -ForegroundColor Yellow
Write-Host ''
Write-Host 'سيتم تنفيذ التالي:'
Write-Host "  1) حذف مفتاح الريجستري: $RegistryPath"
foreach ($folder in $DataFolders) {
    if (Test-Path $folder) {
        Write-Host "  2) حذف $MarkFileName ثم نقل المجلد إلى نسخة احتياطية: $folder"
    }
}
Write-Host ''

if (-not $Force) {
    $answer = Read-Host 'هل أنت متأكد؟ هذا يمسّ بيانات فعلية على هذا الجهاز (Y/N)'
    if ($answer -notmatch '^[Yy]') {
        Write-Host 'أُلغيت العملية — لم يتغيّر أي شيء.' -ForegroundColor Cyan
        exit 0
    }
}

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$didAnything = $false

# ── 1) مفتاح الريجستري ─────────────────────────────────────────────────────
if (Test-Path $RegistryPath) {
    Remove-Item -Path $RegistryPath -Recurse -Force -Confirm:$false
    Write-Host "✔ حُذف مفتاح الريجستري: $RegistryPath" -ForegroundColor Green
    $didAnything = $true
} else {
    Write-Host "– مفتاح الريجستري غير موجود أصلاً: $RegistryPath"
}

# ── 2) و 3) الملف المخفي + نقل مجلدات البيانات ─────────────────────────────
foreach ($folder in $DataFolders) {
    if (-not (Test-Path $folder)) {
        Write-Host "– مجلد البيانات غير موجود أصلاً: $folder"
        continue
    }

    $markFile = Join-Path $folder $MarkFileName
    if (Test-Path $markFile) {
        Remove-Item -Path $markFile -Force -Confirm:$false
        Write-Host "✔ حُذف الملف المخفي: $markFile" -ForegroundColor Green
    }

    $backupPath = "${folder}_OLD_BACKUP_$timestamp"
    try {
        Rename-Item -Path $folder -NewName (Split-Path $backupPath -Leaf) -Force
        Write-Host "✔ نُقل مجلد البيانات إلى: $backupPath" -ForegroundColor Green
        $didAnything = $true
    } catch {
        Write-Host "✘ تعذّر نقل المجلد (هل البرنامج قيد التشغيل؟ أغلقه ثم أعد المحاولة): $folder" -ForegroundColor Red
        Write-Host "   التفاصيل: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

# ── الخلاصة ────────────────────────────────────────────────────────────────
Write-Host ''
if ($didAnything) {
    Write-Host '✅ الجهاز الآن "نظيف" من آثار الترخيص.' -ForegroundColor Green
    Write-Host '   أي تشغيل قادم للنسخة المحزَّمة سيُعامل كـ"أول تشغيل حقيقي"' -ForegroundColor Green
    Write-Host '   وسيُعاد ربط الجهاز تلقائياً دون رسالة "غير مصرح".' -ForegroundColor Green
    Write-Host ''
    Write-Host "   بياناتك القديمة محفوظة في مجلدات *_OLD_BACKUP_$timestamp داخل:" -ForegroundColor Cyan
    Write-Host "   $env:APPDATA" -ForegroundColor Cyan
    Write-Host '   (احذفها يدوياً لاحقاً إن لم تعد بحاجة إليها.)' -ForegroundColor Cyan
} else {
    Write-Host 'ℹ️ لم يكن هناك أي أثر ترخيص أو مجلد بيانات — الجهاز نظيف أصلاً.' -ForegroundColor Cyan
}
Write-Host ''
