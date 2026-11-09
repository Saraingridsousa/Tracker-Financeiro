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
