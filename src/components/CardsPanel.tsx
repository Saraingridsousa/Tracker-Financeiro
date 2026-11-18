import type { BankingController } from '../hooks/useBanking';
import { inferCreditCardInstallment } from '../domain/finance';

const currency = (cents: number, currencyCode = 'BRL') =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currencyCode }).format(cents / 100);

const bankTheme = (bank: string) => {
  const name = bank.toLowerCase();
  if (name.includes('inter')) return 'from-orange-500 via-orange-600 to-amber-500';
  if (name.includes('nubank') || name.includes('rox')) return 'from-violet-600 via-purple-700 to-fuchsia-700';
  if (name.includes('caixa')) return 'from-blue-600 via-blue-700 to-cyan-700';
  if (name.includes('brasil') || name === 'bb') return 'from-yellow-400 via-amber-500 to-yellow-600';
  if (name.includes('santander')) return 'from-red-600 via-rose-700 to-red-800';
  if (name.includes('itau') || name.includes('itaú')) return 'from-blue-700 via-slate-700 to-orange-500';
  if (name.includes('sofisa')) return 'from-emerald-500 via-teal-600 to-cyan-700';
  return 'from-slate-700 via-slate-800 to-cyan-800';
};

const bankInitial = (bank: string) =>
  bank
    .replace(/banco/gi, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'C';

export function CardsPanel({ banking }: { banking: BankingController }) {
  const { snapshot, busy, error, refresh } = banking;
  const cards = snapshot.accounts.filter((account) => account.type === 'CREDIT');
  const bills = snapshot.products?.bills ?? [];
  const groupedCards = cards.reduce<Array<{ bank: string; cards: typeof cards }>>((groups, card) => {
    const bank = card.institution?.name ?? snapshot.connections.find((connection) => connection.id === card.itemId)?.label ?? 'Outros bancos';
    const group = groups.find((item) => item.bank === bank);
    if (group) group.cards.push(card);
    else groups.push({ bank, cards: [card] });
    return groups;
  }, []);

  const formatDate = (value: string) => value.split('-').reverse().join('/');

  return (
    <section aria-labelledby="cards-title" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-600">Cartões conectados</p>
          <h2 id="cards-title" className="mt-2 text-xl font-semibold">Faturas e limites</h2>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void refresh()}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700"
        >
          {busy ? 'Atualizando...' : 'Atualizar dados'}
        </button>
      </div>

      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">{error}</p>}

      {cards.length ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {groupedCards.flatMap(({ bank, cards: bankCards }) =>
          bankCards.map((card) => {
            const cardBills = bills.filter((bill) => bill.accountId === card.id);
            const latestBill = cardBills.sort((left, right) => right.dueDate.localeCompare(left.dueDate))[0];
            const paidCents = latestBill?.payments?.reduce((sum, payment) => sum + payment.amountCents, 0) ?? 0;
            const paymentPercent = latestBill && latestBill.totalAmountCents > 0
              ? Math.min(100, Math.round((paidCents / latestBill.totalAmountCents) * 100))
              : 0;
            const limitCents = card.creditData?.creditLimitCents;
            const availableCents = card.creditData?.availableCreditLimitCents;
            const usedPercent = limitCents && limitCents > 0 && availableCents != null
              ? Math.min(100, Math.round(((limitCents - availableCents) / limitCents) * 100))
              : 0;
            const installments = snapshot.transactions
              .map((transaction) => ({
                transaction,
                installment: inferCreditCardInstallment(transaction),
              }))
              .filter(({ transaction, installment }) =>
                transaction.accountId === card.id &&
                transaction.type === 'expense' &&
                installment !== null &&
                (installment?.totalInstallments ?? 0) > 1
              );
            return (
              <article key={card.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900">
                <div className={`relative overflow-hidden bg-gradient-to-br ${bankTheme(bank)} p-5 text-white`}>
                  <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full border border-white/10" />
                  <div className="absolute -bottom-14 right-16 h-32 w-32 rounded-full border border-white/10" />
                  <div className="relative flex items-start justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-white/70">{card.creditData?.brand ?? 'Cartão'}</p>
                      <p className="mt-2 text-lg font-semibold">{card.name}</p>
                    </div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-white/15 text-sm font-bold shadow-lg backdrop-blur">
                      {bankInitial(bank)}
                    </div>
                  </div>
                  <div className="relative mt-8 flex items-end justify-between">
                    <div>
                      <p className="text-xs text-white/60">Limite disponível - limite total</p>
                      <p className="mt-1 text-xl font-semibold">
                        {availableCents == null ? 'Não informado' : currency(availableCents, card.currencyCode)}
                        <span className="mx-2 text-white/50">-</span>
                        {limitCents == null ? 'Não informado' : currency(limitCents, card.currencyCode)}
                      </p>
                    </div>
                  </div>
                  {limitCents != null && limitCents > 0 && (
                    <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-white/20">
                      <div className="h-full rounded-full bg-cyan-300" style={{ width: `${usedPercent}%` }} />
                    </div>
                  )}
                </div>
                <div className="space-y-4 p-5">
                  {latestBill ? (
                    <div>
                      <div className="flex items-center justify-between">
                        <div><p className="text-xs text-slate-500">Próxima fatura</p><p className="mt-1 font-semibold">{formatDate(latestBill.dueDate)}</p></div>
                        <strong className="text-lg">{currency(latestBill.totalAmountCents, latestBill.currencyCode)}</strong>
                      </div>
                      <div className="mt-3">
                        <div className="mb-1 flex justify-between text-xs text-slate-500"><span>Pago</span><span>{paymentPercent}%</span></div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${paymentPercent}%` }} />
                        </div>
                      </div>
                    </div>
                  ) : <p className="text-sm text-slate-500">Nenhuma fatura disponível nesta consulta.</p>}

                  {installments.length ? (
                    <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Parcelamentos ativos</p>
                      <div className="space-y-2">
                        {installments.slice(0, 4).map(({ transaction, installment }) => {
                          const total = installment?.totalInstallments ?? 1;
                          const current = installment?.installmentNumber ?? 1;
                          const metadataAmountCents = installment?.totalAmountCents;
                          const installmentAmountCents = metadataAmountCents
                            ? Math.round(metadataAmountCents / total)
                            : transaction.amountCents ?? Math.round(transaction.amount * 100);
                          return (
                            <div key={transaction.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-950">
                              <span className="min-w-0 truncate pr-3 text-slate-700 dark:text-slate-200">{transaction.description}</span>
                              <span className="flex shrink-0 items-center gap-2">
                                <strong className="text-slate-800 dark:text-slate-100">{currency(installmentAmountCents, transaction.currencyCode)}</strong>
                                <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">{current}/{total}</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Nenhum cartão conectado encontrado.
        </div>
      )}
    </section>
  );
}
