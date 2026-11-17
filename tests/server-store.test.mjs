import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ITEM = '11111111-1111-4111-8111-111111111111';
const load = () => import('../server/store.mjs');
const account = { id: 'account-A', itemId: ITEM, name: 'Conta sintética', type: 'BANK', currencyCode: 'BRL', balanceCents: 12345 };
const transaction = (id = 'p1') => ({ id: `account-A:${id}`, providerTransactionId: id, accountId: 'account-A', date: '2026-11-01', description: 'Compra sintética', amountCents: 1999, type: 'expense', categoryId: null, manualCategory: false, source: 'pluggy', providerStatus: 'POSTED', currencyCode: 'BRL', bankName: 'Banco sintético', createdAt: '2026-11-01T12:00:00Z' });
const batch = (transactions = [transaction(), transaction('p2')]) => ({ accounts: [account], transactions, status: 'UPDATED', providerUpdatedAt: '2026-10-31T12:00:00Z', consentExpiresAt: '2027-01-01T00:00:00Z' });

test('sync stores integer cents idempotently while retaining equal purchases with distinct IDs', async () => {
  const { Store } = await load();
  const store = new Store();
  try {
    store.registerConnection({ itemId: ITEM, label: 'Teste' });
    store.applySync(ITEM, batch(), '2026-11-02T00:00:00Z');
    store.applySync(ITEM, batch(), '2026-11-03T00:00:00Z');
    const snapshot = store.snapshot(true);
    assert.equal(snapshot.transactions.length, 2);
    assert.equal(snapshot.transactions[0].amount, 19.99);
    assert.equal(snapshot.accounts[0].balanceCents, 12345);
    assert.equal(snapshot.connections[0].lastFetchedAt, '2026-11-03T00:00:00Z');
    assert.equal(snapshot.connections[0].providerUpdatedAt, '2026-10-31T12:00:00Z');
    assert.equal(store.db.prepare('SELECT typeof(amount_cents) AS kind FROM transactions LIMIT 1').get().kind, 'integer');
  } finally { store.close(); }
});

test('local overrides and hidden history survive sync and remain exportable without mutating provider data', async () => {
  const { Store } = await load();
  const store = new Store();
  try {
    store.registerConnection({ itemId: ITEM, label: 'Teste' });
    store.applySync(ITEM, batch(), '2026-11-02T00:00:00Z');
    store.patchTransaction('account-A:p1', { categoryId: 'food', description: 'Meu texto' });
    store.hideTransaction('account-A:p2');
    store.applySync(ITEM, batch(), '2026-11-03T00:00:00Z');
    const tx = store.snapshot(true).transactions;
    assert.equal(tx.length, 1);
    assert.equal(tx[0].description, 'Meu texto');
    assert.equal(tx[0].categoryId, 'food');
    assert.equal(tx[0].manualCategory, true);
    const backup = store.backup();
    assert.equal(backup.schemaVersion, 3);
    assert.equal(backup.transactions.length, 2);
    assert.equal(backup.transactions[0].description, 'Compra sintética');
    assert.equal(backup.overrides.find(o => o.transactionId === 'account-A:p2').hidden, true);
    assert.throws(() => store.patchTransaction('absent', { description: 'X' }), /encontrad/i);
    assert.throws(() => store.patchTransaction('account-A:p1', { amount: 99 }), /campo/i);
    assert.throws(() => store.patchTransaction('account-A:p1', { description: '' }), /descri/i);
    store.patchTransaction('account-A:p1', { categoryId: null });
    assert.equal(store.snapshot(true).transactions[0].manualCategory, true);
  } finally { store.close(); }
});

test('failed and empty syncs preserve history; a broken batch rolls back all writes', async () => {
  const { Store } = await load();
  const store = new Store();
  try {
    store.registerConnection({ itemId: ITEM, label: 'Teste' });
    store.applySync(ITEM, batch(), '2026-11-02T00:00:00Z');
    const before = store.snapshot(true);
    assert.throws(() => store.applySync(ITEM, { ...batch(), accounts: [{ ...account, balanceCents: 99 }], transactions: [{ ...transaction(), amountCents: 1.5 }] }, 'later'));
    assert.deepEqual(store.snapshot(true), before);
    store.recordSyncError(ITEM, 'Consentimento expirado.');
    assert.equal(store.snapshot(true).connections[0].lastFetchedAt, before.connections[0].lastFetchedAt);
    assert.equal(store.snapshot(true).connections[0].lastError, 'Consentimento expirado.');
    store.applySync(ITEM, { ...batch([]), accounts: [] }, '2026-11-03T00:00:00Z');
    assert.equal(store.snapshot(true).transactions.length, 2);
    assert.equal(store.snapshot(true).accounts.length, 1);
    assert.equal(store.snapshot(true).connections[0].lastError, null);
  } finally { store.close(); }
});

test('sync rejects cross-item ownership and unsafe cents without changing existing records', async () => {
  const { Store } = await load();
  const store = new Store();
  const other = '22222222-2222-4222-8222-222222222222';
  try {
    store.registerConnection({ itemId: ITEM, label: 'Um' });
    store.registerConnection({ itemId: other, label: 'Dois' });
    store.applySync(ITEM, batch(), 'first');
    const before = store.snapshot(true);
    assert.throws(() => store.applySync(other, batch(), 'later'), /conta|item/i);
    assert.throws(() => store.applySync(ITEM, { ...batch(), transactions: [{ ...transaction(), amountCents: 9007199254740992 }] }, 'later'), /valor|centavos/i);
    assert.throws(() => store.applySync(ITEM, { ...batch(), accounts: [{ ...account, balanceCents: 9007199254740992 }] }, 'later'), /valor|centavos/i);
    assert.throws(() => store.applySync('absent', { ...batch([]), accounts: [] }, 'later'), /conexão/i);
    assert.deepEqual(store.snapshot(true), before);
  } finally { store.close(); }
});

test('registration rejects malformed IDs, duplicate items and the sixth connection', async () => {
  const { Store } = await load();
  const store = new Store();
  try {
    assert.throws(() => store.registerConnection({ itemId: '../bad', label: 'x' }), /UUID/);
    assert.throws(() => store.registerConnection({ itemId: ITEM, label: ' ' }), /nome/i);
    store.registerConnection({ itemId: ITEM, label: 'Um' });
    assert.throws(() => store.registerConnection({ itemId: ITEM, label: 'duplicado' }), /registrad/i);
    for (let i = 2; i <= 5; i++) store.registerConnection({ itemId: `${i}1111111-1111-4111-8111-111111111111`, label: `Banco ${i}` });
    assert.throws(() => store.registerConnection({ itemId: '61111111-1111-4111-8111-111111111111', label: 'Seis' }), /cinco/i);
    assert.equal(store.connections().length, 5);
  } finally { store.close(); }
});

test('SQLite versioned store persists registered connections across reopening', async () => {
  const { Store } = await load();
  const dir = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'tracker-store-'));
  try {
    let store = new Store(join(dir, 'tracker.sqlite'));
    assert.equal(store.schemaVersion, 4);
    assert.deepEqual(store.snapshot(false), { configured: false, connections: [], accounts: [], transactions: [] });
    const connection = store.registerConnection({ itemId: ITEM, label: 'Banco sintético' });
    assert.equal(connection.id, ITEM);
    store.close();
    store = new Store(join(dir, 'tracker.sqlite'));
    assert.deepEqual(store.snapshot(true).connections, [{
      id: ITEM, label: 'Banco sintético', status: 'REGISTERED', lastFetchedAt: null,
      providerUpdatedAt: null, consentExpiresAt: null, lastError: null,
    }]);
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
