import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { Store } from '../server/store.mjs';
import { normalizeAccount, normalizeTransaction } from '../server/pluggy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
let vite;
let cacheDir;
let App;

before(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), 'fix-backup-period-'));
  vite = await createServer({
    root, configFile: false, cacheDir,
    plugins: [{
      name: 'backup-restore-hook-instrumentation', enforce: 'pre',
      resolveId(id) {
        if (id === 'virtual:backup-react' || id === 'virtual:backup-banking') return `\0${id}`;
      },
      load(id) {
        if (id === '\0virtual:backup-react') return ['useState', 'useEffect', 'useMemo', 'useCallback', 'useRef'].map(name => `export const ${name} = (...args) => globalThis.__backupHooks.${name}(...args);`).join('\n');
        if (id === '\0virtual:backup-banking') return 'export const useBanking = () => globalThis.__backupBanking;';
      },
      transform(code, id) {
        if (id.includes('/src/hooks/') || id.endsWith('/src/App.tsx')) return code.replace(/from 'react'/g, "from 'virtual:backup-react'").replace("from './hooks/useBanking'", "from 'virtual:backup-banking'");
      },
    }, react()],
    server: { host: '127.0.0.1', middlewareMode: true, hmr: false, ws: false, watch: { ignored: ['**/*'] } },
  });
  ({ default: App } = await vite.ssrLoadModule('/src/App.tsx'));
});

after(async () => {
  await vite?.close();
  if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
});

const category = { id: 'custom', name: 'Personalizada', color: '#000000', keywords: ['sintetica'], type: 'both' };
const transaction = { id: 'legacy-before', date: '2026-11-09', description: 'Compra sintetica', amount: 10, type: 'expense', categoryId: category.id, source: 'import', createdAt: '2026-11-09T12:00:00.000Z' };
const rule = { id: 'rule-before', categoryId: category.id, keywords: ['sintetica'], isActive: true };
const asset = { id: 'asset-before', tickerOrName: 'SINTETICO', type: 'Outros', quantity: 1, avgPrice: 100, currentPrice: 100 };
const order = { id: 'order-before', assetId: asset.id, ticker: asset.tickerOrName, type: asset.type, operation: 'BUY', date: '2026-11-09', quantity: 1, unitPrice: 100, totalValue: 100 };

function walk(element, predicate) {
  if (!element || typeof element !== 'object') return undefined;
  if (predicate(element)) return element;
  for (const child of [element.props?.children].flat(Infinity)) {
    const found = walk(child, predicate);
    if (found) return found;
  }
}

async function withRestore(run) {
  const saved = new Map(['window', 'document', '__backupHooks', '__backupBanking', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const storage = new Map([
    ['tracker-financeiro:data', JSON.stringify({ transactions: [transaction], categories: [category] })],
    ['tracker-financeiro:rules', JSON.stringify([rule])],
    ['tracker-financeiro:investments', JSON.stringify([asset])],
    ['tracker-financeiro:investment-orders', JSON.stringify([order])],
  ]);
  const writes = [];
  const alerts = [];
  const hooks = {
    cells: [], cursor: 0, effects: [], setters: [],
    useState(initial) {
      const index = this.cursor++;
      if (!(index in this.cells)) this.cells[index] = typeof initial === 'function' ? initial() : initial;
      return [this.cells[index], value => {
        this.setters.push(index);
        this.cells[index] = typeof value === 'function' ? value(this.cells[index]) : value;
      }];
    },
    useEffect(effect) { this.effects.push(effect); },
    useMemo(fn) { return fn(); },
    useCallback(fn) { return fn; },
    useRef(value) { return { current: value }; },
  };
  globalThis.__backupHooks = hooks;
  globalThis.__backupBanking = { snapshot: { configured: false, connections: [], accounts: [], transactions: [] } };
  globalThis.window = { alert: message => alerts.push(message), localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { writes.push(key); storage.set(key, value); },
    removeItem: key => { writes.push(key); storage.delete(key); },
  } };
  globalThis.document = { documentElement: { classList: { toggle() {} }, style: {} } };
  globalThis.fetch = () => { throw new Error('Rede desabilitada no teste de restauracao'); };
  const render = () => {
    hooks.cursor = 0;
    hooks.effects = [];
    return App();
  };
  const flush = () => { for (const effect of hooks.effects) effect(); };
  try {
    const tree = render();
    flush();
    writes.length = 0;
    const input = walk(tree, node => node.type === 'input' && node.props.accept === '.json,application/json');
    assert.ok(input, 'input real de restauracao do App');
    const restore = async payload => {
      const target = { files: [{ text: async () => typeof payload === 'string' ? payload : JSON.stringify(payload) }], value: 'fixture.json' };
      await input.props.onChange({ target });
      return target;
    };
    return await run({ storage, hooks, writes, alerts, restore, render, flush });
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

function bankingBackup() {
  const store = new Store();
  const itemId = '11111111-1111-4111-8111-111111111111';
  const account = { id: 'synthetic-account', itemId, name: 'Sintetica', type: 'BANK', currencyCode: 'BRL', balance: 100 };
  try {
    store.registerConnection({ itemId, label: 'Sintetica' });
    store.applySync(itemId, { accounts: [normalizeAccount(account, itemId)], transactions: [normalizeTransaction({ id: 'synthetic-tx', accountId: account.id, description: 'Compra sintetica', date: '2026-11-09', amount: -25, type: 'DEBIT', status: 'POSTED', currencyCode: 'BRL' }, account)], status: 'UPDATED' }, '2026-11-09T12:00:00Z');
    return store.backup();
  } finally { store.close(); }
}

async function assertRejected(payload, message = /backup|formato|invalido|inválido/i) {
  return withRestore(async ({ storage, hooks, writes, alerts, restore, render, flush }) => {
    const beforeStorage = new Map(storage);
    const beforeCells = structuredClone(hooks.cells);
    const target = await restore(payload);
    assert.deepEqual(hooks.setters, [], 'formato rejeitado nao pode chamar nenhum setter');
    assert.deepEqual(hooks.cells, beforeCells, 'estado integral preservado');
    assert.deepEqual(writes, [], 'nenhuma escrita ou limpeza durante rejeicao');
    render();
    flush();
    assert.deepEqual(storage, beforeStorage, 'dados, categorias, regras, ativos e ordens persistidos intactos');
    assert.equal(target.value, '', 'input permite selecionar o arquivo novamente');
    assert.equal(alerts.length, 1);
    assert.match(alerts[0], message);
    return { setterCalls: hooks.setters.length, preservedStorageKeys: [...beforeStorage.keys()].filter(key => storage.get(key) === beforeStorage.get(key)), alert: alerts[0] };
  });
}

test('F1: callback real rejeita Store.backup bancario sem setters nem perda de dados', async t => {
  t.diagnostic(JSON.stringify(await assertRejected(bankingBackup(), /banc[aá]ri[oa]/i)));
});

function legacyBackup() {
  return structuredClone({
    transactions: [{ ...transaction, id: 'restored-tx' }],
    categories: [category], rules: [rule],
    assets: [{ ...asset, id: 'restored-asset' }],
    investmentOrders: [{ ...order, id: 'restored-order', assetId: 'restored-asset' }],
    exportedAt: '2026-11-09T12:00:00.000Z',
  });
}

test('F1: valida todo o formato antes do primeiro setter, inclusive a ultima ordem', async t => {
  const cases = [
    ['null', () => null],
    ['array', () => []],
    ['objeto vazio', () => ({})],
    ['transactions ausente', p => { delete p.transactions; return p; }],
    ['categories ausente', p => { delete p.categories; return p; }],
    ['rules ausente', p => { delete p.rules; return p; }],
    ['exportedAt invalido', p => { p.exportedAt = 'ontem'; return p; }],
    ['secao nula', p => { p.rules = null; return p; }],
    ['carteira incompleta', p => { delete p.investmentOrders; return p; }],
    ['transacao sem amount', p => { delete p.transactions[0].amount; return p; }],
    ['amount textual', p => { p.transactions[0].amount = '10'; return p; }],
    ['amount nulo', p => { p.transactions[0].amount = null; return p; }],
    ['amount acima da precisao segura', p => { p.transactions[0].amount = 1e100; return p; }],
    ['data impossivel', p => { p.transactions[0].date = '2026-02-30'; return p; }],
    ['tipo invalido', p => { p.transactions[0].type = 'DEBIT'; return p; }],
    ['origem bancaria disfarcada', p => { p.transactions[0].source = 'pluggy'; return p; }],
    ['descricao nao textual', p => { p.transactions[0].description = {}; return p; }],
    ['id vazio', p => { p.transactions[0].id = ' '; return p; }],
    ['id duplicado', p => { p.transactions.push({ ...p.transactions[0] }); return p; }],
    ['createdAt invalido', p => { p.transactions[0].createdAt = 'nao-data'; return p; }],
    ['flag nao booleana', p => { p.transactions[0].isSelfTransfer = 'false'; return p; }],
    ['categoria sem keywords', p => { delete p.categories[0].keywords; return p; }],
    ['categoria invalida', p => { p.categories[0].name = 3; return p; }],
    ['tipo categoria invalido', p => { p.categories[0].type = 'debit'; return p; }],
    ['regra invalida', p => { p.rules[0].isActive = 'true'; return p; }],
    ['keyword invalida', p => { p.rules[0].keywords = [3]; return p; }],
    ['ativo invalido', p => { p.assets[0].currentPrice = '100'; return p; }],
    ['ativo negativo', p => { p.assets[0].quantity = -1; return p; }],
    ['tipo ativo invalido', p => { p.assets[0].type = 'Desconhecido'; return p; }],
    ['alocacao invalida', p => { p.assets[0].targetAllocationPercent = 101; return p; }],
    ['ultima ordem invalida', p => { p.investmentOrders.push({ ...p.investmentOrders[0], id: 'last', unitPrice: '100' }); return p; }],
    ['operacao invalida', p => { p.investmentOrders[0].operation = 'TRANSFER'; return p; }],
    ['quantidade ordem negativa', p => { p.investmentOrders[0].quantity = -1; return p; }],
    ['data ordem invalida', p => { p.investmentOrders[0].date = '2026-13-09'; return p; }],
    ['versao desconhecida', p => { p.version = 99; return p; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, () => assertRejected(mutate(legacyBackup())));
  await t.test('JSON invalido', () => assertRejected('{"transactions":', /JSON|backup|formato/i));
  await t.test('numero nao finito no JSON', () => assertRejected(JSON.stringify(legacyBackup()).replace('"amount":10', '"amount":1e999')));
});

test('F1: legado documentado sem secoes opcionais de investimentos preserva a carteira', async () => {
  await withRestore(async ({ storage, hooks, alerts, restore, render, flush }) => {
    const beforeAssets = storage.get('tracker-financeiro:investments');
    const beforeOrders = storage.get('tracker-financeiro:investment-orders');
    const payload = legacyBackup();
    delete payload.assets;
    delete payload.investmentOrders;
    await restore(payload);
    assert.equal(hooks.setters.length, 3, 'apenas historico, categorias e regras sao restaurados');
    assert.deepEqual(alerts, []);
    render();
    flush();
    assert.deepEqual(JSON.parse(storage.get('tracker-financeiro:data')), { transactions: payload.transactions, categories: payload.categories });
    assert.deepEqual(JSON.parse(storage.get('tracker-financeiro:rules')), payload.rules);
    assert.equal(storage.get('tracker-financeiro:investments'), beforeAssets);
    assert.equal(storage.get('tracker-financeiro:investment-orders'), beforeOrders);
  });
});

test('F1: secoes explicitamente vazias de um backup valido podem limpar historico e carteira', async () => {
  await withRestore(async ({ storage, alerts, restore, render, flush }) => {
    await restore({ transactions: [], categories: [category], rules: [], assets: [], investmentOrders: [], exportedAt: '2026-11-09T12:00:00.000Z' });
    assert.deepEqual(alerts, []);
    render();
    flush();
    assert.deepEqual(JSON.parse(storage.get('tracker-financeiro:data')), { transactions: [], categories: [category] });
    for (const key of ['tracker-financeiro:rules', 'tracker-financeiro:investments', 'tracker-financeiro:investment-orders']) assert.deepEqual(JSON.parse(storage.get(key)), []);
  });
});

test('F1: formato legado completo documentado restaura todas as secoes', async () => {
  await withRestore(async ({ storage, hooks, alerts, restore, render, flush }) => {
    const payload = legacyBackup();
    await restore(payload);
    assert.equal(hooks.setters.length, 5);
    assert.deepEqual(alerts, []);
    render();
    flush();
    assert.deepEqual(JSON.parse(storage.get('tracker-financeiro:data')), { transactions: payload.transactions, categories: payload.categories });
    assert.deepEqual(JSON.parse(storage.get('tracker-financeiro:rules')), payload.rules);
    assert.deepEqual(JSON.parse(storage.get('tracker-financeiro:investments')), payload.assets);
    assert.deepEqual(JSON.parse(storage.get('tracker-financeiro:investment-orders')), payload.investmentOrders);
  });
});
