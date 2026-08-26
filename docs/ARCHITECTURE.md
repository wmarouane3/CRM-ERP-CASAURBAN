# SHOES OS — Architecture

> نظام تشغيل متكامل لمتجر أحذية إلكتروني في المغرب.
> هذه الوثيقة تغطي النقاط العشر المطلوبة قبل الكود: البنية، قاعدة البيانات،
> الأدوار، الصفحات، تدفق البيانات، دورة حياة الطلب، دورة حياة المخزون،
> منطق الربح، بنية الـ API، وبنية الربط.

---

## 0. لماذا هذا الـ Stack

| الطبقة | الاختيار | السبب |
|---|---|---|
| Frontend | **React 19 + TypeScript + Vite** | TypeScript يمنع أخطاء الأنواع في الحسابات المالية قبل التشغيل. Vite يعطي بناءً سريعاً وحزمة صغيرة. |
| Styling | **Tailwind CSS** | RTL أصلي، وتوحيد المسافات والألوان عبر 15 صفحة بدون CSS متضارب. |
| Database | **PostgreSQL (Supabase)** | معاملات ACID حقيقية — لا يمكن أن يُخصم مخزون بدون تسجيل حركة. Enums و CHECK constraints و Triggers تحمي البيانات على مستوى القاعدة لا الواجهة. |
| Auth | **Supabase Auth** | JWT جاهز + ربط مباشر بـ Row Level Security. |
| Authorization | **Postgres RLS + مصفوفة صلاحيات** | الصلاحية تُطبَّق داخل القاعدة، فلا يمكن تجاوزها بتعديل المتصفح. |
| Server logic | **PL/pgSQL + Edge Functions (Deno)** | منطق المخزون والربح قرب البيانات؛ الـ Webhooks والمفاتيح السرية على الخادم فقط. |
| Charts | **Recharts** | مكوّنات React خفيفة تدعم RTL. |
| State | **Zustand** | بسيط، بدون boilerplate، ولا يحتفظ بمنطق أعمال. |

**القاعدة الحاكمة:** أي قاعدة عمل حساسة (حالة الطلب، خصم المخزون، حساب الربح)
مكتوبة **مرتين عمداً**: مرة في TypeScript (طبقة `core/`) لتجربة فورية وقابلية اختبار،
ومرة في PL/pgSQL لتكون الحارس النهائي الذي لا يُتجاوَز. المواصفة واحدة (هذه الوثيقة)،
والتنفيذان متطابقان سطراً بسطر.

---

## 1. System Architecture

```
                        ┌───────────────────────────────────┐
                        │            المتصفح                 │
                        │  React + TS + Tailwind (RTL)      │
                        │  ┌─────────────────────────────┐  │
                        │  │ pages/    الصفحات            │  │
                        │  │ ui/       مكوّنات مشتركة       │  │
                        │  │ app/      store + routing    │  │
                        │  ├─────────────────────────────┤  │
                        │  │ core/   ← منطق الأعمال النقي  │  │
                        │  │  profit · stock · state       │  │
                        │  │  machine · validation ·       │  │
                        │  │  analytics · permissions      │  │
                        │  ├─────────────────────────────┤  │
                        │  │ data/   ← DataPort (واجهة)   │  │
                        │  └──────┬──────────────┬───────┘  │
                        └─────────┼──────────────┼──────────┘
                                  │              │
                   SupabaseAdapter│              │DemoAdapter
                                  ▼              ▼
              ┌────────────────────────────┐  ┌──────────────────┐
              │   Supabase (PostgreSQL)    │  │  محرك محلي       │
              │  ┌──────────────────────┐  │  │  (تجربة/اختبار)  │
              │  │ RLS  ← الصلاحيات      │  │  └──────────────────┘
              │  ├──────────────────────┤  │
              │  │ RPC / PL-pgSQL       │  │
              │  │  fn_create_order     │  │
              │  │  fn_order_set_status │  │
              │  │  fn_stock_apply      │  │
              │  │  fn_order_recalc     │  │
              │  ├──────────────────────┤  │
              │  │ 36 جدول + 6 Views    │  │
              │  └──────────────────────┘  │
              └───────┬────────────────────┘
                      │
        ┌─────────────┴───────────────┐
        │   Edge Functions (Deno)     │  ← المفاتيح السرية هنا فقط
        │   shopify-webhook           │
        │   carrier-sync (لاحقاً)      │
        │   ads-sync (لاحقاً)          │
        └─────────────┬───────────────┘
                      │
      Shopify · YouCan · Ozon Express · Meta/TikTok/Google Ads · WhatsApp · Sheets
```

### الفصل بين الطبقات

| المجلد | المسؤولية | لا يعرف عن |
|---|---|---|
| `src/core/` | منطق أعمال نقي: أنواع، حالات، ربح، مخزون، تحقق، تحليلات، صلاحيات | React، Supabase، الشبكة |
| `src/data/` | `DataPort` + محوّلان (Supabase / Demo) | الواجهة |
| `src/services` → مدمج في `data/` | حالات الاستخدام | — |
| `src/integrations/` | عقود الربط + محوّلات المزوّدين | الواجهة |
| `src/ui/` | مكوّنات عرض بلا منطق | البيانات |
| `src/pages/` | تركيب الصفحات | SQL |
| `supabase/` | Schema + قواعد + Edge Functions | الواجهة |

إضافة خاصية جديدة = ملف في `pages/` + دالة في `core/` + طريقة في `DataPort`.
لا شيء يُعاد بناؤه.

---

## 2. Database Schema

36 جدولاً، مقسمة إلى ثمانِ مجموعات. الملف الكامل: `supabase/migrations/0001_schema.sql`.

```
TENANCY            organizations · stores · warehouses
IDENTITY           app_users · permission_overrides
REFERENCE          cities · suppliers · shipping_carriers · categories · brands
CATALOG            products ──< product_variants          (variant = منتج + مقاس + لون)
INVENTORY          inventory (variant × warehouse) · inventory_movements
                   purchase_orders ──< purchase_order_items
CRM                customers
SALES              orders ──< order_items
                   order_status_history
FULFILMENT         shipments · returns ──< return_items
MARKETING          ad_platforms ──< ad_campaigns ──< ad_sets ──< ads
                   ad_spend (grain: يوم × إعلان)
FINANCE            expenses · payments
GOVERNANCE         goals · notifications · settings · audit_logs
INTEGRATION        integrations · integration_events
```

### العلاقات الأساسية

```
organizations 1─* stores, warehouses, app_users, … (org_id على كل صف)
products      1─* product_variants  1─* inventory (لكل مستودع)
                                    1─* inventory_movements
customers     1─* orders            1─* order_items ─* product_variants
orders        1─1 shipments         1─* returns ─* return_items
orders        *─1 ad_campaigns      (لربط الطلب بمصدره الإعلاني)
ad_campaigns  1─* ad_sets 1─* ads 1─* ad_spend
```

### قرارات تصميمية مقصودة

1. **المقاس ليس عموداً — بل صف.** `product_variants` تجعل كل مقاس SKU مستقلاً
   بسعره ومخزونه وحده الأدنى. هذا ما يجعل «Nike Dunk مقاس 42 = 12 قطعة» قابلاً
   للتتبع والبيع والإرجاع بشكل مستقل.
2. **المخزون على (variant × warehouse).** مستودع واحد اليوم، عشرة غداً، بدون تغيير Schema.
3. **لقطة عند البيع.** `order_items` تحفظ الاسم والمقاس و SKU وسعر البيع **وسعر التكلفة**
   وقت البيع. تغيير سعر المنتج غداً لا يغيّر ربح طلب الأمس.
4. **`inventory_movements` دفتر أستاذ لا يُعدَّل.** جدول `inventory` مجرد رصيد
   مُشتق؛ الحقيقة هي مجموع الحركات، وكل حركة تحمل `balance_after` للتدقيق.
5. **`NUMERIC(14,2)` لكل مبلغ.** لا `float` في أي حقل مالي.
6. **`org_id` على كل صف + `store_id`/`currency`/`fx_rate` حيث يلزم.**
   نظام متعدد المتاجر والعملات والدول جاهز بنيوياً من اليوم الأول.
7. **فهرس فريد جزئي** `(org_id, channel, external_id)` — درع منع تكرار الطلبات
   المستوردة على مستوى القاعدة لا التطبيق.

---

## 3. User Roles

| الدور | الوحدات | ممنوع عليه |
|---|---|---|
| **Admin** | كل شيء | — |
| **Manager** | كل الوحدات | إدارة المستخدمين، إعادة ضبط البيانات |
| **Order Manager** | لوحة القيادة، الطلبات، العملاء، الشحن، التقارير، التحليلات | المالية، الإعلانات، الحذف |
| **Warehouse** | المنتجات، المخزون، تحضير الطلبات، الشحن | الأسعار والأرباح، إنشاء الطلبات |
| **Marketing** | الإعلانات، التحليلات، التقارير، العملاء | تعديل الطلبات، المالية |
| **Viewer** | مشاهدة فقط | كل تعديل |

**قراءة إضافية خارج الوحدات المملوكة.** الدور لا يملك وحدته فقط — بعض الأدوار تحتاج
قراءة (بدون تعديل) لوحدات أخرى وإلا تعطّل عملها فعلياً:

| الدور | قراءة فقط على |
|---|---|
| Order Manager | المنتجات، المخزون، الحملات — لأنه لا يستطيع ملء طلب جديد بدون رؤية الكاتالوج والمقاسات المتوفرة |
| Marketing | الطلبات، الشحن، المنتجات — لأن قياس ROAS يحتاج الطلبات المسلَّمة |
| Warehouse | الطلبات (قراءة + تعديل الحالة فقط، بدون إنشاء) |

كما أن **البيانات المرجعية والكاتالوج** (المدن، شركات الشحن، المستودعات، المنتجات،
المقاسات، المخزون) مقروءة لكل عضو في المؤسسة، والكتابة عليها وحدها محكومة بالوحدة.
هذا مطبَّق في `fn_role_has` و`can()` معاً.

صيغة الصلاحية: `<module>.<action>` — مثال `orders.edit`, `finance.view`, `demo.reset`.
- الواجهة تستعمل `can(role, permission)` لإخفاء ما لا يُسمح به.
- القاعدة تستعمل `fn_can(permission)` داخل كل RLS Policy لمنعه فعلياً.
- `permission_overrides` تسمح باستثناء فردي لمستخدم بعينه دون اختراع دور جديد.

---

## 4. Main Pages

| المسار | الصفحة | ما تجيب عنه |
|---|---|---|
| `/` | لوحة القيادة | المبيعات، خط الطلبات، الربح، ROAS، المخزون، ما يحتاج تدخلاً الآن |
| `/orders` | الطلبات | تصفية، بحث، تغيير الحالة بضغطة، تصدير |
| `/orders/:id` | تفاصيل الطلب | Timeline، البنود، حساب الربح، حركات المخزون، الشحنة |
| `/customers` | العملاء | التصنيف، الإنفاق، نسبة الرفض |
| `/customers/:id` | ملف العميل | كل تاريخ طلباته + LTV |
| `/products` | المنتجات | بطاقة لكل منتج بمقاساته ومخزونها |
| `/inventory` | المخزون | الأرصدة، إعادة الشراء المقترحة، سجل الحركات |
| `/shipping` | الشحن | الشحنات، الجاهز للشحن، المرتجعات |
| `/marketing` | الإعلانات | الحملات، ROAS/ROI/CPA، تكلفة الطلب المسلّم |
| `/finance` | المالية | قائمة الدخل، المصاريف |
| `/analytics` | التحليلات | المنتجات، المقاسات، المدن، العملاء |
| `/reports` | التقارير | 10 تقارير + CSV/PDF |
| `/goals` | الأهداف | التقدم مقابل المستهدف |
| `/settings` | الإعدادات | القواعد، المستخدمون، الربط، سجل التدقيق، البيانات |

مكوّنات عامة: بحث شامل (⌘K)، فلتر فترة عام، مركز إشعارات، المساعد التحليلي، زر «طلب جديد».

---

## 5. Data Flow

```
   تفاعل المستخدم
        │
        ▼
   pages/  ──────────────► app/store.ts  (حالة الواجهة فقط)
        │                        │
        │                        ▼
        │                   data/DataPort
        │                        │
        │            ┌───────────┴───────────┐
        │            ▼                       ▼
        │     SupabaseAdapter          DemoAdapter
        │            │                       │
        │            ▼                       ▼
        │     RPC داخل PostgreSQL     محرك TypeScript
        │            │                       │
        │            └───────────┬───────────┘
        │                        ▼
        │                 نفس القواعد بالضبط:
        │                 حالة · مخزون · ربح · تدقيق
        │                        │
        └────────◄───────────────┘  snapshot جديد
                     │
                     ▼
             core/analytics.ts  ← كل مؤشر في النظام
                     │
                     ▼
              الرسوم والجداول والتقارير والمساعد
```

**قاعدة مهمة:** لا صفحة تحسب مؤشراً بنفسها. كل رقم يمرّ عبر دالة في
`core/analytics.ts` (أو ما يقابلها في `0003_views.sql`). لذلك لا يمكن أن
تختلف لوحة القيادة عن التقرير عن المساعد.

---

## 6. Order Lifecycle

```
                    ┌──────┐
                    │ new  │
                    └──┬───┘
          ┌────────────┼──────────────┐
          ▼            ▼              ▼
   ┌────────────┐  ┌─────────┐  ┌──────────┐
   │ to_confirm │─►│confirmed│  │cancelled │◄────┐
   └─────┬──────┘  └────┬────┘  └──────────┘     │
         └──────────────┤                        │
                        ▼                        │
                  ┌───────────┐                  │
                  │ preparing │──────────────────┤
                  └─────┬─────┘                  │
                        ▼                        │
                  ┌──────────┐                   │
                  │ shipped  │───────────────────┘
                  └──┬───┬───┘
          ┌──────────┘   └──────────┐
          ▼                          ▼
    ┌───────────┐              ┌──────────┐
    │ delivered │              │ refused  │
    └─────┬─────┘              └────┬─────┘
          │                         │
          └────────────┬────────────┘
                       ▼
                 ┌──────────┐
                 │ returned │  (نهائية)
                 └──────────┘
```

### الآثار الجانبية لكل انتقال

| الحالة | المخزون | المال | كائنات تُنشأ |
|---|---|---|---|
| `new` | — | — | order + order_items + status_history |
| `to_confirm` | — | — | status_history |
| **`confirmed`** | **`sale_out` — يُخصم** | لا تُحتسب مداخيل | movements، `confirmed_at` |
| `preparing` | يُخصم إن لم يكن | — | — |
| `shipped` | يُخصم إن لم يكن | — | **shipment** + رقم تتبع، `shipped_at` |
| **`delivered`** | — | **تُحتسب المداخيل والربح** | **payment**، `delivered_at` |
| **`refused`** | **`refusal_in` — يعود** | تُسجَّل تكلفة الإرجاع كخسارة | **expense** تلقائي |
| **`returned`** | **`return_in` — يعود** | تكلفة إرجاع + تحديث Return Rate | **return + return_items** + expense |
| `cancelled` | يعود إن كان مخصوماً | تبقى تكلفة الإعلان خسارة | — |

أي انتقال غير مسموح يرفضه النظام برسالة `INVALID_TRANSITION` — في الواجهة
(`assertTransition`) وفي القاعدة (`fn_status_allowed`).

---

## 7. Stock Lifecycle

```
   توريد (purchase_in)  ──►  ┌──────────────┐
                              │  on_hand: 12 │
   تأكيد طلب (sale_out) ──►  │  on_hand: 11 │──► تنبيه إذا ≤ min_stock
                              │              │
   رفض/إرجاع (refusal_in │   │  on_hand: 12 │
                return_in)──► └──────────────┘
```

**قواعد صارمة:**
1. **باب واحد للمخزون.** لا شيء يكتب في `inventory` مباشرة — كل شيء يمر عبر
   `fn_stock_apply` / `applyStock`. لا استثناء.
2. **كل حركة تُسجَّل** بنوعها وكميتها الموقّعة و`balance_after` والمرجع
   (`Order #1024`) والمستخدم والوقت.
3. **لا مخزون سالب** إلا إذا فُعِّل صراحة في الإعدادات (`allow_negative_stock`)،
   والقاعدة نفسها تحمل `CHECK (on_hand >= 0)`.
4. **الحجز منفصل عن الخصم.** `reserved` يسمح مستقبلاً بحجز قطعة لطلب مفتوح
   دون إنقاص `on_hand` — جاهز في الـ Schema.
5. **التنبيه تلقائي:** `on_hand = 0` ← نفاد؛ `on_hand ≤ min_stock` ← منخفض.

مثال حقيقي من النظام (صفحة تفاصيل الطلب تعرضه):

```
Order #1024 · Nike Dunk · مقاس 42 · sale_out   −1 · الرصيد 11
Return #1024 · Nike Dunk · مقاس 42 · refusal_in +1 · الرصيد 12
```

---

## 8. Profit Calculation Logic

```
subtotal      = Σ (الكمية × سعر البيع) − خصومات البنود
revenue       = subtotal − خصم الطلب
gross_profit  = revenue − تكلفة المنتج
net_profit    = gross_profit − الشحن − الإرجاع − الإعلان − التغليف − أخرى
margin        = net_profit ÷ revenue × 100
```

**المداخيل لا تُعترف بها إلا عند `delivered`.** هذا هو الفرق بين لوحة تبدو جميلة
ونظام يقول الحقيقة:

| الحالة | gross_profit | net_profit |
|---|---|---|
| `delivered` | `revenue − cost` | كامل المعادلة أعلاه ✅ مُعترف به |
| `refused` / `returned` | `0` | `−(شحن + إرجاع + إعلان + تغليف + أخرى)` — **خسارة حقيقية** |
| `cancelled` | `0` | `−إعلان` — المال الإعلاني أُنفق فعلاً |
| باقي الحالات | `revenue − cost` | ربح **متوقع** غير مُعترف به |

### المثال المطلوب في المواصفة

```
سعر البيع      299
تكلفة المنتج  −120
الشحن          −30
الإعلان        −40
أخرى            −5
──────────────────
الربح الصافي  = 104 MAD   ✅ يُحتسب تلقائياً لكل طلب
```

### توزيع تكلفة الإعلان

`fn_allocate_ad_cost(org, date)` يوزّع إنفاق كل حملة في يوم ما على الطلبات التي
أنتجتها في نفس اليوم، فيحمل كل طلب تكلفة اكتساب حقيقية. النتيجة: `net_profit`
على مستوى الطلب، وليس على مستوى الشهر فقط.

### قاعدة عدم الازدواج المحاسبي

مصاريف الشحن والإرجاع والإعلان مسجَّلة **مرة على الطلب** ومرة كـ`expense` تلقائي
للتتبع. قائمة الدخل تحتسب المصاريف اليدوية فقط (`is_auto = false`) بجانب تكاليف
الطلبات — وإلا لظهرت المصاريف مرتين وكذبت الأرقام.

---

## 9. API Structure

الواجهة لا ترى SQL ولا HTTP. ترى `DataPort` فقط:

```ts
interface DataPort {
  load(): Promise<DataSet>;

  signIn(email, password): Promise<AppUser>;
  currentUser(): Promise<AppUser | null>;

  createOrder(input: NewOrderInput): Promise<Order>;
  setOrderStatus(id, status, reason?, note?): Promise<Order>;
  updateOrder(id, patch): Promise<Order>;

  upsertProduct(p): Promise<Product>;
  upsertVariant(v): Promise<ProductVariant>;
  adjustStock(input: StockAdjustInput): Promise<void>;

  upsertCustomer(c): Promise<Customer>;
  addExpense(e): Promise<Expense>;
  upsertCampaign(c): Promise<AdCampaign>;
  addAdSpend(s): Promise<AdSpend>;
  allocateAdCost(date): Promise<number>;

  upsertGoal(g): Promise<Goal>;
  updateSettings(s): Promise<Settings>;
  upsertIntegration(i): Promise<Integration>;
  ingestExternalOrder(provider, payload): Promise<{status, order?}>;

  resetDemoData(): Promise<void>;
}
```

### الطبقة الفعلية في الإنتاج

| العملية | الآلية | لماذا |
|---|---|---|
| قراءات | PostgREST `select` عبر RLS | سريع، ومحمي على مستوى الصف |
| إنشاء طلب | `rpc('fn_create_order')` | تحقق + منع تكرار + بنود + تدقيق في معاملة واحدة |
| تغيير حالة | `rpc('fn_order_set_status')` | State machine + مخزون + مال + سجل، ذرّياً |
| حركة مخزون | `rpc('fn_stock_apply')` | الباب الوحيد للمخزون |
| Webhook | Edge Function | التحقق من HMAC قبل لمس القاعدة |

**لماذا RPC وليس INSERT مباشراً؟** لأن `INSERT` من المتصفح يمكن تزويره.
دالة `SECURITY DEFINER` تفرض التسلسل الكامل: تحقق → منع تكرار → خصم مخزون →
حساب ربح → سجل تدقيق. إما كلها أو لا شيء.

---

## 10. Integration Architecture

ثلاثة عقود فقط، في `src/integrations/types.ts`:

```ts
SalesChannelAdapter { parseOrder(payload, db) → ParsedExternalOrder | null
                      pushFulfillment?(order) }
CarrierAdapter      { createShipment(order) · syncStatus(shipment) · mapStatus(x) }
AdsAdapter          { fetchDailySpend(from, to) }
MessagingAdapter    { buildLink(phone, msg) · send?(phone, msg) }
```

إضافة YouCan = ملف `youcan/mapper.ts` واحد. إضافة Sendit = ملف `sendit.ts` واحد.
لا صفحة تتغيّر، ولا Schema يتغيّر.

### مسار Shopify (مطبَّق)

```
Shopify orders/create
        │
        ▼
Edge Function shopify-webhook
   1. تحقق من توقيع HMAC          ← يرفض أي طلب غير موقّع
   2. سجّل الحدث بـ idempotency_key ← درع التكرار #1 (فهرس فريد)
   3. parseShopifyOrder()          ← نفس الدالة التي تستعملها الواجهة
        · مطابقة SKU ← المقاس
        · التعرف على المدينة (عربي/فرنسي)
        · ربط الحملة عبر utm_campaign
        · تطبيع رقم الهاتف المغربي
   4. rpc fn_create_order()        ← درع التكرار #2
        (unique index على org_id, channel, external_id)
        ▼
   طلب في SHOES OS بحالة «بانتظار التأكيد»
```

الطلبات المستوردة تدخل بحالة `to_confirm` وليس `confirmed` — لأن المخزون لا
يُخصم قبل أن يؤكد إنسان الطلب هاتفياً. هذا سلوك متجر COD مغربي، لا سلوك متجر بطاقة.

### أين تُخزَّن المفاتيح

| نوع | المكان | يصل إليه المتصفح؟ |
|---|---|---|
| `VITE_SUPABASE_ANON_KEY` | حزمة الواجهة | نعم — وهو بلا قيمة بدون جلسة، لأن RLS يحمي كل جدول |
| `SUPABASE_SERVICE_ROLE_KEY` | بيئة Edge Function | **لا** |
| `SHOPIFY_WEBHOOK_SECRET` | بيئة Edge Function | **لا** |
| مفاتيح Meta / Ozon / WhatsApp | Supabase Vault | **لا** |
| `integrations.config` | القاعدة | نعم — إعدادات غير سرية فقط |

### WhatsApp

المرحلة الأولى تعمل اليوم: زر في كل طلب وكل عميل يفتح محادثة برسالة جاهزة
(5 قوالب: تأكيد، شحن، تسليم، متابعة، بعد الرفض). المرحلة الثانية تستبدل
`buildLink` بـ `send` عبر WhatsApp Cloud API من Edge Function — بدون تغيير الواجهة.

### AI Assistant

المساعد مبني على **طبقة أدوات** (`BUSINESS_TOOLS`): كل سؤال عمل هو دالة نقية
تقرأ من نفس محرك التحليلات. اليوم يوجّهها مُطابق كلمات مفتاحية؛ غداً يوجّهها
نموذج لغوي عبر function-calling من Edge Function. النموذج لن يحتاج وصولاً خاماً
للجداول — سينادي نفس الدوال المُدقَّقة. وهذا ما يجعل تفعيله آمناً لاحقاً.

---

## 11. Data Integrity

| الخطر | الحماية |
|---|---|
| طلبات مكرّرة | فهرس فريد `(org_id, channel, external_id)` + كشف «نفس الهاتف ونفس SKU خلال ساعة» + `idempotency_key` على أحداث الربط |
| مخزون سالب | `CHECK (on_hand >= 0)` + فحص في `fn_stock_apply` + إعداد صريح للسماح |
| هاتف غير صالح | تطبيع + `^0[5-7][0-9]{8}$` في الواجهة والقاعدة |
| سعر غير منطقي | `assertPrice` + `CHECK (amount >= 0)` |
| انتقال حالة غير صالح | `fn_status_allowed` + `assertTransition` |
| تعديل بلا أثر | `audit_logs` — بدون سياسة UPDATE أو DELETE، أي غير قابل لإعادة الكتابة |
| تسريب بيانات بين متاجر | `org_id` + RLS على كل جدول |
| تكرار لانهائي في RLS | `fn_current_org` / `fn_can` / `fn_same_org` مُعرَّفة `SECURITY DEFINER` بـ`search_path` مثبّت — بدونها تستدعي سياسة `app_users` نفسها بلا نهاية |
| جداول بلا `org_id` | `return_items` و`purchase_order_items` ترث المستأجر من صفّها الأب عبر `EXISTS` — بدون تكرار العمود |

---

## 12. Development Phases

| # | المرحلة | الحالة |
|---|---|---|
| 1 | Architecture + Database | ✅ 36 جدول، 6 Views، Triggers، RLS |
| 2 | Authentication + Users | ✅ أدوار + RLS + سجل تدقيق |
| 3 | Products + Inventory | ✅ مقاسات، حركات، تنبيهات، إعادة شراء |
| 4 | Orders | ✅ State machine + أتمتة كاملة |
| 5 | Customers | ✅ تصنيف تلقائي + LTV + سجل الطلبات |
| 6 | Shipping | ✅ شحنات + مرتجعات + عقد CarrierAdapter |
| 7 | Finance | ✅ قائمة دخل + مصاريف + منع ازدواج |
| 8 | Ads | ✅ حملات + توزيع تكلفة + ROAS على المسلّم |
| 9 | Dashboard + Analytics | ✅ 4 عدسات + 10 رسوم |
| 10 | Reports | ✅ 10 تقارير + CSV/PDF |
| 11 | Integrations | ✅ Shopify مطبَّق · الباقي عقود جاهزة |
| 12 | AI Assistant | ✅ طبقة أدوات تعمل · جاهزة لنموذج لغوي |

كل مرحلة بُنيت فوق سابقتها دون كسرها.
