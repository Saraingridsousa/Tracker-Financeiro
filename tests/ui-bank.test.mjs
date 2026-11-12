import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

test('Painel explica configuração sem pedir senha e não depende de PDF', async () => {
  const vite = await createServer({ configFile: false, plugins: [react()], server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: ['**/*'] } } });
  try {
    const { BankingPanel } = await vite.ssrLoadModule('/src/components/BankingPanel.tsx');
    const html = renderToStaticMarkup(createElement(BankingPanel, { banking: {
      snapshot: { configured: false, connections: [], accounts: [], transactions: [] }, busy: false, error: '',
      refresh: async () => true, addConnection: async () => true, sync: async () => true, downloadBackup: async () => true,
    } }));
    assert.match(html, /Meu Pluggy/);
    assert.match(html, /24 horas/);
    assert.match(html, /itemId/);
    assert.match(html, /backend/);
    assert.doesNotMatch(html, /type="password"/);
    assert.match(html, /https:\/\/meu.pluggy.ai/);
    const { default: App } = await vite.ssrLoadModule('/src/App.tsx');
    const app = renderToStaticMarkup(createElement(App));
    assert.match(app, /banking-title/);
    assert.match(app, /Resultado do período/);
    assert.match(app, /Histórico importado/);
    const { TransactionTable } = await vite.ssrLoadModule('/src/components/TransactionTable.tsx');
    const table = renderToStaticMarkup(createElement(TransactionTable, {
      transactions: [{ id: 'pluggy:synthetic', date: '2026-11-08', description: 'Compra sintética', amount: 10, type: 'expense', categoryId: 'uncategorized', source: 'pluggy', providerStatus: 'PENDING', bankName: 'Banco de teste', createdAt: '2026-11-08' }, { id: 'pluggy:usd', date: '2026-11-08', description: 'Operação em dólar', amount: 15, type: 'expense', categoryId: 'uncategorized', source: 'pluggy', providerStatus: 'POSTED', currencyCode: 'USD', bankName: 'Banco de teste', createdAt: '2026-11-08' }],
      categories: [{ id: 'uncategorized', name: 'Sem categoria', color: '#000', type: 'both', keywords: [] }],
      onUpdateCategory() {}, onUpdateTransaction() {}, onDeleteTransaction() {},
    }));
    assert.match(table, /Banco de teste/);
    assert.match(table, /Pendente/);
    assert.match(table, /US\$/);
    assert.match(table, /Ainda não há gastos para mostrar/);
  } finally { await vite.close(); }
});
