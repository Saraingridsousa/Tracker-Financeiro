import type { Category, Rule, Transaction, TransactionType } from '../types/finance';

export const normalizeFinanceText = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

export function inferCategory(description: string, categories: Category[], rules: Rule[] = [], type?: TransactionType): string {
  const text = normalizeFinanceText(description);
  if (type === 'income' && /\b(jose ricardo|jose ricardo de sousa afonso|cofrinho|cofre)\b/.test(text)) {
    if (categories.some((category) => category.id === 'transferencia' && (category.type === 'both' || category.type === type))) {
      return 'transferencia';
    }
  }
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
  const isThirdPartyTransfer = transaction.type === 'income' &&
    /\b(jose ricardo|jose ricardo de sousa afonso|cofrinho|cofre)\b/.test(text);
  const manualTransferRejected = transaction.manualSelfTransfer === true && transaction.isSelfTransfer === false;
  const isSelfTransfer = !manualTransferRejected && (transaction.isSelfTransfer === true || transaction.categoryId === 'transferencia' || isThirdPartyTransfer);
  const categoryNeutral = !(manualTransferRejected && transaction.categoryId === 'transferencia') && (category?.isNeutral || category?.excludeFromTotals);
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

export function summarizeTransactions(items: Transaction[], categories: Category[] = []): import('../types/finance').DashboardSummary {
  const cents = (tx: Transaction) => Math.round((Math.abs(tx.amount) + Number.EPSILON) * 100);
  const income = items.filter((tx) => isRealIncome(tx, categories)).reduce((sum, tx) => sum + cents(tx), 0);
  const expenses = items.filter((tx) => isRealExpense(tx, categories)).reduce((sum, tx) => sum + cents(tx), 0);
  const expenseCount = items.filter((tx) => isRealExpense(tx, categories)).length;
  return {
    balance: (income - expenses) / 100, income: income / 100, expenses: expenses / 100,
    averageExpense: expenseCount ? expenses / 100 / expenseCount : 0,
    monthCount: new Set(items.map((tx) => tx.date.slice(0, 7))).size,
    neutralTotal: items.filter((tx) => classifyTransaction(tx, categories).isNeutral && isSettledBRL(tx)).reduce((sum, tx) => sum + cents(tx), 0) / 100,
    totalInvested: items.filter((tx) => classifyTransaction(tx, categories).isInvestment && isSettledBRL(tx))
      .reduce((sum, tx) => sum + (tx.type === 'expense' ? cents(tx) : -cents(tx)), 0) / 100,
  };
}
