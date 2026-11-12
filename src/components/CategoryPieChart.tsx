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
    <div className="h-60 w-full overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={52}
            outerRadius={78}
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
              border: '1px solid rgba(148, 163, 184, 0.35)',
              borderRadius: 10,
              boxShadow: '0 0.5rem 1rem rgba(15, 23, 42, 0.25)',
              color: '#f8fafc',
              fontWeight: 600,
            }}
            labelStyle={{ color: '#f8fafc' }}
            itemStyle={{ color: '#f8fafc' }}
            cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
