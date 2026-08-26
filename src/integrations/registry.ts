/**
 * SHOES OS — Integration registry.
 * The single list the Settings → Integrations page renders from.
 * Adding a provider = adding an entry + its adapter file.
 */
import type { ProviderMeta } from './types';

export const PROVIDERS: ProviderMeta[] = [
  {
    id: 'shopify', kind: 'sales_channel', name: 'Shopify', status: 'ready',
    description: 'استيراد الطلبات تلقائياً عبر Webhook (orders/create) مع حماية من التكرار ومطابقة SKU بالمقاس.',
    requires: ['Shopify Admin API access token', 'Webhook secret (HMAC)'],
    docs: 'supabase/functions/shopify-webhook/index.ts',
  },
  {
    id: 'youcan', kind: 'sales_channel', name: 'YouCan', status: 'planned',
    description: 'نفس طبقة الاستيراد — يكفي كتابة mapper خاص بـ YouCan.',
    requires: ['YouCan API key'],
  },
  {
    id: 'ozonexpress', kind: 'carrier', name: 'Ozon Express', status: 'planned',
    description: 'إنشاء بوليصة الشحن وتتبع الحالة تلقائياً (Ready → Sent → Delivered / Refused).',
    requires: ['Ozon customer ID', 'API key'],
  },
  {
    id: 'sendit', kind: 'carrier', name: 'Sendit', status: 'planned',
    description: 'شركة شحن بديلة — يعمل عبر نفس CarrierAdapter.',
    requires: ['Sendit API token'],
  },
  {
    id: 'meta_ads', kind: 'ads', name: 'Meta Ads', status: 'planned',
    description: 'سحب المصاريف اليومية والانطباعات والنقرات لكل حملة، وربطها بالطلبات المسلّمة.',
    requires: ['Meta system user token', 'Ad account ID'],
  },
  {
    id: 'tiktok_ads', kind: 'ads', name: 'TikTok Ads', status: 'planned',
    description: 'نفس بنية Meta Ads.',
    requires: ['TikTok advertiser ID'],
  },
  {
    id: 'google_ads', kind: 'ads', name: 'Google Ads', status: 'planned',
    description: 'نفس بنية Meta Ads.',
    requires: ['Google Ads developer token'],
  },
  {
    id: 'google_sheets', kind: 'sheet', name: 'Google Sheets', status: 'planned',
    description: 'استيراد/تصدير ثنائي الاتجاه. قاعدة البيانات تبقى PostgreSQL — Sheets مجرد قناة.',
    requires: ['Service account JSON', 'Spreadsheet ID'],
  },
  {
    id: 'whatsapp', kind: 'messaging', name: 'WhatsApp', status: 'link_only',
    description: 'زر مراسلة العميل يعمل الآن عبر رابط مباشر. WhatsApp Cloud API للرسائل التلقائية جاهز في الطبقة.',
    requires: ['WhatsApp Cloud API token (للإرسال التلقائي فقط)'],
  },
  {
    id: 'ai_assistant', kind: 'ai', name: 'AI Business Assistant', status: 'ready',
    description: 'مساعد يجيب عن أسئلة العمل من بيانات النظام. يعمل الآن بمحرك قواعد محلي، وجاهز للربط بنموذج لغوي.',
    requires: ['(اختياري) مفتاح API لنموذج لغوي — يُخزَّن في الخادم فقط'],
    docs: 'src/integrations/ai/assistant.ts',
  },
];

export const PROVIDER_KIND_LABEL: Record<string, string> = {
  sales_channel: 'قنوات البيع',
  carrier: 'شركات الشحن',
  ads: 'منصات الإعلانات',
  messaging: 'المراسلة',
  sheet: 'جداول البيانات',
  ai: 'الذكاء الاصطناعي',
};
