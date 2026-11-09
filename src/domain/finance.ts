import type { Category, Rule, Transaction, TransactionType } from '../types/finance';

export const normalizeFinanceText = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

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
  const isSelfTransfer = transaction.isSelfTransfer === true || transaction.categoryId === 'transferencia';
  const isCreditCardPayment = transaction.isCreditCardPayment === true || transaction.categoryId === 'pagamento_fatura' || /pagamento (?:de )?fatura|pgto fatura|pagamento efetuado.*fatura/.test(text);
  const isInvestment = transaction.categoryId === 'investimentos' || (transaction.categoryId !== 'proventos' && /\b(cdb|lci|tesouro|selic|aplicacao|resgate|investimento)\b/.test(text));
  return {
    ...transaction,
    isSelfTransfer,
    isInternalTransfer: isSelfTransfer,
    isCreditCardPayment,
    isInvestment,
    isNeutral: Boolean(isSelfTransfer || isCreditCardPayment || isInvestment || category?.isNeutral || category?.excludeFromTotals),
  };
}

export function participatesInResult(tx: Transaction, categories: Category[] = []): boolean {
  return !classifyTransaction(tx, categories).isNeutral && tx.providerStatus !== 'PENDING'
    && (!tx.currencyCode || tx.currencyCode === 'BRL') && Number.isFinite(tx.amount);
}
export const isRealExpense = (tx: Transaction, categories: Category[] = []) => tx.type === 'expense' && participatesInResult(tx, categories);
export const isRealIncome = (tx: Transaction, categories: Category[] = []) => tx.type === 'income' && participatesInResult(tx, categories);

export function summarizeTransactions(items: Transaction[], categories: Category[] = []): import('../types/finance').DashboardSummary {
  const cents = (tx: Transaction) => Math.round((Math.abs(tx.amount) + Number.EPSILON) * 100);
  const income = items.filter((tx) => isRealIncome(tx, categories)).reduce((sum, tx) => sum + cents(tx), 0);
  const expenses = items.filter((tx) => isRealExpense(tx, categories)).reduce((sum, tx) => sum + cents(tx), 0);
  const expenseCount = items.filter((tx) => isRealExpense(tx, categories)).length;
  return {
    balance: (income - expenses) / 100, income: income / 100, expenses: expenses / 100,
    averageExpense: expenseCount ? expenses / 100 / expenseCount : 0,
    monthCount: new Set(items.map((tx) => tx.date.slice(0, 7))).size,
    neutralTotal: items.filter((tx) => classifyTransaction(tx, categories).isNeutral).reduce((sum, tx) => sum + cents(tx), 0) / 100,
    totalInvested: items.filter((tx) => classifyTransaction(tx, categories).isInvestment && tx.providerStatus !== 'PENDING')
      .reduce((sum, tx) => sum + (tx.type === 'expense' ? cents(tx) : -cents(tx)), 0) / 100,
  };
}
