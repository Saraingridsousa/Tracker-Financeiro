import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { summarizeTransactions } from '../src/domain/finance.ts';
const categories = [
 { id: 'investimentos', name: 'Investimentos', type: 'both', keywords: [], color: '#000' },
 { id: 'saude', name: 'Saúde', type: 'expense', keywords: [], color: '#000' },
 { id: 'uncategorized', name: 'Sem categoria', type: 'both', keywords: [], color: '#000' },
 { id: 'proventos', name: 'Proventos', type: 'income', keywords: [], color: '#000' },
];
const tx = (id, description, categoryId, amount, type = 'expense', extra = {}) => ({ id, description, categoryId, amount, type, date: '2026-11-17', createdAt: '2026-11-17', source: 'pluggy', currencyCode: 'BRL', providerStatus: 'POSTED', ...extra });
const rows = [tx('apply', 'Aporte sintético', 'investimentos', 500), tx('redeem', 'Resgate sintético', 'investimentos', 70, 'income'), tx('fallback', 'APLICACAO CDB', 'uncategorized', 300), tx('health', 'APLICACAO DE INSULINA', 'saude', 25, 'expense', { isInvestment: true, manualCategory: true }), tx('yield', 'Rendimento sintético', 'proventos', 10, 'income'), tx('reserve', 'Dinheiro reservado - Cofrinho sintético', 'uncategorized', 200)];

test('investment principal is excluded from spending and income while genuine expense and yield remain', () => {
 const summary = summarizeTransactions(rows, categories);
 assert.equal(summary.expenses, 25);
 assert.equal(summary.income, 10);
 assert.equal(summary.balance, -15);
 assert.equal(summary.averageExpense, 25);
});
function walk(node, predicate) {
 if (!node || typeof node !== 'object') return;
 if (predicate(node)) return node;
 for (const child of [node.props?.children].flat(Infinity)) { const found = walk(child, predicate); if (found) return found; }
}

test('table labels investments separately and excludes them from outflow/income filters without losing records', async () => {
 const previous = Object.getOwnPropertyDescriptor(globalThis, '__outflowHooks');
 let cursor = 0; const cells = [];
 globalThis.__outflowHooks = { useState(initial) { const i = cursor++; if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial; return [cells[i], v => { cells[i] = typeof v === 'function' ? v(cells[i]) : v; }]; }, useMemo: fn => fn(), useRef: () => ({ current: null }) };
 const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, plugins: [{ name: 'outflow-hooks', enforce: 'pre', resolveId(id) { if (id === 'virtual:outflow-hooks') return '\0' + id; }, load(id) { if (id === '\0virtual:outflow-hooks') return ['useState', 'useMemo', 'useRef'].map(n => 'export const ' + n + '=(...a)=>globalThis.__outflowHooks.' + n + '(...a);').join('\n'); }, transform(code, id) { if (id.endsWith('/TransactionTable.tsx')) return code.replace("from 'react'", "from 'virtual:outflow-hooks'"); } }, react()], server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: ['**/*'] } } });
 try {
  const { TransactionTable } = await vite.ssrLoadModule('/src/components/TransactionTable.tsx');
  const before = JSON.stringify(rows);
  const render = () => { cursor = 0; return TransactionTable({ transactions: rows, categories, onUpdateCategory: () => assert.fail('no writes'), onUpdateTransaction: () => assert.fail('no writes'), onDeleteTransaction: () => assert.fail('no writes') }); };
  let tree = render();
  const body = () => renderToStaticMarkup(walk(tree, n => n.type === 'tbody'));
  assert.match(body(), /Investimento · fora dos gastos/);
  const applyRow = body().split('<tr').find(s => s.includes('Aporte sintético'));
  assert.doesNotMatch(applyRow, />Saída</);
  const setType = value => { const select = walk(tree, n => n.type === 'select' && [n.props.children].flat(Infinity).some(c => c?.props?.value === 'expense')); select.props.onChange({ target: { value } }); tree = render(); };
  setType('expense');
  assert.match(body(), /APLICACAO DE INSULINA/);
  assert.doesNotMatch(body(), /Aporte sintético|Resgate sintético|APLICACAO CDB|Cofrinho sintético/);
  setType('investment');
  assert.match(body(), /Aporte sintético/); assert.match(body(), /Resgate sintético/); assert.match(body(), /APLICACAO CDB/); assert.match(body(), /Cofrinho sintético/);
  assert.doesNotMatch(body(), /APLICACAO DE INSULINA|Rendimento sintético/);
  setType('income'); assert.match(body(), /Rendimento sintético/); assert.doesNotMatch(body(), /Resgate sintético/);
  setType('all'); assert.ok(rows.every(r => body().includes(r.description))); assert.equal(JSON.stringify(rows), before);
  const aside = renderToStaticMarkup(walk(tree, n => n.type === 'aside'));
  assert.match(aside, /APLICACAO DE INSULINA/); assert.doesNotMatch(aside, /Aporte sintético|Resgate sintético|APLICACAO CDB|Cofrinho sintético/);
 } finally { await vite.close(); if (previous) Object.defineProperty(globalThis, '__outflowHooks', previous); else delete globalThis.__outflowHooks; }
});
