import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export interface CategoryChartPoint {
  name: string;
  value: number;
  color: string;
}

interface CategoryPieChartProps {
  data: CategoryChartPoint[];
}

export function CategoryPieChart({ data }: CategoryPieChartProps) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={3}
            stroke="transparent"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
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
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
