# سجل الوظائف — ترجمان القرآني

> يحدّثه Claude Code **بعد كل تعديل في الكود**: ما الذي نُفّذ + ما التغييرات.
> الترتيب في الـ Changelog: الأحدث أولاً.

---

## مكتمل ✅

- **[الإعداد]** سَقالة Nuxt 4 + Nuxt UI v4 + Tailwind 4 + Pinia + Supabase، بنية مجلدات CLAUDE.md، ضبط RTL/عربي، `.env` آمن — 2026-06-22
- **[نظام التصميم]** توكنز البريف §5 (فاتح/ليلي)، خط Lama Sans، تدرّجات الألوان مرتبطة بـ Nuxt UI — 2026-06-22

---

## قيد العمل 🟡

_(لا شيء بعد — التالي: المكوّنات الأساسية §5، ثم أول migration.)_

---

## مخطّط ⬜

الميزات الكاملة موثّقة في `ROADMAP.md` مقسّمةً على ثلاث مراحل. ملخّص النطاق الحالي (المرحلتان 1 و2):

**المرحلة 1 — الأساس:**
- نظام التصميم (Tokens، RTL، الوضعان، المكوّنات الأساسية)
- المصادقة (دخول بالبريد للعاملين فقط، دعوة بريدية، إعادة تعيين) — الطالب لا يدخل النظام
- الهيكل العام (Shell + Sidebar + Drawer)
- حماية المسارات حسب الدور
- إدارة المستخدمين والحلقات
- الملفات الشخصية
- لوحات الأدوار الأربع العاملة
- محاضر الاجتماعات + الملف المالي + الأخبار

**المرحلة 2 — العمليات الميدانية:**
- الزيارات الإشرافية (جدولة/نتائج/متابعة)
- الاختبارات (ترشيح/تقييم/خطة يعدّلها المدير)
- التقارير الشهرية + كشف حوافز الحلقة
- مؤشرات التقدّم
- أدلّة الطلاب والمشرفين
- التنبيهات الإدارية
- دليل المعادلات

---

## Changelog

> سجلّ زمني لكل تغيير: ماذا تغيّر ولماذا. الأحدث أولاً.

<!-- مثال:
### 2026-01-15
- **feat:** إضافة composable `useAuth` لدخول العاملين بالبريد
- **chore:** إعداد Supabase client مُنمّط بنوع Database
-->

### 2026-06-23
- **feat(shell):** الهيكل العام `layouts/dashboard.vue` (§4.2) — Sidebar حسب الدور + Topbar + Drawer للجوال + تبديل الوضع + خروج
- **feat(auth):** middleware عامّ `auth.global.ts` (§4.3) لحماية المسارات (تحويل غير المسجّل للدخول، والمسجّل بعيداً عن /login)
- **feat(dashboard):** لوحة المدير (§4.3) — بطاقات إحصائية بأعداد حقيقية + بطاقات إعدادات مربوطة بجدول `app_settings` (قراءة/اعتماد)
- **feat(types):** توليد أنواع TypeScript من قاعدة Supabase إلى `app/types/database.types.ts` (typed client) + `useProfile` (دور المستخدم)
- **feat(auth):** شاشة تسجيل الدخول (§4.1) بمكوّنات Nuxt UI — بريد فقط (الطالب لا يدخل)، تحقّق، إظهار/إخفاء كلمة المرور، نافذة استعادة (إرسال رابط)، تبديل الوضع
- **feat(auth):** composable `useAuth` (دخول/خروج/استعادة عبر Supabase) + `useErrorHandler` (رسائل عربية موحّدة)
- **chore:** لوحة مؤقّتة `pages/dashboard.vue` (تُستبدل بالـ Shell ولوحات الأدوار)

### 2026-06-22
- **feat(landing):** بناء صفحة Landing (§4.0) كـ Nuxt نظيف من التصميم — RTL، تبديل الوضع، SEO، تجاوب، بالتوكنز. الأخبار بيانات وهمية (تُربط بـ §4.26 لاحقاً)
- **feat(design):** تطبيق أول migration على Supabase (المخطّط كامل + RLS) + توسيع `main.css` لمجموعة توكنز التصميم v1.0 الكاملة (فاتح/ليلي) + أصول العلامة في `public/`
- **chore:** تنظيف القالب (حذف AppLogo/TemplateMenu) + جذر `app.vue` نظيف (UApp فقط)
- **fix(ci):** إصلاح ترتيب مفاتيح `nuxt.config.ts` ليمرّ فحص lint (سير عمل GitHub Actions CI)
- **chore(assets):** إضافة نسخ اللوغو الأربع في `public/logo/` (navy/white/blue/green)
- **chore:** سَقالة Nuxt 4 (قالب Nuxt UI) + إضافة Pinia و@nuxtjs/supabase
- **chore:** بنية مجلدات `app/` (composables, constants, layouts, middleware, stores, types, components/ui) + `server/` + `supabase/migrations/`
- **chore:** نقل المشروع إلى `~/Developer/turjuman` + تهيئة git (فرع main) + `.gitignore`/`.env.example` آمنان
- **feat(design):** نظام التصميم في `app/assets/css/main.css` — توكنز §5 (فاتح/ليلي)، خط Lama Sans (300/500/600 مع ربط 400/700)، تدرّجات navy/blue/green/err/neutral
- **chore:** ربط ألوان Nuxt UI بالهوية في `app/app.config.ts` + ضبط RTL/عربي في `nuxt.config.ts`

### (بداية المشروع)
- **docs:** تجهيز ملفات التوثيق الأساسية (CLAUDE.md, ROADMAP.md, DATABASE.md, PAGES.md, FEATURES.md, DESIGN-BRIEF.md)
