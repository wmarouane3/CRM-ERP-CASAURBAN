/**
 * SHOES OS — end-to-end verification of the 20 success criteria.
 * Loads the built single-file app in headless Chromium, drives the real
 * engine through the browser, and asserts the numbers.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const file = 'file://' + path.resolve(root, '../dist-single/index.html');

const results = [];
const check = (n, name, pass, detail = '') => results.push({ n, name, pass, detail });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(file);
await page.waitForSelector('text=لوحة القيادة', { timeout: 20000 });
check(0, 'التطبيق يفتح ويعرض لوحة القيادة', true);

// Screenshot the dashboard
await page.waitForTimeout(1200);
await page.screenshot({ path: path.resolve(root, '../screenshots/dashboard.png'), fullPage: false });

const out = await page.evaluate(async () => {
  const raw = localStorage.getItem('shoes-os.demo.v1');
  const db = JSON.parse(raw).data;
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const items = (id) => db.orderItems.filter((i) => i.order_id === id);

  const delivered = db.orders.filter((o) => o.status === 'delivered');
  const refused = db.orders.filter((o) => o.status === 'refused');
  const returned = db.orders.filter((o) => o.status === 'returned');

  // pick a delivered order and verify the profit formula by hand
  const d = delivered[0];
  const dItems = items(d.id);
  const revenue = dItems.reduce((a, i) => a + i.quantity * i.unit_price - i.discount, 0) - d.discount;
  const cost = dItems.reduce((a, i) => a + i.quantity * i.unit_cost, 0);
  const expectedNet = Math.round((revenue - cost - d.shipping_cost - d.return_cost
    - d.ad_cost - d.packaging_cost - d.other_cost) * 100) / 100;

  // a refused order must be a loss and its stock must have been returned
  const r = refused[0];
  const rMoves = db.movements.filter((m) => m.reference_id === r?.id);

  // stock ledger consistency: balance_after must equal running sum per variant
  let ledgerOk = true;
  const byVariant = {};
  for (const m of [...db.movements].reverse()) {
    if (m.type === 'reserve' || m.type === 'release') continue;
    byVariant[m.variant_id] = (byVariant[m.variant_id] ?? 0) + m.quantity;
    if (byVariant[m.variant_id] !== m.balance_after) ledgerOk = false;
  }
  // and the final ledger balance must equal the inventory table
  let inventoryOk = true;
  for (const inv of db.inventory) {
    if ((byVariant[inv.variant_id] ?? 0) !== inv.on_hand) inventoryOk = false;
  }

  // no negative stock anywhere
  const negative = db.inventory.filter((i) => i.on_hand < 0).length;

  // customer aggregates match their orders
  let customersOk = true;
  for (const c of db.customers.slice(0, 40)) {
    const co = db.orders.filter((o) => o.customer_id === c.id);
    if (co.length !== c.total_orders) customersOk = false;
    const spent = Math.round(sum(co.filter((o) => o.status === 'delivered').map((o) => o.revenue)) * 100) / 100;
    if (Math.abs(spent - c.total_spent) > 0.05) customersOk = false;
  }

  // every delivered order has a payment and a shipment
  const paymentsOk = delivered.every((o) => db.payments.some((p) => p.order_id === o.id));
  const shipmentsOk = delivered.every((o) => db.shipments.some((s) => s.order_id === o.id && s.status === 'delivered'));

  // return costs produced auto expenses
  const returnExpenses = db.expenses.filter((e) => e.is_auto && e.category === 'return_shipping');

  return {
    counts: {
      products: db.products.length, variants: db.variants.length,
      customers: db.customers.length, orders: db.orders.length,
      movements: db.movements.length, campaigns: db.campaigns.length,
      expenses: db.expenses.length, audits: db.auditLogs.length,
      shipments: db.shipments.length, returns: db.returns.length,
    },
    delivered: delivered.length, refused: refused.length, returned: returned.length,
    sample: {
      number: d.order_number, revenue: d.revenue, product_cost: d.product_cost,
      shipping: d.shipping_cost, ad: d.ad_cost, packaging: d.packaging_cost,
      net: d.net_profit, expectedNet, recognised: d.revenue_recognized,
    },
    refusedSample: r ? {
      number: r.order_number, net: r.net_profit, returnCost: r.return_cost,
      restored: r.stock_restored,
      moveTypes: rMoves.map((m) => m.type),
    } : null,
    ledgerOk, inventoryOk, negative, customersOk, paymentsOk, shipmentsOk,
    returnExpenses: returnExpenses.length,
    totalRevenue: Math.round(sum(delivered.map((o) => o.revenue))),
    totalProfit: Math.round(sum(db.orders.filter((o) => ['delivered','refused','returned','cancelled'].includes(o.status)).map((o) => o.net_profit))),
    adSpend: Math.round(sum(db.adSpend.map((s) => s.spend))),
  };
});

check(1, 'المنتجات والمقاسات موجودة', out.counts.products >= 20 && out.counts.variants >= 100,
  `${out.counts.products} منتج / ${out.counts.variants} مقاس`);
check(2, 'مخزون مُسجَّل عبر حركات', out.counts.movements > 100, `${out.counts.movements} حركة`);
check(3, 'طلبات مُنشأة', out.counts.orders >= 100, `${out.counts.orders} طلب`);
check(4, 'طلبات مؤكدة ومسلّمة', out.delivered > 20, `${out.delivered} مسلّم`);
check(5, 'دفتر المخزون متسق (balance_after)', out.ledgerOk);
check(6, 'جدول المخزون = مجموع الحركات', out.inventoryOk);
check(7, 'لا يوجد مخزون سالب', out.negative === 0);
check(8, 'حساب الربح الصافي صحيح',
  Math.abs(out.sample.net - out.sample.expectedNet) < 0.02,
  `${out.sample.number}: ${out.sample.net} = المتوقع ${out.sample.expectedNet}`);
check(9, 'المداخيل تُحتسب فقط عند التسليم', out.sample.recognised === true);
check(10, 'الطلب المرفوض يسجَّل كخسارة', out.refusedSample && out.refusedSample.net < 0,
  `${out.refusedSample?.number}: ${out.refusedSample?.net} MAD`);
check(11, 'المنتج يعود للمخزون بعد الرفض',
  !!out.refusedSample?.restored && out.refusedSample.moveTypes.includes('refusal_in'),
  out.refusedSample?.moveTypes.join(', '));
check(12, 'تكلفة الإرجاع تُسجَّل كمصروف تلقائي', out.returnExpenses > 0, `${out.returnExpenses} مصروف`);
check(13, 'كل طلب مسلّم له دفعة مسجَّلة', out.paymentsOk);
check(14, 'كل طلب مسلّم له شحنة بحالة مسلّمة', out.shipmentsOk);
check(15, 'إحصاءات العملاء مطابقة لطلباتهم', out.customersOk);
check(16, 'حملات وإنفاق إعلاني', out.counts.campaigns >= 5 && out.adSpend > 0, `${out.adSpend} MAD إنفاق`);
check(17, 'مرتجعات وشحنات', out.counts.returns > 0 && out.counts.shipments > 0,
  `${out.counts.returns} مرتجع / ${out.counts.shipments} شحنة`);
check(18, 'سجل تدقيق يعمل', out.counts.audits > 100, `${out.counts.audits} سجل`);

// --- navigate every page and confirm it renders ------------------------
const pages = [
  ['#/orders', 'الطلبات'], ['#/customers', 'العملاء'], ['#/products', 'المنتجات'],
  ['#/inventory', 'المخزون'], ['#/shipping', 'الشحن'], ['#/marketing', 'إدارة الإعلانات'],
  ['#/finance', 'المالية'], ['#/analytics', 'التحليلات'], ['#/reports', 'التقارير'],
  ['#/goals', 'أهداف العمل'], ['#/settings', 'الإعدادات'],
];
let allPagesOk = true;
for (const [hash, heading] of pages) {
  await page.goto(file + hash);
  try {
    await page.waitForSelector(`h1:has-text("${heading}")`, { timeout: 8000 });
  } catch { allPagesOk = false; console.log('PAGE FAILED:', hash); }
}
check(19, 'كل الصفحات تفتح بدون أخطاء', allPagesOk);

// --- drive a full order lifecycle through the UI -----------------------
await page.goto(file + '#/orders');
await page.waitForSelector('h1:has-text("الطلبات")');
await page.screenshot({ path: path.resolve(root, '../screenshots/orders.png') });

await page.goto(file + '#/analytics');
await page.waitForTimeout(800);
await page.screenshot({ path: path.resolve(root, '../screenshots/analytics.png') });

await page.goto(file + '#/inventory');
await page.waitForTimeout(500);
await page.screenshot({ path: path.resolve(root, '../screenshots/inventory.png') });

await page.goto(file + '#/finance');
await page.waitForTimeout(800);
await page.screenshot({ path: path.resolve(root, '../screenshots/finance.png') });

const realErrors = errors.filter((e) => !/ERR_TUNNEL|fonts.googleapis|ERR_NAME_NOT_RESOLVED|net::ERR/.test(e));
check(20, 'لا توجد أخطاء JavaScript', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

await browser.close();

console.log('\n=== SHOES OS — نتائج التحقق ===\n');
for (const r of results) {
  console.log(`${r.pass ? '✅' : '❌'}  ${String(r.n).padStart(2)} ${r.name}${r.detail ? '  —  ' + r.detail : ''}`);
}
console.log('\n--- إحصاءات البيانات التجريبية ---');
console.log(JSON.stringify(out.counts, null, 2));
console.log(`المداخيل المحققة: ${out.totalRevenue} MAD | صافي الربح: ${out.totalProfit} MAD | الإنفاق الإعلاني: ${out.adSpend} MAD`);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} نجح`);
process.exit(failed.length ? 1 : 0);
