/**
 * SHOES OS — WhatsApp adapter.
 * Phase 1 : deep links (works today, zero configuration).
 * Phase 2 : swap `send` for the WhatsApp Cloud API — called from an Edge
 *           Function so the token never touches the browser.
 */
import type { Order } from '../../core/types';
import { normalizePhone } from '../../core/validation';
import { fmtMoney } from '../../core/money';

function toInternational(phone: string): string {
  const p = normalizePhone(phone);
  return p.startsWith('0') ? `212${p.slice(1)}` : p;
}

export function whatsappLink(phone: string, message: string): string {
  return `https://wa.me/${toInternational(phone)}?text=${encodeURIComponent(message)}`;
}

export type TemplateKey = 'confirmation' | 'shipped' | 'delivered' | 'followup' | 'refused';

export const TEMPLATES: Record<TemplateKey, { label: string; build: (o: Order) => string }> = {
  confirmation: {
    label: 'تأكيد الطلب',
    build: (o) =>
      `مرحباً ${o.customer_name} 👋\nطلبكم رقم ${o.order_number} توصل بيه.\nالمبلغ: ${fmtMoney(o.revenue)}\nالمدينة: ${o.city_name ?? ''}\nواش نأكدو الطلب؟`,
  },
  shipped: {
    label: 'تم الشحن',
    build: (o) =>
      `مرحباً ${o.customer_name}، طلبكم ${o.order_number} تشحن ✅\nرقم التتبع: ${o.tracking_number ?? '—'}\nغادي يوصلكم خلال 24-48 ساعة.`,
  },
  delivered: {
    label: 'بعد التسليم',
    build: (o) =>
      `شكراً ${o.customer_name} على ثقتكم 🙏\nطلبكم ${o.order_number} توصل بنجاح.\nإذا عجبكم المنتج، رأيكم يهمنا!`,
  },
  followup: {
    label: 'متابعة',
    build: (o) =>
      `مرحباً ${o.customer_name}، كنتبعو معاكم بخصوص الطلب ${o.order_number}. واش كاين شي حاجة نقدرو نعاونكم فيها؟`,
  },
  refused: {
    label: 'بعد الرفض',
    build: (o) =>
      `مرحباً ${o.customer_name}، لاحظنا أن الطلب ${o.order_number} ما تسلمش. واش كاين شي مشكل نقدرو نحلوه؟`,
  },
};

export function orderWhatsappLink(order: Order, template: TemplateKey = 'confirmation'): string {
  return whatsappLink(order.phone, TEMPLATES[template].build(order));
}
