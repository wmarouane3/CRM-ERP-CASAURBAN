/**
 * SHOES OS — enum metadata (labels, colors, transitions).
 * Single source of truth for how a status is named and drawn.
 */
import type {
  OrderStatus, ShipmentStatus, MovementType, ExpenseCategory,
  CustomerSegment, UserRole, SalesChannel, AdPlatformCode, GoalMetric,
} from './types';

export interface EnumMeta { label: string; short?: string; tone: Tone; icon?: string }
export type Tone =
  | 'slate' | 'blue' | 'indigo' | 'violet' | 'amber' | 'emerald'
  | 'rose' | 'red' | 'zinc' | 'cyan' | 'orange';

export const ORDER_STATUS: Record<OrderStatus, EnumMeta> = {
  new:         { label: 'جديد',            tone: 'slate' },
  to_confirm:  { label: 'بانتظار التأكيد',  tone: 'amber' },
  confirmed:   { label: 'مؤكد',            tone: 'blue' },
  preparing:   { label: 'قيد التحضير',      tone: 'indigo' },
  shipped:     { label: 'تم الشحن',         tone: 'violet' },
  delivered:   { label: 'تم التسليم',       tone: 'emerald' },
  refused:     { label: 'مرفوض',           tone: 'rose' },
  returned:    { label: 'مُرتجع',           tone: 'orange' },
  cancelled:   { label: 'ملغى',            tone: 'zinc' },
};

export const ORDER_STATUS_ORDER: OrderStatus[] = [
  'new', 'to_confirm', 'confirmed', 'preparing', 'shipped',
  'delivered', 'refused', 'returned', 'cancelled',
];

/** The pipeline shown in the order timeline (happy path). */
export const ORDER_PIPELINE: OrderStatus[] =
  ['new', 'confirmed', 'preparing', 'shipped', 'delivered'];

/** Allowed transitions — mirrors fn_status_allowed() in SQL. */
export const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new:        ['to_confirm', 'confirmed', 'cancelled'],
  to_confirm: ['confirmed', 'cancelled', 'new'],
  confirmed:  ['preparing', 'shipped', 'cancelled'],
  preparing:  ['shipped', 'cancelled', 'confirmed'],
  shipped:    ['delivered', 'refused', 'returned'],
  delivered:  ['returned'],
  refused:    ['returned', 'cancelled'],
  returned:   [],
  cancelled:  [],
};

export const OPEN_STATUSES: OrderStatus[] =
  ['new', 'to_confirm', 'confirmed', 'preparing', 'shipped'];
export const CLOSED_STATUSES: OrderStatus[] =
  ['delivered', 'refused', 'returned', 'cancelled'];
/** Statuses that prove the order actually reached the carrier's last mile. */
export const RESOLVED_STATUSES: OrderStatus[] = ['delivered', 'refused', 'returned'];

export const SHIPMENT_STATUS: Record<ShipmentStatus, EnumMeta> = {
  ready:      { label: 'جاهز للشحن', tone: 'slate' },
  sent:       { label: 'تم الإرسال', tone: 'blue' },
  in_transit: { label: 'في الطريق',  tone: 'indigo' },
  delivered:  { label: 'تم التسليم', tone: 'emerald' },
  refused:    { label: 'مرفوض',     tone: 'rose' },
  returned:   { label: 'مُرتجع',     tone: 'orange' },
};

export const MOVEMENT_TYPE: Record<MovementType, EnumMeta> = {
  purchase_in:    { label: 'شراء / توريد',       tone: 'emerald' },
  sale_out:       { label: 'بيع',                tone: 'rose' },
  return_in:      { label: 'إرجاع للمخزون',      tone: 'blue' },
  refusal_in:     { label: 'رفض — عودة للمخزون', tone: 'amber' },
  adjustment_in:  { label: 'تسوية (+)',          tone: 'cyan' },
  adjustment_out: { label: 'تسوية (−)',          tone: 'zinc' },
  transfer_in:    { label: 'تحويل وارد',         tone: 'cyan' },
  transfer_out:   { label: 'تحويل صادر',         tone: 'zinc' },
  reserve:        { label: 'حجز',                tone: 'violet' },
  release:        { label: 'فك الحجز',           tone: 'slate' },
};

export const EXPENSE_CATEGORY: Record<ExpenseCategory, EnumMeta> = {
  advertising:     { label: 'إعلانات',        tone: 'violet' },
  product_purchase:{ label: 'شراء منتجات',    tone: 'blue' },
  shipping:        { label: 'شحن',            tone: 'indigo' },
  return_shipping: { label: 'إرجاع الشحن',    tone: 'rose' },
  packaging:       { label: 'تغليف',          tone: 'cyan' },
  salaries:        { label: 'رواتب',          tone: 'amber' },
  software:        { label: 'برامج واشتراكات', tone: 'slate' },
  rent:            { label: 'إيجار',          tone: 'zinc' },
  other:           { label: 'أخرى',           tone: 'slate' },
};

export const CUSTOMER_SEGMENT: Record<CustomerSegment, EnumMeta> = {
  new:       { label: 'عميل جديد',   tone: 'blue' },
  returning: { label: 'عميل متكرر',  tone: 'emerald' },
  vip:       { label: 'VIP',        tone: 'violet' },
  high_risk: { label: 'خطر مرتفع',   tone: 'rose' },
  inactive:  { label: 'غير نشط',     tone: 'zinc' },
};

export const USER_ROLE: Record<UserRole, EnumMeta> = {
  admin:         { label: 'مدير النظام',   tone: 'violet' },
  manager:       { label: 'مدير',          tone: 'blue' },
  order_manager: { label: 'مسؤول الطلبات', tone: 'cyan' },
  warehouse:     { label: 'المستودع',      tone: 'amber' },
  marketing:     { label: 'التسويق',       tone: 'emerald' },
  viewer:        { label: 'مشاهدة فقط',    tone: 'zinc' },
};

export const SALES_CHANNEL: Record<SalesChannel, EnumMeta> = {
  manual:    { label: 'يدوي',      tone: 'slate' },
  shopify:   { label: 'Shopify',   tone: 'emerald' },
  youcan:    { label: 'YouCan',    tone: 'blue' },
  whatsapp:  { label: 'WhatsApp',  tone: 'emerald' },
  instagram: { label: 'Instagram', tone: 'rose' },
  phone:     { label: 'هاتف',      tone: 'cyan' },
  other:     { label: 'أخرى',      tone: 'zinc' },
};

export const AD_PLATFORM: Record<AdPlatformCode, EnumMeta> = {
  meta:      { label: 'Meta',      tone: 'blue' },
  facebook:  { label: 'Facebook',  tone: 'blue' },
  instagram: { label: 'Instagram', tone: 'rose' },
  tiktok:    { label: 'TikTok',    tone: 'zinc' },
  google:    { label: 'Google',    tone: 'amber' },
  snapchat:  { label: 'Snapchat',  tone: 'amber' },
  other:     { label: 'أخرى',      tone: 'slate' },
};

export const GOAL_METRIC: Record<GoalMetric, EnumMeta> = {
  sales:            { label: 'المبيعات',        tone: 'blue' },
  orders:           { label: 'عدد الطلبات',     tone: 'indigo' },
  profit:           { label: 'الربح الصافي',     tone: 'emerald' },
  delivered_orders: { label: 'الطلبات المسلّمة', tone: 'violet' },
  roas:             { label: 'ROAS',           tone: 'amber' },
  delivery_rate:    { label: 'نسبة التسليم',    tone: 'cyan' },
};

export const TONE_CLASSES: Record<Tone, string> = {
  slate:   'bg-slate-100 text-slate-700 ring-slate-200',
  blue:    'bg-blue-50 text-blue-700 ring-blue-200',
  indigo:  'bg-indigo-50 text-indigo-700 ring-indigo-200',
  violet:  'bg-violet-50 text-violet-700 ring-violet-200',
  amber:   'bg-amber-50 text-amber-800 ring-amber-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rose:    'bg-rose-50 text-rose-700 ring-rose-200',
  red:     'bg-red-50 text-red-700 ring-red-200',
  zinc:    'bg-zinc-100 text-zinc-600 ring-zinc-200',
  cyan:    'bg-cyan-50 text-cyan-700 ring-cyan-200',
  orange:  'bg-orange-50 text-orange-700 ring-orange-200',
};

export const TONE_DOT: Record<Tone, string> = {
  slate: 'bg-slate-400', blue: 'bg-blue-500', indigo: 'bg-indigo-500',
  violet: 'bg-violet-500', amber: 'bg-amber-500', emerald: 'bg-emerald-500',
  rose: 'bg-rose-500', red: 'bg-red-500', zinc: 'bg-zinc-400',
  cyan: 'bg-cyan-500', orange: 'bg-orange-500',
};

export const CHART_COLORS = [
  '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#14b8a6', '#f97316', '#64748b', '#ec4899',
];
