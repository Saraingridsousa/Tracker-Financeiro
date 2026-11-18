import { MainTabs } from './components/MainTabs';
import type { MainTab } from './components/MainTabs';
import { ConnectedInvestments, ConnectedInvestmentValue } from './components/ConnectedInvestments';
import { summarizeConnectedInvestments } from './domain/connectedInvestments';
import { SharedFinancePanel } from './components/SharedFinancePanel';
import { useSharedFinance } from './hooks/useSharedFinance';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Filter,
  Moon,
  Sun,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { BankingPanel } from './components/BankingPanel';
import { CardsPanel } from './components/CardsPanel';
import { useBanking } from './hooks/useBanking';
import { classifyTransaction, isInvestmentApplication, isRealExpense, isRealIncome, participatesInResult, projectInstallmentTransactions, summarizeTransactions } from './domain/finance';
import { CategoryManagerModal } from './components/CategoryManagerModal';
import { CategoryPieChart } from './components/CategoryPieChart';
import { MonthlyBarChart } from './components/MonthlyBarChart';
import { TransactionTable } from './components/TransactionTable';
import { useTransactions } from './hooks/useTransactions';
import type { Category, Transaction } from './types/finance';
import { filterTransactionsByPeriod } from './domain/period';

const toneStyles = {
  emerald: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  cyan: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  rose: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  violet: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
} as const;

const periodOptions = [
  { value: 'month', label: 'Mês atual' },
  { value: 'last2months', label: 'Últimos 2 meses' },
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


const formatBrazilianDate = (value: string) => {
  if (!value) return '';

  const isoValue = value.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoValue)) {
    const [year, month, day] = isoValue.split('-');
    return `${day}/${month}/${year}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const getMonthLabel = (date: Date) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '');


const buildMonthlyData = (items: Transaction[], categories: Category[] = []) => {
  const grouped = new Map<string, { income: number; expenses: number; invested: number; month: string; sortKey: string }>();

  items.forEach((item) => {
    let year = '';
    let monthNum = '';

    if (item.date.includes('-')) {
      const parts = item.date.split('-');
      year = parts[0];
      monthNum = parts[1];
    } else if (item.date.includes('/')) {
      const parts = item.date.split('/');
      year = parts[2];
      monthNum = parts[1];
    }

    if (!year || !monthNum) return;

    const sortKey = `${year}-${monthNum.padStart(2, '0')}`;
    const monthLabels: Record<string, string> = {
      '01': 'jan',
      '02': 'fev',
      '03': 'mar',
      '04': 'abr',
      '05': 'mai',
      '06': 'jun',
      '07': 'jul',
      '08': 'ago',
      '09': 'set',
      '10': 'out',
      '11': 'nov',
      '12': 'dez',
    };
    const label = monthLabels[monthNum.padStart(2, '0')] || monthNum;

    if (!grouped.has(sortKey)) {
      grouped.set(sortKey, { month: label, sortKey, income: 0, expenses: 0, invested: 0 });
    }

    const current = grouped.get(sortKey)!;
    const absAmount = Math.abs(item.amount);

    const classified = classifyTransaction(item, categories);
    if (item.type === 'income' && participatesInResult(item, categories)) {
      current.income += absAmount;
    } else if (isInvestmentApplication(item, categories)) {
      current.invested += absAmount;
    } else if (
      (item.type === 'expense' || item.amount < 0) &&
      !item.isNeutral &&
      !item.isInternalTransfer &&
      !item.isSelfTransfer &&
      !item.isInvestment &&
      !item.isCreditCardPayment &&
      item.category !== 'Pagamento de Fatura' &&
      item.categoryId !== 'pagamento_fatura'
    ) {
      current.expenses += absAmount;
    }
  });

  return Array.from(grouped.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
};

const getTransactionMonthKey = (dateStr: string) => {
  if (!dateStr) return '';

  if (dateStr.includes('/')) {
    const [, month, year] = dateStr.split('/');
    return `${year}-${month.padStart(2, '0')}`;
  }

  if (dateStr.includes('-')) {
    const [year, month] = dateStr.split('-');
    return `${year}-${month.padStart(2, '0')}`;
  }

  return '';
};

const monthNames: Record<string, string> = {
  '01': 'jan',
  '02': 'fev',
  '03': 'mar',
  '04': 'abr',
  '05': 'mai',
  '06': 'jun',
  '07': 'jul',
  '08': 'ago',
  '09': 'set',
  '10': 'out',
  '11': 'nov',
  '12': 'dez',
};

const formatMonthPeriodLabel = (yearMonth: string) => {
  const [year, month] = yearMonth.split('-');
  if (!year || !month) return yearMonth;
  return `${monthNames[month] || month}/${year.slice(2)}`;
};

const getRealExpenseTransactions = (items: Transaction[], categories: Category[] = []) => items.filter((tx) => isRealExpense(tx, categories));

const buildCategoryData = (items: Transaction[], categories: Category[]) => {
  const map = new Map<string, number>();
  const validItems = getRealExpenseTransactions(items, categories).filter((item) => {
    const hasCategoryName = Boolean(item.category && item.category.trim() !== '' && item.category.toLowerCase() !== 'sem categoria');
    const hasCategoryId = item.categoryId !== 'sem_categoria' && item.categoryId !== 'uncategorized';
    return hasCategoryName && hasCategoryId && Boolean(item.categoryId);
  });

  const totalForChart = validItems.reduce((sum, item) => sum + Math.abs(item.amount), 0);

  validItems.forEach((item) => {
    const category = categories.find((entry) => entry.id === item.categoryId) ?? categories[0];
    const categoryName = category?.name ?? 'Outros';
    map.set(categoryName, (map.get(categoryName) ?? 0) + Math.abs(item.amount));
  });

  const entries = Array.from(map.entries())
    .map(([name, value]) => ({
      name,
      value,
      color: categories.find((entry) => entry.name === name)?.color ?? '#7dd3fc',
      percentage: totalForChart > 0 ? (value / totalForChart) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return entries;
};

const buildIncomeCategoryData = (items: Transaction[], categories: Category[], period?: string) => {
  const isAllPeriods = !period || period === 'ALL' || period === 'all' || period.toLowerCase().includes('geral');

  const filtered = items.filter((item) => {
    if (!isRealIncome(item, categories)) return false;

    if (!isAllPeriods) {
      let itemPeriod = '';
      if (item.date.includes('-')) {
        const [year, month] = item.date.split('-');
        itemPeriod = `${year}-${month.padStart(2, '0')}`;
      } else if (item.date.includes('/')) {
        const [, month, year] = item.date.split('/');
        itemPeriod = `${year}-${month.padStart(2, '0')}`;
      }
      if (itemPeriod !== period) return false;
    }

    if (item.isInternalTransfer || item.isSelfTransfer || item.category === 'Pagamento de Fatura') return false;

    const foundCategory = categories.find((category) => category.id === item.categoryId);
    const categoryName = item.category || foundCategory?.name || '';
    if (!categoryName || categoryName.toLowerCase() === 'sem categoria' || item.categoryId === 'sem_categoria') return false;

    return true;
  });

  const grouped = new Map<string, number>();
  filtered.forEach((item) => {
    const foundCategory = categories.find((category) => category.id === item.categoryId);
    const categoryName = (item.category || foundCategory?.name || 'Outras Receitas').trim();
    const current = grouped.get(categoryName) || 0;
    grouped.set(categoryName, current + Math.abs(item.amount));
  });

  const total = Array.from(grouped.values()).reduce((sum, value) => sum + value, 0);
  const palette = ['#10b981', '#34d399', '#22c55e', '#0ea5e9', '#2dd4bf', '#14b8a6'];

  return Array.from(grouped.entries())
    .map(([name, value], index) => ({
      name,
      value,
      color: categories.find((category) => category.name === name)?.color ?? palette[index % palette.length],
      percentage: total > 0 ? (value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
};

function App({ now = () => new Date() }: { now?: () => Date } = {}) {
  const [selectedPeriod, setSelectedPeriod] = useState<(typeof periodOptions)[number]['value']>('all');
  const [categoryChartPeriod, setCategoryChartPeriod] = useState<string>('ALL');
  const [incomeChartPeriod, setIncomeChartPeriod] = useState<string>('ALL');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
    if (typeof window !== 'undefined') {
      const savedTheme = window.localStorage.getItem('tracker-theme');
      if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    }
    } catch { /* Use the in-memory theme when storage is blocked. */ }

    return 'light';
  });
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [activeTab, setActiveTab] = useState<MainTab>('overview');
  const banking = useBanking();
  const connectedSummary = summarizeConnectedInvestments(banking, now());
  const shared = useSharedFinance(banking.snapshot.sharedStateAvailable === true || banking.snapshot.accessMode === 'private' || (typeof window !== 'undefined' && window.location?.protocol === 'https:'));
  const transactionsStore = useTransactions(shared.backing, banking.loaded !== false);
  const { categories, rules, inferCategory, addCategory, updateCategory, deleteCategory, addRule, deleteRule } = transactionsStore;

  const transactions = useMemo<Transaction[]>(() => {
    const rows: Transaction[] = banking.snapshot.transactions.map((tx) => {
      const categoryId = tx.manualCategory && tx.categoryId ? tx.categoryId : inferCategory(tx.description, tx.type);
      const category = categories.find((entry) => entry.id === categoryId);
      return { ...tx, categoryId, categoryName: category?.name ?? 'Sem categoria', category: category?.name };
    });
    return rows.map((tx) => classifyTransaction(tx, categories));
  }, [banking.snapshot.transactions, categories, rules]);

  const updateTransactionCategory = (id: string, categoryId: string) => {
    void banking.updateTransaction(id, { categoryId });
  };
  const updateTransaction = (id: string, updates: Partial<Transaction>) => {
    void banking.updateTransaction(id, { description: updates.description, notes:updates.notes, isSelfTransfer:updates.isSelfTransfer });
  };
  const deleteTransaction = (id: string) => {
    void banking.hideTransaction(id);
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    try { window.localStorage.setItem('tracker-theme', theme); } catch { /* Theme remains in memory. */ }
  }, [theme]);

  const periodReference = now();
  const periodMonth = new Date(periodReference.getFullYear(), periodReference.getMonth(), 1).getTime();
  const projectedTransactions = useMemo(() => projectInstallmentTransactions(transactions), [transactions]);
  const filteredTransactions = useMemo(() => filterTransactionsByPeriod(projectedTransactions, selectedPeriod, { source: 'banking', now: () => new Date(periodMonth) }), [projectedTransactions, selectedPeriod, periodMonth]);
  const summary = useMemo(() => summarizeTransactions(filteredTransactions, categories), [categories, filteredTransactions]);

  const monthlyChartData = useMemo(() => buildMonthlyData(filteredTransactions, categories), [filteredTransactions, categories]);

  const categoryMonthOptions = useMemo(() => {
    const months = new Map<string, string>();

    projectedTransactions.forEach((transaction) => {
      const key = getTransactionMonthKey(transaction.date);
      if (!key) return;
      months.set(key, key);
    });

    return Array.from(months.keys()).sort((left, right) => right.localeCompare(left));
  }, [projectedTransactions]);

  const filteredCategoryExpenses = useMemo(() => {
    const base = getRealExpenseTransactions(filteredTransactions, categories);
    if (categoryChartPeriod === 'ALL') return base;

    return base.filter((transaction) => getTransactionMonthKey(transaction.date) === categoryChartPeriod);
  }, [categoryChartPeriod, filteredTransactions, categories]);

  const categoryChartData = useMemo(() => buildCategoryData(filteredCategoryExpenses, categories), [filteredCategoryExpenses, categories]);

  const topCategoryList = useMemo(
    () =>
      [...categories]
        .map((category) => ({
          ...category,
          total: filteredCategoryExpenses
            .filter((tx) => {
              const validCategory =
                Boolean(tx.category && tx.category.trim() !== '' && tx.category.toLowerCase() !== 'sem categoria') &&
                tx.categoryId !== 'sem_categoria' &&
                tx.categoryId !== 'uncategorized' &&
                Boolean(tx.categoryId);

              return validCategory && tx.categoryId === category.id;
            })
            .reduce((sum, tx) => sum + Math.abs(tx.amount), 0),
        }))
        .filter((item) => item.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5),
    [categories, filteredCategoryExpenses],
  );

  const incomeSourceChartData = useMemo(
    () => buildIncomeCategoryData(filteredTransactions, categories, incomeChartPeriod),
    [filteredTransactions, categories, incomeChartPeriod],
  );

  const topIncomeSourceList = useMemo(() => [...incomeSourceChartData].slice(0, 5), [incomeSourceChartData]);

  const sharedPanel = <SharedFinancePanel shared={shared} initialCategories={categories} />;
  if (shared.enabled && !shared.status.payload) return sharedPanel;
  return (<>
    {sharedPanel}
    {banking.loaded === false && banking.error && <div role="alert" className="m-4 rounded-xl bg-amber-50 p-4 text-amber-900"><p>{banking.error}</p><button type="button" className="mt-2 rounded-lg border px-3 py-2" onClick={() => void banking.refresh()}>Tentar ler o PC novamente</button></div>}
    <fieldset disabled={banking.loaded === false || (!shared.enabled && !transactionsStore.localReady) || (shared.enabled && (shared.status.busy || Boolean(shared.status.error)))} className="min-w-0">
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
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
                onClick={() => setShowCategoryManager(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Categorias
              </button>

            </div>
          </div>
        </header>
        <MainTabs active={activeTab} onChange={setActiveTab} />
        <div id={'panel-' + activeTab} role="tabpanel" aria-labelledby={'tab-' + activeTab} tabIndex={0} className="space-y-6 min-w-0">
        {activeTab === 'overview' ? (
          <>
            <section aria-label="Resumo das conexões" className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300"><span>{banking.loaded ? banking.snapshot.connections.length + ' conexões' : 'Lendo conexões…'} · {connectedSummary.partial ? 'Cobertura parcial' : 'Cache local'}{connectedSummary.lastReadAt ? ' · Última leitura: ' + new Date(connectedSummary.lastReadAt).toLocaleString('pt-BR') : ''}{banking.error ? ' · ' + banking.error : ''}</span><button type="button" className="font-medium text-cyan-700 underline dark:text-cyan-300" onClick={() => setActiveTab('connections')}>Gerenciar conexões</button></section>
            {transactions.length === 0 && <section role="status" className="rounded-xl bg-cyan-50 p-5 text-sm text-cyan-900 dark:bg-cyan-950 dark:text-cyan-100">{banking.loaded ? 'Nenhuma movimentação bancária armazenada. Consulte os dados dos seus bancos na aba Conexões.' : 'Carregando movimentações dos bancos…'}</section>}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Resultado do período', value: summary.balance, icon: Wallet, tone: 'emerald' },
            { label: 'Entradas liquidadas', value: summary.income, icon: ArrowUpCircle, tone: 'cyan' },
            { label: 'Saídas liquidadas', value: summary.expenses, icon: ArrowDownCircle, tone: 'rose' },
            { label: 'Valor atual dos investimentos', value: summary.totalInvested, icon: TrendingUp, tone: 'violet' },
          ].map(({ label, value, icon: Icon, tone }) => (
            <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
                  <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{label === 'Valor atual dos investimentos' ? <ConnectedInvestmentValue summary={connectedSummary} /> : formatCurrency(value)}</h3>
                </div>
                <div className={`rounded-xl p-3 ${toneStyles[tone as keyof typeof toneStyles]}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="flex flex-col gap-6">
          <div className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Resumo do período</h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {filteredTransactions.length} transações
              </span>
            </div>

            <MonthlyBarChart data={monthlyChartData} />
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Maiores gastos</h3>
              <select
                value={categoryChartPeriod}
                onChange={(event) => setCategoryChartPeriod(event.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-cyan-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="ALL">Geral (Todos os meses)</option>
                {categoryMonthOptions.map((monthKey) => (
                  <option key={monthKey} value={monthKey}>
                    {formatMonthPeriodLabel(monthKey)}
                  </option>
                ))}
              </select>
              </div>

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
              <div className="flex h-64 items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">
                Nenhum gasto registrado neste período.
              </div>
            )}
            </div>

            <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Fontes de receita</h3>
              <select
                value={incomeChartPeriod}
                onChange={(event) => setIncomeChartPeriod(event.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="ALL">Geral (Todos os meses)</option>
                {categoryMonthOptions.map((monthKey) => (
                  <option key={monthKey} value={monthKey}>
                    {formatMonthPeriodLabel(monthKey)}
                  </option>
                ))}
              </select>
              </div>

            {incomeSourceChartData.length ? (
              <>
                <CategoryPieChart data={incomeSourceChartData} />
                <div className="mt-2 space-y-3">
                  {topIncomeSourceList.map((source) => (
                    <div key={source.name} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-950/70">
                      <div className="flex items-center gap-3">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: source.color }} />
                        <span className="text-sm text-slate-700 dark:text-slate-200">{source.name}</span>
                      </div>
                      <span className="text-sm text-slate-500 dark:text-slate-400">{formatCurrency(source.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-64 items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">
                Nenhuma receita registrada neste período.
              </div>
            )}
            </div>
          </div>
        </section>

            <div className="mt-0">
              {transactions.length > 0 ? (
                <>
                  <TransactionTable
                    transactions={filteredTransactions}
                    categories={categories}
                    onUpdateCategory={(transactionId, categoryId) => updateTransactionCategory(transactionId, categoryId)}
                    onUpdateTransaction={(transactionId, updates) => updateTransaction(transactionId, updates)}
                    onDeleteTransaction={(transactionId) => deleteTransaction(transactionId)}
                  />
                </>
              ) : null}
            </div>
          </>
        ) : activeTab === 'connections' ? (
          <BankingPanel banking={banking} onShowInvestments={() => setActiveTab('investments')} />
        ) : activeTab === 'cards' ? (
          <CardsPanel banking={banking} />
        ) : (
          <ConnectedInvestments summary={connectedSummary} transactions={transactions} categories={categories} />
        )}
        </div>
      </div>

      <CategoryManagerModal
        open={showCategoryManager}
        categories={categories}
        rules={rules}
        onClose={() => setShowCategoryManager(false)}
        onCreateCategory={addCategory}
        onUpdateCategory={updateCategory}
        onDeleteCategory={deleteCategory}
        onAddRule={addRule}
        onDeleteRule={deleteRule}
      />
    </div>
    </fieldset>
  </>);
}

export default App;
