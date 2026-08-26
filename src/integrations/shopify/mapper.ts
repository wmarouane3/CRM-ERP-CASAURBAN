/**
 * SHOES OS — Shopify → canonical order mapper.
 *
 *   Shopify order  →  Webhook (orders/create)  →  Edge Function
 *      → verify HMAC → parseShopifyOrder() → createOrder()
 *
 * The mapper is pure so it can run identically in the Edge Function and
 * in the browser demo, and so it can be unit-tested without a network.
 *
 * Duplicate protection is two-layered:
 *   1. idempotencyKey  = shopify order id (+ webhook id when present)
 *   2. orders.external_id unique index in PostgreSQL
 */
import type { DataSet } from '../../core/types';
import { normalizePhone } from '../../core/validation';
import type { ParsedExternalOrder } from '../types';

interface ShopifyLineItem {
  id?: number | string;
  sku?: string;
  title?: string;
  variant_title?: string;
  quantity?: number;
  price?: string | number;
  properties?: { name: string; value: string }[];
}

interface ShopifyAddress {
  name?: string; first_name?: string; last_name?: string;
  address1?: string; address2?: string; city?: string; phone?: string;
}

export interface ShopifyOrderPayload {
  id?: number | string;
  admin_graphql_api_id?: string;
  order_number?: number | string;
  name?: string;
  created_at?: string;
  currency?: string;
  total_discounts?: string | number;
  phone?: string;
  note?: string;
  customer?: { first_name?: string; last_name?: string; phone?: string; email?: string };
  shipping_address?: ShopifyAddress;
  billing_address?: ShopifyAddress;
  line_items?: ShopifyLineItem[];
  shipping_lines?: { price?: string | number }[];
  source_name?: string;
  landing_site?: string;
  referring_site?: string;
  note_attributes?: { name: string; value: string }[];
}

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
};

/** Extract the shoe size from SKU / variant title / line properties. */
function extractSize(li: ShopifyLineItem): string | undefined {
  const fromProps = li.properties?.find((p) => /size|مقاس|pointure/i.test(p.name))?.value;
  if (fromProps) return String(fromProps).trim();
  if (li.variant_title) {
    const m = li.variant_title.match(/\b(3[5-9]|4[0-9]|50)\b/);
    if (m) return m[1];
  }
  if (li.sku) {
    const m = li.sku.match(/-(3[5-9]|4[0-9]|50)$/);
    if (m) return m[1];
  }
  return undefined;
}

export function parseShopifyOrder(payload: unknown, db: DataSet): ParsedExternalOrder | null {
  const p = payload as ShopifyOrderPayload;
  if (!p || (!p.id && !p.order_number)) return null;

  const warnings: string[] = [];
  const externalId = String(p.id ?? p.order_number);
  const addr = p.shipping_address ?? p.billing_address ?? {};
  const fullName =
    addr.name ??
    [p.customer?.first_name, p.customer?.last_name].filter(Boolean).join(' ') ??
    [addr.first_name, addr.last_name].filter(Boolean).join(' ');

  const phone = normalizePhone(addr.phone ?? p.phone ?? p.customer?.phone ?? '');
  if (!phone) warnings.push('MISSING_PHONE');

  const cityRaw = (addr.city ?? '').trim();
  const city = db.cities.find(
    (c) => c.name_ar === cityRaw ||
      c.name_fr?.toLowerCase() === cityRaw.toLowerCase(),
  );
  if (cityRaw && !city) warnings.push(`UNKNOWN_CITY:${cityRaw}`);

  const lines: ParsedExternalOrder['input']['lines'] = [];
  for (const li of p.line_items ?? []) {
    let variant = li.sku ? db.variants.find((v) => v.sku === li.sku) : undefined;
    if (!variant) {
      const size = extractSize(li);
      const title = (li.title ?? '').toLowerCase();
      const product = db.products.find((pr) => title.includes(pr.name.toLowerCase()))
        ?? db.products.find((pr) => pr.name.toLowerCase().includes(title.split(' ')[0] ?? '~'));
      if (product && size) {
        variant = db.variants.find((v) => v.product_id === product.id && v.size === size);
      }
    }
    if (!variant) { warnings.push(`UNMATCHED_ITEM:${li.sku ?? li.title ?? '?'}`); continue; }
    lines.push({
      variant_id: variant.id,
      quantity: Math.max(1, Math.round(num(li.quantity, 1))),
      unit_price: num(li.price, variant.selling_price),
    });
  }
  if (!lines.length) return null;

  const shipping = (p.shipping_lines ?? []).reduce((a, s) => a + num(s.price), 0);
  const utmCampaign = p.note_attributes?.find((a) => /utm_campaign/i.test(a.name))?.value;
  const campaign = utmCampaign
    ? db.campaigns.find((c) => c.name.toLowerCase().includes(utmCampaign.toLowerCase()))
    : undefined;

  return {
    externalId,
    idempotencyKey: `shopify:${externalId}`,
    warnings,
    input: {
      customer: {
        full_name: fullName || 'عميل Shopify',
        phone: phone || '0600000000',
        city_id: city?.id,
        city_name: city?.name_ar ?? cityRaw,
        address: [addr.address1, addr.address2].filter(Boolean).join(' — '),
      },
      lines,
      discount: num(p.total_discounts),
      shipping_cost: shipping || city?.default_shipping_cost,
      channel: 'shopify',
      source: utmCampaign ?? p.source_name ?? 'shopify',
      ad_campaign_id: campaign?.id,
      external_id: externalId,
      notes: p.note ?? undefined,
      status: 'to_confirm',
    },
  };
}

/** Sample payload used by the built-in webhook simulator in Settings. */
export const SAMPLE_SHOPIFY_PAYLOAD = {
  id: 5123456789,
  order_number: 1042,
  currency: 'MAD',
  created_at: new Date().toISOString(),
  customer: { first_name: 'ياسين', last_name: 'العلوي', phone: '0661234567' },
  shipping_address: {
    name: 'ياسين العلوي', address1: 'حي النخيل، زنقة 12، رقم 45',
    city: 'الدار البيضاء', phone: '0661234567',
  },
  line_items: [{ sku: 'DNK-PND-42', title: 'Nike Dunk Low Panda', quantity: 1, price: '799.00' }],
  shipping_lines: [{ price: '30.00' }],
  note_attributes: [{ name: 'utm_campaign', value: 'Nike Dunk — Retargeting' }],
  source_name: 'web',
};
