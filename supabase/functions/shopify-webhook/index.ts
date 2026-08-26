/**
 * SHOES OS — Shopify webhook (Supabase Edge Function, Deno).
 *
 *   Shopify orders/create ──▶ this function
 *        1. verify HMAC signature (reject anything unsigned)
 *        2. record the event with an idempotency key  ← duplicate shield #1
 *        3. map the payload with the SAME mapper the UI uses
 *        4. call fn_create_order() inside PostgreSQL   ← duplicate shield #2
 *                                                        (unique index on
 *                                                         org_id, channel, external_id)
 *
 * Secrets (SHOPIFY_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY) live in the
 * function's environment. They are never sent to the browser.
 *
 * Deploy:
 *   supabase secrets set SHOPIFY_WEBHOOK_SECRET=xxxx
 *   supabase functions deploy shopify-webhook --no-verify-jwt
 *
 * Register in Shopify:
 *   Settings → Notifications → Webhooks → orders/create
 *   URL: https://<project>.functions.supabase.co/shopify-webhook
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parseShopifyOrder } from '../_shared/shopify-mapper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('SHOPIFY_WEBHOOK_SECRET')!;
const ORG_ID = Deno.env.get('SHOES_OS_ORG_ID')!;

async function verifyHmac(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const digest = btoa(String.fromCharCode(...new Uint8Array(mac)));
  // constant-time compare
  if (digest.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < digest.length; i++) diff |= digest.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const raw = await req.text();
  const signature = req.headers.get('x-shopify-hmac-sha256');
  const topic = req.headers.get('x-shopify-topic') ?? 'orders/create';
  const webhookId = req.headers.get('x-shopify-webhook-id');

  if (!(await verifyHmac(raw, signature))) {
    return new Response(JSON.stringify({ error: 'INVALID_SIGNATURE' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const payload = JSON.parse(raw);
  const idempotencyKey = `shopify:${payload.id ?? payload.order_number}:${webhookId ?? ''}`;

  // --- duplicate shield #1 : unique index on integration_events -------
  const { error: eventError } = await supabase.from('integration_events').insert({
    org_id: ORG_ID, provider: 'shopify', direction: 'inbound',
    event_type: topic, external_id: String(payload.id ?? ''),
    idempotency_key: idempotencyKey, status: 'received', payload,
  });
  if (eventError?.code === '23505') {
    return new Response(JSON.stringify({ status: 'skipped', reason: 'duplicate' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }

  // --- map with the shared, unit-tested mapper ------------------------
  const [{ data: cities }, { data: variants }, { data: products }, { data: campaigns }] =
    await Promise.all([
      supabase.from('cities').select('*').eq('org_id', ORG_ID),
      supabase.from('product_variants').select('*').eq('org_id', ORG_ID),
      supabase.from('products').select('*').eq('org_id', ORG_ID),
      supabase.from('ad_campaigns').select('*').eq('org_id', ORG_ID),
    ]);

  const parsed = parseShopifyOrder(payload, {
    cities: cities ?? [], variants: variants ?? [],
    products: products ?? [], campaigns: campaigns ?? [],
  });

  if (!parsed) {
    await supabase.from('integration_events')
      .update({ status: 'failed', error: 'UNMAPPABLE_PAYLOAD', processed_at: new Date().toISOString() })
      .eq('idempotency_key', idempotencyKey);
    return new Response(JSON.stringify({ status: 'failed' }), { status: 200 });
  }

  // --- create the order inside PostgreSQL ----------------------------
  const { data: order, error } = await supabase.rpc('fn_create_order', {
    p_org: ORG_ID, p_input: parsed.input,
  });

  await supabase.from('integration_events').update({
    status: error ? 'failed' : 'processed',
    error: error?.message ?? (parsed.warnings.length ? parsed.warnings.join(',') : null),
    processed_at: new Date().toISOString(),
  }).eq('idempotency_key', idempotencyKey);

  return new Response(JSON.stringify({
    status: error ? 'failed' : 'processed',
    order_number: order?.order_number,
    warnings: parsed.warnings,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
});
