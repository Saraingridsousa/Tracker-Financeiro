import { useMemo, useState } from 'react';

import type { Category, Transaction } from '../types/finance';

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

interface TransactionTableProps {
  transactions: Transaction[];
  categories: Category[];
  onUpdateCategory: (transactionId: string, categoryId: string) => void;
}

const pageSize = 8;

const sortTransactionsByDateDesc = (items: Transaction[]) =>
  [...items].sort((a, b) => {
    const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return (a.id ?? '').localeCompare(b.id ?? '');
  });

export function TransactionTable({ transactions, categories, onUpdateCategory }: TransactionTableProps) {
  const [search, setSearch] = useState('');
  const [selectedBank, setSelectedBank] = useState<'all' | 'Inter' | 'Caixa' | 'Sofisa' | 'BB' | 'Outro'>('all');
  const [page, setPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ field: 'date'; direction: 'asc' | 'desc' }>({
    field: 'date',
    direction: 'desc',
  });

  const bankOptions = useMemo(
    () =>
      Array.from(
        new Set(
          transactions
            .map((transaction) => transaction.bank ?? 'Outro')
            .filter((bank): bank is 'Inter' | 'Caixa' | 'Sofisa' | 'BB' | 'Outro' => Boolean(bank)),
        ),
      ).sort(),
    [transactions],
  );

  const sortedTransactions = useMemo(() => {
    const items = sortTransactionsByDateDesc(transactions);
    if (sortConfig.field === 'date' && sortConfig.direction === 'asc') {
      return [...items].reverse();
    }
    return items;
  }, [sortConfig, transactions]);

  const filteredTransactions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sortedTransactions.filter((transaction) => {
      const matchesSearch = !term || transaction.description.toLowerCase().includes(term);
      const matchesBank = selectedBank === 'all' || (transaction.bank ?? 'Outro') === selectedBank;
      return matchesSearch && matchesBank;
    });
  }, [search, selectedBank, sortedTransactions]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));

  const paginatedTransactions = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, page]);

  const topExpenses = useMemo(
    () =>
      [...transactions]
        .filter(
          (tx) =>
            (tx.type === 'expense' || tx.amount < 0) &&
            !tx.isNeutral &&
            !tx.isInternalTransfer &&
            !tx.isSelfTransfer &&
            !tx.isInvestment &&
            !tx.isCreditCardPayment &&
            tx.category !== 'Pagamento de Fatura' &&
            tx.categoryId !== 'pagamento_fatura',
        )
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
    [transactions],
  );

  const onPageChange = (nextPage: number) => {
    setPage(Math.min(Math.max(nextPage, 1), totalPages));
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Transações</h3>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                value={selectedBank}
                onChange={(event) => {
                  setSelectedBank(event.target.value as 'all' | 'Inter' | 'Caixa' | 'Sofisa' | 'BB' | 'Outro');
                  setPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-cyan-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="all">Todos os bancos</option>
                {bankOptions.map((bank) => (
                  <option key={bank} value={bank}>
                    {bank}
                  </option>
                ))}
              </select>
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Buscar por descrição"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none ring-0 transition placeholder:text-slate-400 focus:border-cyan-400 sm:max-w-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-950/70">
                  <tr>
                    <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Data</th>
                    <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Descrição</th>
                    <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Categoria</th>
                    <th className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                  {paginatedTransactions.length ? (
                    paginatedTransactions.map((transaction) => {
                      const category = categories.find((item) => item.id === transaction.categoryId) ?? categories[0];
                      const isNeutral = Boolean(category?.isNeutral || category?.excludeFromTotals);
                      const bankStyles: Record<string, string> = {
                        Inter: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/60 dark:text-orange-300',
                        Caixa: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/60 dark:text-blue-300',
                        BB: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-300',
                        Sofisa: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-300',
                        Outro: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
                      };

                      return (
                        <tr key={transaction.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/70">
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatBrazilianDate(transaction.date)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-800 dark:text-slate-100">{transaction.description}</span>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <span className="text-xs text-slate-500 dark:text-slate-400">{transaction.type === 'income' ? 'Entrada' : 'Saída'}</span>
                                <span
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${bankStyles[transaction.bank ?? 'Outro'] ?? bankStyles. Outro}`}
                                >
                                  {transaction.bank ?? 'Outro'}
                                </span>
                                {transaction.isCreditCardPayment && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                    Fatura Paga (Neutro)
                                  </span>
                                )}
                                {isNeutral && !transaction.isCreditCardPayment && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/60 dark:text-violet-300">
                                    ⇄ Transferência / Neutro
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={transaction.categoryId}
                              onChange={(event) => onUpdateCategory(transaction.id, event.target.value)}
                              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-cyan-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                            >
                              {categories.map((categoryOption) => (
                                <option key={categoryOption.id} value={categoryOption.id}>
                                  {categoryOption.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: category?.color ?? '#94a3b8' }}
                              />
                              <span
                                className={`font-semibold ${
                                  transaction.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {transaction.type === 'income' ? '+' : '-'}
                                {new Intl.NumberFormat('pt-BR', {
                                  style: 'currency',
                                  currency: 'BRL',
                                }).format(transaction.amount)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                        Nenhuma transação encontrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              Anterior
            </button>

            <span className="text-sm text-slate-600 dark:text-slate-300">
              Página {page} de {totalPages}
            </span>

            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              Próxima
            </button>
          </div>
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none">
          <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Top 5 maiores gastos</h3>
          <div className="space-y-3">
            {topExpenses.length ? (
              topExpenses.map((transaction, index) => {
                const category = categories.find((item) => item.id === transaction.categoryId);

                return (
                  <div key={transaction.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/70">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        #{index + 1}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{formatBrazilianDate(transaction.date)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{transaction.description}</p>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{category?.name ?? 'Sem categoria'}</span>
                      </div>
                      <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                        -
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        }).format(transaction.amount)}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">Ainda não há gastos para mostrar.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
