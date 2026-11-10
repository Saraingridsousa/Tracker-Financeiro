import test from 'node:test';
import assert from 'node:assert/strict';

const ITEM = '11111111-1111-4111-8111-111111111111';
const load = () => import('../server/pluggy.mjs');
const bank = { id: 'bank', itemId: ITEM, name: 'Conta sintética', type: 'BANK', balance: 123.45, currencyCode: 'BRL' };
const card = { ...bank, id: 'card', type: 'CREDIT' };
const tx = (extra = {}) => ({ id: 'p1', date: '2026-11-01T12:00:00Z', createdAt: '2026-11-01T12:00:00Z', description: 'PIX recebido de terceiro', amount: -10.25, currencyCode: 'BRL', status: 'POSTED', ...extra });

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('readItem authenticates server-side and reads account pages plus transaction cursors without forcing bank sync', async () => {
  const { PluggyClient } = await load();
  const calls = [];
  const fetchImpl = async (url, options) => {
    const u = new URL(url); calls.push({ u, options });
    assert.equal(u.origin, 'https://api.pluggy.ai');
    if (u.pathname === '/auth') { assert.deepEqual(JSON.parse(options.body), { clientId: 'synthetic-id', clientSecret: 'synthetic-secret' }); return json({ apiKey: 'synthetic-key' }); }
    assert.equal(options.headers['X-API-KEY'], 'synthetic-key');
    assert.equal(options.method, 'GET');
    if (u.pathname === `/items/${ITEM}`) return json({ status: 'UPDATED', updatedAt: '2026-10-31T00:00:00Z', consentExpiresAt: '2027-01-01T00:00:00Z', connector: { name: 'Sintético' } });
    if (u.pathname === '/accounts') return json({ results: u.searchParams.get('page') === '2' ? [card] : [bank], totalPages: 2 });
    if (u.pathname === '/v2/transactions') return json({ results: [tx({ id: u.searchParams.has('after') ? 'second' : 'first' })], next: u.searchParams.has('after') ? null : `?accountId=${u.searchParams.get('accountId')}&after=opaque%2Bcursor` });
    throw new Error('Unexpected synthetic route');
  };
  const client = new PluggyClient({ clientId: 'synthetic-id', clientSecret: 'synthetic-secret', fetchImpl, now: () => Date.parse('2026-11-01T00:00:00Z') });
  const result = await client.readItem(ITEM);
  assert.equal(client.configured, true);
  assert.equal(result.accounts.length, 2);
  assert.equal(result.transactions.length, 4);
  assert.equal(result.providerUpdatedAt, '2026-10-31T00:00:00Z');
  assert.equal(result.transactions[0].bankName, 'Sintético');
  await client.readItem(ITEM);
  assert.equal(calls.filter(c => c.u.pathname === '/auth').length, 1);
  assert.equal(calls.filter(c => c.u.pathname === '/v2/items' || c.u.pathname === '/transactions').length, 0);
});

test('cursor pagination rejects unsafe targets, changed accounts, loops and excessive pages', async () => {
  const { PluggyClient } = await load();
  for (const next of ['https://evil.invalid/steal', '//evil.invalid/steal', '/accounts?itemId=x', '?accountId=other&after=x', '?accountId=bank&after=x#fragment', '?accountId=bank&after=x&after=y', '?accountId=bank&after=repeat']) {
    let count = 0;
    const client = new PluggyClient({ clientId: 'synthetic-id', clientSecret: 'synthetic-secret', maxPages: 3, fetchImpl: async url => {
      const u = new URL(url);
      assert.equal(u.origin, 'https://api.pluggy.ai');
      if (u.pathname === '/auth') return json({ apiKey: 'synthetic-key' });
      if (u.pathname.startsWith('/items/')) return json({ status: 'UPDATED' });
      if (u.pathname === '/accounts') return json({ results: [bank] });
      if (++count > 5) throw new Error('synthetic infinite cursor guard');
      return json({ results: [], next });
    }});
    await assert.rejects(client.readItem(ITEM), /pagina|cursor/i, next);
    assert.ok(count <= 3);
  }
  const client = new PluggyClient({ clientId: 'id', clientSecret: 'secret', maxPages: 2, fetchImpl: async url => {
    const u = new URL(url);
    if (u.pathname === '/auth') return json({ apiKey: 'key' });
    if (u.pathname.startsWith('/items/')) return json({ status: 'UPDATED' });
    return json({ results: [bank], totalPages: 10000 });
  }});
  await assert.rejects(client.readItem(ITEM), /pagina/i);
});

test('401 refreshes a cached key once, expiry refreshes with margin and errors never echo secrets', async () => {
  const { PluggyClient } = await load();
  let time = 0, auths = 0, requests = 0;
  const client = new PluggyClient({ clientId: 'SYNTHETIC_CLIENT', clientSecret: 'SYNTHETIC_SECRET', now: () => time, fetchImpl: async (url, options) => {
    assert.equal(options.redirect, 'error');
    if (new URL(url).pathname === '/auth') return json({ apiKey: `SYNTHETIC_KEY_${++auths}` });
    if (++requests === 1) return json({ secret: 'SYNTHETIC_SECRET' }, 401);
    return json({ status: 'UPDATED' });
  }});
  assert.deepEqual(await client.request(`/items/${ITEM}`), { status: 'UPDATED' });
  assert.equal(auths, 2);
  time = 2 * 60 * 60 * 1000;
  await client.request(`/items/${ITEM}`);
  assert.equal(auths, 3);
  let rejectedAuths = 0, rejectedReads = 0;
  const rejected = new PluggyClient({ clientId: 'SYNTHETIC_CLIENT', clientSecret: 'SYNTHETIC_SECRET', fetchImpl: async url => {
    if (new URL(url).pathname === '/auth') { rejectedAuths++; return json({ apiKey: 'SYNTHETIC_KEY' }); }
    rejectedReads++; return json({ message: 'SYNTHETIC_SECRET SYNTHETIC_KEY' }, 401);
  }});
  await assert.rejects(rejected.request(`/items/${ITEM}`), error => /autentica/i.test(error.message) && !/SYNTHETIC/.test(error.message));
  assert.equal(rejectedAuths, 2);
  assert.equal(rejectedReads, 2);
  const badAuth = new PluggyClient({ clientId: 'SYNTHETIC_CLIENT', clientSecret: 'SYNTHETIC_SECRET', fetchImpl: async () => json({ message: 'SYNTHETIC_SECRET' }, 403) });
  await assert.rejects(badAuth.request(`/items/${ITEM}`), error => !/SYNTHETIC/.test(error.message));
});

test('transport times out fetch and JSON body reads and sanitizes network/provider errors', async () => {
  const { PluggyClient } = await load();
  const cases = [
    async () => new Promise(() => {}),
    async () => ({ ok: true, json: () => new Promise(() => {}) }),
    async () => { throw new Error('SYNTHETIC_SECRET network'); },
    async () => json({ error: 'SYNTHETIC_SECRET' }, 500),
    async () => new Response('SYNTHETIC_SECRET malformed json', { status: 200 }),
  ];
  for (const fetchImpl of cases) {
    const client = new PluggyClient({ clientId: 'synthetic', clientSecret: 'SYNTHETIC_SECRET', fetchImpl, timeoutMs: 15 });
    const outcome = await Promise.race([client.request(`/items/${ITEM}`).then(() => ({ success: true }), error => ({ error })), new Promise(resolve => setTimeout(() => resolve({ missingTimeout: true }), 150))]);
    assert.equal(outcome.missingTimeout, undefined, 'transport must enforce deadline itself');
    assert.ok(outcome.error);
    assert.equal(outcome.error.name, 'PluggyError');
    assert.doesNotMatch(outcome.error.message, /SYNTHETIC|malformed|network/);
  }
});

test('expired consent stops before account reads and malformed provider pages fail closed', async () => {
  const { PluggyClient } = await load();
  let accountReads = 0;
  const expired = new PluggyClient({ clientId: 'id', clientSecret: 'secret', now: () => Date.parse('2026-11-01T00:00:00Z'), fetchImpl: async url => {
    const u = new URL(url);
    if (u.pathname === '/auth') return json({ apiKey: 'key' });
    if (u.pathname.startsWith('/items/')) return json({ status: 'UPDATED', consentExpiresAt: '2026-10-01T00:00:00Z' });
    accountReads++; return json({ results: [] });
  }});
  await assert.rejects(expired.readItem(ITEM), /consentimento expirado/i);
  assert.equal(accountReads, 0);
  for (const payload of [{}, { results: null }, { results: [bank], totalPages: '2' }]) {
    const client = new PluggyClient({ clientId: 'id', clientSecret: 'secret', fetchImpl: async url => {
      const u = new URL(url);
      if (u.pathname === '/auth') return json({ apiKey: 'key' });
      if (u.pathname.startsWith('/items/')) return json({ status: 'UPDATED' });
      return json(payload);
    }});
    await assert.rejects(client.readItem(ITEM), error => error.name === 'PluggyError');
  }
  const unconfigured = new PluggyClient({ fetchImpl: () => { throw new Error('must not fetch'); } });
  await assert.rejects(unconfigured.readItem(ITEM), /credenciais/i);
});

test('normalization uses explicit invoice operation metadata and collision-safe account-scoped IDs', async () => {
  const { normalizeTransaction } = await load();
  const payment = normalizeTransaction(tx({ description: 'Pagamento recebido', operationType: 'PAGAMENTO_FATURA', updatedAt: '2026-11-02T00:00:00Z', paymentData: { paymentMethod: 'PIX', referenceNumber: 'synthetic-ref' }, creditCardMetadata: { installmentNumber: 2, totalInstallments: 6, totalAmount: 100.05 } }), card);
  assert.equal(payment.isCreditCardPayment, true);
  assert.equal(payment.operationType, 'PAGAMENTO_FATURA');
  assert.equal(payment.providerUpdatedAt, '2026-11-02T00:00:00Z');
  assert.deepEqual(payment.paymentData, { paymentMethod: 'PIX', referenceNumber: 'synthetic-ref' });
  assert.equal(payment.creditCardMetadata.totalAmountCents, 10005);
  assert.equal(payment.creditCardMetadata.totalAmount, undefined);
  const one = normalizeTransaction(tx({ id: 'c' }), { ...bank, id: 'a:b' });
  const two = normalizeTransaction(tx({ id: 'b:c' }), { ...bank, id: 'a' });
  assert.notEqual(one.id, two.id);
  assert.notEqual(normalizeTransaction(tx(), bank).id, normalizeTransaction(tx(), card).id);
});

test('normalization preserves pending/foreign metadata and identifies only explicit invoice payments', async () => {
  const { normalizeTransaction, normalizeAccount } = await load();
  const foreign = normalizeTransaction(tx({ amount: 3, currencyCode: 'USD', amountInAccountCurrency: 15.12, status: 'PENDING', category: 'Shopping', categoryId: 'provider-1' }), card);
  assert.equal(foreign.amountCents, 1512);
  assert.equal(foreign.currencyCode, 'BRL');
  assert.equal(foreign.providerStatus, 'PENDING');
  assert.equal(foreign.providerCategory, 'Shopping');
  assert.equal(foreign.providerCategoryId, 'provider-1');
  assert.equal(foreign.categoryId, null);
  const unconverted = normalizeTransaction(tx({ currencyCode: 'USD', amount: 3 }), card);
  assert.equal(unconverted.currencyCode, 'USD');
  assert.equal(unconverted.amountCents, 300);
  assert.equal(normalizeTransaction(tx({ amount: -20, description: 'Estorno de compra' }), card).isCreditCardPayment, false);
  assert.equal(normalizeTransaction(tx({ amount: -20, description: 'Pagamento de fatura' }), card).isCreditCardPayment, true);
  assert.equal(normalizeTransaction(tx({ amount: -20, category: 'Credit card payment' }), card).isCreditCardPayment, true);
  assert.notEqual(normalizeTransaction(tx({ type: 'CREDIT' }), bank).type, 'selftransfer');
  assert.throws(() => normalizeTransaction(tx({ date: 'invalid' }), bank), /dados/i);
  assert.throws(() => normalizeTransaction(tx({ status: 'GARBAGE' }), bank), /dados/i);
  assert.throws(() => normalizeAccount({ ...bank, type: 'LOAN' }, ITEM), /dados/i);
});

test('money normalization distinguishes BANK debit/credit from card signs and keeps exact cents', async () => {
  const { normalizeAccount, normalizeTransaction, toCents } = await load();
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-0.29), -29);
  assert.throws(() => toCents(NaN), /valor/i);
  assert.throws(() => toCents(1e20), /valor/i);
  assert.equal(normalizeAccount(bank, ITEM).balanceCents, 12345);
  const debit = normalizeTransaction(tx({ type: 'DEBIT', amount: 10.25 }), bank, 'Sintético');
  assert.equal(debit.type, 'expense');
  assert.equal(debit.amountCents, 1025);
  assert.equal(debit.id, 'bank:p1');
  assert.equal(normalizeTransaction(tx({ type: 'CREDIT', amount: -10.25 }), bank).type, 'income');
  assert.equal(normalizeTransaction(tx(), bank).type, 'expense');
  assert.equal(normalizeTransaction(tx({ amount: 10.25, type: 'CREDIT' }), card).type, 'expense');
  assert.equal(normalizeTransaction(tx({ amount: -10.25, type: 'DEBIT' }), card).type, 'income');
});
