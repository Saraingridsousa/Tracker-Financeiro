import type { Category, Rule, Transaction, TransactionType } from '../types/finance';

export const normalizeFinanceText = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

export function inferCreditCardInstallment(tx: Pick<Transaction, 'date' | 'description' | 'amount'> & Pick<Transaction, 'amountCents' | 'creditCardMetadata'>): {
  installmentNumber: number;
  totalInstallments: number;
  purchaseDate: string;
  totalAmountCents?: number;
} | null {
  const metadata = tx.creditCardMetadata;
  if (Number.isInteger(metadata?.totalInstallments) && (metadata?.totalInstallments ?? 0) > 1) {
    return {
      installmentNumber: Number.isInteger(metadata?.installmentNumber) ? (metadata?.installmentNumber as number) : 1,
      totalInstallments: metadata?.totalInstallments as number,
      purchaseDate: metadata?.purchaseDate ?? tx.date,
      ...(Number.isSafeInteger(metadata?.totalAmountCents) ? { totalAmountCents: metadata?.totalAmountCents } : {}),
    };
  }

  const rawText = tx.description;
  const normalizedText = normalizeFinanceText(rawText);
  const match = rawText.match(/(?:parcela|parcelamento|parcelado)[^0-9]*(\d{1,2})\s*(?:de|\/)\s*(\d{1,2})\b/i) ??
    rawText.match(/\b(\d{1,2})\s*(?:\/|\bde\b)\s*(\d{1,2})\b/i) ??
    normalizedText.match(/(?:parcela|parcelamento|parcelado)[^0-9]*(\d{1,2})\s+de\s+(\d{1,2})\b/);
  if (!match) return null;

  const installmentNumber = Number(match[1]);
  const totalInstallments = Number(match[2]);
  if (!Number.isInteger(installmentNumber) || !Number.isInteger(totalInstallments) ||
    installmentNumber < 1 || totalInstallments < 2 || installmentNumber > totalInstallments) {
    return null;
  }

  const amountCents = typeof tx.amountCents === 'number' && Number.isSafeInteger(tx.amountCents)
    ? tx.amountCents
    : Math.round((Math.abs(tx.amount) + Number.EPSILON) * 100);

  return {
    installmentNumber,
    totalInstallments,
    purchaseDate: tx.date,
    totalAmountCents: amountCents * totalInstallments,
  };
}

export function inferCategory(description: string, categories: Category[], rules: Rule[] = [], type?: TransactionType): string {
  const text = normalizeFinanceText(description);
  const compatible = (id: string) => categories.some((c) => c.id === id && (!type || c.type === 'both' || c.type === type));
  const candidates = rules.filter((r) => r.isActive && compatible(r.categoryId)).flatMap((r) => r.keywords.map((keyword) => ({ categoryId: r.categoryId, keyword: normalizeFinanceText(keyword) }))).filter((r) => r.keyword && text.includes(r.keyword)).sort((a, b) => b.keyword.length - a.keyword.length);
  if (candidates.length) return candidates[0].categoryId;
  for (const category of categories) {
    // Categorias antigas traziam 'pix enviado/recebido': não comprovam titularidade.
    if (category.id === 'transferencia' || !compatible(category.id)) continue;
    if (category.keywords.some((keyword) => { const normalized = normalizeFinanceText(keyword); return normalized && text.includes(normalized); })) return category.id;
  }
  return 'uncategorized';
}

/** Meio de pagamento não é evidência de titularidade. Flags são recalculadas. */
export function classifyTransaction(transaction: Transaction, categories: Category[] = []): Transaction {
  const text = normalizeFinanceText(transaction.description);
  const category = categories.find((entry) => entry.id === transaction.categoryId);
  const manualTransferRejected = transaction.manualSelfTransfer === true && transaction.isSelfTransfer === false;
  const manuallyConfirmedSelfTransfer = transaction.manualSelfTransfer === true && transaction.isSelfTransfer === true;
  const providerConfirmedSelfTransfer = transaction.source === 'pluggy' && transaction.isSelfTransfer === true;
  const isSelfTransfer = !manualTransferRejected && (providerConfirmedSelfTransfer || manuallyConfirmedSelfTransfer);
  const categoryNeutral = category?.id !== 'transferencia' && Boolean(category?.isNeutral || category?.excludeFromTotals);
  const isCreditCardPayment = transaction.isCreditCardPayment === true || transaction.categoryId === 'pagamento_fatura' || text === 'statement payment' || /pagamento (?:de )?fatura|pgto fatura|pagamento efetuado.*fatura/.test(text);
  // Category inference already applies rules before keywords; a specific known
  // category (including a manual correction) must outrank this weaker text hint.
  const hasSpecificCategory = Boolean(category && category.id !== 'uncategorized');
  // Bank allocation descriptors, not any purchase mentioning a physical cofrinho.
  const isCofrinhoAllocation = /^(?:aporte na carteira|dinheiro reservado)\b.*\bcofrinho\b/.test(text);
  const isInvestment = transaction.categoryId === 'investimentos' || (!hasSpecificCategory && transaction.categoryId !== 'proventos' && (isCofrinhoAllocation || /\b(cdb|lci|tesouro|selic|aplicacao|resgate|investimento)\b/.test(text)));
  return {
    ...transaction,
    isSelfTransfer,
    isInternalTransfer: isSelfTransfer,
    isCreditCardPayment,
    isInvestment,
    isNeutral: Boolean(isSelfTransfer || isCreditCardPayment || isInvestment || categoryNeutral),
  };
}

const isSettledBRL = (tx: Transaction) => tx.providerStatus !== 'PENDING' && (!tx.currencyCode || tx.currencyCode === 'BRL') && Number.isFinite(tx.amount);

export function participatesInResult(tx: Transaction, categories: Category[] = []): boolean {
  return !classifyTransaction(tx, categories).isNeutral && isSettledBRL(tx);
}
export const isRealExpense = (tx: Transaction, categories: Category[] = []) => tx.type === 'expense' && participatesInResult(tx, categories);
export const isRealIncome = (tx: Transaction, categories: Category[] = []) => tx.type === 'income' && participatesInResult(tx, categories);
export const isInvestmentApplication = (tx: Transaction, categories: Category[] = []) => {
  if (tx.type !== 'expense' || !isSettledBRL(tx)) return false;
  const text = normalizeFinanceText(tx.description);
  if (/\bresgate\b/.test(text)) return false;
  return classifyTransaction(tx, categories).isInvestment;
};

const validCivilDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

const addMonths = (date: string, months: number): string => {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(Math.min(day || 1, lastDay)).padStart(2, '0')}`;
};

/** Expands only purchases whose reported amount is the full parcelada purchase.
 *  If each installment is already reported separately, the amount differs from
 *  totalAmountCents and no duplicate expansion is made.
 */
export function projectInstallmentTransactions(items: Transaction[]): Transaction[] {
  return items.flatMap((tx) => {
    if (tx.type !== 'expense') return [tx];

    const metadata = tx.creditCardMetadata;
    const totalInstallments = metadata?.totalInstallments;
    const totalAmountCents = metadata?.totalAmountCents;
    const amountCents = Number.isSafeInteger(tx.amountCents)
      ? tx.amountCents
      : Math.round((Math.abs(tx.amount) + Number.EPSILON) * 100);

    if (!metadata ||
      !Number.isInteger(totalInstallments) ||
      (totalInstallments ?? 0) < 2 ||
      !Number.isSafeInteger(totalAmountCents) ||
      (totalAmountCents ?? 0) <= 0 ||
      amountCents !== totalAmountCents) {
      return [tx];
    }

    const installmentCount = totalInstallments as number;
    const purchaseAmountCents = totalAmountCents as number;
    const startDate = validCivilDate(metadata.purchaseDate) ? metadata.purchaseDate : tx.date;
    if (!validCivilDate(startDate)) return [tx];

    const baseCents = Math.floor(purchaseAmountCents / installmentCount);
    const remainderCents = purchaseAmountCents - baseCents * installmentCount;

    return Array.from({ length: installmentCount }, (_, index) => ({
      ...tx,
      date: addMonths(startDate, index),
      amount: (baseCents + (index < remainderCents ? 1 : 0)) / 100,
      amountCents: baseCents + (index < remainderCents ? 1 : 0),
      creditCardMetadata: {
        ...metadata,
        installmentNumber: index + 1,
      },
    }));
  });
}

export function summarizeTransactions(items: Transaction[], categories: Category[] = []): import('../types/finance').DashboardSummary {
  const projectedItems = projectInstallmentTransactions(items);
  const cents = (tx: Transaction): number => {
    if (typeof tx.amountCents === 'number' && Number.isSafeInteger(tx.amountCents)) return tx.amountCents;
    return Math.round((Math.abs(tx.amount) + Number.EPSILON) * 100);
  };
  const income = projectedItems.filter((tx) => isRealIncome(tx, categories)).reduce((sum, tx) => sum + cents(tx), 0);
  const expenses = projectedItems.filter((tx) => isRealExpense(tx, categories)).reduce((sum, tx) => sum + cents(tx), 0);
  const expenseCount = projectedItems.filter((tx) => isRealExpense(tx, categories)).length;
  return {
    balance: (income - expenses) / 100, income: income / 100, expenses: expenses / 100,
    averageExpense: expenseCount ? expenses / 100 / expenseCount : 0,
    monthCount: new Set(projectedItems.map((tx) => tx.date.slice(0, 7))).size,
    neutralTotal: projectedItems.filter((tx) => classifyTransaction(tx, categories).isNeutral && isSettledBRL(tx)).reduce((sum, tx) => sum + cents(tx), 0) / 100,
    totalInvested: projectedItems.filter((tx) => classifyTransaction(tx, categories).isInvestment && isSettledBRL(tx))
      .reduce((sum, tx) => sum + (tx.type === 'expense' ? cents(tx) : -cents(tx)), 0) / 100,
  };
}
