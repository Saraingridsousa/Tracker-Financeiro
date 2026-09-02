import {
  ArrowDownCircle,
  ArrowUpCircle,
  Download,
  FileText,
  Filter,
  LayoutDashboard,
  Moon,
  PieChart,
  Plus,
  Settings,
  Sun,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { CategoryManagerModal } from './components/CategoryManagerModal';
import { CategoryPieChart } from './components/CategoryPieChart';
import { InvestmentsDashboard } from './components/InvestmentsDashboard';
import { MonthlyBarChart } from './components/MonthlyBarChart';
import { TransactionTable } from './components/TransactionTable';
import { useInvestments } from './hooks/useInvestments';
import { parseBankFile } from './lib/parseBankFile';
import { useTransactions } from './hooks/useTransactions';
import type { BackupPayload, Category, Transaction } from './types/finance';

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

const parseISODate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

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

const filterTransactionsByPeriod = (items: Transaction[], period: (typeof periodOptions)[number]['value']) => {
  if (period === 'all') return items;

  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startDate = new Date(currentMonth);

  if (period === 'month') {
    startDate.setMonth(currentMonth.getMonth());
  }

  if (period === 'last2months') {
    startDate.setMonth(currentMonth.getMonth() - 1);
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

  return items.filter((item) => parseISODate(item.date) >= startDate);
};

const buildMonthlyData = (items: Transaction[]) => {
  const grouped = new Map<string, { income: number; expenses: number; month: string; sortKey: string }>();

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
      grouped.set(sortKey, { month: label, sortKey, income: 0, expenses: 0 });
    }

    const current = grouped.get(sortKey)!;
    const absAmount = Math.abs(item.amount);

    if (item.type === 'income') {
      current.income += absAmount;
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

const getRealExpenseTransactions = (items: Transaction[]) =>
  items.filter(
    (transaction) =>
      (transaction.type === 'expense' || transaction.amount < 0) &&
      !transaction.isNeutral &&
      !transaction.isInternalTransfer &&
      !transaction.isSelfTransfer &&
      !transaction.isInvestment &&
      !transaction.isCreditCardPayment &&
      transaction.category !== 'Pagamento de Fatura' &&
      transaction.categoryId !== 'pagamento_fatura',
  );

const buildCategoryData = (items: Transaction[], categories: Category[]) => {
  const map = new Map<string, number>();

  getRealExpenseTransactions(items).forEach((item) => {
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

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<(typeof periodOptions)[number]['value']>('last2months');
  const [categoryChartPeriod, setCategoryChartPeriod] = useState<string>('ALL');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'overview' | 'investments'>('overview');
  const transactionsStore = useTransactions();
  const investmentsStore = useInvestments();
  const { portfolioSummary } = investmentsStore;
  const {
    transactions,
    categories,
    rules,
    addTransactions,
    inferCategory,
    addCategory,
    updateCategory,
    deleteCategory,
    addRule,
    deleteRule,
    updateTransaction,
    updateTransactionCategory,
    deleteTransaction,
    resetAllData,
    importBackup,
    exportBackup,
  } = transactionsStore;
  const {
    assets,
    orders,
    addAsset,
    updateAsset,
    deleteAsset,
    addOrder,
    deleteOrder,
    importAssetsFromCsv,
    resetAllData: resetInvestments,
    importBackup: importInvestmentBackup,
    exportBackup: exportInvestmentBackup,
  } = investmentsStore;

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

  const filteredTransactions = useMemo(() => {
    const periodTransactions = filterTransactionsByPeriod(transactions, selectedPeriod).filter(
      (transaction) => !transaction.isSelfTransfer && !transaction.isInternalTransfer,
    );
    if (selectedCategoryFilter === 'all') return periodTransactions;
    return periodTransactions.filter((transaction) => transaction.categoryId === selectedCategoryFilter);
  }, [transactions, selectedPeriod, selectedCategoryFilter]);

  const realExpenses = useMemo(() => getRealExpenseTransactions(filteredTransactions), [filteredTransactions]);

  const summary = useMemo(() => {
    const totalIncome = filteredTransactions
      .filter((transaction) => transaction.type === 'income')
      .reduce((sum, item) => sum + item.amount, 0);

    const totalExpense = realExpenses.reduce((sum, item) => sum + item.amount, 0);

    const totalInvested = portfolioSummary.totalCurrentValue;

    const neutralTotal = filteredTransactions
      .filter((transaction) => {
        const category = categories.find((item) => item.id === transaction.categoryId);
        return Boolean(category?.isNeutral || category?.excludeFromTotals);
      })
      .reduce((sum, item) => sum + item.amount, 0);

    return {
      balance: totalIncome - totalExpense,
      income: totalIncome,
      expenses: totalExpense,
      averageExpense: totalExpense > 0 ? totalExpense / Math.max(1, filteredTransactions.filter((tx) => tx.type === 'expense').length) : 0,
      neutralTotal,
      totalInvested,
    };
  }, [categories, filteredTransactions, portfolioSummary.totalCurrentValue]);

  const monthlyChartData = useMemo(() => buildMonthlyData(filteredTransactions), [filteredTransactions]);

  const categoryMonthOptions = useMemo(() => {
    const months = new Map<string, string>();

    transactions.forEach((transaction) => {
      const key = getTransactionMonthKey(transaction.date);
      if (!key) return;
      months.set(key, key);
    });

    return Array.from(months.keys()).sort((left, right) => right.localeCompare(left));
  }, [transactions]);

  const filteredCategoryExpenses = useMemo(() => {
    const base = getRealExpenseTransactions(filteredTransactions);
    if (categoryChartPeriod === 'ALL') return base;

    return base.filter((transaction) => getTransactionMonthKey(transaction.date) === categoryChartPeriod);
  }, [categoryChartPeriod, filteredTransactions]);

  const categoryChartData = useMemo(() => buildCategoryData(filteredCategoryExpenses, categories), [filteredCategoryExpenses, categories]);

  const topCategoryList = useMemo(
    () =>
      [...categories]
        .map((category) => ({
          ...category,
          total: filteredCategoryExpenses
            .filter((tx) => tx.categoryId === category.id)
            .reduce((sum, tx) => sum + tx.amount, 0),
        }))
        .filter((item) => item.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5),
    [categories, filteredCategoryExpenses],
  );

  const normalizeImportedCategory = (input?: string) => {
    if (!input) return null;

    const raw = String(input).trim();
    if (!raw || raw.toUpperCase() === 'OUTROS') return null;

    const normalized = raw.toUpperCase();
    const map: Record<string, string> = {
      SUPERMERCADO: 'Supermercado',
      MERCADO: 'Supermercado',
      TRANSPORTE: 'Transporte',
      RESTAURANTES: 'Alimentação',
      BARES: 'Alimentação',
      CULTURA: 'Lazer / Cultura',
      ENTRETENIMENTO: 'Lazer / Cultura',
      DROGARIA: 'Saúde',
      SAUDE: 'Saúde',
      VESTUARIO: 'Compras',
      VESTUÁRIO: 'Compras',
      COMPRAS: 'Compras',
      SERVICOS: 'Serviços',
      SERVIÇOS: 'Serviços',
      ENSINO: 'Educação',
      LIVRARIAS: 'Educação',
    };

    return map[normalized] ?? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;

    setIsImporting(true);

    try {
      const parsed: Transaction[] = [];

      for (const file of Array.from(files)) {
        let list: Transaction[] = [];

        const lowerName = file.name.toLowerCase();

        if (lowerName.endsWith('.pdf')) {
          const { parsePDFStatement } = await import('./utils/pdfParser');
          list = await parsePDFStatement(file);
        } else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
          const { parseExcelStatement } = await import('./utils/excelParser');
          list = await parseExcelStatement(file);
        } else {
          list = await parseBankFile(file);
        }

        const normalized = list.map((item) => {
          const importedCategory = normalizeImportedCategory(item.category ?? item.categoryName);
          const fallbackCategoryId = inferCategory(item.description);
          const resolvedCategoryId =
            importedCategory && categories.some((category) => category.name.toLowerCase() === importedCategory.toLowerCase())
              ? categories.find((category) => category.name.toLowerCase() === importedCategory.toLowerCase())?.id ?? fallbackCategoryId
              : fallbackCategoryId;

          return {
            ...item,
            categoryId: resolvedCategoryId,
            categoryName: categories.find((category) => category.id === resolvedCategoryId)?.name ?? importedCategory ?? 'Sem categoria',
            category: importedCategory ?? item.category ?? item.categoryName,
          };
        });

        parsed.push(...normalized);
      }

      if (!parsed.length) {
        window.alert('Nenhuma transação foi reconhecida neste arquivo. Verifique se o extrato está em formato válido (.CSV, .OFX ou .PDF).');
        return;
      }

      addTransactions(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível importar este arquivo.';
      window.alert(message);
    } finally {
      setIsImporting(false);
    }
  };

  const exportBackupFile = () => {
    const payload = {
      ...exportBackup(),
      ...exportInvestmentBackup(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tracker-financeiro-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importBackupFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const payload = JSON.parse(text) as BackupPayload;
    importBackup(payload);
    importInvestmentBackup({
      assets: payload.assets ?? [],
      investmentOrders: payload.investmentOrders ?? [],
      exportedAt: payload.exportedAt ?? new Date().toISOString(),
    });
    event.target.value = '';
  };

  const clearAllData = () => {
    if (!window.confirm('Tem certeza que deseja limpar todos os dados? Esta ação não pode ser desfeita.')) {
      return;
    }

    resetAllData();
    resetInvestments();
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
                onClick={() => setShowCategoryManager(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Categorias
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowSettingsMenu((current) => !current)}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  aria-label="Abrir configurações"
                  aria-expanded={showSettingsMenu}
                >
                  <Settings className="h-4 w-4" />
                </button>

                {showSettingsMenu && (
                  <div className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <button
                      type="button"
                      onClick={() => {
                        exportBackupFile();
                        setShowSettingsMenu(false);
                      }}
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <span>Fazer backup dos dados (.json)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        backupInputRef.current?.click();
                        setShowSettingsMenu(false);
                      }}
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <span>Restaurar backup (.json)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        resetAllData();
                        setShowSettingsMenu(false);
                      }}
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-amber-600 transition hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                    >
                      <span>Limpar transações</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        resetInvestments();
                        setShowSettingsMenu(false);
                      }}
                      className="flex w-full items-center justify-between border-t border-slate-200 px-4 py-3 text-left text-sm text-rose-600 transition hover:bg-rose-50 dark:border-slate-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
                    >
                      <span>Limpar carteira e investimentos</span>
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Formatos suportados: .OFX, .CSV, .PDF"
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400"
              >
                <Plus className="h-4 w-4" />
                Importar extrato
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".ofx,.csv,.pdf,.xlsx,.xls"
                multiple
                title="Formatos suportados: .OFX, .CSV, .PDF, .XLSX"
                hidden
                onChange={(event) => handleFiles(event.target.files)}
              />
              <input
                ref={backupInputRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={importBackupFile}
              />
            </div>
          </div>
        </header>

        <div className="mb-6 flex justify-start">
          <div className="inline-flex items-center justify-start gap-1 rounded-xl border border-slate-200 bg-white/80 p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            {[
              { key: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
              { key: 'investments', label: 'Investimentos', icon: PieChart },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key as 'overview' | 'investments')}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? 'bg-cyan-500 text-slate-950 shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === 'overview' ? (
          <>
            {transactions.length === 0 ? (
              <section
                className={`mb-8 rounded-2xl border-2 border-dashed p-8 transition ${
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
                <div className="flex flex-col items-center justify-center gap-4 text-center">
                  <div className="rounded-full bg-cyan-500/10 p-4 text-cyan-600 dark:bg-slate-800 dark:text-cyan-400">
                    <FileText className="h-8 w-8" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Seu painel está limpo</h2>
                    <p className="mt-2 max-w-xl text-sm text-slate-500 dark:text-slate-400">
                      Comece importando um extrato .OFX, .CSV, .PDF ou .XLSX para visualizar seus gastos, receitas e categorias em tempo real.
                    </p>
                    <p className="mt-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                      Formatos suportados: .OFX, .CSV, .PDF, .XLSX
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-medium text-slate-950 hover:bg-cyan-400"
                  >
                    {isImporting ? 'Importando...' : 'Importar primeiro extrato'}
                  </button>
                </div>
              </section>
            ) : (
              <section className="mb-8 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Importar extrato</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Adicione mais arquivos sem perder os dados já cadastrados.</p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Formatos suportados: .OFX, .CSV, .PDF, .XLSX</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {isImporting ? 'Importando...' : 'Selecionar arquivos'}
                  </button>
                </div>
              </section>
            )}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Saldo atual', value: summary.balance, icon: Wallet, tone: 'emerald' },
            { label: 'Entradas', value: summary.income, icon: ArrowUpCircle, tone: 'cyan' },
            { label: 'Saídas', value: summary.expenses, icon: ArrowDownCircle, tone: 'rose' },
            { label: 'Total Investido', value: summary.totalInvested, icon: TrendingUp, tone: 'violet' },
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
        </section>

            <div className="mt-8">
              {transactions.length > 0 ? (
                <>
                  <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-1 items-center gap-3">
                      <label className="text-sm text-slate-600 dark:text-slate-300">Filtrar por categoria</label>
                      <select
                        value={selectedCategoryFilter}
                        onChange={(event) => setSelectedCategoryFilter(event.target.value)}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                      >
                        <option value="all">Todas</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

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
        ) : (
          <InvestmentsDashboard
            assets={assets}
            orders={orders}
            onAddAsset={addAsset}
            onUpdateAsset={updateAsset}
            onDeleteAsset={deleteAsset}
            onAddOrder={addOrder}
            onDeleteOrder={deleteOrder}
            onImportCsv={importAssetsFromCsv}
          />
        )}
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
  );
}

export default App;
