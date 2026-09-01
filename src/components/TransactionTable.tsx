import { useMemo, useState } from 'react';

import type { Category, Transaction } from '../types/finance';

interface TransactionTableProps {
  transactions: Transaction[];
  categories: Category[];
  onUpdateCategory: (transactionId: string, categoryId: string) => void;
}

const pageSize = 8;

export function TransactionTable({ transactions, categories, onUpdateCategory }: TransactionTableProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const filteredTransactions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return transactions.filter((transaction) =>
      !term || transaction.description.toLowerCase().includes(term),
    );
  }, [search, transactions]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));

  const paginatedTransactions = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, page]);

  const topExpenses = useMemo(
    () =>
      [...transactions]
        .filter((tx) => tx.type === 'expense')
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
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Transações</h3>
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

                      return (
                        <tr key={transaction.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/70">
                          <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{transaction.date}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-800 dark:text-slate-100">{transaction.description}</span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">{transaction.type === 'income' ? 'Entrada' : 'Saída'}</span>
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
                      <span className="text-xs text-slate-500 dark:text-slate-400">{transaction.date}</span>
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
