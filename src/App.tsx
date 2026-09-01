import { ArrowDownCircle, ArrowUpCircle, DollarSign, Download, FileText, Filter, TrendingUp } from 'lucide-react';
import { useRef, useState } from 'react';

import { parseBankFile } from './lib/parseBankFile';
import { useTransactions } from './hooks/useTransactions';

const toneStyles = {
  emerald: 'bg-emerald-500/15 text-emerald-400',
  cyan: 'bg-cyan-500/15 text-cyan-400',
  rose: 'bg-rose-500/15 text-rose-400',
  amber: 'bg-amber-500/15 text-amber-400',
} as const;

const summaryCards = [
  {
    label: 'Saldo atual',
    valueKey: 'balance',
    icon: DollarSign,
    tone: 'emerald',
  },
  {
    label: 'Entradas',
    valueKey: 'income',
    icon: ArrowUpCircle,
    tone: 'cyan',
  },
  {
    label: 'Saídas',
    valueKey: 'expenses',
    icon: ArrowDownCircle,
    tone: 'rose',
  },
  {
    label: 'Gasto médio',
    valueKey: 'averageExpense',
    icon: TrendingUp,
    tone: 'amber',
  },
] as const;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const { transactions, dashboardSummary, addTransactions, inferCategory, categories } = useTransactions();

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;

    setIsImporting(true);

    try {
      const parsed: any[] = [];

      for (const file of Array.from(files)) {
        const list = await parseBankFile(file);

        const normalized = list.map((item) => ({
          ...item,
          categoryId: inferCategory(item.description),
          categoryName: categories.find((category) => category.id === inferCategory(item.description))?.name ?? 'Sem categoria',
        }));

        parsed.push(...normalized);
      }

      addTransactions(parsed);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-soft backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-cyan-400">Tracker Financeiro</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Painel pessoal</h1>
          </div>

          <div className="flex items-center gap-3">
            <button className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:border-slate-500">
              <Filter className="h-4 w-4" />
              Período: Mês atual
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
        </header>

        <section
          className={`mb-8 rounded-2xl border-2 border-dashed p-6 transition ${
            isDragging ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-700 bg-slate-900/70'
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
            <div className="rounded-full bg-slate-800 p-3 text-cyan-400">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Arraste seus extratos aqui</h2>
              <p className="mt-1 text-sm text-slate-400">Arquivos .CSV e .OFX ficam 100% no navegador.</p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
            >
              {isImporting ? 'Importando...' : 'Selecionar arquivos'}
            </button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map(({ label, valueKey, icon: Icon, tone }) => {
            const value = dashboardSummary[valueKey];

            return (
              <article key={label} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-soft">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-400">{label}</p>
                    <h3 className="mt-2 text-2xl font-semibold text-white">{formatCurrency(value)}</h3>
                  </div>
                  <div className={`rounded-xl p-3 ${toneStyles[tone]}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.7fr_1fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Resumo do período</h3>
              <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">
                {transactions.length} transações
              </span>
            </div>

            <div className="h-64 rounded-xl bg-slate-950/80 p-4">
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Gráfico de receitas x despesas em desenvolvimento
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
            <h3 className="mb-4 text-lg font-semibold text-white">Top categorias</h3>
            <div className="space-y-3">
              {categories.slice(0, 5).map((category) => (
                <div key={category.id} className="flex items-center justify-between rounded-xl bg-slate-950/80 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: category.color }} />
                    <span className="text-sm text-slate-200">{category.name}</span>
                  </div>
                  <span className="text-sm text-slate-400">{transactions.filter((tx) => tx.categoryId === category.id).length}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;
