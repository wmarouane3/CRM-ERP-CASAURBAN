# SHOES OS

نظام CRM/ERP متكامل لمتجر أحذية إلكتروني في المغرب — طلبات، عملاء، مخزون بالمقاسات،
شحن، مالية، إعلانات، تحليلات وتقارير، في نظام واحد مترابط.

**Stack:** React 19 · TypeScript · Tailwind CSS · Supabase (PostgreSQL + Auth + RLS + Edge Functions)

الوثيقة المعمارية الكاملة: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

---

## التشغيل خلال دقيقتين (وضع تجريبي)

```bash
npm install
npm run dev
```

يفتح على `http://localhost:5173` ببيانات تجريبية واقعية مولَّدة عبر نفس محرك
النظام (20 منتج، 140 مقاس، ~60 عميل، ~300 طلب، 7 حملات، مخزون وحركات متسقة).
لا حاجة لأي إعداد.

---

## التشغيل الحقيقي مع Supabase

### 1. أنشئ مشروعاً على [supabase.com](https://supabase.com)

### 2. طبّق ملفات SQL بالترتيب

من **SQL Editor** في لوحة Supabase، شغّل بالترتيب:

```
supabase/migrations/0001_schema.sql      الجداول والأنواع والفهارس
supabase/migrations/0002_functions.sql   منطق الأعمال (مخزون، حالات، ربح، تدقيق)
supabase/migrations/0003_views.sql       عروض التحليلات
supabase/migrations/0004_rls.sql         الصلاحيات على مستوى الصف
supabase/migrations/0005_rpc.sql         دوال الكتابة + bootstrap
```

كل ملف قابل لإعادة التشغيل بأمان (`0004` يحذف السياسات القديمة قبل إنشائها)،
فإن توقف عندك في المنتصف أعد تشغيل الملف من أوله بلا قلق.

أو عبر CLI:

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

### 3. جهّز المؤسسة والبيانات المرجعية

```sql
select fn_bootstrap_org('متجر الأحذية', 'you@example.com');
```

ينشئ المؤسسة، المستودع الافتراضي، الإعدادات، 20 مدينة مغربية بتكاليف شحنها،
شركات الشحن، ومنصات الإعلانات.

### 4. أنشئ المستخدم الأول

من **Authentication → Users → Add user**. أول مستخدم يُنشأ يصبح `admin` تلقائياً
(عبر trigger على `auth.users`)، والباقي يبدأون بدور `viewer` ويُرقّون من صفحة
الإعدادات.

### 5. اربط الواجهة

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

```bash
npm run dev
```

النظام ينتقل تلقائياً من المحرك المحلي إلى PostgreSQL. **لا سطر واحد من الكود يتغيّر** —
`src/data/index.ts` يختار المحوّل حسب وجود المتغيرات.

---

## ربط Shopify

```bash
npx supabase secrets set SHOPIFY_WEBHOOK_SECRET=<من إعدادات Shopify>
npx supabase secrets set SHOES_OS_ORG_ID=<uuid المؤسسة>
npx supabase functions deploy shopify-webhook --no-verify-jwt
```

في Shopify: **Settings → Notifications → Webhooks → Create webhook**
- Event: `Order creation`
- Format: JSON
- URL: `https://<project>.functions.supabase.co/shopify-webhook`

الدالة تتحقق من توقيع HMAC، تمنع التكرار بطبقتين، تطابق SKU بالمقاس، تتعرف على
المدينة، وتربط الحملة عبر `utm_campaign`، ثم تنشئ الطلب بحالة «بانتظار التأكيد».

> جرّب المسار كاملاً بدون Shopify: **الإعدادات ← الربط ← محاكي Webhook**.
> اضغط «استقبال الطلب» مرتين لترى الحماية من التكرار تعمل.

---

## البناء والنشر

```bash
npm run build          # dist/ — ارفعه على Vercel أو Netlify أو أي استضافة ثابتة
SINGLE=1 npm run build # dist-single/index.html — ملف واحد مستقل
npm run verify         # 21 فحصاً آلياً على معايير النجاح في متصفح حقيقي
```

ولاختبار قواعد قاعدة البيانات نفسها على PostgreSQL محلي (بدون Supabase):
راجع [`supabase/tests/README.md`](supabase/tests/README.md).

---

## بنية المشروع

```
src/
├── core/              منطق أعمال نقي — لا React ولا شبكة
│   ├── types.ts         أنواع المجال (مرآة الـ Schema)
│   ├── enums.ts         الحالات وتسمياتها وألوانها وانتقالاتها
│   ├── profit.ts        محرك الربح — معادلة واحدة للنظام كله
│   ├── analytics.ts     كل مؤشر: مبيعات، مالية، تسويق، مخزون، عملاء
│   ├── validation.ts    الهاتف، الأسعار، الكميات، الانتقالات، التكرار
│   ├── permissions.ts   مصفوفة الأدوار (توأم fn_can في SQL)
│   ├── money.ts         حساب نقدي بدقة عشرية + تنسيق RTL
│   └── dates.ts         الفترات الزمنية والمقارنات
├── data/
│   ├── ports.ts         DataPort — العقد الوحيد بين الواجهة والبيانات
│   ├── demo/            محرك محلي + مولّد بيانات (توأم دوال SQL)
│   └── supabase/        محوّل الإنتاج
├── integrations/
│   ├── types.ts         عقود: قناة بيع، شركة شحن، منصة إعلانات، مراسلة
│   ├── registry.ts      سجل المزوّدين المعروض في الإعدادات
│   ├── shopify/         محوّل Shopify (نقي، مشترك مع Edge Function)
│   ├── whatsapp/        روابط وقوالب الرسائل
│   └── ai/assistant.ts  طبقة أدوات المساعد التحليلي
├── ui/                  مكوّنات العرض والرسوم
├── pages/               15 صفحة
└── app/                 المتجر، التخطيط، التوجيه

supabase/
├── migrations/          5 ملفات SQL
└── functions/           Edge Functions (Deno)
```

---

## ما تم التحقق منه آلياً

`npm run verify` يشغّل النظام في متصفح حقيقي ويؤكد 21 فحصاً، منها:

- دفتر حركات المخزون متسق (`balance_after` = المجموع التراكمي لكل مقاس)
- جدول المخزون يساوي مجموع الحركات تماماً
- لا يوجد مخزون سالب في أي مقاس
- الربح الصافي المحسوب = المعادلة المطبقة يدوياً على البنود
- المداخيل لا تُعترف بها إلا في حالة «تم التسليم»
- الطلب المرفوض يُسجَّل كخسارة **ويعود مخزونه** بحركة `refusal_in`
- تكلفة الإرجاع تُنشئ مصروفاً تلقائياً
- كل طلب مسلّم له دفعة وشحنة بحالة مطابقة
- إحصاءات كل عميل تطابق طلباته الفعلية
- كل الصفحات تفتح بدون أخطاء JavaScript

---

## الترخيص

كود خاص بـ SHOES OS.
