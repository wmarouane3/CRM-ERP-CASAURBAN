/**
 * SHOES OS — Chart primitives.
 * One place decides grid, axes, tooltip and colour so every chart in the
 * product reads as part of the same system.
 */
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line,
  ComposedChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { CHART_COLORS } from '../core/enums';
import { fmtCompact, fmtMoney } from '../core/money';

const GRID = '#eef0f4';
const AXIS = { stroke: GRID, tickLine: false, axisLine: false } as const;

function tip(currency = false) {
  return {
    contentStyle: { direction: 'rtl' as const, fontFamily: 'IBM Plex Sans Arabic' },
    formatter: ((v: number, name: string) => [currency ? fmtMoney(v) : fmtCompact(v), name]) as never,
  };
}

export function AreaTrend({ data, x, series, height = 240, currency = true }: {
  data: readonly object[]; x: string;
  series: { key: string; name: string; color?: string }[];
  height?: number; currency?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color ?? CHART_COLORS[i]} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.color ?? CHART_COLORS[i]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={x} {...AXIS} minTickGap={24} reversed />
        <YAxis {...AXIS} width={44} orientation="right" tickFormatter={(v) => fmtCompact(v as number)} />
        <Tooltip {...tip(currency)} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, direction: 'rtl' }} />}
        {series.map((s, i) => (
          <Area
            key={s.key} type="monotone" dataKey={s.key} name={s.name}
            stroke={s.color ?? CHART_COLORS[i]} strokeWidth={2}
            fill={`url(#g-${s.key})`} dot={false} activeDot={{ r: 4 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function Bars({ data, x, series, height = 240, currency = false, stacked, layout = 'horizontal' }: {
  data: readonly object[]; x: string;
  series: { key: string; name: string; color?: string }[];
  height?: number; currency?: boolean; stacked?: boolean;
  layout?: 'horizontal' | 'vertical';
}) {
  const vertical = layout === 'vertical';
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={vertical} horizontal={!vertical} />
        {vertical ? (
          <>
            <XAxis type="number" {...AXIS} tickFormatter={(v) => fmtCompact(v as number)} />
            <YAxis type="category" dataKey={x} {...AXIS} width={110} orientation="right" />
          </>
        ) : (
          <>
            <XAxis dataKey={x} {...AXIS} minTickGap={16} reversed />
            <YAxis {...AXIS} width={44} orientation="right" tickFormatter={(v) => fmtCompact(v as number)} />
          </>
        )}
        <Tooltip {...tip(currency)} cursor={{ fill: 'rgba(91,85,217,.05)' }} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, direction: 'rtl' }} />}
        {series.map((s, i) => (
          <Bar
            key={s.key} dataKey={s.key} name={s.name}
            stackId={stacked ? 'a' : undefined}
            fill={s.color ?? CHART_COLORS[i]} radius={vertical ? [0, 5, 5, 0] : [5, 5, 0, 0]}
            maxBarSize={vertical ? 20 : 42}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, height = 240, currency = true }: {
  data: { name: string; value: number; color?: string }[];
  height?: number; currency?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data} dataKey="value" nameKey="name"
          innerRadius="58%" outerRadius="86%" paddingAngle={2} stroke="none"
        >
          {data.map((d, i) => <Cell key={d.name} fill={d.color ?? CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Pie>
        <Tooltip {...tip(currency)} />
        <Legend wrapperStyle={{ fontSize: 12, direction: 'rtl' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function SpendVsRevenue({ data, height = 260 }: {
  data: readonly object[]; height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="g-rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...AXIS} minTickGap={24} reversed />
        <YAxis {...AXIS} width={44} orientation="right" tickFormatter={(v) => fmtCompact(v as number)} />
        <Tooltip {...tip(true)} />
        <Legend wrapperStyle={{ fontSize: 12, direction: 'rtl' }} />
        <Area type="monotone" dataKey="revenue" name="المداخيل" stroke="#10b981" strokeWidth={2} fill="url(#g-rev)" dot={false} />
        <Bar dataKey="adSpend" name="الإنفاق الإعلاني" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={26} />
        <Line type="monotone" dataKey="profit" name="الربح الصافي" stroke="#4f46e5" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function Sparkline({ data, color = '#5B55D9', height = 40 }: {
  data: { v: number }[]; color?: string; height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`sp-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.6}
          fill={`url(#sp-${color.slice(1)})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
