# دليل المساهمة — Hakawi

مرحباً بك. هذا المشروع منصة حكاية عربية (`NestJS` + `PostgreSQL` + `Valkey` على الـ API، `Next.js App Router` على الويب، وأنواع مشتركة في مونوريبو npm workspaces).

## قبل أن تبدأ

1. اقرأ `README.md` كاملاً —特に قسم **Setup** و **Run** و **Test**.
2. تأكد من أن `Node.js 22` و `npm 10+` مثبتان.
3. شغّل `docker compose up -d postgres valkey` لقواعد البيانات محلياً.
4. شغّل `npm ci` من جذر المستودع لتثبيت تبعيات كل workspaces.
5. شغّل `npm run build:shared-types` لبناء الحزمة المشتركة (`@hakawi/shared-types`) قبل أي فحص أنواع.
6. شغّل `npm run migration:run` ثم `npm run seed:dev` لتجهيز المخطط والبيانات الأولية.

## سير العمل المقترح

1. أنشئ فرعاً من `main` باسم وصفي (مثلاً `feat/add-story-pinning` أو `fix/mfa-enforcement`).
2. نفّذ التعديل، ثم شغّل الفحوصات المحلية قبل تقديم طلب السحب:

```bash
# فحص الأنواع لجميع workspaces
npm run typecheck --workspace=backend
npm run typecheck --workspace=frontend
npm run typecheck --workspace=packages/shared-types

# اللينت
npm run lint --workspace=backend
npm run lint --workspace=frontend

# الاختبارات
npm run test --workspace=backend
npm run test:run --workspace=frontend

# فحص الهجرات (بدون قاعدة بيانات)
npm run db:check
npm run migration:list
npm run migration:verify
```

3. لا تدمج طلب السحب إلا إذا passaram كل الفحوصات وجميع الاختبارات خضراء.
4. رسائل الالتزام تتبع `Conventional Commits` (مثلاً `feat:`, `fix:`, `docs:`, `chore:`).

## معايير الكود

- لا تضف تعليقات إلا عند الحاجة لتبرير قرار غير بديهي.
- اتبع تنسيق الملف الموجود (مسافات، استيرادات، ترتيب الصفحات).
- كل وحدة خلفية (`module`) تحت `backend/src/modules/` تحتوي على متحكم، خدمة، مستودع، وأنواع।
- الأنواع المشتركة تُعرف في `packages/shared-types/src/` وتُستورد من كلا workspaces.
- لا تستخدم `drizzle-kit generate` لسجل الهجرات — الهجرات مكتوبة يدوياً.sql تحت `migrations/` مع مجموع تحقق `sha256`.

## الهجرات

- أضف هجرة جديدة بـ `npm run migration:create -- <name>`.
- لكل هجرة ملف `down/` rollback يعلن `reversibility` و `data-loss` في سطره الأول.
- لا تملأ الثغرات في الترقيم (مثلاً `0017` ثغرة دائمة).

## النشر

- البنية التحتية موجودة تحت `infrastructure/terraform/` و `infrastructure/helm/`.
- لا توجد مجموعة EKS مطبقة بعد — النشر خاص بمرحلة العمليات، وليس بمساهمات الكود العادية.

## الإبلاغ عن مشاكل الأمن

لا ترسل ثغرات أمنية عبر طلبات السحب العامة. راسل mainteners عبر قناة الدعم في المستودع.

## الرخصة

هذا المشروع مرخص بموجب رخصة MIT — انظر ملف `LICENSE`.
