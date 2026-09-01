import { useEffect, useMemo, useState } from 'react';

import type { Category, DashboardSummary, Transaction } from '../types/finance';

const STORAGE_KEY = 'tracker-financeiro:data';

const defaultCategories: Category[] = [
  { id: 'alimentacao', name: 'Alimentação', color: '#ef4444', keywords: ['uber', 'restaurante', 'mercado', 'padaria', 'delivery'], type: 'expense', isDefault: true },
  { id: 'moradia', name: 'Moradia', color: '#f59e0b', keywords: ['aluguel', 'condominio', 'luz', 'água', 'internet'], type: 'expense', isDefault: true },
  { id: 'transporte', name: 'Transporte', color: '#3b82f6', keywords: ['uber', 'metro', 'onibus', 'combustivel', 'posto'], type: 'expense', isDefault: true },
  { id: 'lazer', name: 'Lazer', color: '#8b5cf6', keywords: ['cinema', 'spotify', 'streaming', 'ingresso'], type: 'expense', isDefault: true },
  { id: 'saude', name: 'Saúde', color: '#10b981', keywords: ['farmacia', 'medico', 'consulta', 'dentista'], type: 'expense', isDefault: true },
  { id: 'investimentos', name: 'Investimentos', color: '#06b6d4', keywords: ['investimento', 'aplicacao', 'tesouro'], type: 'expense', isDefault: true },
  { id: 'salario', name: 'Salário/Entradas', color: '#22c55e', keywords: ['salario', 'beneficio', 'pagamento', 'venda'], type: 'income', isDefault: true },
  { id: 'outros', name: 'Outros', color: '#64748b', keywords: ['varios', 'outros'], type: 'both', isDefault: true },
  { id: 'uncategorized', name: 'Sem categoria', color: '#cbd5e1', keywords: [], type: 'both', isDefault: true },
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

const persist = (transactions: Transaction[], categories: Category[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ transactions, categories }));
};

export const useTransactions = () => {
  const initialData = readStorage();
  const [transactions, setTransactions] = useState<Transaction[]>(initialData.transactions);
  const [categories, setCategories] = useState<Category[]>(initialData.categories);

  useEffect(() => {
    persist(transactions, categories);
  }, [transactions, categories]);

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
    const income = transactions
      .filter((tx) => tx.type === 'income')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const expenses = transactions
      .filter((tx) => tx.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const balance = income - expenses;
    const averageExpense = expenses > 0 ? expenses / Math.max(1, transactions.filter((tx) => tx.type === 'expense').length) : 0;

    return {
      balance,
      income,
      expenses,
      averageExpense,
      monthCount: new Set(transactions.map((tx) => tx.date.slice(0, 7))).size,
    };
  }, [transactions]);

  const updateTransactionCategory = (transactionId: string, categoryId: string) => {
    setTransactions((prev) =>
      prev.map((transaction) =>
        transaction.id === transactionId
          ? { ...transaction, categoryId, updatedAt: new Date().toISOString() }
          : transaction,
      ),
    );
  };

  return {
    transactions,
    categories,
    addTransactions,
    addCategory,
    updateCategory,
    deleteCategory,
    inferCategory,
    dashboardSummary,
    setTransactions,
    updateTransactionCategory,
  };
};
