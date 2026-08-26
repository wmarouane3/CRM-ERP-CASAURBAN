/**
 * SHOES OS — Settings.
 * General rules, users & permissions, integrations (with a live Shopify
 * webhook simulator), the audit log, and demo data control.
 */
import { useState } from 'react';
import clsx from 'clsx';
import {
  Save, Shield, Plug, ScrollText, Database, PlayCircle, RefreshCw, Trash2,
} from 'lucide-react';
import { useApp, backendMode } from '../app/store';
import { Avatar, Badge, Card, Field, PageHeader, Select, Table, Tabs } from '../ui/kit';
import { USER_ROLE } from '../core/enums';
import { ROLE_DESCRIPTION, visibleModules } from '../core/permissions';
import { fmtDateTime } from '../core/dates';
import { dataPort } from '../data';
import { PROVIDERS, PROVIDER_KIND_LABEL } from '../integrations/registry';
import { SAMPLE_SHOPIFY_PAYLOAD } from '../integrations/shopify/mapper';
import type { Settings as SettingsType } from '../core/types';

export default function Settings() {
  const { db, run, user, switchUser, allows, refresh } = useApp();
  const [tab, setTab] = useState('general');
  const [form, setForm] = useState<SettingsType | null>(null);

  if (!db) return null;
  const s = form ?? db.settings;

  return (
    <>
      <PageHeader title="الإعدادات" subtitle={`${db.organization.name} · ${backendMode === 'supabase' ? 'Supabase' : 'وضع تجريبي'}`} />

      <Card padded={false}>
        <div className="px-3 pt-2">
          <Tabs
            tabs={[
              { id: 'general', label: 'عام' },
              { id: 'users', label: 'المستخدمون والصلاحيات', count: db.users.length },
              { id: 'integrations', label: 'الربط', count: PROVIDERS.length },
              { id: 'audit', label: 'سجل التدقيق', count: db.auditLogs.length },
              { id: 'data', label: 'البيانات' },
            ]}
            active={tab} onChange={setTab}
          />
        </div>

        {/* ---------------------------------------------------- general */}
        {tab === 'general' && (
          <div className="p-4 max-w-3xl">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="تكلفة الشحن الافتراضية (MAD)">
                <input type="number" className="input num" value={s.default_shipping_cost}
                  onChange={(e) => setForm({ ...s, default_shipping_cost: Number(e.target.value) })} />
              </Field>
              <Field label="تكلفة الإرجاع الافتراضية (MAD)">
                <input type="number" className="input num" value={s.default_return_cost}
                  onChange={(e) => setForm({ ...s, default_return_cost: Number(e.target.value) })} />
              </Field>
              <Field label="تكلفة التغليف لكل طلب (MAD)">
                <input type="number" className="input num" value={s.default_packaging_cost}
                  onChange={(e) => setForm({ ...s, default_packaging_cost: Number(e.target.value) })} />
              </Field>
              <Field label="الحد الأدنى للتنبيه على المخزون">
                <input type="number" className="input num" value={s.low_stock_threshold}
                  onChange={(e) => setForm({ ...s, low_stock_threshold: Number(e.target.value) })} />
              </Field>
              <Field label="بادئة رقم الطلب">
                <input className="input num" value={s.order_number_prefix}
                  onChange={(e) => setForm({ ...s, order_number_prefix: e.target.value })} />
              </Field>
              <Field label="رقم الطلب التالي">
                <input type="number" className="input num" value={s.order_number_next}
                  onChange={(e) => setForm({ ...s, order_number_next: Number(e.target.value) })} />
              </Field>
            </div>

            <h4 className="text-[12px] font-semibold text-ink-500 uppercase tracking-wide mt-6 mb-3">قواعد التشغيل</h4>
            <div className="space-y-2">
              {([
                ['restock_on_refused', 'إعادة المنتج للمخزون عند رفض الطلب'],
                ['restock_on_returned', 'إعادة المنتج للمخزون عند الإرجاع'],
                ['auto_allocate_ad_cost', 'توزيع الإنفاق الإعلاني تلقائياً على طلبات اليوم'],
                ['allow_negative_stock', 'السماح بمخزون سالب (غير مستحسن)'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 p-3 rounded-lg border border-[#e4e7ec] cursor-pointer hover:bg-ground">
                  <input type="checkbox" checked={Boolean(s[key])}
                    onChange={(e) => setForm({ ...s, [key]: e.target.checked })}
                    className="h-4 w-4 accent-[#5B55D9]" />
                  <span className="text-[13px] text-ink-700">{label}</span>
                </label>
              ))}
            </div>

            {allows('settings.edit') && (
              <button className="btn-primary gap-1.5 mt-5"
                onClick={async () => { await run(() => dataPort().updateSettings(s), 'تم حفظ الإعدادات'); setForm(null); }}>
                <Save size={15} /> حفظ الإعدادات
              </button>
            )}
          </div>
        )}

        {/* ------------------------------------------------------ users */}
        {tab === 'users' && (
          <div className="p-4">
            <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-3 mb-4 text-[12.5px] text-brand-800">
              <b>جرّب الصلاحيات:</b> اضغط «تسجيل الدخول كـ» لأي مستخدم لترى كيف تتغير القائمة الجانبية والأزرار المتاحة.
              في الإنتاج تُطبَّق نفس القواعد داخل PostgreSQL عبر Row Level Security — لا يمكن تجاوزها من المتصفح.
            </div>
            <div className="grid lg:grid-cols-2 gap-3">
              {db.users.map((u) => (
                <div key={u.id} className={clsx('card p-3', u.id === user?.id && 'ring-2 ring-brand-400')}>
                  <div className="flex items-center gap-3">
                    <Avatar name={u.full_name} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold text-ink-900">{u.full_name}</div>
                      <div className="num text-[11.5px] text-ink-400">{u.email}</div>
                    </div>
                    <Badge tone={USER_ROLE[u.role].tone}>{USER_ROLE[u.role].label}</Badge>
                  </div>
                  <p className="text-[12px] text-ink-500 mt-2.5">{ROLE_DESCRIPTION[u.role]}</p>
                  <div className="flex flex-wrap gap-1 mt-2.5">
                    {visibleModules(u.role).slice(0, 8).map((m) => (
                      <span key={m} className="text-[10.5px] bg-ground text-ink-500 rounded px-1.5 py-0.5">{m}</span>
                    ))}
                  </div>
                  {u.id !== user?.id && (
                    <button className="btn-ghost h-8 mt-3 w-full" onClick={() => switchUser(u.id)}>
                      تسجيل الدخول كـ {u.full_name.split(' ')[0]}
                    </button>
                  )}
                  {u.id === user?.id && (
                    <div className="mt-3 text-center text-[12px] text-brand-700 font-medium">الجلسة الحالية</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ----------------------------------------------- integrations */}
        {tab === 'integrations' && <Integrations onRefresh={refresh} />}

        {/* ------------------------------------------------------ audit */}
        {tab === 'audit' && (
          <>
            <div className="px-4 py-3 text-[12.5px] text-ink-500 border-b border-[#eef0f4] flex items-center gap-2">
              <ScrollText size={14} /> كل عملية حساسة تُسجَّل: من قام بها، ماذا غيّر، ومتى. السجل غير قابل للتعديل أو الحذف.
            </div>
            <Table head={['العملية', 'الكيان', 'المرجع', 'التغيير', 'المستخدم', 'الوقت']}>
              {db.auditLogs.slice(0, 200).map((a) => (
                <tr key={a.id} className="tr">
                  <td className="td">
                    <Badge tone={a.action === 'delete' ? 'rose' : a.action === 'create' ? 'emerald' : 'blue'} dot={false}>
                      {a.action}
                    </Badge>
                  </td>
                  <td className="td">{a.entity}</td>
                  <td className="td num">{a.entity_label ?? '—'}</td>
                  <td className="td text-[11.5px] text-ink-400 max-w-[280px] truncate">
                    {a.before && a.after
                      ? `${JSON.stringify(a.before).slice(0, 60)} → ${JSON.stringify(a.after).slice(0, 60)}`
                      : '—'}
                  </td>
                  <td className="td">{a.actor_name}</td>
                  <td className="td text-[11.5px] text-ink-400">{fmtDateTime(a.created_at)}</td>
                </tr>
              ))}
            </Table>
          </>
        )}

        {/* ------------------------------------------------------- data */}
        {tab === 'data' && (
          <div className="p-4 max-w-2xl space-y-4">
            <div className="card p-4">
              <h4 className="text-[13.5px] font-semibold flex items-center gap-2"><Database size={15} /> مصدر البيانات</h4>
              <p className="text-[12.5px] text-ink-500 mt-1.5 leading-relaxed">
                {backendMode === 'supabase'
                  ? 'النظام متصل بقاعدة بيانات PostgreSQL عبر Supabase مع Row Level Security مفعّل.'
                  : 'النسخة الحالية تعمل بمحرك محلي داخل المتصفح لأغراض التجربة. عند ضبط VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY ينتقل النظام تلقائياً إلى PostgreSQL دون أي تغيير في الكود.'}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                {[
                  ['المنتجات', db.products.length], ['المقاسات', db.variants.length],
                  ['العملاء', db.customers.length], ['الطلبات', db.orders.length],
                  ['الحركات', db.movements.length], ['الحملات', db.campaigns.length],
                  ['المصاريف', db.expenses.length], ['سجلات التدقيق', db.auditLogs.length],
                ].map(([l, v]) => (
                  <div key={l as string} className="rounded-lg bg-ground p-2.5">
                    <div className="num text-[16px] font-semibold text-ink-800">{v as number}</div>
                    <div className="text-[11px] text-ink-400">{l as string}</div>
                  </div>
                ))}
              </div>
            </div>

            {allows('demo.reset') ? (
              <div className="card p-4 border-rose-200">
                <h4 className="text-[13.5px] font-semibold text-rose-700">إدارة البيانات التجريبية</h4>
                <p className="text-[12.5px] text-ink-500 mt-1.5">
                  متاح للمدير فقط. «إعادة توليد» ينشئ مجموعة بيانات واقعية جديدة؛ «حذف الكل» يفرغ النظام تماماً.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button className="btn-ghost gap-1.5"
                    onClick={() => run(async () => { await dataPort().seedDemoData(); }, 'تمت إعادة توليد البيانات التجريبية')}>
                    <RefreshCw size={14} /> إعادة توليد البيانات
                  </button>
                  <button className="btn-danger gap-1.5"
                    onClick={() => { if (confirm('سيتم حذف كل البيانات. متابعة؟')) run(async () => { await dataPort().resetDemoData(); }, 'تم تفريغ النظام'); }}>
                    <Trash2 size={14} /> حذف كل البيانات
                  </button>
                </div>
              </div>
            ) : (
              <div className="card p-4 text-[12.5px] text-ink-400">
                إدارة البيانات التجريبية متاحة لمدير النظام فقط.
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}

/* ------------------------------------------------------- integrations */

function Integrations({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const { db, toast } = useApp();
  const [payload, setPayload] = useState(JSON.stringify(SAMPLE_SHOPIFY_PAYLOAD, null, 2));
  const [busy, setBusy] = useState(false);

  if (!db) return null;

  const simulate = async () => {
    setBusy(true);
    try {
      const parsed = JSON.parse(payload);
      const res = await dataPort().ingestExternalOrder('shopify', parsed);
      await onRefresh();
      toast({
        tone: res.status === 'processed' ? 'success' : res.status === 'skipped' ? 'info' : 'error',
        title: res.status === 'processed' ? `تم إنشاء الطلب ${res.order?.order_number}`
          : res.status === 'skipped' ? 'طلب مكرر — تم تجاهله (حماية Idempotency)'
            : 'فشل استيراد الطلب',
        body: res.status === 'skipped' ? 'نفس معرّف Shopify مستورد مسبقاً.' : undefined,
      });
    } catch {
      toast({ tone: 'error', title: 'JSON غير صالح' });
    }
    setBusy(false);
  };

  const grouped = PROVIDERS.reduce<Record<string, typeof PROVIDERS>>((a, p) => {
    (a[p.kind] ??= []).push(p);
    return a;
  }, {});

  return (
    <div className="p-4 space-y-5">
      <div className="bg-ground border border-[#e4e7ec] rounded-xl p-4">
        <h4 className="text-[13.5px] font-semibold flex items-center gap-2"><Shield size={15} /> أين تُخزَّن المفاتيح؟</h4>
        <p className="text-[12.5px] text-ink-500 mt-1.5 leading-relaxed">
          لا يُخزَّن أي مفتاح أو Token داخل الواجهة. المتصفح يرى فقط الإعدادات غير السرية.
          مفاتيح Shopify و Meta و شركات الشحن تُحفظ في Supabase Vault وتُستعمل حصرياً داخل Edge Functions
          على الخادم، مع التحقق من توقيع HMAC لكل Webhook قبل لمس قاعدة البيانات.
        </p>
      </div>

      {Object.entries(grouped).map(([kind, list]) => (
        <div key={kind}>
          <h4 className="text-[12px] font-semibold text-ink-500 uppercase tracking-wide mb-2">
            {PROVIDER_KIND_LABEL[kind] ?? kind}
          </h4>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map((p) => {
              const conf = db.integrations.find((i) => i.provider === p.id);
              return (
                <div key={p.id} className="card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Plug size={15} className="text-ink-300" />
                      <span className="text-[13.5px] font-semibold">{p.name}</span>
                    </div>
                    {p.status === 'ready'
                      ? <Badge tone="emerald">جاهز</Badge>
                      : p.status === 'link_only'
                        ? <Badge tone="blue">رابط مباشر</Badge>
                        : <Badge tone="zinc">مُخطَّط</Badge>}
                  </div>
                  <p className="text-[12px] text-ink-500 mt-2 leading-relaxed">{p.description}</p>
                  <ul className="mt-2 space-y-0.5">
                    {p.requires.map((r) => (
                      <li key={r} className="text-[11px] text-ink-400 flex gap-1.5">
                        <span className="mt-1.5 h-1 w-1 rounded-full bg-ink-200 shrink-0" />{r}
                      </li>
                    ))}
                  </ul>
                  {conf?.is_enabled && (
                    <div className="mt-2.5 text-[11px] text-emerald-700">● مُفعَّل — {conf.last_status}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="card p-4">
        <h4 className="text-[13.5px] font-semibold flex items-center gap-2">
          <PlayCircle size={15} className="text-brand-500" /> محاكي Webhook — Shopify
        </h4>
        <p className="text-[12.5px] text-ink-500 mt-1.5 leading-relaxed">
          هذا ليس عرضاً توضيحياً: الطلب أدناه يمر بنفس دالة التحويل التي ستستعملها Edge Function في الإنتاج
          (<code className="num text-[11.5px] bg-ground px-1 rounded">parseShopifyOrder</code>) — مطابقة SKU بالمقاس،
          التعرف على المدينة، ربط الحملة عبر utm_campaign، وحماية من التكرار. اضغط مرتين لترى الحماية تعمل.
        </p>
        <textarea
          value={payload} onChange={(e) => setPayload(e.target.value)}
          rows={10}
          className="input num mt-3 h-auto py-2 text-[11.5px] leading-relaxed" dir="ltr"
        />
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button className="btn-primary gap-1.5" disabled={busy} onClick={simulate}>
            <PlayCircle size={15} /> {busy ? 'جارٍ الاستيراد…' : 'استقبال الطلب'}
          </button>
          <button className="btn-ghost" onClick={() => setPayload(JSON.stringify({
            ...SAMPLE_SHOPIFY_PAYLOAD, id: Math.floor(Math.random() * 9e9),
          }, null, 2))}>توليد معرّف جديد</button>
        </div>

        {db.integrationEvents.length > 0 && (
          <div className="mt-4">
            <h5 className="text-[12px] font-semibold text-ink-500 uppercase tracking-wide mb-2">سجل أحداث الربط</h5>
            <Table head={['المزوّد', 'الحدث', 'المعرّف الخارجي', 'الحالة', 'الوقت']}>
              {db.integrationEvents.slice(0, 20).map((e) => (
                <tr key={e.id} className="tr">
                  <td className="td">{e.provider}</td>
                  <td className="td num text-[11.5px]">{e.event_type}</td>
                  <td className="td num text-[11.5px]">{e.external_id ?? '—'}</td>
                  <td className="td">
                    <Badge tone={e.status === 'processed' ? 'emerald' : e.status === 'skipped' ? 'amber' : 'rose'}>
                      {e.status === 'processed' ? 'تم' : e.status === 'skipped' ? 'مكرر — تجاهل' : 'فشل'}
                    </Badge>
                  </td>
                  <td className="td text-[11.5px] text-ink-400">{fmtDateTime(e.created_at)}</td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </div>

      <div className="card p-4">
        <h4 className="text-[13.5px] font-semibold">Google Sheets</h4>
        <p className="text-[12.5px] text-ink-500 mt-1.5 leading-relaxed">
          التصدير إلى CSV متاح الآن من كل صفحة (الطلبات، المخزون، العملاء، التقارير) بترميز يدعم العربية في Excel.
          المزامنة ثنائية الاتجاه مع Google Sheets تمر عبر نفس طبقة الاستيراد — وتبقى PostgreSQL هي قاعدة البيانات
          الأساسية، وSheets مجرد قناة إدخال/إخراج.
        </p>
      </div>
    </div>
  );
}

export function roleSelect() {
  return <Select value="" onChange={() => { }} options={Object.entries(USER_ROLE).map(([v, m]) => ({ value: v, label: m.label }))} />;
}
