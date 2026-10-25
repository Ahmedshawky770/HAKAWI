# قائمة التحقق قبل الرفع (Pre-Commit & Deployment Checklist)

## الحالة الحالية

جميع التعديلات الإصلاحية مكتملة وجاهزة في working tree (لم تُرفع بعد بـ commit). 수정ات شملت:

| الملف | الحالة | الغرض |
|-------|--------|-------|
| `migrations/0039_partition_cutover.sql` | ✅ معدل | إضافة IF EXISTS + تحذير دائم no-rollback |
| `backend/src/modules/users/dto/users.dto.ts` | ✅ معدل | إعادة `'professional'` لقائمة upgrade targets |
| `backend/src/modules/messages/repositories/messages.repository.ts` | ✅ معدل | dual-write transactional + fallback 42P01 |
| `backend/src/modules/notifications/repositories/notifications.repository.ts` | ✅ معدل | dual-write transactional + fallback 42P01 |
| `backend/src/modules/reactions/repositories/reactions.repository.ts` | ✅ معدل | dual-write transactional + fallback 42P01 |
| `backend/src/modules/payments/repositories/payments.repository.ts` | ✅ معدل | createTransaction dual-write في معاملة واحدة |
| `backend/scripts/cleanup-orphaned-uploads.ts` | ✅ معدل | إضافة `--confirm` للتشغيل التدميري |
| `.npmrc` | ✅ مراجعة | إعدادات آمنة، لا تعديل مطلوب |
| `backend/package.json` | ✅ موجود | سكريبتات الربط مضافة |
| `backend/scripts/backfill-partitioned-tables.ts` | ✅ موجود | مع `--dry-run` |
| `backend/scripts/verify-partition-cutover.ts` | ✅ موجود | فحص جاهزية القطع |
| `backend/scripts/check-db-enums.ts` | ✅ موجود | بوابة CI للتزامن enums |

## ما ينقص قبل الرفع (commit)

### 1. قاعدة بيانات PostgreSQL حقيقية
غير متوفرة في بيئة العمل الحالية. السكربتات التشغيلية تحتاج اتصالاً مباشراً بقاعدة بيانات.

### 2. تشغيل `verify-partition-cutover`
بعد توفر قاعدة البيانات، يجب تشغيل:
```bash
npm run db:verify-cutover --workspace=backend
```
الشروط المسبقة:
- Migration 0035 مطبق (الجداول `*_p` موجودة)
- `npm run db:backfill-partitions` نُفذ وتم نسخ البيانات
- متغير `DATABASE_URL` مضبوط وصالح

### 3. قرار بشأن migration 0039
هذا migration **لا يمكن التراجع عنه** بعد حذف الجداول القديمة (`messages`, `notifications`, `payment_transactions`, `reactions`).

## ما يجب تنفيذه (DO)

| # | الإجراء | الأمر / الملاحظة |
|---|---------|------------------|
| 1 | توفير قاعدة بيانات PostgreSQL | Docker محلي أو سحابة (Neon, RDS, إلخ) |
| 2 | تطبيق migration 0035 | إنشائه الجداول المجزأة `*_p` |
| 3 | تشغيل backfill | `npm run db:backfill-partitions --workspace=backend` |
| 4 | تشغيل التحقق | `npm run db:verify-cutover --workspace=backend` (يجب أن يخرج 0) |
| 5 | اتخاذ قرار حول 0039 | إن كان verificaton ناجحاً، يمكن تطبيق `migrations/0039_partition_cutover.sql` بحذر |
| 6 | أخذ نسخة احتياطية | قبل تطبيق 0039 على الإنتاج |
| 7 | رفع التعديلات بـ commit | بعد التأكد من نجاح النوع والتحقق |
| 8 | تشغيل lint + typecheck | `npm run lint --workspace=backend` و `npm run typecheck --workspace=backend` (لا أخطاء) |

## ما لا يجب تنفيذه (DO NOT)

| # | الإجراء | السبب |
|---|---------|-------|
| 1 | تطبيق migration 0039 بدون verify | قد يفقد بيانات إذا لم تتطابق الصفوف |
| 2 | تشغيل cleanup-orphaned-uploads بدون `--confirm` | السكربت يرفض التشغيل التدميري بدون العلم |
| 3 | حذف `.npmrc` | إعداداته آمنة وتزيد موثوقية البناء |
| 4 | رفع commit قبل توفر قاعدة بيانات | لا يمكن التحقق من جاهزية القطع دونها |
| 5 | تشغيل backfill على إنتاجية بدون `--dry-run` أولاً | اختبار أولاً على بيئة staging |

## خطوات الرفع (Commit)

بعد استيفاء جميع الشروط أعلاه:

```bash
# 1. مراجعة الحالة
git status --short

# 2. مراجعة الفرق
git diff --stat

# 3. تشغيل الفحوصات
npm run lint --workspace=backend
npm run typecheck --workspace=backend

# 4. رفع التعديلات (عند الجاهزية)
git add .
git commit -m "feat: complete partition cutover readiness and safety fixes"
```

## تحذير نهائي

**Migration 0039 لا يدعم rollback.** بمجرد حذف الجداول القديمة، لا يمكن استعادة البيانات إلا من نسخة احتياطية. لا يُطبَّق على الإنتاج إلا بعد تأكيد `verify-partition-cutover` بنجاح وأخذ نسخة احتياطية كاملة من قاعدة البيانات.
