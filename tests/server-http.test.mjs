import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { once } from 'node:events';
import { Store } from '../server/store.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ITEM = '11111111-1111-4111-8111-111111111111';
async function setup(t, options = {}) {
  const { createAppServer } = await import('../server/app.mjs');
  const store = new Store();
  const server = createAppServer({ store, pluggy: { configured: false }, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.close(); });
  const call = (path, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const bodyHeaders = body !== undefined && !Object.keys(headers).some(k => ['content-length','transfer-encoding'].includes(k.toLowerCase())) ? { 'Content-Length': Buffer.byteLength(body) } : {};
    const req = request({ host: '127.0.0.1', port, path, method, headers: { ...bodyHeaders, ...headers } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => { const text = Buffer.concat(chunks).toString(); let data; try { data = JSON.parse(text); } catch {} resolve({ status: res.statusCode, headers: res.headers, text, data }); });
    });
    req.on('error', reject); req.end(body);
  });
  return { server, store, port, call };
}

test('Host and Origin allow only exact loopback ports and never use wildcard CORS', async t => {
  const { call, port } = await setup(t);
  for (const host of ['evil.invalid', '127.0.0.1.evil.invalid', `localhost:${port + 1}`, `127.1:${port}`, `[::1]:${port}`]) {
    assert.equal((await call('/api/session', { headers: { Host: host } })).status, 403, host);
  }
  for (const origin of ['null', 'https://evil.invalid', `http://localhost:${port + 1}`, `http://localhost:${port}/path`, `http://user@localhost:${port}`, `http://127.0.0.1:${port}.evil.invalid`]) {
    assert.equal((await call('/api/session', { headers: { Origin: origin } })).status, 403, origin);
  }
  for (const origin of [`http://127.0.0.1:${port}`, `http://localhost:${port}`, 'http://localhost:5173', 'http://127.0.0.1:5173']) {
    const result = await call('/api/session', { headers: { Origin: origin } });
    assert.equal(result.status, 200);
    assert.equal(result.headers['access-control-allow-origin'], origin);
    assert.notEqual(result.headers['access-control-allow-origin'], '*');
  }
  const preflight = await call('/api/connections', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-tracker-csrf' } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers['access-control-allow-headers'], /X-Tracker-CSRF/i);
  const { createAppServer } = await import('../server/app.mjs');
  const unsafe = createAppServer({ store: {}, pluggy: {} });
  try { assert.throws(() => unsafe.listen(0, '0.0.0.0'), /loopback/i); }
  finally { unsafe.close(); }
});

test('connection registration requires CSRF, JSON and a bounded body before any local write', async t => {
  const { call, store } = await setup(t);
  const token = (await call('/api/session')).data.csrfToken;
  const body = JSON.stringify({ itemId: ITEM, label: 'Sintético' });
  const headers = { 'Content-Type': 'application/json', 'X-Tracker-CSRF': token };
  assert.equal((await call('/api/connections', { method: 'POST', body })).status, 403);
  assert.equal((await call('/api/connections', { method: 'POST', headers: { ...headers, 'X-Tracker-CSRF': 'wrong' }, body })).status, 403);
  assert.equal((await call('/api/connections', { method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' }, body })).status, 415);
  assert.equal((await call('/api/connections', { method: 'POST', headers, body: '{invalid' })).status, 400);
  assert.equal((await call('/api/connections', { method: 'POST', headers, body: '[]' })).status, 400);
  assert.equal((await call('/api/connections', { method: 'POST', headers, body: JSON.stringify({ itemId: '../bad', label: 'X' }) })).status, 400);
  assert.equal((await call('/api/connections', { method: 'POST', headers, body: ' '.repeat(65537) })).status, 413);
  assert.equal((await call('/api/connections', { method: 'POST', headers: { ...headers, 'Transfer-Encoding': 'chunked' }, body: ' '.repeat(65537) })).status, 413);
  assert.equal(store.connections().length, 0);
  assert.equal((await call('/api/connections', { method: 'POST', headers, body })).status, 201);
  assert.equal((await call('/api/banking')).data.connections[0].id, ITEM);
  assert.equal((await call('/api/connections', { method: 'POST', headers, body })).status, 400);
});

test('HTTP sync reads injected provider pages atomically, preserves empty history and sanitizes errors', async t => {
  const { PluggyClient } = await import('../server/pluggy.mjs');
  let mode = 'success';
  const provider = new PluggyClient({ clientId: 'SYNTHETIC_CLIENT', clientSecret: 'SYNTHETIC_SECRET', fetchImpl: async url => {
    const u = new URL(url);
    const data = body => new Response(JSON.stringify(body), { status: 200 });
    if (u.pathname === '/auth') return data({ apiKey: 'SYNTHETIC_KEY' });
    if (u.pathname.startsWith('/items/')) return data({ status: 'UPDATED', updatedAt: '2026-10-31T00:00:00Z', connector: { name: 'Sintético' } });
    if (u.pathname === '/accounts') return data({ results: [{ id: 'a', itemId: ITEM, type: 'BANK', name: 'Conta sintética', currencyCode: 'BRL', balance: mode === 'failure' ? 999 : 100 }] });
    if (mode === 'empty') return data({ results: [], next: null });
    if (u.searchParams.has('after') && mode === 'failure') return new Response('SYNTHETIC_SECRET raw financial payload', { status: 500 });
    return data({ results: [{ id: u.searchParams.has('after') ? 'second' : 'first', date: '2026-11-01', description: 'PIX sintético', amount: -12.34, type: 'DEBIT', currencyCode: 'BRL', status: 'POSTED' }], next: u.searchParams.has('after') ? null : '?accountId=a&after=second' });
  }});
  const { call } = await setup(t, { pluggy: provider, now: () => new Date('2026-11-02T00:00:00Z') });
  const headers = { 'Content-Type': 'application/json', 'X-Tracker-CSRF': (await call('/api/session')).data.csrfToken };
  await call('/api/connections', { method: 'POST', headers, body: JSON.stringify({ itemId: ITEM, label: 'Teste' }) });
  const sync = () => call(`/api/connections/${ITEM}/sync`, { method: 'POST', headers, body: '{}' });
  assert.equal((await sync()).status, 200);
  const before = (await call('/api/banking')).data;
  assert.equal(before.transactions.length, 2);
  assert.equal(before.connections[0].lastFetchedAt, '2026-11-02T00:00:00.000Z');
  assert.equal(before.connections[0].providerUpdatedAt, '2026-10-31T00:00:00Z');
  mode = 'failure';
  const failed = await sync();
  assert.equal(failed.status, 502);
  assert.doesNotMatch(failed.text, /SYNTHETIC|raw financial/);
  const after = (await call('/api/banking')).data;
  assert.deepEqual(after.accounts, before.accounts);
  assert.deepEqual(after.transactions, before.transactions);
  assert.equal(after.connections[0].lastFetchedAt, before.connections[0].lastFetchedAt);
  assert.ok(after.connections[0].lastError);
  mode = 'empty';
  assert.equal((await sync()).status, 200);
  assert.equal((await call('/api/banking')).data.transactions.length, 2);
  assert.equal((await call('/api/connections/22222222-2222-4222-8222-222222222222/sync', { method: 'POST', headers, body: '{}' })).status, 404);
});

test('HTTP local edits and deletion preserve provider history in a credentials-free JSON backup', async t => {
  const { normalizeAccount, normalizeTransaction } = await import('../server/pluggy.mjs');
  const { call, store } = await setup(t, { pluggy: { configured: true, clientSecret: 'SYNTHETIC_SECRET', apiKey: 'SYNTHETIC_KEY' } });
  const rawAccount = { id: 'a/special', itemId: ITEM, type: 'BANK', name: 'Sintético', balance: 12, currencyCode: 'BRL' };
  const rawTx = { id: 't?:1', date: '2026-11-01', description: 'Original sintético', amount: -1.23, status: 'PENDING' };
  const transaction = normalizeTransaction(rawTx, rawAccount);
  const batch = { accounts: [normalizeAccount(rawAccount, ITEM)], transactions: [transaction], status: 'UPDATED' };
  store.registerConnection({ itemId: ITEM, label: 'Teste' });
  store.applySync(ITEM, batch, '2026-11-02T00:00:00Z');
  const headers = { 'Content-Type': 'application/json', 'X-Tracker-CSRF': (await call('/api/session')).data.csrfToken };
  const path = `/api/transactions/${encodeURIComponent(transaction.id)}`;
  assert.equal((await call(path, { method: 'PATCH', headers, body: JSON.stringify({ categoryId: 'food', description: 'Local sintético' }) })).status, 200);
  store.applySync(ITEM, batch, '2026-11-03T00:00:00Z');
  const visible = (await call('/api/banking')).data.transactions[0];
  assert.equal(visible.description, 'Local sintético');
  assert.equal(visible.manualCategory, true);
  assert.equal((await call('/api/transactions/absent', { method: 'PATCH', headers, body: '{"description":"x"}' })).status, 404);
  assert.equal((await call('/api/transactions/%invalid', { method: 'PATCH', headers, body: '{}' })).status, 400);
  assert.equal((await call(path, { method: 'PATCH', headers, body: '{"amount":999}' })).status, 400);
  assert.equal((await call(path, { method: 'DELETE', headers, body: '{}' })).status, 200);
  assert.equal((await call('/api/banking')).data.transactions.length, 0);
  const backup = await call('/api/backup');
  assert.equal(backup.status, 200);
  assert.match(backup.headers['content-disposition'], /attachment/);
  assert.equal(backup.data.transactions.length, 1);
  assert.equal(backup.data.transactions[0].description, 'Original sintético');
  assert.equal(backup.data.overrides[0].hidden, true);
  assert.doesNotMatch(backup.text, /SYNTHETIC|clientSecret|apiKey|csrfToken/);
});

test('production static serving blocks traversal, dotfiles and symlink escape while supporting SPA and HEAD', async t => {
  const root = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'tracker-static-'));
  const dist = join(root, 'dist'); mkdirSync(dist); mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>synthetic app</title>');
  writeFileSync(join(dist, 'assets', 'app.js'), 'console.log("synthetic");');
  writeFileSync(join(dist, 'assets', 'pdf.worker.mjs'), 'export const syntheticWorker = true;');
  writeFileSync(join(root, 'secret.env'), 'SYNTHETIC_SECRET');
  writeFileSync(join(dist, '.env'), 'SYNTHETIC_SECRET');
  symlinkSync(root, join(dist, 'outside'), process.platform === 'win32' ? 'junction' : 'dir');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { call } = await setup(t, { distDir: dist });
  const index = await call('/');
  assert.equal(index.status, 200); assert.match(index.text, /synthetic app/);
  const script = await call('/assets/app.js?v=1');
  assert.equal(script.status, 200); assert.match(script.headers['content-type'], /javascript/);
  const worker = await call('/assets/pdf.worker.mjs');
  assert.equal(worker.status, 200);
  assert.match(worker.headers['content-type'], /javascript/);
  const head = await call('/assets/app.js', { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(head.text, '');
  assert.equal((await call('/connections', { headers: { Accept: 'text/html' } })).status, 200);
  assert.equal((await call('/assets/missing.js')).status, 404);
  assert.equal((await call('/api/missing', { headers: { Accept: 'text/html' } })).status, 404);
  for (const path of ['/../secret.env', '/%2e%2e/secret.env', '/..%5csecret.env', '/.env', '/outside/secret.env']) {
    const result = await call(path);
    assert.equal(result.status, 403, path); assert.doesNotMatch(result.text, /SYNTHETIC_SECRET/);
  }
  assert.equal((await call('/%00')).status, 400);
});

test('loopback server exposes an empty banking snapshot and a random per-server session token', async t => {
  const a = await setup(t);
  assert.equal(a.server.address().address, '127.0.0.1');
  const session = await a.call('/api/session');
  assert.equal(session.status, 200);
  assert.match(session.data.csrfToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal((await a.call('/api/session')).data.csrfToken, session.data.csrfToken);
  const snapshot = await a.call('/api/banking');
  assert.deepEqual(snapshot.data, { configured: false, connections: [], accounts: [], transactions: [] });
  assert.match(snapshot.headers['cache-control'], /no-store/);
  assert.equal(snapshot.headers['x-content-type-options'], 'nosniff');
  assert.match(snapshot.headers['content-security-policy'], /frame-ancestors 'none'/);
  const b = await setup(t);
  assert.notEqual((await b.call('/api/session')).data.csrfToken, session.data.csrfToken);
});

test('concurrent sync of the same item returns conflict and always releases its lock', { timeout: 10000 }, async t => {
  let release;
  let markStarted;
  let reads = 0;
  let failNext = false;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { markStarted = resolve; });
  const pluggy = { configured: true, async readItem() {
    reads++;
    if (reads === 1) { markStarted(); await gate; }
    if (failNext) { failNext = false; throw new Error('synthetic provider failure'); }
    return { accounts: [], transactions: [], status: 'UPDATED' };
  } };
  const { call, store } = await setup(t, { pluggy });
  store.registerConnection({ itemId: ITEM, label: 'Teste concorrente' });
  const headers = { 'Content-Type': 'application/json', 'X-Tracker-CSRF': (await call('/api/session')).data.csrfToken };
  const sync = () => call(`/api/connections/${ITEM}/sync`, { method: 'POST', headers, body: '{}' });
  const first = sync();
  await started;
  try {
    assert.equal((await sync()).status, 409);
    assert.equal(reads, 1);
  } finally { release(); await first; }
  assert.equal((await sync()).status, 200);
  failNext = true;
  assert.equal((await sync()).status, 502);
  assert.equal((await sync()).status, 200);
});
