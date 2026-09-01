import { useEffect, useMemo, useState } from 'react';

import type { BackupPayload, Category, DashboardSummary, Rule, Transaction } from '../types/finance';

const STORAGE_KEY = 'tracker-financeiro:data';
const RULES_KEY = 'tracker-financeiro:rules';

const defaultCategories: Category[] = [
  { id: 'alimentacao', name: 'Alimentação', color: '#ef4444', keywords: ['uber', 'restaurante', 'mercado', 'padaria', 'delivery'], type: 'expense', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'moradia', name: 'Moradia', color: '#f59e0b', keywords: ['aluguel', 'condominio', 'luz', 'água', 'internet'], type: 'expense', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'transporte', name: 'Transporte', color: '#3b82f6', keywords: ['uber', 'metro', 'onibus', 'combustivel', 'posto'], type: 'expense', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'lazer', name: 'Lazer', color: '#8b5cf6', keywords: ['cinema', 'spotify', 'streaming', 'ingresso'], type: 'expense', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'saude', name: 'Saúde', color: '#10b981', keywords: ['farmacia', 'medico', 'consulta', 'dentista'], type: 'expense', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'investimentos', name: 'Investimentos', color: '#06b6d4', keywords: ['investimento', 'aplicacao', 'aplicação', 'tesouro', 'aplicação', 'investir'], type: 'expense', isDefault: true, isNeutral: true, excludeFromTotals: true },
  { id: 'transferencia', name: 'Transferência Entre Contas', color: '#a78bfa', keywords: ['mesma titularidade', 'pix enviado', 'pix enviado - sofisa', 'transferencia', 'transferência', 'mesma titularidade', 'sofisa', 'inter', 'bb', 'picpay', 'conta propria', 'entre contas'], type: 'both', isDefault: true, isNeutral: true, excludeFromTotals: true },
  { id: 'pagamento_fatura', name: 'Pagamento de Fatura', color: '#f97316', keywords: ['pagamento de fatura', 'pgto fatura', 'fatura', 'invoice', 'payment'], type: 'expense', isDefault: true, isNeutral: true, excludeFromTotals: true },
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
      transactions: parsed.transactions ?? [],
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

export const useTransactions = () => {
  const initialData = readStorage();
  const [transactions, setTransactions] = useState<Transaction[]>(initialData.transactions);
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
      const map = new Map(prev.map((item) => [item.id, item]));

      incoming.forEach((item) => {
        if (!map.has(item.id)) {
          map.set(item.id, item);
        }
      });

      return Array.from(map.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
    const normalized = description.toLowerCase();

    for (const category of categories) {
      const matched = category.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
      if (matched) {
        return category.id;
      }
    }

    return 'uncategorized';
  };

  const dashboardSummary = useMemo<DashboardSummary>(() => {
    const getCategoryMeta = (tx: Transaction) => categories.find((category) => category.id === tx.categoryId);

    const activeTransactions = transactions.filter((tx) => !getCategoryMeta(tx)?.isNeutral && !getCategoryMeta(tx)?.excludeFromTotals);

    const income = activeTransactions
      .filter((tx) => tx.type === 'income')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const expenses = activeTransactions
      .filter((tx) => tx.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const neutralTotal = transactions
      .filter((tx) => getCategoryMeta(tx)?.isNeutral || getCategoryMeta(tx)?.excludeFromTotals)
      .reduce((sum, tx) => sum + tx.amount, 0);

    const balance = income - expenses;
    const averageExpense = expenses > 0 ? expenses / Math.max(1, activeTransactions.filter((tx) => tx.type === 'expense').length) : 0;

    return {
      balance,
      income,
      expenses,
      averageExpense,
      monthCount: new Set(transactions.map((tx) => tx.date.slice(0, 7))).size,
      neutralTotal,
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
    setTransactions(payload.transactions ?? []);
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
    updateTransactionCategory,
    addRule,
    deleteRule,
    resetAllData,
    importBackup,
    exportBackup,
  };
};
