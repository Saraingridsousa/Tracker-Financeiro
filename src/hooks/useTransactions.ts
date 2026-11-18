import type { Dispatch, SetStateAction } from 'react';
import type { SharedBacking } from './useSharedFinance';
import { useEffect, useMemo, useState } from 'react';
import { classifyTransaction, inferCategory as inferCategoryFromRules, summarizeTransactions } from '../domain/finance';

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

const classifyTransactionFlags = (transaction: Transaction): Transaction => classifyTransaction(transaction);

const buildTransactionFingerprint = (transaction: Pick<Transaction, 'date' | 'description' | 'amount' | 'type'>) => {
  const normalized = normalizeImportText(`${transaction.date}|${transaction.description}|${Math.abs(transaction.amount).toFixed(2)}|${transaction.type}`);
  return normalized;
};

const defaultCategories: Category[] = [
  { id: 'alimentacao', name: 'Alimentação', color: '#ef4444', keywords: ['restaurante', 'mercado', 'padaria', 'delivery'], type: 'expense', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'moradia', name: 'Moradia', color: '#f59e0b', keywords: ['aluguel', 'condominio', 'luz', 'água', 'internet'], type: 'expense', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'transporte', name: 'Transporte', color: '#3b82f6', keywords: ['uber', 'metro', 'onibus', 'combustivel', 'posto'], type: 'expense', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'lazer', name: 'Lazer', color: '#8b5cf6', keywords: ['cinema', 'spotify', 'streaming', 'ingresso'], type: 'expense', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'saude', name: 'Saúde', color: '#10b981', keywords: ['farmacia', 'medico', 'consulta', 'dentista'], type: 'expense', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'investimentos', name: 'Investimentos', color: '#06b6d4', keywords: ['investimento', 'aplicacao', 'aplicação', 'resgate', 'cdb', 'lci', 'debito online td', 'debito online t/d', 'selic', 'tesouro', 'investir'], type: 'expense', isDefault: true, isNeutral: true, excludeFromTotals: true },
  { id: 'transferencia', name: 'Transferência Entre Contas', color: '#a78bfa', keywords: ['mesma titularidade', 'conta propria', 'conta própria', 'entre contas'], type: 'both', isDefault: true, isNeutral: true, excludeFromTotals: true },
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

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { transactions: [], categories: defaultCategories };
    }

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

  try {
    const raw = window.localStorage.getItem(RULES_KEY);
    if (!raw) return [];

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

export const useTransactions = (shared?: SharedBacking, localWritable = true) => {
  const canReadLocal = !shared && localWritable;
  const [initialData] = useState(() => canReadLocal ? readStorage() : { transactions: [], categories: defaultCategories });
  const [localTransactions, setLocalTransactions] = useState<Transaction[]>(sortTransactionsByDateDesc(initialData.transactions));
  const [localCategories, setLocalCategories] = useState<Category[]>(initialData.categories);
  const [localRules, setLocalRules] = useState<Rule[]>(() => canReadLocal ? readRules() : []);
  const [localHydrated, setLocalHydrated] = useState(canReadLocal);

  const transactions = shared?.payload?.transactions ?? localTransactions;
  const categories = shared?.payload?.categories ?? localCategories;
  const rules = shared?.payload?.rules ?? localRules;
  const setTransactions: Dispatch<SetStateAction<Transaction[]>> = shared ? update => shared.set('transactions', update) : setLocalTransactions;
  const setCategories: Dispatch<SetStateAction<Category[]>> = shared ? update => shared.set('categories', update) : setLocalCategories;
  const setRules: Dispatch<SetStateAction<Rule[]>> = shared ? update => shared.set('rules', update) : setLocalRules;

  useEffect(() => {
    if (!canReadLocal || localHydrated) return;
    const next = readStorage();
    setLocalTransactions(sortTransactionsByDateDesc(next.transactions));
    setLocalCategories(next.categories);
    setLocalRules(readRules());
    setLocalHydrated(true);
  }, [canReadLocal, localHydrated]);

  useEffect(() => {
    if (canReadLocal && localHydrated) persist(transactions, categories);
  }, [transactions, categories, canReadLocal, localHydrated]);

  useEffect(() => {
    if (canReadLocal && localHydrated) persistRules(rules);
  }, [rules, canReadLocal, localHydrated]);

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
      isNeutral: category.isNeutral ?? false,
      excludeFromTotals: category.excludeFromTotals ?? false,
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

  const inferCategory = (description: string, type?: Transaction['type']): string => inferCategoryFromRules(description, categories, rules, type);

  const dashboardSummary = useMemo<DashboardSummary>(() => summarizeTransactions(transactions, categories), [categories, transactions]);

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
    if (!shared && localWritable && typeof window !== 'undefined') {
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
    localReady: localHydrated,
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
    exportLocalBackup: (): BackupPayload => ({ ...readStorage(), rules: readRules(), exportedAt: new Date().toISOString() }),
  };
};
