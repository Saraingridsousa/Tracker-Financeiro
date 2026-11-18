import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { summarizeConnectedInvestments } from '../src/domain/connectedInvestments.ts';

test('connected view explains coverage and optional amounts without manual controls', async () => {
 const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, plugins: [react()], server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: ['**/*'] } } });
 try {
  const { ConnectedInvestments } = await vite.ssrLoadModule('/src/components/ConnectedInvestments.tsx');
  const snapshot = { configured: true, connections: [{ id: 'synthetic', label: 'Corretora sem contas', lastError: null, productStates: { investments: { state: 'error' } } }], accounts: [], transactions: [], products: { bills: [], investments: [{ id: 's:p', providerId: 'p', itemId: 'synthetic', name: 'Posição sintética', type: 'FIXED_INCOME', subtype: 'CDB', currencyCode: 'BRL', balanceCents: 12345, status: 'ACTIVE', observedAt: '2026-11-17T12:00:00Z', originalAmountCents: null, profitCents: null }] } };
  const summary = summarizeConnectedInvestments({ snapshot });
  const html = renderToStaticMarkup(createElement(ConnectedInvestments, { summary }));
  assert.match(html, /Cobertura parcial/);
  assert.match(html, /123,45/);
  assert.match(html, /Posição sintética/);
  assert.match(html, /último valor conhecido/);
  assert.match(html, /não informado/);
  assert.doesNotMatch(html, /Carteira manual/);
  assert.match(html, /apelido/);
  for (const [state, text] of [['loading', 'Carregando'], ['noConnections', 'Nenhuma conexão'], ['notQueried', 'ainda não consultados'], ['loadError', 'Falha na leitura local']]) {
   const empty = renderToStaticMarkup(createElement(ConnectedInvestments, { summary: { ...summary, status: state, primary: null, positions: [] } }));
   assert.ok(empty.includes(text), state);
   assert.doesNotMatch(empty, /R\$[^<]*0,00/);
  }
 } finally { await vite.close(); }
});
