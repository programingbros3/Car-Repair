# أدوات المحاكاة والتحقق (خارج مسار الإنتاج)

> ⚠️ هذه الأدوات **لا تُحزَّم مع التطبيق** ولا تُستدعى من `npm run dev`/`npm run build`
> العاديين. مخصّصة للتدقيق والاختبار فقط. **لا تمسّ قاعدة بيانات الإنتاج**
> (`garage.db` في مجلد `userData`) إطلاقاً.

## الملفات

| الملف | الغرض |
|---|---|
| `simulate-history.ts` | يولّد ~10 سنوات من بيانات كراج واقعية عبر **قنوات IPC الحقيقية** للتطبيق. |
| `verify-integrity.ts` | 8 فحوص سلامة تقارن قنوات التقارير بمجاميع الجداول الخام (منها اتساق جداول الدفعة العامة للمورد). |
| `run-verify.mjs` | مشغّل مؤتمت لـ `verify-integrity.ts` بأمر واحد (يحلّ تعارض ABI آلياً). |
| `electron-stub.mjs` | بديل تجريبي لوحدة `electron` (يلتقط معالجات IPC ويوفّر `invoke`). |
| `hooks.mjs` / `register.mjs` | خطاف حلّ الوحدات (يوجّه `electron` للـ stub + يحلّ استيرادات `.ts`). |
| `preview-db/garage-simulation-preview.db` | نسخة معزولة معبّأة ببيانات المحاكاة، **للمعاينة داخل التطبيق**. |

## معاينة بيانات الـ10 سنوات داخل التطبيق فعلياً

قاعدة `src/database.ts` تقرأ متغيّر البيئة الاختياري **`GARAGE_DB_PATH`**: إن وُجد
استُخدم مساره بدل قاعدة المستخدم الافتراضية؛ إن لم يوجد فالسلوك الافتراضي كما هو
تماماً (**لا أثر على الإنتاج**). لفتح التطبيق على بيانات المحاكاة:

```bash
GARAGE_DB_PATH=./scripts/preview-db/garage-simulation-preview.db npm run dev
```

ثم تصفّح كل الشاشات (الصندوق، الفواتير، الديون، الكفالات، التقارير، الشيكات…) على
حجم بيانات ضخم واقعي. أي تعديل تجريه أثناء المعاينة يمسّ **نسخة المعاينة فقط**، لا
قاعدة الإنتاج.

> عزل مضمون: اسم الملف مختلف بوضوح (`garage-simulation-preview.db`)، ومسار مختلف
> (`scripts/preview-db/`)، ولا يُقرأ إلا حين تمرّر `GARAGE_DB_PATH` صراحةً.

## فحص سلامة القاعدة بأمر واحد

```bash
npm run verify:integrity
```

يشغّل كل فحوص `verify-integrity.ts` بلا أي خطوة يدوية: يجمّع الملف بـ esbuild ثم
يشغّله عبر Electron كـ Node (فيطابق ABI الخاص بـ `better-sqlite3`) — لا حاجة لـ
`npm rebuild` ولا لضبط أي متغيّر بيئة. يعمل افتراضياً على **قاعدة الإنتاج الحقيقية**
(الفحوص قراءة فقط). للتشغيل على نسخة اختبارية بدلاً منها مرّر `GARAGE_DB_PATH`:

```bash
GARAGE_DB_PATH=./scripts/preview-db/garage-simulation-preview.db npm run verify:integrity
```

## إعادة توليد قاعدة المحاكاة/المعاينة

يتطلّب `better-sqlite3` مبنيّاً لـ **Node** (لا Electron)، ثم إعادته لـ Electron بعده:

```bash
npm rebuild better-sqlite3                                   # ABI الخاص بـ Node
GARAGE_DB_PATH=./scripts/preview-db/garage-simulation-preview.db \
  node --experimental-strip-types --import ./scripts/register.mjs scripts/simulate-history.ts
GARAGE_DB_PATH=./scripts/preview-db/garage-simulation-preview.db \
  node --experimental-strip-types --import ./scripts/register.mjs scripts/verify-integrity.ts
./node_modules/.bin/electron-rebuild -f -o better-sqlite3    # إعادة ABI لـ Electron (لـ dev/build)
```
