/**
 * SHOES OS — AI Business Assistant panel.
 * Answers business questions from the live dataset through the tool layer
 * in src/integrations/ai/assistant.ts.
 */
import { useState } from 'react';
import { Sparkles, CornerDownLeft } from 'lucide-react';
import { useApp } from '../app/store';
import { Drawer } from '../ui/kit';
import { filterOrders } from '../core/analytics';
import { askAssistant, BUSINESS_TOOLS, type AssistantAnswer } from '../integrations/ai/assistant';

export function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, range } = useApp();
  const [q, setQ] = useState('');
  const [thread, setThread] = useState<{ q: string; a: AssistantAnswer }[]>([]);

  if (!db) return null;
  const orders = filterOrders(db, { range });

  const ask = (question: string) => {
    if (!question.trim()) return;
    const a = askAssistant(question, { db, orders, range });
    setThread([{ q: question, a }, ...thread]);
    setQ('');
  };

  return (
    <Drawer
      open={open} onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Sparkles size={16} className="text-brand-500" />
          المساعد التحليلي
          <span className="text-[11px] font-normal text-ink-300">— يقرأ بيانات {range.label}</span>
        </span>
      }
      footer={
        <div className="flex gap-2">
          <input
            className="input" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') ask(q); }}
            placeholder="اسأل عن الأرباح، المنتجات، المدن، الحملات…"
          />
          <button className="btn-primary" onClick={() => ask(q)}><CornerDownLeft size={15} /></button>
        </div>
      }
    >
      {thread.length === 0 && (
        <div>
          <p className="text-[13px] text-ink-500 mb-3">
            اسألني عن أي شيء في بياناتك. هذه بعض الأسئلة الجاهزة:
          </p>
          <div className="grid gap-1.5">
            {BUSINESS_TOOLS.map((t) => (
              <button
                key={t.id} onClick={() => ask(t.question)}
                className="text-right px-3 py-2 rounded-lg border border-[#e4e7ec] text-[13px] text-ink-700 hover:border-brand-400 hover:bg-brand-50 transition-colors"
              >{t.question}</button>
            ))}
          </div>
          <p className="text-[11.5px] text-ink-300 mt-5 leading-relaxed">
            يعمل المساعد حالياً بمحرك تحليلي محلي فوق نفس دوال التحليل التي تغذّي لوحة القيادة —
            لا يخترع أرقاماً. البنية جاهزة لربط نموذج لغوي لاحقاً عبر Edge Function
            دون تغيير الواجهة.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {thread.map((t, i) => (
          <div key={i} className="rise">
            <div className="text-[13px] font-medium text-ink-900 bg-ground rounded-lg px-3 py-2 mb-2">{t.q}</div>
            <div className="border-r-2 border-brand-400 pr-3">
              <p className="text-[12px] font-semibold text-brand-700 mb-1">{t.a.title}</p>
              <p className="text-[13px] text-ink-700 leading-relaxed">{t.a.answer}</p>
              {t.a.bullets && t.a.bullets.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {t.a.bullets.filter(Boolean).map((b, j) => (
                    <li key={j} className="text-[12.5px] text-ink-500 flex gap-2">
                      <span className="text-ink-200 mt-1.5 h-1 w-1 rounded-full bg-ink-200 shrink-0" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
    </Drawer>
  );
}
