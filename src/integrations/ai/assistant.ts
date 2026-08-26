/**
 * SHOES OS — AI Business Assistant (local engine).
 *
 * ARCHITECTURE NOTE
 * -----------------
 * The assistant is split in two so the LLM can be added without touching
 * the UI:
 *
 *   1. TOOLS   — `BUSINESS_TOOLS` below. Each tool is a pure function that
 *                answers ONE business question from the DataSet. They are
 *                deterministic, cheap, and already used by the dashboard.
 *   2. ROUTER  — today a keyword matcher. Tomorrow: send the question plus
 *                the tool JSON-schemas to a model (function calling) from
 *                an Edge Function, run the chosen tool server-side, and
 *                let the model phrase the answer.
 *
 * The model never needs raw table access — it calls the same audited
 * functions the UI calls. That is what makes it safe to enable later.
 */
import {
  campaignPerformance, cityPerformance, customerKpis, financeKpis,
  inventoryKpis, marketingKpis, productPerformance, salesKpis, sizePerformance,
  generateInsights,
} from '../../core/analytics';
import { fmtMoney, fmtPct } from '../../core/money';
import { resolveRange, type DateRange } from '../../core/dates';
import type { DataSet, Order } from '../../core/types';

export interface AssistantAnswer {
  title: string;
  answer: string;
  bullets?: string[];
  link?: string;
}

export interface ToolContext { db: DataSet; orders: Order[]; range: DateRange }

export interface BusinessTool {
  id: string;
  question: string;
  keywords: string[];
  run: (c: ToolContext) => AssistantAnswer;
}

export const BUSINESS_TOOLS: BusinessTool[] = [
  {
    id: 'best_selling_product',
    question: 'ما أكثر منتج مبيعاً؟',
    keywords: ['أكثر منتج', 'مبيعا', 'مبيعاً', 'best selling', 'أفضل منتج'],
    run: ({ db, orders }) => {
      const rows = productPerformance(db, orders).sort((a, b) => b.unitsDelivered - a.unitsDelivered);
      const top = rows[0];
      if (!top) return { title: 'لا توجد بيانات', answer: 'لا توجد طلبات في هذه الفترة.' };
      return {
        title: 'أكثر منتج مبيعاً',
        answer: `${top.name} — ${top.unitsDelivered} قطعة مسلّمة بمداخيل ${fmtMoney(top.revenue)}.`,
        bullets: rows.slice(1, 4).map((r) => `${r.name}: ${r.unitsDelivered} قطعة — ${fmtMoney(r.revenue)}`),
        link: '/analytics',
      };
    },
  },
  {
    id: 'most_profitable_product',
    question: 'ما أكثر منتج ربحاً؟',
    keywords: ['منتج ربح', 'أكثر ربحا', 'مربح', 'profitable'],
    run: ({ db, orders }) => {
      const rows = productPerformance(db, orders).sort((a, b) => b.profit - a.profit);
      const top = rows[0];
      if (!top) return { title: 'لا توجد بيانات', answer: 'لا توجد طلبات مسلّمة بعد.' };
      return {
        title: 'أكثر منتج ربحاً',
        answer: `${top.name} — ربح إجمالي ${fmtMoney(top.profit)} بهامش ${fmtPct(top.margin)}.`,
        bullets: rows.slice(1, 4).map((r) => `${r.name}: ${fmtMoney(r.profit)} (${fmtPct(r.margin)})`),
        link: '/analytics',
      };
    },
  },
  {
    id: 'worst_products',
    question: 'ما المنتجات الضعيفة؟',
    keywords: ['أسوأ', 'ضعيف', 'خسارة منتج', 'worst'],
    run: ({ db, orders }) => {
      const rows = productPerformance(db, orders)
        .filter((r) => r.orders >= 2)
        .sort((a, b) => a.profit - b.profit);
      return {
        title: 'المنتجات الأضعف أداءً',
        answer: rows.length
          ? `${rows[0].name} هو الأضعف: ${fmtMoney(rows[0].profit)} ربح من ${rows[0].orders} طلب، نسبة تسليم ${fmtPct(rows[0].deliveryRate)}.`
          : 'لا توجد بيانات كافية.',
        bullets: rows.slice(1, 4).map((r) => `${r.name}: ${fmtMoney(r.profit)} — تسليم ${fmtPct(r.deliveryRate)}`),
        link: '/analytics',
      };
    },
  },
  {
    id: 'best_size',
    question: 'ما أفضل مقاس؟',
    keywords: ['مقاس', 'size', 'أفضل مقاس'],
    run: ({ db, orders }) => {
      const rows = sizePerformance(db, orders).sort((a, b) => b.delivered - a.delivered);
      const top = rows[0];
      return {
        title: 'أفضل المقاسات',
        answer: top ? `المقاس ${top.size} هو الأكثر طلباً — ${top.delivered} قطعة مسلّمة.` : 'لا توجد بيانات.',
        bullets: rows.slice(0, 5).map((r) => `مقاس ${r.size}: ${r.delivered} مسلّمة — ${fmtMoney(r.revenue)}`),
        link: '/analytics',
      };
    },
  },
  {
    id: 'best_city',
    question: 'ما أفضل مدينة؟',
    keywords: ['مدينة', 'مدن', 'city', 'أفضل مدينة'],
    run: ({ orders }) => {
      const rows = cityPerformance(orders).filter((r) => r.orders >= 3);
      const byProfit = [...rows].sort((a, b) => b.profit - a.profit);
      const worst = [...rows].sort((a, b) => a.deliveryRate - b.deliveryRate)[0];
      const top = byProfit[0];
      return {
        title: 'أداء المدن',
        answer: top
          ? `${top.city} هي الأفضل: ${top.delivered} طلب مسلّم، ربح ${fmtMoney(top.profit)}، نسبة تسليم ${fmtPct(top.deliveryRate)}.`
          : 'لا توجد بيانات كافية.',
        bullets: [
          ...byProfit.slice(1, 4).map((r) => `${r.city}: ${fmtMoney(r.profit)} — تسليم ${fmtPct(r.deliveryRate)}`),
          worst ? `⚠️ أضعف مدينة: ${worst.city} — نسبة تسليم ${fmtPct(worst.deliveryRate)}` : '',
        ].filter(Boolean),
        link: '/analytics',
      };
    },
  },
  {
    id: 'refusal_rate',
    question: 'ما نسبة الرفض؟',
    keywords: ['رفض', 'refus', 'مرتجع', 'إرجاع', 'return rate'],
    run: ({ db, orders }) => {
      const s = salesKpis(db, orders);
      const worstCities = cityPerformance(orders)
        .filter((c) => c.orders >= 3)
        .sort((a, b) => b.refusalRate - a.refusalRate)
        .slice(0, 3);
      return {
        title: 'نسب الرفض والإرجاع',
        answer: `نسبة الرفض ${fmtPct(s.refusalRate)} ونسبة الإرجاع ${fmtPct(s.returnRate)} — مقابل نسبة تسليم ${fmtPct(s.deliveryRate)}.`,
        bullets: worstCities.map((c) => `${c.city}: رفض ${fmtPct(c.refusalRate)} من ${c.orders} طلب`),
        link: '/analytics',
      };
    },
  },
  {
    id: 'real_profit',
    question: 'كم ربحت فعلياً؟',
    keywords: ['ربحت', 'ربح', 'profit', 'صافي', 'خسرت', 'خسارة'],
    run: ({ db, orders, range }) => {
      const f = financeKpis(db, orders, range);
      return {
        title: 'الربح الحقيقي',
        answer: `المداخيل المحققة ${fmtMoney(f.revenue)} والربح الصافي ${fmtMoney(f.netProfit)} بهامش ${fmtPct(f.profitMargin)}.`,
        bullets: [
          `تكلفة المنتجات: ${fmtMoney(f.productCost)}`,
          `الشحن: ${fmtMoney(f.shippingCost)}`,
          `المرتجعات: ${fmtMoney(f.returnCost)}`,
          `الإعلانات: ${fmtMoney(f.adSpend)}`,
          `مصاريف أخرى: ${fmtMoney(f.otherExpenses)}`,
        ],
        link: '/finance',
      };
    },
  },
  {
    id: 'why_profit_dropped',
    question: 'لماذا انخفض الربح هذا الشهر؟',
    keywords: ['لماذا', 'انخفض', 'سبب', 'why'],
    run: ({ db, orders, range }) => {
      const cur = financeKpis(db, orders, range);
      const prevRange = resolveRange('last_month');
      const prevOrders = db.orders.filter(
        (o) => new Date(o.created_at) >= prevRange.from && new Date(o.created_at) <= prevRange.to);
      const prev = financeKpis(db, prevOrders, prevRange);
      const diff = cur.netProfit - prev.netProfit;
      const reasons: string[] = [];
      if (cur.adSpend > prev.adSpend) reasons.push(`ارتفاع الإنفاق الإعلاني بـ ${fmtMoney(cur.adSpend - prev.adSpend)}`);
      if (cur.returnCost > prev.returnCost) reasons.push(`ارتفاع تكاليف المرتجعات بـ ${fmtMoney(cur.returnCost - prev.returnCost)}`);
      if (cur.revenue < prev.revenue) reasons.push(`انخفاض المداخيل بـ ${fmtMoney(prev.revenue - cur.revenue)}`);
      if (cur.productCost / Math.max(cur.revenue, 1) > prev.productCost / Math.max(prev.revenue, 1)) {
        reasons.push('ارتفاع نسبة تكلفة المنتج من سعر البيع');
      }
      return {
        title: diff >= 0 ? 'الربح تحسّن' : 'أسباب انخفاض الربح',
        answer: `الربح الصافي ${fmtMoney(cur.netProfit)} مقابل ${fmtMoney(prev.netProfit)} في الفترة المقارنة (${diff >= 0 ? '+' : ''}${fmtMoney(diff)}).`,
        bullets: reasons.length ? reasons : ['لا يوجد تغير جوهري في بنود المصاريف.'],
        link: '/finance',
      };
    },
  },
  {
    id: 'best_campaign',
    question: 'ما أفضل حملة إعلانية؟',
    keywords: ['حملة', 'campaign', 'إعلان', 'roas', 'ads'],
    run: ({ db, orders, range }) => {
      const rows = campaignPerformance(db, orders, range);
      const best = rows[0];
      const worst = rows[rows.length - 1];
      const m = marketingKpis(db, orders, range);
      return {
        title: 'أداء الحملات',
        answer: best
          ? `أفضل حملة: ${best.campaign} — ROAS ${best.roas}، ربح ${fmtMoney(best.profit)}، تكلفة الطلب المسلّم ${fmtMoney(best.costPerDelivered)}.`
          : 'لا توجد حملات.',
        bullets: [
          `إجمالي الإنفاق: ${fmtMoney(m.adSpend)} — ROAS عام ${m.roas}`,
          `تكلفة الطلب المسلّم: ${fmtMoney(m.costPerDelivered)}`,
          worst && worst.profit < 0 ? `⚠️ أسوأ حملة: ${worst.campaign} — خسارة ${fmtMoney(Math.abs(worst.profit))}` : '',
        ].filter(Boolean),
        link: '/marketing',
      };
    },
  },
  {
    id: 'restock',
    question: 'ما المنتجات التي يجب أن أطلبها؟',
    keywords: ['أطلب', 'إعادة', 'restock', 'نفد', 'مخزون'],
    run: ({ db }) => {
      const inv = inventoryKpis(db);
      const rows = db.inventory
        .map((i) => {
          const v = db.variants.find((x) => x.id === i.variant_id)!;
          const p = db.products.find((x) => x.id === v?.product_id);
          return { name: p?.name ?? '', size: v?.size ?? '', on_hand: i.on_hand, min: v?.min_stock ?? 3, cost: v?.cost_price ?? 0 };
        })
        .filter((r) => r.on_hand <= r.min)
        .sort((a, b) => a.on_hand - b.on_hand);
      return {
        title: 'ما يجب إعادة طلبه',
        answer: `${inv.outOfStock} مقاس نفد و${inv.lowStock} مقاس وصل الحد الأدنى. قيمة إعادة التخزين المقترحة ${fmtMoney(inv.restockValue)}.`,
        bullets: rows.slice(0, 6).map((r) => `${r.name} — مقاس ${r.size}: ${r.on_hand} قطعة (الحد ${r.min})`),
        link: '/inventory',
      };
    },
  },
  {
    id: 'aov',
    question: 'ما متوسط قيمة الطلب وتكلفة العميل؟',
    keywords: ['متوسط', 'aov', 'عميل', 'cpa', 'تكلفة الحصول'],
    run: ({ db, orders, range }) => {
      const f = financeKpis(db, orders, range);
      const m = marketingKpis(db, orders, range);
      const c = customerKpis(db, range);
      return {
        title: 'مؤشرات العميل',
        answer: `متوسط قيمة الطلب ${fmtMoney(f.avgOrderValue)} وتكلفة الحصول على طلب مسلّم ${fmtMoney(m.costPerDelivered)}.`,
        bullets: [
          `عملاء جدد في الفترة: ${c.newCustomers}`,
          `عملاء متكررون: ${c.returning} (${fmtPct(c.repeatRate)})`,
          `متوسط القيمة الدائمة للعميل: ${fmtMoney(c.avgLtv)}`,
          `عملاء خطر مرتفع: ${c.highRisk}`,
        ],
        link: '/customers',
      };
    },
  },
  {
    id: 'summary',
    question: 'أعطني ملخص الأداء',
    keywords: ['ملخص', 'وضعية', 'حالة', 'summary', 'كيف'],
    run: ({ db, orders, range }) => {
      const s = salesKpis(db, orders);
      const f = financeKpis(db, orders, range);
      return {
        title: 'ملخص الأداء',
        answer: `${s.orders} طلب، منها ${s.delivered} مسلّم (${fmtPct(s.deliveryRate)}). المداخيل ${fmtMoney(f.revenue)} والربح الصافي ${fmtMoney(f.netProfit)}.`,
        bullets: generateInsights(db, orders, range).slice(0, 4).map((i) => `${i.title} — ${i.detail}`),
        link: '/',
      };
    },
  },
];

/** Keyword router. Replace with LLM function-calling when the key exists. */
export function askAssistant(question: string, ctx: ToolContext): AssistantAnswer {
  const q = question.trim().toLowerCase();
  let best: BusinessTool | undefined;
  let bestScore = 0;
  for (const t of BUSINESS_TOOLS) {
    const score = t.keywords.reduce((a, k) => a + (q.includes(k.toLowerCase()) ? k.length : 0), 0);
    if (score > bestScore) { bestScore = score; best = t; }
  }
  if (!best) {
    return {
      title: 'لم أفهم السؤال',
      answer: 'جرّب أحد الأسئلة الجاهزة أدناه، أو اسأل عن: المنتجات، المدن، الحملات، الربح، المخزون، أو العملاء.',
      bullets: BUSINESS_TOOLS.slice(0, 6).map((t) => t.question),
    };
  }
  return best.run(ctx);
}
