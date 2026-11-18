import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Store } from '../server/store.mjs';
import { normalizeAccount, normalizeTransaction } from '../server/pluggy.mjs';
import { FinanceState } from '../shared/financeState.mjs';

// Legacy validation and persisted compatibility remain covered without exposing
// a restore/import control in the connected-only application.
const category = { id: 'custom', name: 'Personalizada', color: '#000000', keywords: ['sintetica'], type: 'both' };
const transaction = { id: 'legacy-before', date: '2026-11-09', description: 'Compra sintetica', amount: 10, type: 'expense', categoryId: category.id, source: 'import', createdAt: '2026-11-09T12:00:00.000Z' };
const rule = { id: 'rule-before', categoryId: category.id, keywords: ['sintetica'], isActive: true };
const asset = { id: 'asset-before', tickerOrName: 'SINTETICO', type: 'Outros', quantity: 1, avgPrice: 100, currentPrice: 100 };
const order = { id: 'order-before', assetId: asset.id, ticker: asset.tickerOrName, type: asset.type, operation: 'BUY', date: '2026-11-09', quantity: 1, unitPrice: 100, totalValue: 100 };
const initial = () => structuredClone({ transactions: [transaction], categories: [category], rules: [rule], assets: [asset], investmentOrders: [order], exportedAt: '2026-11-09T12:00:00.000Z' });
const settle = () => new Promise(resolve => setImmediate(resolve));
async function withModel(run) {
 const store = new Store(); let saves = 0, drafts = 0;
 try {
  store.saveSharedState(0, initial());
  const model = new FinanceState({ load: async () => store.sharedState(), save: async (revision, payload) => { saves++; return store.saveSharedState(revision, payload); } }, { persistDraft: () => { drafts++; } });
  await model.load();
  return await run({ store, model, saves: () => saves, drafts: () => drafts });
 } finally { store.close(); }
}
function bankingBackup() {
 const store = new Store();
 const itemId = '11111111-1111-4111-8111-111111111111';
 const account = { id: 'synthetic-account', itemId, name: 'Sintetica', type: 'BANK', currencyCode: 'BRL', balance: 100 };
 try {
  store.registerConnection({ itemId, label: 'Sintetica' });
  store.applySync(itemId, { accounts: [normalizeAccount(account, itemId)], transactions: [normalizeTransaction({ id: 'synthetic-tx', accountId: account.id, description: 'Compra sintetica', date: '2026-11-09', amount: -25, type: 'DEBIT', status: 'POSTED', currencyCode: 'BRL' }, account)], status: 'UPDATED' }, '2026-11-09T12:00:00Z');
  return store.backup();
 } finally { store.close(); }
}
function legacyBackup() {
 return structuredClone({ transactions: [{ ...transaction, id: 'restored-tx' }], categories: [category], rules: [rule], assets: [{ ...asset, id: 'restored-asset' }], investmentOrders: [{ ...order, id: 'restored-order', assetId: 'restored-asset' }], exportedAt: '2026-11-09T12:00:00.000Z' });
}
async function assertRejected(payload, message = /backup|formato|invalido|inválido/i) {
 return withModel(async ({ store, model, saves, drafts }) => {
  const before = store.sharedState(), beforeModel = structuredClone(model.state);
  assert.throws(() => model.restore(typeof payload === 'string' ? payload : JSON.stringify(payload)), message);
  await settle();
  assert.equal(saves(), 0); assert.equal(drafts(), 0);
  assert.deepEqual(store.sharedState(), before);
  assert.deepEqual(model.state, beforeModel);
 });
}
test('F1: banking backup is rejected before legacy recovery writes or loses data', async () => { await assertRejected(bankingBackup(), /banc[aá]ri[oa]/i); });
test('F1: legacy recovery validates the entire document before any persistence', async t => {
  const cases = [
    ['null', () => null],
    ['array', () => []],
    ['objeto vazio', () => ({})],
    ['transactions ausente', p => { delete p.transactions; return p; }],
    ['categories ausente', p => { delete p.categories; return p; }],
    ['rules ausente', p => { delete p.rules; return p; }],
    ['exportedAt invalido', p => { p.exportedAt = 'ontem'; return p; }],
    ['secao nula', p => { p.rules = null; return p; }],
    ['carteira incompleta', p => { delete p.investmentOrders; return p; }],
    ['transacao sem amount', p => { delete p.transactions[0].amount; return p; }],
    ['amount textual', p => { p.transactions[0].amount = '10'; return p; }],
    ['amount nulo', p => { p.transactions[0].amount = null; return p; }],
    ['amount acima da precisao segura', p => { p.transactions[0].amount = 1e100; return p; }],
    ['data impossivel', p => { p.transactions[0].date = '2026-02-30'; return p; }],
    ['tipo invalido', p => { p.transactions[0].type = 'DEBIT'; return p; }],
    ['origem bancaria disfarcada', p => { p.transactions[0].source = 'pluggy'; return p; }],
    ['descricao nao textual', p => { p.transactions[0].description = {}; return p; }],
    ['id vazio', p => { p.transactions[0].id = ' '; return p; }],
    ['id duplicado', p => { p.transactions.push({ ...p.transactions[0] }); return p; }],
    ['createdAt invalido', p => { p.transactions[0].createdAt = 'nao-data'; return p; }],
    ['flag nao booleana', p => { p.transactions[0].isSelfTransfer = 'false'; return p; }],
    ['categoria sem keywords', p => { delete p.categories[0].keywords; return p; }],
    ['categoria invalida', p => { p.categories[0].name = 3; return p; }],
    ['tipo categoria invalido', p => { p.categories[0].type = 'debit'; return p; }],
    ['regra invalida', p => { p.rules[0].isActive = 'true'; return p; }],
    ['keyword invalida', p => { p.rules[0].keywords = [3]; return p; }],
    ['ativo invalido', p => { p.assets[0].currentPrice = '100'; return p; }],
    ['ativo negativo', p => { p.assets[0].quantity = -1; return p; }],
    ['tipo ativo invalido', p => { p.assets[0].type = 'Desconhecido'; return p; }],
    ['alocacao invalida', p => { p.assets[0].targetAllocationPercent = 101; return p; }],
    ['ultima ordem invalida', p => { p.investmentOrders.push({ ...p.investmentOrders[0], id: 'last', unitPrice: '100' }); return p; }],
    ['operacao invalida', p => { p.investmentOrders[0].operation = 'TRANSFER'; return p; }],
    ['quantidade ordem negativa', p => { p.investmentOrders[0].quantity = -1; return p; }],
    ['data ordem invalida', p => { p.investmentOrders[0].date = '2026-13-09'; return p; }],
    ['versao desconhecida', p => { p.version = 99; return p; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, () => assertRejected(mutate(legacyBackup())));
  await t.test('JSON invalido', () => assertRejected('{"transactions":', /JSON|backup|formato/i));
  await t.test('numero nao finito no JSON', () => assertRejected(JSON.stringify(legacyBackup()).replace('"amount":10', '"amount":1e999')));
});
test('F1: legacy documents without optional investment sections preserve the saved wallet', async () => {
 await withModel(async ({ store, model }) => {
  const before = initial(); const payload = legacyBackup(); delete payload.assets; delete payload.investmentOrders;
  model.restore(JSON.stringify(payload)); await settle();
  assert.equal(model.state.error, '');
  const saved = store.sharedState().payload;
  assert.deepEqual(saved.transactions, payload.transactions); assert.deepEqual(saved.categories, payload.categories); assert.deepEqual(saved.rules, payload.rules);
  assert.deepEqual(saved.assets, before.assets); assert.deepEqual(saved.investmentOrders, before.investmentOrders);
 });
});
test('F1: explicit empty sections remain valid in legacy recovery, never applied by connected-only boot', async () => {
 await withModel(async ({ store, model }) => {
  model.restore(JSON.stringify({ transactions: [], categories: [category], rules: [], assets: [], investmentOrders: [], exportedAt: '2026-11-09T12:00:00.000Z' })); await settle();
  assert.equal(model.state.error, '');
  const saved = store.sharedState().payload;
  assert.deepEqual(saved.categories, [category]);
  for (const key of ['transactions', 'rules', 'assets', 'investmentOrders']) assert.deepEqual(saved[key], []);
 });
});
test('F1: complete legacy document retains all sections through SQLite recovery', async () => {
 await withModel(async ({ store, model }) => {
  const payload = legacyBackup(); model.restore(JSON.stringify(payload)); await settle();
  assert.equal(model.state.error, '');
  for (const key of ['transactions', 'categories', 'rules', 'assets', 'investmentOrders']) assert.deepEqual(store.sharedState().payload[key], payload[key]);
 });
});
