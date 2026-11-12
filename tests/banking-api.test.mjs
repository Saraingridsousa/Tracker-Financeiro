import assert from 'node:assert/strict';
import test from 'node:test';
import { createBankingApi } from '../src/lib/bankingApi.ts';

test('Cliente obtém token CSRF e não envia segredo Pluggy ao backend', async () => {
  const calls = [];
  const api = createBankingApi(async (path, options = {}) => {
    calls.push({ path, options });
    return new Response(JSON.stringify(path === '/api/session' ? { csrfToken: 'session-token' } : { configured: false, connections: [], accounts: [], transactions: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  await api.mutate('POST', '/api/connections', { itemId: '11111111-1111-4111-8111-111111111111', label: 'Minha conta' });
  assert.equal(calls[0].path, '/api/session');
  assert.equal(calls[1].options.headers['X-Tracker-CSRF'], 'session-token');
  assert.doesNotMatch(JSON.stringify(calls), /clientSecret|apiKey/);
});

test('Resposta HTTP de erro não vira snapshot vazio bem-sucedido', async () => {
  const api = createBankingApi(async () => new Response(JSON.stringify({ error: 'Serviço indisponível' }), { status: 503 }));
  await assert.rejects(api.load(), /Serviço indisponível/);
});
