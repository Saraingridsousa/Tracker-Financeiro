import { useEffect, useMemo, useState } from 'react';

import type { BackupPayload, Category, DashboardSummary, Rule, Transaction } from '../types/finance';

const STORAGE_KEY = 'tracker-financeiro:data';
const RULES_KEY = 'tracker-financeiro:rules';

const normalizeImportText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const classifyTransactionFlags = (transaction: Transaction): Transaction => {
  const normalized = normalizeImportText(transaction.description);
  const isSelfTransferPattern = /(sara ingrid|sara i s o afonso|sara afonso|sara ingrid sousa|sara sousa|cp\s*:\s*\d{7,8}|pix (recebido|enviado).*sara|recebimento de transfer.*via pix.*sara|envio de transfer.*via pix.*sara|para sara|de sara|sara\b)/i.test(normalized);
  const isInternalTransfer = /(pix|ted|transferencia|transferência|conta propria|conta própria|mesma titularidade|entre contas)/i.test(normalized);
  const isSelfTransfer = isInternalTransfer && isSelfTransferPattern;
  const isInvestment = /(cdb|lci|tesouro|selic|b3|aplicacao|aplicação|resgate|vencimento|investimento|dividendos|juros sobre capital)/i.test(normalized);
  const isCreditCardPayment = /(pagamento on line|pagamento online|pagamento fatura cartao|pagamento de fatura|pagamento efetuado.*pagamento fatura|pagamento efetuado: pagamento fatura)/i.test(normalized);
  const isNeutral = isInternalTransfer || isInvestment || isCreditCardPayment || isSelfTransfer;

  return {
    ...transaction,
    isInternalTransfer: isInternalTransfer || isSelfTransfer,
    isSelfTransfer,
    isInvestment: isInvestment && !isInternalTransfer,
    isCreditCardPayment,
    isNeutral,
    category: isCreditCardPayment ? 'Pagamento de Fatura' : transaction.category,
  };
};

const buildTransactionFingerprint = (transaction: Pick<Transaction, 'date' | 'description' | 'amount' | 'type'>) => {
  const normalized = normalizeImportText(`${transaction.date}|${transaction.description}|${Math.abs(transaction.amount).toFixed(2)}|${transaction.type}`);
  return normalized;
};

const defaultCategories: Category[] = [
  { id: 'alimentacao', name: 'Alimentação', color: '#ef4444', keywords: ['uber', 'restaurante', 'mercado', 'padaria', 'delivery'], type: 'expense', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'moradia', name: 'Moradia', color: '#f59e0b', keywords: ['aluguel', 'condominio', 'luz', 'água', 'internet'], type: 'expense', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'transporte', name: 'Transporte', color: '#3b82f6', keywords: ['uber', 'metro', 'onibus', 'combustivel', 'posto'], type: 'expense', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'lazer', name: 'Lazer', color: '#8b5cf6', keywords: ['cinema', 'spotify', 'streaming', 'ingresso'], type: 'expense', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'saude', name: 'Saúde', color: '#10b981', keywords: ['farmacia', 'medico', 'consulta', 'dentista'], type: 'expense', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'investimentos', name: 'Investimentos', color: '#06b6d4', keywords: ['investimento', 'aplicacao', 'aplicação', 'resgate', 'cdb', 'lci', 'debito online td', 'debito online t/d', 'selic', 'tesouro', 'investir'], type: 'expense', isDefault: true, isNeutral: true, excludeFromTotals: true },
  { id: 'transferencia', name: 'Transferência Entre Contas', color: '#a78bfa', keywords: ['sara ingrid', 'sara i s o afonso', 'sara afonso', 'pix recebido', 'pix enviado', 'recebimento de transferencia', 'recebimento de transferência', 'envio de transferencia', 'envio de transferência', 'mesma titularidade', 'conta propria', 'entre contas'], type: 'both', isDefault: true, isNeutral: true, excludeFromTotals: true },
  { id: 'pagamento_fatura', name: 'Pagamento de Fatura', color: '#f97316', keywords: ['pagamento de fatura', 'pagamento fatura cartao', 'pagamento efetuado pagamento fatura', 'pgto fatura', 'fatura', 'invoice', 'payment'], type: 'expense', isDefault: true, isNeutral: true, excludeFromTotals: true },
  { id: 'proventos', name: 'Receitas / Proventos e Dividendos', color: '#22c55e', keywords: ['prov rendimento', 'prov dividendos', 'prov juros s capital', 'credito evento b3', 'crédito evento b3', 'dividendos', 'juros sobre capital'], type: 'income', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'salario', name: 'Salário/Entradas', color: '#22c55e', keywords: ['salario', 'beneficio', 'pagamento', 'venda'], type: 'income', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'outros', name: 'Outros', color: '#64748b', keywords: ['varios', 'outros'], type: 'both', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'uncategorized', name: 'Sem categoria', color: '#cbd5e1', keywords: [], type: 'both', isDefault: true, isNeutral: false, excludeFromTotals: false },
];

const readStorage = (): { transactions: Transaction[]; categories: Category[] } => {
  if (typeof window === 'undefined') {
    return { transactions: [], categories: defaultCategories };
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { transactions: [], categories: defaultCategories };
  }

  try {
    const parsed = JSON.parse(raw) as { transactions?: Transaction[]; categories?: Category[] };
    return {
      transactions: sortTransactionsByDateDesc((parsed.transactions ?? []).map(classifyTransactionFlags)),
      categories: parsed.categories?.length ? parsed.categories : defaultCategories,
    };
  } catch {
    return { transactions: [], categories: defaultCategories };
  }
};

const readRules = (): Rule[] => {
  if (typeof window === 'undefined') return [];

  const raw = window.localStorage.getItem(RULES_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw) as Rule[];
  } catch {
    return [];
  }
};

const persist = (transactions: Transaction[], categories: Category[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ transactions, categories }));
};

const persistRules = (rules: Rule[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RULES_KEY, JSON.stringify(rules));
};

const sortTransactionsByDateDesc = (items: Transaction[]) =>
  [...items].sort((a, b) => {
    const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return (a.id ?? '').localeCompare(b.id ?? '');
  });

export const useTransactions = () => {
  const initialData = readStorage();
  const [transactions, setTransactions] = useState<Transaction[]>(sortTransactionsByDateDesc(initialData.transactions));
  const [categories, setCategories] = useState<Category[]>(initialData.categories);
  const [rules, setRules] = useState<Rule[]>(readRules());

  useEffect(() => {
    persist(transactions, categories);
  }, [transactions, categories]);

  useEffect(() => {
    persistRules(rules);
  }, [rules]);

  const addTransactions = (incoming: Transaction[]) => {
    setTransactions((prev) => {
      const normalizedIncoming = incoming.map(classifyTransactionFlags);
      const map = new Map(prev.map((item) => [item.id, classifyTransactionFlags(item)]));
      const seenFingerprints = new Set(prev.map((item) => buildTransactionFingerprint(item)));

      normalizedIncoming.forEach((item) => {
        const fingerprint = buildTransactionFingerprint(item);

        if (!seenFingerprints.has(fingerprint) && !map.has(item.id)) {
          map.set(item.id, item);
          seenFingerprints.add(fingerprint);
        }
      });

      return sortTransactionsByDateDesc(Array.from(map.values()));
    });
  };

  const addCategory = (category: Omit<Category, 'id'> & { id?: string }) => {
    const newCategory: Category = {
      id: category.id ?? crypto.randomUUID(),
      name: category.name,
      color: category.color,
      icon: category.icon,
      keywords: category.keywords ?? [],
      type: category.type,
      isDefault: false,
    };

    setCategories((prev) => [...prev, newCategory]);
    return newCategory;
  };

  const updateCategory = (categoryId: string, updates: Partial<Category>) => {
    setCategories((prev) =>
      prev.map((category) => (category.id === categoryId ? { ...category, ...updates } : category)),
    );
  };

  const deleteCategory = (categoryId: string) => {
    setCategories((prev) => prev.filter((category) => category.id !== categoryId));
    setTransactions((prev) =>
      prev.map((transaction) =>
        transaction.categoryId === categoryId ? { ...transaction, categoryId: 'uncategorized' } : transaction,
      ),
    );
  };

  const inferCategory = (description: string): string => {
    const normalized = normalizeImportText(description);

    const specificRules = [
      {
        categoryId: 'transferencia',
        match: new RegExp(
          '((sara ingrid|sara i s o afonso|sara afonso).*(pix recebido|pix enviado|recebimento de transferencia|envio de transferencia))|((pix recebido|pix enviado|recebimento de transferencia|envio de transferencia).*(sara ingrid|sara i s o afonso|sara afonso))',
          'i',
        ),
      },
      {
        categoryId: 'pagamento_fatura',
        match: new RegExp('(pagamento fatura cartao|pagamento efetuado.*pagamento fatura|pagamento de fatura|pgto fatura)', 'i'),
      },
      {
        categoryId: 'investimentos',
        match: new RegExp('(aplicacao|resgate|cdb|lci|debito online td|debito online t d|selic|tesouro)', 'i'),
      },
      {
        categoryId: 'proventos',
        match: new RegExp('(prov rendimento|prov dividendos|prov juros s capital|credito evento b3|dividendos|juros sobre capital)', 'i'),
      },
    ];

    for (const rule of specificRules) {
      if (rule.match.test(normalized)) {
        return rule.categoryId;
      }
    }

    for (const category of categories) {
      const matched = category.keywords.some((keyword) => {
        const cleanedKeyword = normalizeImportText(keyword);
        return cleanedKeyword.length > 0 && normalized.includes(cleanedKeyword);
      });

      if (matched) {
        return category.id;
      }
    }

    return 'uncategorized';
  };

  const dashboardSummary = useMemo<DashboardSummary>(() => {
    const getCategoryMeta = (tx: Transaction) => categories.find((category) => category.id === tx.categoryId);

    const activeTransactions = transactions.filter((tx) => {
      const categoryMeta = getCategoryMeta(tx);
      const isExcluded =
        tx.isCreditCardPayment ||
        tx.isInternalTransfer ||
        tx.isInvestment ||
        tx.isNeutral ||
        categoryMeta?.isNeutral ||
        categoryMeta?.excludeFromTotals ||
        tx.categoryId === 'pagamento_fatura';

      return !isExcluded;
    });

    const income = activeTransactions
      .filter((tx) => tx.type === 'income')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const expenses = activeTransactions
      .filter((tx) => tx.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const neutralTotal = transactions
      .filter((tx) => {
        const categoryMeta = getCategoryMeta(tx);
        return (
          tx.isNeutral ||
          tx.isCreditCardPayment ||
          tx.isInternalTransfer ||
          tx.isInvestment ||
          categoryMeta?.isNeutral ||
          categoryMeta?.excludeFromTotals ||
          tx.categoryId === 'pagamento_fatura'
        );
      })
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalInvested = transactions
      .filter((tx) => !tx.isInternalTransfer && tx.isInvestment)
      .reduce((sum, tx) => {
        if (tx.type === 'expense') return sum + tx.amount;
        if (tx.type === 'income') return sum - tx.amount;
        return sum;
      }, 0);

    const balance = income - expenses;
    const averageExpense = expenses > 0 ? expenses / Math.max(1, activeTransactions.filter((tx) => tx.type === 'expense').length) : 0;

    return {
      balance,
      income,
      expenses,
      averageExpense,
      monthCount: new Set(transactions.map((tx) => tx.date.slice(0, 7))).size,
      neutralTotal,
      totalInvested,
    };
  }, [categories, transactions]);

  const updateTransactionCategory = (transactionId: string, categoryId: string) => {
    setTransactions((prev) =>
      prev.map((transaction) =>
        transaction.id === transactionId
          ? { ...transaction, categoryId, updatedAt: new Date().toISOString() }
          : transaction,
      ),
    );
  };

  const updateTransaction = (transactionId: string, updates: Partial<Transaction>) => {
    setTransactions((prev) =>
      prev.map((transaction) =>
        transaction.id === transactionId
          ? {
              ...transaction,
              ...updates,
              updatedAt: new Date().toISOString(),
            }
          : transaction,
      ),
    );
  };

  const deleteTransaction = (transactionId: string) => {
    setTransactions((prev) => prev.filter((transaction) => transaction.id !== transactionId));
  };

  const addRule = (rule: Omit<Rule, 'id'> & { id?: string }) => {
    const nextRule: Rule = {
      id: rule.id ?? crypto.randomUUID(),
      categoryId: rule.categoryId,
      keywords: rule.keywords ?? [],
      isActive: rule.isActive ?? true,
    };

    setRules((prev) => [...prev, nextRule]);
    return nextRule;
  };

  const deleteRule = (ruleId: string) => {
    setRules((prev) => prev.filter((rule) => rule.id !== ruleId));
  };

  const resetAllData = () => {
    setTransactions([]);
    setCategories(defaultCategories);
    setRules([]);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(RULES_KEY);
    }
  };

  const importBackup = (payload: BackupPayload) => {
    setTransactions(sortTransactionsByDateDesc(payload.transactions ?? []));
    setCategories(payload.categories?.length ? payload.categories : defaultCategories);
    setRules(payload.rules ?? []);
  };

  const exportBackup = (): BackupPayload => ({
    transactions,
    categories,
    rules,
    exportedAt: new Date().toISOString(),
  });

  return {
    transactions,
    categories,
    rules,
    addTransactions,
    addCategory,
    updateCategory,
    deleteCategory,
    inferCategory,
    dashboardSummary,
    setTransactions,
    updateTransaction,
    updateTransactionCategory,
    deleteTransaction,
    addRule,
    deleteRule,
    resetAllData,
    importBackup,
    exportBackup,
  };
};
