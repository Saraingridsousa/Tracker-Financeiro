import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyTransaction } from './finance.ts';
import * as finance from './finance.ts';
import type { Category, Rule } from '../types/finance';

const base = { id: 'pix-1', date: '2026-11-08', description: 'Pix enviado para Padaria', amount: 24.5, type: 'expense' as const, categoryId: 'alimentacao', source: 'import' as const, createdAt: '2026-11-08T12:00:00Z' };

test('Pix de terceiros não é transferência própria e não é neutro', () => {
  const tx = classifyTransaction(base);
  assert.equal(tx.isInternalTransfer, false);
  assert.equal(tx.isNeutral, false);
});

const categories: Category[] = [
  { id: 'alimentacao', name: 'Alimentação', color: '#000', keywords: ['padaria'], type: 'expense' },
  { id: 'lazer', name: 'Lazer', color: '#000', keywords: [], type: 'expense' },
  { id: 'transferencia', name: 'Entre contas', color: '#000', keywords: ['pix enviado', 'pix recebido'], type: 'both', isNeutral: true },
];

test('Regra ativa mais específica precede keyword e regra genérica', () => {
  const rules: Rule[] = [
    { id: 'r1', categoryId: 'alimentacao', keywords: ['padaria'], isActive: true },
    { id: 'r2', categoryId: 'lazer', keywords: ['Padaria do Zé'], isActive: true },
  ];
  assert.equal(finance.inferCategory('PIX PADARIA DO ZE', categories, rules, 'expense'), 'lazer');
  assert.equal(finance.inferCategory('Pix enviado para José', categories, [], 'expense'), 'uncategorized');
});

test('Regra inativa ou categoria removida não recategoriza', () => {
  const rules: Rule[] = [
    { id: 'r1', categoryId: 'lazer', keywords: ['padaria'], isActive: false },
    { id: 'r2', categoryId: 'nao-existe', keywords: ['padaria'], isActive: true },
  ];
  assert.equal(finance.inferCategory('Padaria', categories, rules, 'expense'), 'alimentacao');
});

test('Resumo usa centavos e exclui pendentes, remanejo e moedas diferentes', () => {
  const rows = [
    { ...base, id: 'salary', amount: 100, type: 'income' as const, description: 'Salário' },
    { ...base, id: 'small-1', amount: 0.1 },
    { ...base, id: 'small-2', amount: 0.2 },
    { ...base, id: 'pending', amount: 500, providerStatus: 'PENDING' as const },
    { ...base, id: 'internal', amount: 10, categoryId: 'transferencia' },
    { ...base, id: 'usd', amount: 700, currencyCode: 'USD' },
  ];
  const result = finance.summarizeTransactions(rows, categories);
  assert.equal(result.income, 100);
  assert.equal(result.expenses, 0.3);
  assert.equal(result.balance, 99.7);
  assert.equal(finance.isRealExpense(rows[3]), false);
});

test('Flags antigas de transferência genérica não excluem um Pix de terceiro', () => {
  assert.equal(classifyTransaction({ ...base, isInternalTransfer: true, isSelfTransfer: false, isNeutral: true }).isNeutral, false);
  assert.equal(classifyTransaction({ ...base, categoryId: 'transferencia' }).isSelfTransfer, true);
});

test('Pix recebido de dinheiro de terceiro não entra em entradas', () => {
  const tx = {
    ...base,
    type: 'income' as const,
    description: 'Pix recebido - Jose Ricardo De Sousa Afonso',
    categoryId: 'uncategorized',
  };
  assert.equal(finance.inferCategory(tx.description, categories, [], 'income'), 'transferencia');
  assert.equal(classifyTransaction(tx, categories).isNeutral, true);
  assert.equal(finance.isRealIncome(tx, categories), false);
  assert.equal(finance.summarizeTransactions([tx], categories).income, 0);
});

test('Statement Payment já persistido com flag antiga falsa também não vira renda', () => {
  const tx = { ...base, description: 'Statement Payment', type: 'income' as const, amount: 150, isCreditCardPayment: false, source: 'pluggy' as const };
  assert.equal(finance.summarizeTransactions([tx]).income, 0);
  assert.equal(classifyTransaction(tx).isCreditCardPayment, true);
  assert.equal(classifyTransaction({ ...tx, description: 'Statement Payment Refund' }).isCreditCardPayment, false);
});

const healthCategories: Category[] = [
  { id: 'saude', name: 'Saúde', color: '#000', keywords: ['clinica'], type: 'expense' },
  { id: 'investimentos', name: 'Investimentos', color: '#000', keywords: ['cdb'], type: 'both', isNeutral: true },
];

test('Categoria específica e regra de Saúde vencem regex de aplicação no resumo financeiro', () => {
  const description = 'PIX CLINICA APLICACAO DE INSULINA';
  const rules: Rule[] = [{ id: 'insulina', categoryId: 'saude', keywords: ['aplicacao de insulina'], isActive: true }];
  for (const appliedRules of [[], rules]) {
    // With rules, remove the Saúde keyword: only the explicit rule can select it.
    const available = appliedRules.length ? healthCategories.map(c => c.id === 'saude' ? { ...c, keywords: [] } : c) : healthCategories;
    const categoryId = finance.inferCategory(description, available, appliedRules, 'expense');
    const tx = { ...base, amount: 45, description, categoryId };
    assert.equal(categoryId, 'saude');
    assert.equal(finance.summarizeTransactions([tx], healthCategories).expenses, 45);
    assert.equal(classifyTransaction(tx, healthCategories).isInvestment, false);
  }
});

test('Correção manual Saúde recalcula flags antigas e recupera a despesa de aplicação clínica', () => {
  const tx = { ...base, amount: 45, description: 'APLICACAO DE INSULINA', categoryId: 'saude', manualCategory: true, isInvestment: true, isNeutral: true };
  const classified = classifyTransaction(tx, healthCategories);
  assert.equal(classified.isInvestment, false);
  assert.equal(classified.isNeutral, false);
  assert.equal(finance.summarizeTransactions([classified], healthCategories).expenses, 45);
});

test('Investimentos reais, fallback sem categoria e proventos mantêm políticas distintas', () => {
  for (const categoryId of ['investimentos', 'uncategorized', 'categoria-removida']) {
    const tx = { ...base, amount: 100, description: 'APLICACAO CDB', categoryId };
    const result = finance.summarizeTransactions([tx], healthCategories);
    assert.equal(classifyTransaction(tx, healthCategories).isInvestment, true);
    assert.equal(result.expenses, 0);
    assert.equal(result.totalInvested, 100);
  }
  const redemption = { ...base, amount: 70, type: 'income' as const, description: 'RESGATE TESOURO', categoryId: 'investimentos' };
  assert.equal(finance.summarizeTransactions([redemption], healthCategories).totalInvested, -70);
  const yieldIncome = { ...redemption, amount: 10, categoryId: 'proventos' };
  assert.equal(finance.summarizeTransactions([yieldIncome], healthCategories).income, 10);
  assert.equal(classifyTransaction(yieldIncome, healthCategories).isInvestment, false);
});

test('Categoria neutra e marcações explícitas de transferência/fatura continuam fora do resultado', () => {
  const policies: Category[] = [...healthCategories,
    { id: 'ajuste', name: 'Ajuste', color: '#000', keywords: [], type: 'both', isNeutral: true },
    { id: 'fora', name: 'Fora', color: '#000', keywords: [], type: 'both', excludeFromTotals: true },
  ];
  for (const extra of [{ categoryId: 'ajuste' }, { categoryId: 'fora' }, { categoryId: 'saude', isSelfTransfer: true }, { categoryId: 'saude', isCreditCardPayment: true }]) {
    const tx = { ...base, description: 'APLICACAO DE INSULINA', manualCategory: true, ...extra };
    assert.equal(finance.summarizeTransactions([tx], policies).expenses, 0);
    assert.equal(classifyTransaction(tx, policies).isNeutral, true);
  }
});


test('bank cofrinho contributions and reserved money are allocations, never spending', () => {
  for (const description of ['APORTE NA CARTEIRA COFRINHO SINTÉTICO', 'Dinheiro reservado - Cofrinho do cartão sintético']) {
    const tx = { ...base, description, categoryId: 'uncategorized', amount: 100 };
    const classified = classifyTransaction(tx, healthCategories);
    assert.equal(classified.isInvestment, true, description);
    assert.equal(finance.isRealExpense(tx, healthCategories), false);
    assert.equal(finance.summarizeTransactions([tx], healthCategories).expenses, 0);
    assert.equal(finance.summarizeTransactions([tx], healthCategories).neutralTotal, 100);
    // Explicit user correction still takes priority over description inference.
    assert.equal(classifyTransaction({ ...tx, categoryId: 'saude', manualCategory: true }, healthCategories).isInvestment, false);
  }
  const retail = { ...base, description: 'Compra de cofrinho decorativo', categoryId: 'uncategorized' };
  assert.equal(classifyTransaction(retail, healthCategories).isInvestment, false);
  assert.equal(finance.isRealExpense(retail, healthCategories), true);
});
