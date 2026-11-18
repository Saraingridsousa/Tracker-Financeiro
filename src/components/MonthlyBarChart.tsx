import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TooltipProps } from 'recharts';

export interface MonthlyChartPoint {
  month: string;
  income: number;
  expenses: number;
  invested: number;
}

interface MonthlyBarChartProps {
  data: MonthlyChartPoint[];
}

function MonthlyTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload as MonthlyChartPoint;
  const currency = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 shadow-lg">
      <div className="font-semibold text-slate-100">{label}</div>
      {payload.map((item) => (
        <div key={item.dataKey?.toString()} className="mt-1" style={{ color: item.color }}>
          {item.name}: {currency.format(Number(item.value))}
        </div>
      ))}
      <div className="mt-1 text-violet-400">Investido: {currency.format(point.invested)}</div>
    </div>
  );
}

export function MonthlyBarChart({ data }: MonthlyBarChartProps) {
  return (
    <div className="h-72 w-full overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={8}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <Tooltip content={<MonthlyTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }} />
          <Bar dataKey="income" name="Entradas" fill="#22c55e" radius={[6, 6, 0, 0]} />
          <Bar dataKey="expenses" name="Saídas" fill="#f87171" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
