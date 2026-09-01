import {
  ArrowDownCircle,
  ArrowUpCircle,
  Download,
  FileText,
  Filter,
  Moon,
  Sun,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { CategoryPieChart } from './components/CategoryPieChart';
import { MonthlyBarChart } from './components/MonthlyBarChart';
import { TransactionTable } from './components/TransactionTable';
import { parseBankFile } from './lib/parseBankFile';
import { useTransactions } from './hooks/useTransactions';
import type { Category, Transaction, TransactionType } from './types/finance';

const toneStyles = {
  emerald: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  cyan: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  rose: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
} as const;

const periodOptions = [
  { value: 'month', label: 'Mês atual' },
  { value: 'quarter', label: 'Últimos 3 meses' },
  { value: 'semester', label: 'Semestre' },
  { value: 'year', label: 'Ano' },
  { value: 'all', label: 'Todos' },
] as const;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);

const getMonthLabel = (date: Date) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '');

const filterTransactionsByPeriod = (items: Transaction[], period: (typeof periodOptions)[number]['value']) => {
  if (period === 'all') return items;

  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startDate = new Date(currentMonth);

  if (period === 'month') {
    startDate.setMonth(currentMonth.getMonth());
  }

  if (period === 'quarter') {
    startDate.setMonth(currentMonth.getMonth() - 2);
  }

  if (period === 'semester') {
    startDate.setMonth(currentMonth.getMonth() - 5);
  }

  if (period === 'year') {
    startDate.setFullYear(currentMonth.getFullYear() - 1);
  }

  return items.filter((item) => new Date(item.date) >= startDate);
};

const buildMonthlyData = (items: Transaction[]) => {
  const grouped = new Map<string, { income: number; expense: number; month: string }>();

  items.forEach((item) => {
    const date = new Date(item.date);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const label = getMonthLabel(date);

    if (!grouped.has(key)) {
      grouped.set(key, { month: label, income: 0, expense: 0 });
    }

    const current = grouped.get(key)!;
    if (item.type === 'income') current.income += item.amount;
    else current.expense += item.amount;
  });

  return Array.from(grouped.values()).sort((a, b) => {
    const left = new Date(`${new Date().getFullYear()}-${a.month}`);
    const right = new Date(`${new Date().getFullYear()}-${b.month}`);
    return left.getTime() - right.getTime();
  });
};

const buildCategoryData = (items: Transaction[], categories: Category[]) => {
  const map = new Map<string, number>();

  items.forEach((item) => {
    if (item.type !== 'expense') return;
    const category = categories.find((entry) => entry.id === item.categoryId) ?? categories[0];
    map.set(category?.name ?? 'Outros', (map.get(category?.name ?? 'Outros') ?? 0) + item.amount);
  });

  return Array.from(map.entries())
    .map(([name, value]) => ({
      name,
      value,
      color: categories.find((entry) => entry.name === name)?.color ?? '#7dd3fc',
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
};

const createDemoTransactions = (): Transaction[] => {
  const today = new Date();
  const base: Omit<Transaction, 'createdAt'>[] = [
    { id: 'demo-1', date: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10), description: 'Salário', amount: 4200, type: 'income', categoryId: 'salario', source: 'manual', bankName: 'Demo' },
    { id: 'demo-2', date: new Date(today.getFullYear(), today.getMonth(), 3).toISOString().slice(0, 10), description: 'Mercado', amount: 420, type: 'expense', categoryId: 'alimentacao', source: 'manual', bankName: 'Demo' },
    { id: 'demo-3', date: new Date(today.getFullYear(), today.getMonth(), 6).toISOString().slice(0, 10), description: 'Aluguel', amount: 1850, type: 'expense', categoryId: 'moradia', source: 'manual', bankName: 'Demo' },
    { id: 'demo-4', date: new Date(today.getFullYear(), today.getMonth(), 8).toISOString().slice(0, 10), description: 'Uber', amount: 95, type: 'expense', categoryId: 'transporte', source: 'manual', bankName: 'Demo' },
    { id: 'demo-5', date: new Date(today.getFullYear(), today.getMonth(), 10).toISOString().slice(0, 10), description: 'Netflix', amount: 49.9, type: 'expense', categoryId: 'lazer', source: 'manual', bankName: 'Demo' },
    { id: 'demo-6', date: new Date(today.getFullYear(), today.getMonth(), 12).toISOString().slice(0, 10), description: 'Consulta médica', amount: 180, type: 'expense', categoryId: 'saude', source: 'manual', bankName: 'Demo' },
    { id: 'demo-7', date: new Date(today.getFullYear(), today.getMonth(), 15).toISOString().slice(0, 10), description: 'Freelance', amount: 1100, type: 'income', categoryId: 'salario', source: 'manual', bankName: 'Demo' },
    { id: 'demo-8', date: new Date(today.getFullYear(), today.getMonth() - 1, 2).toISOString().slice(0, 10), description: 'Supermercado', amount: 560, type: 'expense', categoryId: 'alimentacao', source: 'manual', bankName: 'Demo' },
    { id: 'demo-9', date: new Date(today.getFullYear(), today.getMonth() - 1, 7).toISOString().slice(0, 10), description: 'Investimento Tesouro', amount: 700, type: 'expense', categoryId: 'investimentos', source: 'manual', bankName: 'Demo' },
    { id: 'demo-10', date: new Date(today.getFullYear(), today.getMonth() - 2, 5).toISOString().slice(0, 10), description: 'Salário', amount: 4200, type: 'income', categoryId: 'salario', source: 'manual', bankName: 'Demo' },
    { id: 'demo-11', date: new Date(today.getFullYear(), today.getMonth() - 2, 12).toISOString().slice(0, 10), description: 'Cinema', amount: 85, type: 'expense', categoryId: 'lazer', source: 'manual', bankName: 'Demo' },
    { id: 'demo-12', date: new Date(today.getFullYear(), today.getMonth() - 3, 9).toISOString().slice(0, 10), description: 'Abastecimento', amount: 180, type: 'expense', categoryId: 'transporte', source: 'manual', bankName: 'Demo' },
  ];

  return base.map((item) => ({
    ...item,
    createdAt: new Date().toISOString(),
  }));
};

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<(typeof periodOptions)[number]['value']>('month');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const { transactions, categories, addTransactions, inferCategory, setTransactions, updateTransactionCategory } = useTransactions();

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('tracker-theme');
    const preferredTheme = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'dark';
    setTheme(preferredTheme);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem('tracker-theme', theme);
  }, [theme]);

  const filteredTransactions = useMemo(
    () => filterTransactionsByPeriod(transactions, selectedPeriod),
    [transactions, selectedPeriod],
  );

  const summary = useMemo(() => {
    const totalIncome = filteredTransactions
      .filter((transaction) => transaction.type === 'income')
      .reduce((sum, item) => sum + item.amount, 0);

    const totalExpense = filteredTransactions
      .filter((transaction) => transaction.type === 'expense')
      .reduce((sum, item) => sum + item.amount, 0);

    return {
      balance: totalIncome - totalExpense,
      income: totalIncome,
      expenses: totalExpense,
      averageExpense: totalExpense > 0 ? totalExpense / Math.max(1, filteredTransactions.filter((tx) => tx.type === 'expense').length) : 0,
    };
  }, [filteredTransactions]);

  const monthlyChartData = useMemo(() => buildMonthlyData(filteredTransactions), [filteredTransactions]);
  const categoryChartData = useMemo(() => buildCategoryData(filteredTransactions, categories), [filteredTransactions, categories]);

  const topCategoryList = useMemo(
    () =>
      [...categories]
        .map((category) => ({
          ...category,
          total: filteredTransactions
            .filter((tx) => tx.categoryId === category.id && tx.type === 'expense')
            .reduce((sum, tx) => sum + tx.amount, 0),
        }))
        .filter((item) => item.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5),
    [categories, filteredTransactions],
  );

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;

    setIsImporting(true);

    try {
      const parsed: Transaction[] = [];

      for (const file of Array.from(files)) {
        const list = await parseBankFile(file);

        const normalized = list.map((item) => {
          const categoryId = inferCategory(item.description);
          return {
            ...item,
            categoryId,
            categoryName: categories.find((category) => category.id === categoryId)?.name ?? 'Sem categoria',
          };
        });

        parsed.push(...normalized);
      }

      addTransactions(parsed);
    } finally {
      setIsImporting(false);
    }
  };

  const loadDemoData = () => {
    setTransactions(createDemoTransactions());
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-soft backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-cyan-600 dark:text-cyan-400">Tracker Financeiro</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">Painel pessoal</h1>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <Filter className="h-4 w-4" />
                <select
                  value={selectedPeriod}
                  onChange={(event) => setSelectedPeriod(event.target.value as (typeof periodOptions)[number]['value'])}
                  className="appearance-none bg-transparent pr-7 font-medium outline-none"
                >
                  {periodOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                aria-label="Alternar tema"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400"
              >
                <Download className="h-4 w-4" />
                Importar extrato
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.ofx"
                multiple
                hidden
                onChange={(event) => handleFiles(event.target.files)}
              />
            </div>
          </div>
        </header>

        <section
          className={`mb-8 rounded-2xl border-2 border-dashed p-6 transition ${
            isDragging ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-200 bg-white/80 dark:border-slate-700 dark:bg-slate-900/70'
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            handleFiles(event.dataTransfer.files);
          }}
        >
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-full bg-cyan-500/10 p-3 text-cyan-600 dark:bg-slate-800 dark:text-cyan-400">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Arraste seus extratos aqui</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Arquivos .CSV e .OFX ficam 100% no navegador.</p>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                {isImporting ? 'Importando...' : 'Selecionar arquivos'}
              </button>
              <button
                type="button"
                onClick={loadDemoData}
                className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Carregar dados de exemplo
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Saldo atual', value: summary.balance, icon: Wallet, tone: 'emerald' },
            { label: 'Entradas', value: summary.income, icon: ArrowUpCircle, tone: 'cyan' },
            { label: 'Saídas', value: summary.expenses, icon: ArrowDownCircle, tone: 'rose' },
            { label: 'Gasto médio', value: summary.averageExpense, icon: TrendingUp, tone: 'amber' },
          ].map(({ label, value, icon: Icon, tone }) => (
            <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
                  <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{formatCurrency(value)}</h3>
                </div>
                <div className={`rounded-xl p-3 ${toneStyles[tone as keyof typeof toneStyles]}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.7fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Resumo do período</h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {filteredTransactions.length} transações
              </span>
            </div>

            <MonthlyBarChart data={monthlyChartData} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Top categorias</h3>
            {categoryChartData.length ? (
              <>
                <CategoryPieChart data={categoryChartData} />
                <div className="mt-2 space-y-3">
                  {topCategoryList.map((category) => (
                    <div key={category.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-950/70">
                      <div className="flex items-center gap-3">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: category.color }} />
                        <span className="text-sm text-slate-700 dark:text-slate-200">{category.name}</span>
                      </div>
                      <span className="text-sm text-slate-500 dark:text-slate-400">{formatCurrency(category.total)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-64 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                Nenhuma categoria para exibir.
              </div>
            )}
          </div>
        </section>

        <div className="mt-8">
          <TransactionTable
            transactions={filteredTransactions}
            categories={categories}
            onUpdateCategory={(transactionId, categoryId) => updateTransactionCategory(transactionId, categoryId)}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
