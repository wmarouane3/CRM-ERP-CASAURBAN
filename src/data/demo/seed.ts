/**
 * SHOES OS — Demo data generator.
 *
 * Builds a realistic Moroccan sneaker store: 20 products with per-size
 * stock, 50+ customers, ~140 orders spread over 90 days, campaigns with
 * daily spend, expenses, shipments and returns.
 *
 * IMPORTANT: orders are created through the SAME engine the UI uses, so
 * stock, movements, profit, customer stats and the audit log are all
 * internally consistent — this is demo *data*, not a fake dashboard.
 */
import type {
  AdCampaign, AdPlatform, AppUser, City, DataSet,
  Goal, Organization, Product, ProductVariant, Settings, Supplier,
  ShippingCarrier, Warehouse, OrderStatus,
} from '../../core/types';
import { money } from '../../core/money';
import { recalcOrder } from '../../core/profit';
import { applyStock, createOrder, setOrderStatus, uid, type Ctx } from './engine';

/* ------------------------------------------------------------- random */
let seedState = 20260826;
function rnd(): number {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
const chance = (p: number) => rnd() < p;

/* ------------------------------------------------------------ fixtures */

const CITIES: [string, string, number][] = [
  ['الدار البيضاء', 'Casablanca', 30], ['الرباط', 'Rabat', 30],
  ['مراكش', 'Marrakech', 35], ['فاس', 'Fès', 35],
  ['طنجة', 'Tanger', 35], ['أكادير', 'Agadir', 40],
  ['مكناس', 'Meknès', 35], ['وجدة', 'Oujda', 45],
  ['القنيطرة', 'Kénitra', 30], ['تطوان', 'Tétouan', 40],
  ['سلا', 'Salé', 30], ['الجديدة', 'El Jadida', 35],
  ['بني ملال', 'Béni Mellal', 40], ['الناظور', 'Nador', 45],
  ['خريبكة', 'Khouribga', 35], ['سطات', 'Settat', 30],
  ['المحمدية', 'Mohammedia', 30], ['العيون', 'Laâyoune', 60],
  ['تازة', 'Taza', 45], ['برشيد', 'Berrechid', 30],
];

const PRODUCTS: [string, string, string, number, number, string][] = [
  // name, brand, model, cost, price, category
  ['Nike Air Force 1 Low',      'Nike',        'AF1-WHT',   315, 749, 'رياضي'],
  ['Nike Dunk Low Panda',       'Nike',        'DNK-PND',   335, 799, 'رياضي'],
  ['Nike Air Max 90',           'Nike',        'AM90-GRY',  380, 899, 'رياضي'],
  ['Air Jordan 1 Mid',          'Jordan',      'AJ1-MID',   425, 999, 'رياضي'],
  ['Adidas Samba OG',           'Adidas',      'SMB-OG',    325, 769, 'كلاسيكي'],
  ['Adidas Gazelle',            'Adidas',      'GZL-BLU',   305, 729, 'كلاسيكي'],
  ['Adidas Ultraboost 22',      'Adidas',      'UB22',      450, 1049, 'جري'],
  ['New Balance 550',           'New Balance', 'NB550',     355, 849, 'رياضي'],
  ['New Balance 574',           'New Balance', 'NB574',     295, 699, 'كلاسيكي'],
  ['Puma Suede Classic',        'Puma',        'SUEDE-CL',  235, 559, 'كلاسيكي'],
  ['Puma RS-X',                 'Puma',        'RSX-3D',    285, 679, 'رياضي'],
  ['Vans Old Skool',            'Vans',        'OS-BLK',    245, 579, 'كاجوال'],
  ['Converse Chuck 70 High',    'Converse',    'CT70-HI',   260, 619, 'كاجوال'],
  ['Reebok Club C 85',          'Reebok',      'CC85',      250, 599, 'كلاسيكي'],
  ['Asics Gel-Lyte III',        'Asics',       'GL3',       345, 819, 'جري'],
  ['Timberland 6-Inch Premium', 'Timberland',  'TB6-WHT',   510, 1199, 'بوت'],
  ['Nike Blazer Mid 77',        'Nike',        'BLZ-77',    310, 739, 'كلاسيكي'],
  ['Adidas Forum Low',          'Adidas',      'FRM-LOW',   290, 689, 'رياضي'],
  ['Salomon XT-6',              'Salomon',     'XT6',       575, 1349, 'تريل'],
  ['Nike Air Max Plus TN',      'Nike',        'TN-PLUS',   420, 989, 'رياضي'],
];

const SIZES = ['39', '40', '41', '42', '43', '44', '45'];
const SIZE_WEIGHT: Record<string, number> = {
  '39': 0.06, '40': 0.13, '41': 0.19, '42': 0.24, '43': 0.19, '44': 0.13, '45': 0.06,
};

const FIRST = ['يوسف','محمد','أمين','رضا','سعيد','خالد','عثمان','إلياس','أيوب','بلال','مهدي','زكرياء','حمزة','عمر','ياسين','عبد الله','كريم','نبيل','طارق','سفيان','هشام','رشيد','منير','وليد','أنس'];
const LAST = ['المراوني','بنعلي','الفاسي','العلوي','الإدريسي','بوعزة','الشرقاوي','برادة','التازي','الحسني','أزرقان','بنجلون','الصقلي','الغزواني','السباعي','لمريني','الودغيري','أمزيل','بلمهدي','الرگراگي'];

const SUPPLIERS = ['Sneaker Trade Casa', 'Import Line Tanger', 'Atlas Footwear', 'MoroccoKicks Supply'];

const BRAND_COLORS: Record<string, string> = {
  Nike: '#111827', Jordan: '#991b1b', Adidas: '#1e3a8a', 'New Balance': '#374151',
  Puma: '#065f46', Vans: '#7c2d12', Converse: '#0f172a', Reebok: '#1d4ed8',
  Asics: '#1e40af', Timberland: '#a16207', Salomon: '#b91c1c',
};

/** Tiny inline SVG so the demo needs zero external requests. */
function productImage(name: string, brand: string): string {
  const color = BRAND_COLORS[brand] ?? '#334155';
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${color}" stop-opacity="0.92"/>
<stop offset="1" stop-color="${color}" stop-opacity="0.55"/></linearGradient></defs>
<rect width="120" height="120" rx="18" fill="url(#g)"/>
<path d="M22 78c8-2 14-6 20-12 5-5 9-11 15-11 7 0 9 6 17 8 9 2 16 3 22 8 3 3 4 7 2 9H24c-3 0-4-1-2-2z" fill="#fff" fill-opacity="0.9"/>
<text x="60" y="34" font-family="Inter,Arial" font-size="20" font-weight="700" fill="#fff" text-anchor="middle">${initials}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* ------------------------------------------------------------- builder */

export function buildEmptyDataSet(): DataSet {
  const org: Organization = {
    id: uid(), name: 'SHOES OS — متجر الأحذية',
    country_code: 'MA', base_currency: 'MAD', timezone: 'Africa/Casablanca',
  };

  const warehouse: Warehouse = {
    id: uid(), org_id: org.id, name: 'المستودع الرئيسي — الدار البيضاء',
    city: 'الدار البيضاء', is_default: true, is_active: true,
  };

  const settings: Settings = {
    org_id: org.id,
    default_shipping_cost: 35, default_return_cost: 15, default_packaging_cost: 5,
    restock_on_refused: true, restock_on_returned: true,
    allow_negative_stock: false, auto_allocate_ad_cost: true,
    low_stock_threshold: 3, order_number_prefix: '#', order_number_next: 1001,
    currency: 'MAD',
  };

  const users: AppUser[] = [
    ['walid@shoesos.ma', 'وليد — المدير', 'admin'],
    ['manager@shoesos.ma', 'سناء بنعلي — مديرة', 'manager'],
    ['orders@shoesos.ma', 'أمين — مسؤول الطلبات', 'order_manager'],
    ['stock@shoesos.ma', 'رشيد — المستودع', 'warehouse'],
    ['ads@shoesos.ma', 'ليلى — التسويق', 'marketing'],
  ].map(([email, full_name, role]) => ({
    id: uid(), org_id: org.id, email, full_name,
    role: role as AppUser['role'], is_active: true,
    created_at: new Date(Date.now() - 200 * 864e5).toISOString(),
  }));

  const cities: City[] = CITIES.map(([ar, fr, ship]) => ({
    id: uid(), org_id: org.id, name_ar: ar, name_fr: fr,
    default_shipping_cost: ship, default_return_cost: Math.round(ship * 0.45),
    is_active: true,
  }));

  const suppliers: Supplier[] = SUPPLIERS.map((name) => ({
    id: uid(), org_id: org.id, name, country: 'المغرب', is_active: true,
  }));

  const carriers: ShippingCarrier[] = [
    { id: uid(), org_id: org.id, code: 'ozonexpress', name: 'Ozon Express', is_active: true, default_shipping_cost: 35, default_return_cost: 15 },
    { id: uid(), org_id: org.id, code: 'sendit', name: 'Sendit', is_active: true, default_shipping_cost: 32, default_return_cost: 14 },
    { id: uid(), org_id: org.id, code: 'inhouse', name: 'توصيل داخلي', is_active: true, default_shipping_cost: 20, default_return_cost: 10 },
  ];

  return {
    organization: org, settings, users, warehouses: [warehouse], cities,
    suppliers, carriers,
    products: [], variants: [], inventory: [], movements: [],
    customers: [], orders: [], orderItems: [], statusHistory: [],
    shipments: [], returns: [],
    platforms: [], campaigns: [], adSets: [], ads: [], adSpend: [],
    expenses: [], payments: [], goals: [], notifications: [],
    auditLogs: [], integrations: [], integrationEvents: [],
  };
}

export function seedDemo(db: DataSet): DataSet {
  seedState = 20260826;
  const admin = db.users[0];
  const org = db.organization;
  const DAYS = 90;
  const now = Date.now();
  let clockISO = new Date(now - DAYS * 864e5).toISOString();
  const ctx: Ctx = { db, actor: admin, clock: () => clockISO };
  const setClock = (d: Date) => { clockISO = d.toISOString(); };

  /* ---------------------------------------------------- catalog + stock */
  PRODUCTS.forEach(([name, brand, model, cost, price, category], idx) => {
    const product: Product = {
      id: uid(), org_id: org.id,
      reference: `SHO-${String(idx + 1).padStart(4, '0')}`,
      name, model, brand, category,
      supplier_id: pick(db.suppliers).id,
      cost_price: cost, selling_price: price,
      image_url: productImage(name, brand),
      status: 'active',
      description: `${name} — ${brand}. أصلي 100%، متوفر بعدة مقاسات.`,
      created_at: new Date(now - (DAYS + 20) * 864e5).toISOString(),
    };
    db.products.push(product);

    for (const size of SIZES) {
      const v: ProductVariant = {
        id: uid(), org_id: org.id, product_id: product.id, size,
        sku: `${model}-${size}`,
        barcode: `61${int(10000000, 99999999)}`,
        cost_price: cost, selling_price: price,
        min_stock: 3, is_active: true,
      };
      db.variants.push(v);
      // initial purchase, weighted by how common the size is
      const qty = Math.max(2, Math.round(SIZE_WEIGHT[size] * int(60, 130)));
      applyStock(ctx, {
        variant_id: v.id, type: 'purchase_in', quantity: qty,
        reference_type: 'purchase', reference_label: `توريد أولي — ${product.name}`,
        note: 'مخزون افتتاحي',
      });
    }

    db.expenses.push({
      id: uid(), org_id: org.id,
      date: new Date(now - (DAYS + 15) * 864e5).toISOString().slice(0, 10),
      category: 'product_purchase',
      amount: money(cost * 40), currency: 'MAD',
      description: `شراء مخزون — ${name}`,
      payment_method: 'bank_transfer', is_auto: true,
      created_at: new Date(now - (DAYS + 15) * 864e5).toISOString(),
    });
  });

  /* ------------------------------------------------------- ad structure */
  const platformDefs: [AdPlatform['code'], string][] = [
    ['meta', 'Meta Ads'], ['tiktok', 'TikTok Ads'], ['google', 'Google Ads'],
  ];
  const platforms: AdPlatform[] = platformDefs.map(([code, name]) => ({
    id: uid(), org_id: org.id, code, name,
  }));
  db.platforms.push(...platforms);

  const campaignDefs: [string, number, string][] = [
    ['Nike Dunk — Retargeting', 0, 'conversions'],
    ['Air Force 1 — Broad MA', 0, 'conversions'],
    ['Samba OG — Lookalike', 0, 'conversions'],
    ['TikTok Sneakers — Cold', 1, 'traffic'],
    ['TikTok Jordan Hype', 1, 'conversions'],
    ['Google Search — أحذية رياضية', 2, 'search'],
    ['Ultraboost — Runners', 0, 'conversions'],
  ];
  const campaigns: AdCampaign[] = campaignDefs.map(([name, pIdx, objective]) => ({
    id: uid(), org_id: org.id, platform_id: platforms[pIdx].id,
    name, objective, status: 'active',
    started_at: new Date(now - DAYS * 864e5).toISOString().slice(0, 10),
    daily_budget: int(120, 320),
  }));
  db.campaigns.push(...campaigns);

  // Each campaign gets its own true cost-per-order. One of them is
  // deliberately bad so the "losing campaign" alert has something real to
  // find. Actual spend is generated AFTER the orders exist (see below), so
  // CPA, ROAS and per-order ad cost are internally consistent.
  const campaignCpa = new Map<string, number>();
  campaigns.forEach((c, i) => {
    db.adSets.push({ id: uid(), org_id: org.id, campaign_id: c.id, name: `${c.name} — Adset 1`, audience: 'MA 18-40' });
    const set = db.adSets[db.adSets.length - 1];
    db.ads.push({ id: uid(), org_id: org.id, ad_set_id: set.id, name: `${c.name} — Creative A` });
    campaignCpa.set(c.id, i === 3 ? int(180, 240) : int(45, 100));
  });

  /* ------------------------------------------------------------ customers */
  const customerSeeds = Array.from({ length: 62 }, () => {
    const city = pick(db.cities);
    return {
      full_name: `${pick(FIRST)} ${pick(LAST)}`,
      phone: `06${int(10000000, 99999999)}`,
      city_id: city.id, city_name: city.name_ar,
      address: `حي ${pick(['النخيل','المسيرة','السلام','الرياض','الأمل','الفتح','الوفاق'])}، زنقة ${int(1, 60)}، رقم ${int(1, 200)}`,
    };
  });

  /* --------------------------------------------------------------- orders */
  // status mix that mirrors a real Moroccan COD store
  const statusRoll = (): OrderStatus => {
    const r = rnd();
    if (r < 0.52) return 'delivered';
    if (r < 0.66) return 'refused';
    if (r < 0.71) return 'returned';
    if (r < 0.77) return 'cancelled';
    if (r < 0.85) return 'shipped';
    if (r < 0.91) return 'preparing';
    if (r < 0.96) return 'confirmed';
    return 'to_confirm';
  };

  const activeVariants = () => db.variants.filter((v) => {
    const inv = db.inventory.find((i) => i.variant_id === v.id);
    return (inv?.on_hand ?? 0) > 1;
  });

  let created = 0;
  for (let d = DAYS; d >= 0; d--) {
    const dayOrders = d > 60 ? int(1, 3) : d > 30 ? int(2, 5) : int(3, 6);
    for (let k = 0; k < dayOrders; k++) {
      const when = new Date(now - d * 864e5);
      when.setHours(int(9, 21), int(0, 59), int(0, 59), 0);
      setClock(when);

      const cs = chance(0.22) && db.customers.length > 5
        ? (() => { const c = pick(db.customers); return { id: c.id, full_name: c.full_name, phone: c.phone, city_id: c.city_id, city_name: c.city_name, address: c.address }; })()
        : pick(customerSeeds);

      const pool = activeVariants();
      if (!pool.length) continue;
      const lineCount = chance(0.13) ? 2 : 1;
      const chosen: string[] = [];
      for (let i = 0; i < lineCount; i++) {
        const v = pick(pool);
        if (!chosen.includes(v.id)) chosen.push(v.id);
      }
      const campaign = chance(0.85) ? pick(campaigns) : undefined;

      let order;
      try {
        order = createOrder(ctx, {
          customer: cs,
          lines: chosen.map((variant_id) => ({ variant_id, quantity: 1 })),
          channel: chance(0.55) ? 'shopify' : chance(0.5) ? 'manual' : 'instagram',
          source: campaign?.name,
          ad_campaign_id: campaign?.id,
          status: 'new',
        });
      } catch { continue; }

      created++;

      // walk the order through its lifecycle with realistic timing
      const target = statusRoll();
      const step = (s: OrderStatus, hours: number) => {
        const t = new Date(when.getTime() + hours * 3600_000);
        if (t.getTime() > now) return false;
        setClock(t);
        try { setOrderStatus(ctx, order!.id, s); } catch { return false; }
        return true;
      };

      if (target === 'to_confirm') { step('to_confirm', 1); continue; }
      if (!step('confirmed', int(1, 20))) continue;
      if (target === 'confirmed') continue;
      if (target === 'cancelled') { step('cancelled', int(21, 40)); continue; }
      if (!step('preparing', int(21, 30))) continue;
      if (target === 'preparing') continue;
      if (!step('shipped', int(31, 50))) continue;
      if (target === 'shipped') continue;
      if (target === 'delivered') { step('delivered', int(55, 120)); continue; }
      if (target === 'refused') {
        if (step('refused', int(55, 130))) {
          if (chance(0.6)) step('returned', int(140, 200));
        }
        continue;
      }
      if (target === 'returned') { step('returned', int(60, 140)); }
    }
  }

  /* ------------------------------------- ad spend derived from real orders */
  // Spend is generated from the orders each campaign actually produced, at
  // that campaign's true CPA, plus a small amount of wasted spend on days
  // that brought nothing. This keeps CPA / ROAS / per-order ad cost coherent
  // instead of three numbers that contradict each other.
  setClock(new Date(now));
  for (const c of campaigns) {
    const set = db.adSets.find((s) => s.campaign_id === c.id)!;
    const ad = db.ads.find((a) => a.ad_set_id === set.id)!;
    const cpa = campaignCpa.get(c.id)!;
    for (let d = DAYS; d >= 0; d--) {
      const date = new Date(now - d * 864e5).toISOString().slice(0, 10);
      const dayOrdersForCampaign = db.orders.filter(
        (o) => o.ad_campaign_id === c.id && o.created_at.slice(0, 10) === date && o.status !== 'cancelled');
      const waste = dayOrdersForCampaign.length ? int(0, 40) : int(20, 90);
      const spend = money(dayOrdersForCampaign.length * cpa * (0.85 + rnd() * 0.35) + waste);
      if (spend <= 0) continue;
      const cpc = 1.2 + rnd() * 2.2;
      const clicks = Math.max(1, Math.round(spend / cpc));
      const ctr = 0.009 + rnd() * 0.02;
      db.adSpend.push({
        id: uid(), org_id: org.id, date, campaign_id: c.id,
        ad_set_id: set.id, ad_id: ad.id,
        spend, clicks, impressions: Math.round(clicks / ctr),
        leads: Math.round(clicks * (0.04 + rnd() * 0.08)),
        currency: 'MAD',
      });
      // allocate that day's spend across the orders it produced
      if (dayOrdersForCampaign.length) {
        const per = money(spend / dayOrdersForCampaign.length);
        for (const o of dayOrdersForCampaign) o.ad_cost = per;
      }
    }
  }
  // recompute every order after ad allocation
  for (const o of db.orders) {
    const items = db.orderItems.filter((i) => i.order_id === o.id);
    Object.assign(o, recalcOrder(o, items));
  }
  for (const c of db.customers) {
    const orders = db.orders.filter((o) => o.customer_id === c.id);
    const delivered = orders.filter((o) => o.status === 'delivered');
    c.total_spent = money(delivered.reduce((a, o) => a + o.revenue, 0));
    c.total_profit = money(orders.reduce((a, o) => a + o.net_profit, 0));
    c.avg_order_value = delivered.length ? money(c.total_spent / delivered.length) : 0;
    c.lifetime_value = c.total_profit;
  }

  /* ------------------------------------------------- operating expenses */
  for (let m = 3; m >= 0; m--) {
    const date = new Date(now - m * 30 * 864e5).toISOString().slice(0, 10);
    const fixed: [string, number, 'salaries' | 'rent' | 'software' | 'packaging' | 'other'][] = [
      ['رواتب الفريق', 5200, 'salaries'],
      ['كراء المستودع', 1800, 'rent'],
      ['اشتراكات (Shopify، أدوات)', 620, 'software'],
      ['مواد التغليف', 480, 'packaging'],
      ['مصاريف متنوعة', 350, 'other'],
    ];
    for (const [description, amount, category] of fixed) {
      db.expenses.push({
        id: uid(), org_id: org.id, date, category,
        amount: money(amount * (0.9 + rnd() * 0.2)), currency: 'MAD',
        description, payment_method: 'bank_transfer', is_auto: false,
        created_at: new Date(date).toISOString(),
      });
    }
  }

  /* ------------------------------------------------------------- goals */
  const first = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const last = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  const goals: Goal[] = [
    { metric: 'sales', target_value: 90000, label: 'هدف المبيعات الشهري' },
    { metric: 'orders', target_value: 150, label: 'عدد الطلبات' },
    { metric: 'profit', target_value: 20000, label: 'الربح الصافي' },
    { metric: 'delivered_orders', target_value: 85, label: 'الطلبات المسلّمة' },
    { metric: 'roas', target_value: 3, label: 'ROAS' },
  ].map((g) => ({
    id: uid(), org_id: org.id, period: 'month',
    period_start: first.toISOString().slice(0, 10),
    period_end: last.toISOString().slice(0, 10),
    is_active: true, ...g,
  } as Goal));
  db.goals.push(...goals);

  /* ------------------------------------------------------ integrations */
  db.integrations.push(
    { id: uid(), org_id: org.id, provider: 'shopify', label: 'متجر Shopify', is_enabled: true, config: { shop_domain: 'shoes-os.myshopify.com', auto_create_orders: true, default_status: 'to_confirm' }, last_status: 'connected', last_sync_at: new Date(now - 3600_000).toISOString() },
    { id: uid(), org_id: org.id, provider: 'ozonexpress', label: 'Ozon Express', is_enabled: false, config: { mode: 'manual' }, last_status: 'not_configured' },
    { id: uid(), org_id: org.id, provider: 'meta_ads', label: 'Meta Ads', is_enabled: false, config: {}, last_status: 'not_configured' },
    { id: uid(), org_id: org.id, provider: 'google_sheets', label: 'Google Sheets', is_enabled: false, config: {}, last_status: 'not_configured' },
    { id: uid(), org_id: org.id, provider: 'whatsapp', label: 'WhatsApp', is_enabled: true, config: { mode: 'deep_link' }, last_status: 'link_only' },
  );

  db.notifications = db.notifications.slice(0, 40);
  void created;
  return db;
}
