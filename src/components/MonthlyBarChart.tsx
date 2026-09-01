import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface MonthlyChartPoint {
  month: string;
  income: number;
  expense: number;
}

interface MonthlyBarChartProps {
  data: MonthlyChartPoint[];
}

export function MonthlyBarChart({ data }: MonthlyBarChartProps) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={8}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <Tooltip
            formatter={(value: number) =>
              new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              }).format(Number(value))
            }
            contentStyle={{
              background: '#0f172a',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              borderRadius: 12,
              color: '#e2e8f0',
            }}
          />
          <Bar dataKey="income" name="Entradas" fill="#22c55e" radius={[6, 6, 0, 0]} />
          <Bar dataKey="expense" name="Saídas" fill="#f87171" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
