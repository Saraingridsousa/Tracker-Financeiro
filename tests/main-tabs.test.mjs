import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

function walk(node, predicate) {
 if (!node || typeof node !== 'object') return;
 if (predicate(node)) return node;
 for (const child of [node.props?.children].flat(Infinity)) { const found = walk(child, predicate); if (found) return found; }
}

test('main tabs support arrows, wrapping, Home and End with focus and ARIA', async () => {
 const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, plugins: [react()], server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: ['**/*'] } } });
 const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
 try {
  const { MainTabs } = await vite.ssrLoadModule('/src/components/MainTabs.tsx');
  const chosen = [], focused = [];
  globalThis.document = { getElementById: id => ({ focus: () => focused.push(id) }) };
  const tree = MainTabs({ active: 'overview', onChange: key => chosen.push(key) });
  const buttons = tree.props.children;
  assert.deepEqual(buttons.map(b => b.props.tabIndex), [0, -1, -1]);
  assert.equal(buttons[0].props['aria-selected'], true);
  for (const [index, key, expected] of [[0, 'ArrowRight', 'investments'], [2, 'ArrowRight', 'overview'], [0, 'ArrowLeft', 'connections'], [1, 'Home', 'overview'], [0, 'End', 'connections']]) {
   let prevented = false;
   buttons[index].props.onKeyDown({ key, preventDefault: () => { prevented = true; } });
   assert.equal(prevented, true); assert.equal(chosen.at(-1), expected); assert.equal(focused.at(-1), 'tab-' + expected);
  }
  const count = chosen.length;
  buttons[0].props.onKeyDown({ key: 'Tab', preventDefault: () => assert.fail('Tab must keep normal behavior') });
  assert.equal(chosen.length, count);
 } finally { if (previous) Object.defineProperty(globalThis, 'document', previous); else delete globalThis.document; await vite.close(); }
});

test('switching main views keeps one banking controller, connected total ignores month, manual stays separate', async () => {
 const saved = new Map(['window', '__tabsHooks', '__tabsBanking'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
 let cursor = 0; const cells = [];
 globalThis.__tabsHooks = {
  useState(initial) { const i = cursor++; if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial; return [cells[i], v => { cells[i] = typeof v === 'function' ? v(cells[i]) : v; }]; },
  useRef(initial) { const i = cursor++; if (!(i in cells)) cells[i] = { current: initial }; return cells[i]; },
  useMemo: fn => fn(), useEffect() {}, useCallback: fn => fn,
 };
 const storage = new Map([['tracker-financeiro:investments', JSON.stringify([{ id: 'manual', tickerOrName: 'MANUAL', type: 'Outros', quantity: 1, avgPrice: 90, currentPrice: 90 }])]]);
 globalThis.window = { localStorage: { getItem: k => storage.get(k) ?? null, setItem: () => assert.fail('view switch cannot write data') } };
 const calls = [];
 globalThis.__tabsBanking = { loaded: true, error: '', busy: false, snapshot: { configured: true, connections: [{ id: 'synthetic', label: 'Sem contas', lastError: null, lastFetchedAt: '2026-11-17T12:00:00Z', productStates: { investments: { state: 'available' } } }], accounts: [], transactions: [], products: { bills: [], investments: [{ id: 's:p', providerId: 'p', itemId: 'synthetic', name: 'Posição antiga ativa', type: 'FIXED_INCOME', subtype: 'CDB', currencyCode: 'BRL', status: 'ACTIVE', balanceCents: 12345, referenceDate: '2025-01-01', observedAt: '2026-11-17T12:00:00Z' }] } }, ...Object.fromEntries(['sync', 'refresh', 'addConnection', 'downloadBackup'].map(k => [k, () => calls.push(k)])) };
 const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, plugins: [{ name: 'tab-harness', enforce: 'pre', resolveId(id) { if (id === 'virtual:tabs-hooks' || id === 'virtual:tabs-bank') return '\0' + id; }, load(id) { if (id === '\0virtual:tabs-hooks') return ['useState', 'useRef', 'useMemo', 'useEffect', 'useCallback'].map(n => 'export const ' + n + '=(...a)=>globalThis.__tabsHooks.' + n + '(...a);').join('\n'); if (id === '\0virtual:tabs-bank') return 'export const useBanking=()=>globalThis.__tabsBanking;'; }, transform(code, id) { if (id.endsWith('/src/App.tsx') || id.includes('/src/hooks/')) return code.replace(/from 'react'/g, "from 'virtual:tabs-hooks'").replace("from './hooks/useBanking'", "from 'virtual:tabs-bank'"); } }, react()], server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: ['**/*'] } } });
 try {
  const { default: App } = await vite.ssrLoadModule('/src/App.tsx');
  const render = () => { cursor = 0; return App({ now: () => new Date('2026-11-17T15:00:00Z') }); };
  let tree = render();
  const tabs = () => walk(tree, n => n.type?.name === 'MainTabs');
  assert.equal(tabs().props.active, 'overview');
  assert.equal(walk(tree, n => n.type?.name === 'BankingPanel'), undefined);
  const value = walk(tree, n => n.type?.name === 'ConnectedInvestmentValue');
  assert.equal(value.props.summary.primary.cents, 12345);
  walk(tree, n => n.type === 'select' && n.props.value === 'all').props.onChange({ target: { value: 'year' } });
  tree = render();
  assert.equal(walk(tree, n => n.type?.name === 'ConnectedInvestmentValue').props.summary.primary.cents, 12345);
  tabs().props.onChange('investments'); tree = render();
  const connected = walk(tree, n => n.type?.name === 'ConnectedInvestments');
  assert.equal(connected.props.summary.primary.cents, value.props.summary.primary.cents);
  const manualButton = walk(tree, n => n.type === 'button' && n.props.children === 'Carteira manual');
  manualButton.props.onClick(); tree = render();
  const manual = walk(tree, n => n.type?.name === 'InvestmentsDashboard');
  assert.equal(manual.props.assets.length, 1); assert.equal(manual.props.assets[0].id, 'manual');
  tabs().props.onChange('connections'); tree = render();
  assert.equal(walk(tree, n => n.type?.name === 'BankingPanel').props.banking, globalThis.__tabsBanking);
  tabs().props.onChange('overview'); tree = render();
  assert.equal(walk(tree, n => n.type?.name === 'ConnectedInvestmentValue').props.summary.primary.cents, 12345);
  assert.deepEqual(calls, []);
  assert.equal(storage.size, 1);
 } finally { await vite.close(); for (const [k, d] of saved) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; } }
});

test('compact shared status retains full conflict and recovery controls', async () => {
 const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, plugins: [react()], server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: ['**/*'] } } });
 try {
  const { SharedFinancePanel } = await vite.ssrLoadModule('/src/components/SharedFinancePanel.tsx');
  const status = { ready: true, payload: {}, revision: 1, busy: false, error: '', draft: null };
  const render = extra => renderToStaticMarkup(createElement(SharedFinancePanel, { shared: { enabled: true, status: { ...status, ...extra } }, browserCopy() {} }));
  assert.match(render({}), /<details>/);
  assert.match(render({ error: 'Conflito de gravação', draft: {} }), /role="alert"/);
  assert.match(render({ error: 'Conflito de gravação', draft: {} }), /Exportar rascunho não confirmado/);
  assert.match(render({ payload: null }), /Conferir cópia deste navegador/);
 } finally { await vite.close(); }
});
