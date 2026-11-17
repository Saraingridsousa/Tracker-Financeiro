import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.mjs';
import { normalizeAccount, normalizeTransaction } from '../server/pluggy.mjs';
import { summarizeTransactions } from '../src/domain/finance.ts';

const ITEM = '11111111-1111-4111-8111-111111111111';
const rawAccount = { id: 'account-A', name: 'Sintética', type: 'BANK', currencyCode: 'BRL', balance: 0 };
const raw = (id, extra = {}) => ({ id, providerId: 'provider-stable', providerCode: '00042', date: '2026-11-01', description: 'Compra sintética', amount: -100, type: 'DEBIT', status: 'POSTED', ...extra });
const batch = (rows, account = rawAccount) => ({ accounts: [normalizeAccount(account, ITEM)], transactions: rows.map(t => normalizeTransaction(t, account)), status: 'UPDATED' });
function withStore(fn) {
  const store = new Store();
  try { store.registerConnection({ itemId: ITEM, label: 'Teste' }); return fn(store); }
  finally { store.close(); }
}

test('providerId 1:1 replaces a changed Pluggy ID without counting both versions', () => withStore(store => {
  store.applySync(ITEM, batch([raw('old')]), 'first');
  store.applySync(ITEM, batch([raw('new', { description: 'Compra corrigida' })]), 'second');
  const snapshot = store.snapshot(true);
  assert.equal(snapshot.transactions.length, 1);
  assert.equal(snapshot.transactions[0].providerTransactionId, 'new');
  assert.equal(snapshot.transactions[0].description, 'Compra corrigida');
  assert.equal(snapshot.transactions[0].identityId, 'account-A:old');
  assert.equal(summarizeTransactions(snapshot.transactions).expenses, 100);
  const history = store.backup().transactions;
  assert.equal(history.length, 2);
  assert.equal(history.find(t => t.providerTransactionId === 'old').supersededBy, 'account-A:new');
  assert.equal(history.find(t => t.providerTransactionId === 'old').description, 'Compra sintética');
}));

test('ID replacement carries description, manual category and hide overrides separately from provider data', () => withStore(store => {
  store.applySync(ITEM, batch([raw('old'), raw('hidden-old', { providerId: 'hidden-provider' })]), 'first');
  store.patchTransaction('account-A:old', { description: 'Minha descrição', categoryId: 'saude' });
  store.hideTransaction('account-A:hidden-old');
  store.applySync(ITEM, batch([
    raw('new', { amount: -145, date: '2026-11-03', description: 'Novo texto do banco' }),
    raw('hidden-new', { providerId: 'hidden-provider' }),
  ]), 'second');
  const active = store.snapshot(true).transactions;
  assert.equal(active.length, 1);
  assert.equal(active[0].description, 'Minha descrição');
  assert.equal(active[0].categoryId, 'saude');
  assert.equal(active[0].manualCategory, true);
  assert.equal(active[0].amount, 145);
  assert.equal(active[0].date, '2026-11-03');
  assert.equal(summarizeTransactions(active).expenses, 145);
  const backup = store.backup();
  assert.equal(backup.transactions.find(t => t.id === 'account-A:new').description, 'Novo texto do banco');
  assert.equal(backup.overrides.find(o => o.transactionId === 'account-A:hidden-new').hidden, true);
}));

test('reimporting a retired ID cannot resurrect expenses or rewrite its audited raw version', () => withStore(store => {
  store.applySync(ITEM, batch([raw('old')]), 'first');
  store.applySync(ITEM, batch([raw('new', { amount: -125, date: '2026-11-04' })]), 'second');
  const correction = batch([raw('new', { amount: -125, date: '2026-11-04' })]);
  store.applySync(ITEM, correction, 'repeat');
  store.applySync(ITEM, batch([raw('old', { amount: -999, description: 'Replay de ID aposentado' })]), 'stale');
  assert.equal(summarizeTransactions(store.snapshot(true).transactions).expenses, 125);
  assert.equal(store.backup().transactions.find(t => t.id === 'account-A:old').amountCents, 10000);
  assert.equal(store.backup().transactions.length, 2);
  assert.deepEqual(store.backup().reconciliations, [{ fromId: 'account-A:old', toId: 'account-A:new', providerId: 'provider-stable', reconciledAt: 'second', revokedAt: null }]);
  store.applySync(ITEM, batch([raw('newest', { amount: -130, date: '2026-11-05' })]), 'third');
  assert.equal(store.snapshot(true).transactions.length, 1);
  assert.equal(store.snapshot(true).transactions[0].identityId, 'account-A:old');
  assert.equal(summarizeTransactions(store.snapshot(true).transactions).expenses, 130);
}));

test('simultaneous distinct IDs sharing ambiguous providerId are never merged, in either order', () => {
  for (const reverse of [false, true]) withStore(store => {
    const rows = [raw('one'), raw('two')];
    store.applySync(ITEM, batch(reverse ? rows.reverse() : rows), 'first');
    assert.equal(store.snapshot(true).transactions.length, 2);
    assert.equal(summarizeTransactions(store.snapshot(true).transactions).expenses, 200);
    store.applySync(ITEM, batch([raw('third')]), 'second');
    assert.equal(store.snapshot(true).transactions.length, 3, 'multiple historical candidates are not linked arbitrarily');
    assert.equal(store.backup().reconciliations.length, 0);
  });
});

test('a previously retired ID seen simultaneously with its replacement makes the identity ambiguous', () => withStore(store => {
  store.applySync(ITEM, batch([raw('old')]), 'first');
  store.applySync(ITEM, batch([raw('new')]), 'second');
  store.applySync(ITEM, batch([raw('old'), raw('new')]), 'ambiguous');
  assert.equal(store.snapshot(true).transactions.length, 2);
  assert.equal(summarizeTransactions(store.snapshot(true).transactions).expenses, 200);
  const history = store.backup();
  assert.equal(history.reconciliations[0].revokedAt, 'ambiguous');
  assert.equal(new Set(history.transactions.map(t => t.identityId)).size, 2);
  store.applySync(ITEM, batch([raw('third')]), 'later');
  assert.equal(store.snapshot(true).transactions.length, 3);
}));

test('an existing ID still present in the batch is not retired when its providerId changes', () => withStore(store => {
  store.applySync(ITEM, batch([raw('one')]), 'first');
  store.applySync(ITEM, batch([raw('one', { providerId: 'corrected-provider' }), raw('two')]), 'second');
  assert.equal(store.snapshot(true).transactions.length, 2);
  assert.equal(summarizeTransactions(store.snapshot(true).transactions).expenses, 200);
  assert.equal(store.backup().reconciliations.length, 0);
}));

test('edits and hide requests using a retired ID follow its current version', () => withStore(store => {
  store.applySync(ITEM, batch([raw('old')]), 'first');
  store.applySync(ITEM, batch([raw('new')]), 'second');
  store.patchTransaction('account-A:old', { categoryId: null, description: 'Correção em voo' });
  assert.equal(store.snapshot(true).transactions[0].description, 'Correção em voo');
  assert.equal(store.snapshot(true).transactions[0].manualCategory, true);
  assert.equal(store.snapshot(true).transactions[0].categoryId, null);
  store.hideTransaction('account-A:old');
  assert.equal(store.snapshot(true).transactions.length, 0);
}));

test('equal purchases with distinct bank identifiers survive repeated imports', () => withStore(store => {
  const rows = [raw('one', { providerId: 'bank-one', providerCode: 'code-one' }), raw('two', { providerId: 'bank-two', providerCode: 'code-two' })];
  store.applySync(ITEM, batch(rows), 'first');
  store.applySync(ITEM, batch(rows), 'repeat');
  assert.equal(store.snapshot(true).transactions.length, 2);
  assert.equal(summarizeTransactions(store.snapshot(true).transactions).expenses, 200);
  assert.equal(store.backup().reconciliations.length, 0);
}));

test('providerCode alone and matching amount/date/description never prove replacement', () => {
  for (const providerId of [null, '', '   ', undefined, 42]) withStore(store => {
    store.applySync(ITEM, batch([raw('old', { providerId })]), 'first');
    store.applySync(ITEM, batch([raw('new', { providerId })]), 'second');
    assert.equal(store.snapshot(true).transactions.length, 2);
    assert.equal(summarizeTransactions(store.snapshot(true).transactions).expenses, 200);
    assert.equal(store.backup().reconciliations.length, 0);
  });
});

test('providerId matching never crosses account or item boundaries', () => withStore(store => {
  store.applySync(ITEM, batch([raw('old')]), 'first');
  store.applySync(ITEM, batch([raw('new')], { ...rawAccount, id: 'account-B' }), 'second');
  const other = '22222222-2222-4222-8222-222222222222';
  store.registerConnection({ itemId: other, label: 'Outro item' });
  const foreignBatch = batch([raw('other')], { ...rawAccount, id: 'account-C' });
  foreignBatch.accounts[0].itemId = other;
  store.applySync(other, foreignBatch, 'third');
  assert.equal(store.snapshot(true).transactions.length, 3);
  assert.equal(store.backup().reconciliations.length, 0);
}));

test('failed and empty batches leave identity links, history and overrides intact', () => withStore(store => {
  store.applySync(ITEM, batch([raw('old')]), 'first');
  store.patchTransaction('account-A:old', { categoryId: 'saude' });
  const before = store.backup();
  const broken = batch([raw('new'), raw('invalid', { providerId: 'other' })]);
  broken.transactions[1].amountCents = 0.5;
  assert.throws(() => store.applySync(ITEM, broken, 'broken'), /centavos/);
  const after = store.backup();
  delete before.exportedAt; delete after.exportedAt;
  assert.deepEqual(after, before);
  store.applySync(ITEM, batch([]), 'empty');
  assert.equal(store.snapshot(true).transactions.length, 1);
  assert.equal(store.snapshot(true).transactions[0].categoryId, 'saude');
}));

test('legacy records without bank identity stay separate if the old ID cannot first be refreshed', () => withStore(store => {
  store.applySync(ITEM, batch([raw('old', { providerId: null, providerCode: null })]), 'legacy');
  store.patchTransaction('account-A:old', { description: 'Correção legada', categoryId: 'saude' });
  store.applySync(ITEM, batch([raw('new')]), 'new-id');
  assert.equal(store.snapshot(true).transactions.length, 2);
  assert.equal(store.snapshot(true).transactions.find(t => t.id === 'account-A:old').description, 'Correção legada');
  assert.equal(store.backup().reconciliations.length, 0);
}));

test('identical duplicate pages still import one operation and one safe replacement', () => withStore(store => {
  store.applySync(ITEM, batch([raw('old'), raw('old')]), 'first');
  store.applySync(ITEM, batch([raw('new'), raw('new')]), 'second');
  assert.equal(store.snapshot(true).transactions.length, 1);
  assert.equal(store.backup().reconciliations.length, 1);
  assert.equal(summarizeTransactions(store.snapshot(true).transactions).expenses, 100);
}));

test('conflicting copies of one Pluggy ID reject the batch without arbitrary retirement', () => withStore(store => {
  store.applySync(ITEM, batch([raw('old')]), 'first');
  const before = store.snapshot(true);
  assert.throws(() => store.applySync(ITEM, batch([raw('new'), raw('new', { providerId: 'conflicting-bank-id' })]), 'conflicting'), /conflit|identidade/i);
  assert.deepEqual(store.snapshot(true), before);
  assert.equal(store.backup().reconciliations.length, 0);
}));

test('SQLite v1 upgrades atomically without losing raw records, overrides or hidden history', () => {
  const dir = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'tracker-upgrade-'));
  const filename = join(dir, 'v1.sqlite');
  let store;
  try {
    const legacy = new DatabaseSync(filename);
    legacy.exec(`CREATE TABLE connections(id TEXT PRIMARY KEY,label TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'REGISTERED',last_fetched_at TEXT,provider_updated_at TEXT,consent_expires_at TEXT,last_error TEXT);
      CREATE TABLE accounts(id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES connections(id),balance_cents INTEGER NOT NULL CHECK(typeof(balance_cents)='integer'),data TEXT NOT NULL);
      CREATE TABLE transactions(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),amount_cents INTEGER NOT NULL CHECK(typeof(amount_cents)='integer' AND amount_cents>=0),data TEXT NOT NULL);
      CREATE TABLE overrides(transaction_id TEXT PRIMARY KEY REFERENCES transactions(id),category_id TEXT,manual_category INTEGER NOT NULL DEFAULT 0,description TEXT,hidden INTEGER NOT NULL DEFAULT 0);
      PRAGMA user_version=1;`);
    legacy.prepare('INSERT INTO connections(id,label) VALUES (?,?)').run(ITEM, 'Legado');
    const normalized = batch([raw('old'), raw('hidden', { providerId: 'hidden' })]);
    const { balanceCents, ...accountData } = normalized.accounts[0];
    legacy.prepare('INSERT INTO accounts VALUES (?,?,?,?)').run(accountData.id, ITEM, balanceCents, JSON.stringify(accountData));
    for (const row of normalized.transactions) {
      const { amountCents, providerId, providerCode, ...data } = row; // Exact v1 boundary: bank IDs were discarded.
      legacy.prepare('INSERT INTO transactions VALUES (?,?,?,?)').run(row.id, row.accountId, amountCents, JSON.stringify(data));
    }
    legacy.prepare('INSERT INTO overrides VALUES (?,?,?,?,?)').run('account-A:old', 'saude', 1, 'Minha correção', 0);
    legacy.prepare('INSERT INTO overrides VALUES (?,?,?,?,?)').run('account-A:hidden', null, 0, null, 1);
    legacy.close();
    store = new Store(filename);
    assert.equal(store.schemaVersion, 4);
    assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, 4);
    assert.equal(store.snapshot(true).transactions.length, 1);
    assert.equal(store.snapshot(true).transactions[0].description, 'Minha correção');
    assert.equal(store.snapshot(true).transactions[0].categoryId, 'saude');
    assert.equal(store.backup().transactions.length, 2);
    assert.equal(store.backup().overrides.find(o => o.transactionId === 'account-A:hidden').hidden, true);
    store.close(); store = new Store(filename);
    // Refresh the same legacy ID to learn providerId; no invented backfill from value/text.
    store.applySync(ITEM, batch([raw('old')]), 'learn');
    store.applySync(ITEM, batch([raw('new', { amount: -123, date: '2026-11-03' })]), 'replace');
    assert.equal(store.snapshot(true).transactions.length, 1);
    assert.equal(store.snapshot(true).transactions[0].description, 'Minha correção');
    assert.equal(store.snapshot(true).transactions[0].amount, 123);
    assert.equal(store.snapshot(true).transactions[0].identityId, 'account-A:old');
    assert.equal(store.backup().transactions.length, 3);
    assert.deepEqual(store.db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(store.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally { store?.close(); rmSync(dir, { recursive: true, force: true }); }
});
