import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { summarizeTransactions } from '../src/domain/finance.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
let vite;
let cacheDir;
let App;
let filterTransactionsByPeriod;

before(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), 'fix-backup-period-filter-'));
  vite = await createServer({
    root, configFile: false, cacheDir,
    plugins: [{
      name: 'period-app-instrumentation', enforce: 'pre',
      resolveId(id) { if (id === 'virtual:period-react' || id === 'virtual:period-banking') return `\0${id}`; },
      load(id) {
        if (id === '\0virtual:period-react') return ['useState', 'useEffect', 'useMemo', 'useCallback', 'useRef'].map(name => `export const ${name} = (...args) => globalThis.__periodHooks.${name}(...args);`).join('\n');
        if (id === '\0virtual:period-banking') return 'export const useBanking = () => globalThis.__periodBanking;';
      },
      transform(code, id) {
        if (id.includes('/src/hooks/') || id.endsWith('/src/App.tsx')) {
          const output = code.replace(/from 'react'/g, "from 'virtual:period-react'").replace("from './hooks/useBanking'", "from 'virtual:period-banking'");
          return id.endsWith('/src/App.tsx') ? `${output}\nexport { filterTransactionsByPeriod };` : output;
        }
      },
    }, react()],
    server: { host: '127.0.0.1', middlewareMode: true, hmr: false, ws: false, watch: { ignored: ['**/*'] } },
  });
  ({ default: App, filterTransactionsByPeriod } = await vite.ssrLoadModule('/src/App.tsx'));
});

after(async () => {
  await vite?.close();
  if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
});

const tx = (id, date, providerStatus = 'POSTED') => ({ id, date, description: 'Compra sintetica', amount: id === 'pending-future' ? 1000 : 25, type: 'expense', categoryId: 'outros', source: 'pluggy', providerStatus, currencyCode: 'BRL', createdAt: '2026-11-09T12:00:00Z' });
const rows = [tx('posted-current', '2026-11-09'), tx('pending-future', '2027-11-09', 'PENDING'), tx('posted-old', '2025-02-04')];

function walk(element, predicate) {
  if (!element || typeof element !== 'object') return undefined;
  if (predicate(element)) return element;
  for (const child of [element.props?.children].flat(Infinity)) {
    const found = walk(child, predicate);
    if (found) return found;
  }
}

function withApp(run) {
  const saved = new Map(['window', '__periodHooks', '__periodBanking', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const legacy = tx('legacy-old', '2024-03-15');
  legacy.source = 'import';
  const storage = new Map([['tracker-financeiro:data', JSON.stringify({ transactions: [legacy], categories: [{ id: 'outros', name: 'Outros', color: '#000000', keywords: [], type: 'both' }] })]]);
  const hooks = {
    cells: [], memos: [], cursor: 0, memoCursor: 0,
    useState(initial) {
      const index = this.cursor++;
      if (!(index in this.cells)) this.cells[index] = typeof initial === 'function' ? initial() : initial;
      return [this.cells[index], value => { this.cells[index] = typeof value === 'function' ? value(this.cells[index]) : value; }];
    },
    useMemo(fn, deps) {
      const index = this.memoCursor++;
      const previous = this.memos[index];
      if (!previous || !deps || deps.length !== previous.deps?.length || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) this.memos[index] = { value: fn(), deps };
      return this.memos[index].value;
    },
    useEffect() {}, useCallback(fn) { return fn; }, useRef(value) { return { current: value }; },
  };
  globalThis.__periodHooks = hooks;
  globalThis.__periodBanking = { snapshot: { configured: false, connections: [], accounts: [], transactions: rows } };
  globalThis.window = { localStorage: { getItem: key => storage.get(key) ?? null } };
  globalThis.fetch = () => { throw new Error('Rede desabilitada no teste de periodo'); };
  const render = props => { hooks.cursor = 0; hooks.memoCursor = 0; return App(props); };
  try { run({ render, legacy }); }
  finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('F5: mes bancario usa relogio injetado com POSTED corrente, PENDING futuro e historico antigo', () => {
  const reference = new Date(2026, 10, 9, 12);
  const original = structuredClone(rows);
  const filtered = filterTransactionsByPeriod(rows, 'month', { source: 'banking', now: () => reference });
  assert.deepEqual(filtered.map(item => item.id), ['posted-current']);
  assert.equal(summarizeTransactions(filtered).expenses, 25);
  assert.deepEqual(rows, original);
  assert.equal(reference.getMonth(), 10);
});

test('F5: App encaminha Mês atual bancario ao relogio, sem usar a maior data', () => {
  withApp(({ render }) => {
    const props = { now: () => new Date(2026, 10, 9, 12) };
    let tree = render(props);
    const period = walk(tree, node => node.type === 'select' && node.props.value === 'all');
    assert.ok(period);
    period.props.onChange({ target: { value: 'month' } });
    tree = render(props);
    const table = walk(tree, node => node.type?.name === 'TransactionTable');
    assert.deepEqual(table.props.transactions.map(item => item.id), ['posted-current']);
  });
});

test('F5: legacy period utility remains compatible while App only shows banking data', () => {
  const historical = [tx('old-march', '2024-03-15'), tx('old-february', '2024-02-29')];
  assert.deepEqual(filterTransactionsByPeriod(historical, 'month', { source: 'legacy', now: () => new Date(2026, 10, 9) }).map(item => item.id), ['old-march']);
  withApp(({ render, legacy }) => {
    const props = { now: () => new Date(2026, 10, 9) };
    let tree = render(props);
    walk(tree, node => node.type === 'select' && node.props.value === 'all').props.onChange({ target: { value: 'month' } });
    assert.equal(walk(tree, node => node.type === 'select' && node.props['aria-label'] === 'Fonte dos dados'), undefined);
    tree = render(props);
    const monthOption = walk(tree, node => node.type === 'option' && node.props.value === 'month');
    assert.equal(monthOption.props.children, 'Mês atual');
    assert.deepEqual(walk(tree, node => node.type?.name === 'TransactionTable').props.transactions.map(item => item.id), ['posted-current']);
  });
});

test('F5: passagem de ano respeita limites de mes e periodos bancarios, sem incluir parcelas futuras', () => {
  const boundary = [tx('january', '2027-01-01'), tx('december', '2026-12-31'), tx('november', '2026-11-30'), tx('future-february', '2027-02-01', 'PENDING'), tx('future-year', '2028-01-01', 'PENDING')];
  const opts = { source: 'banking', now: () => new Date(2027, 0, 1, 0, 1) };
  assert.deepEqual(filterTransactionsByPeriod(boundary, 'month', opts).map(item => item.id), ['january']);
  assert.deepEqual(filterTransactionsByPeriod(boundary, 'last2months', opts).map(item => item.id), ['january', 'december']);
  assert.deepEqual(filterTransactionsByPeriod(boundary, 'quarter', opts).map(item => item.id), ['january', 'december', 'november']);
  for (const period of ['semester', 'year']) assert.deepEqual(filterTransactionsByPeriod(boundary, period, opts).map(item => item.id), ['january', 'december', 'november']);
  assert.equal(filterTransactionsByPeriod(boundary, 'all', opts), boundary);
  assert.deepEqual(filterTransactionsByPeriod([tx('old-only', '2024-01-01')], 'month', opts), []);
});

test('F5: App atualiza o filtro ao mudar o mes do relogio, mesmo com memos e payload identicos', () => {
  withApp(({ render }) => {
    globalThis.__periodBanking.snapshot.transactions = [tx('december', '2026-12-31'), tx('january', '2027-01-01'), tx('future-year', '2028-01-01', 'PENDING')];
    let reference = new Date(2026, 11, 31, 23, 59);
    const props = { now: () => reference };
    let tree = render(props);
    walk(tree, node => node.type === 'select' && node.props.value === 'all').props.onChange({ target: { value: 'month' } });
    tree = render(props);
    assert.deepEqual(walk(tree, node => node.type?.name === 'TransactionTable').props.transactions.map(item => item.id), ['december']);
    reference = new Date(2027, 0, 1, 0, 1);
    tree = render(props);
    assert.deepEqual(walk(tree, node => node.type?.name === 'TransactionTable').props.transactions.map(item => item.id), ['january']);
  });
});

test('F5: padrao bancario consulta o relogio real, nao a data mais nova do payload', () => {
  const current = new Date();
  const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
  const liveRows = [tx('live-current', localDate(current)), tx('live-future', localDate(new Date(current.getFullYear() + 1, current.getMonth(), 1)), 'PENDING'), tx('live-old', localDate(new Date(current.getFullYear() - 2, current.getMonth(), 1)))];
  assert.deepEqual(filterTransactionsByPeriod(liveRows, 'month').map(item => item.id), ['live-current']);
});
