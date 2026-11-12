import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTransaction } from '../server/pluggy.mjs';
import { Store } from '../server/store.mjs';
import { summarizeTransactions } from '../src/domain/finance.ts';

const ITEM = '11111111-1111-4111-8111-111111111111';
const account = { id: 'card', itemId: ITEM, name: 'Cartão sintético', type: 'CREDIT', currencyCode: 'BRL', balanceCents: 0 };
const raw = (description, amount = -150) => ({ id: description, description, amount, date: '2026-11-09', type: 'CREDIT', status: 'POSTED' });

test('documented Statement Payment is neutral through normalization, SQLite snapshot and result summary', () => {
  const store = new Store();
  try {
    store.registerConnection({ itemId: ITEM, label: 'Sintético' });
    const payment = normalizeTransaction(raw('Statement Payment'), account);
    store.applySync(ITEM, { accounts: [account], transactions: [payment], status: 'UPDATED' }, 'now');
    const snapshot = store.snapshot(true);
    const result = summarizeTransactions(snapshot.transactions);
    assert.equal(result.income, 0);
    assert.equal(result.expenses, 0);
    assert.equal(result.balance, 0);
    assert.equal(result.neutralTotal, 150);
    assert.equal(snapshot.transactions[0].isCreditCardPayment, true);
  } finally { store.close(); }
});

test('refunds, reversals and cashback do not become invoice payments merely because a card amount is negative', () => {
  const rows = ['Estorno de compra', 'Cashback', 'Refund', 'Statement Payment Refund'].map(description => normalizeTransaction(raw(description, -20), account));
  for (const row of rows) assert.equal(row.isCreditCardPayment, false, row.description);
  const result = summarizeTransactions(rows.map(row => ({ ...row, amount: row.amountCents / 100 })));
  assert.equal(result.income, 80);
  assert.equal(result.neutralTotal, 0);
});

test('persisted manual Saúde correction wins over aplicação text through the actual server-to-summary path', () => {
  const store = new Store();
  try {
    store.registerConnection({ itemId: ITEM, label: 'Sintético' });
    const transaction = normalizeTransaction(raw('PIX CLINICA APLICACAO DE INSULINA', 45), account);
    store.applySync(ITEM, { accounts: [account], transactions: [transaction], status: 'UPDATED' }, 'now');
    store.patchTransaction(transaction.id, { categoryId: 'saude' });
    const categories = [{ id: 'saude', name: 'Saúde', type: 'expense', keywords: [], color: '#000' }];
    const active = store.snapshot(true).transactions;
    assert.equal(active[0].manualCategory, true);
    assert.equal(summarizeTransactions(active, categories).expenses, 45);
    assert.equal(summarizeTransactions(active, categories).totalInvested, 0);
  } finally { store.close(); }
});
