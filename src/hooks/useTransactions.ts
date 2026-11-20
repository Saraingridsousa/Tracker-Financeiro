import { useMemo } from 'react';
import { getFinanceStore, useFinanceCollection } from '../data/financeStore';
import { defaultCategories } from '../data/defaultCategories';
import { pickManualOverrides, transactionScope, upsertTransactions } from '../data/transactionIdentity';

import type { Category, DashboardSummary, Rule, Transaction } from '../types/finance';

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

export const useTransactions = () => {
  const [transactions, setTransactions] = useFinanceCollection('transactions');
  const [categories, setCategories] = useFinanceCollection('categories');
  const [rules, setRules] = useFinanceCollection('rules');

  const addTransactions = (incoming: Transaction[]) => getFinanceStore().update(data => ({ ...data, transactions: upsertTransactions(data.transactions, incoming.map(classifyTransactionFlags)) }));

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
    return getFinanceStore().update(data => {
      if (categoryId === 'uncategorized') throw new Error('A categoria de recuperação não pode ser removida.');
      const categories = data.categories.filter(category => category.id !== categoryId);
      if (!categories.some(category => category.id === 'uncategorized')) categories.push(structuredClone(defaultCategories.find(category => category.id === 'uncategorized')!));
      return {
        ...data, categories,
        rules: data.rules.filter(rule => rule.categoryId !== categoryId),
        transactions: data.transactions.map(transaction => {
          const manualOverrides = transaction.manualOverrides?.categoryId === categoryId ? { ...transaction.manualOverrides, categoryId: 'uncategorized' } : transaction.manualOverrides;
          return { ...transaction, manualOverrides, categoryId: transaction.categoryId === categoryId ? 'uncategorized' : transaction.categoryId };
        }),
      };
    });
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
          ? { ...transaction, categoryId, categoryManuallyAssigned: true, manualOverrides: { ...transaction.manualOverrides, categoryId }, updatedAt: new Date().toISOString() }
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
              identityScope: transactionScope(transaction),
              id: transaction.id,
              manualOverrides: { ...transaction.manualOverrides, ...pickManualOverrides(updates) },
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

  const resetAllData = () => getFinanceStore().update(data => ({ ...data, transactions: [], categories: structuredClone(defaultCategories), rules: [] }), true);
  const importBackup = (payload: unknown) => getFinanceStore().restore(payload, true);
  const exportBackup = () => getFinanceStore().getStatus().snapshot;

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
