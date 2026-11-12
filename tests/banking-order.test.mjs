import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('late snapshot or error cannot overwrite a completed banking mutation', async () => {
  const saved = new Map(['__orderHooks', '__orderApi'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    const source = readFileSync(new URL('../src/hooks/useBanking.ts', import.meta.url), 'utf8')
      .replace(/import \{([^}]+)\} from 'react';/, ['useState', 'useRef', 'useCallback', 'useEffect'].map(name => 'const ' + name + ' = (...args) => globalThis.__orderHooks.' + name + '(...args);').join('\n'))
      .replace("import { createBankingApi } from '../lib/bankingApi';", 'const createBankingApi = () => ({load: (...a) => globalThis.__orderApi.load(...a), mutate: (...a) => globalThis.__orderApi.mutate(...a)});');
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
    const { useBanking } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
    for (const failOld of [false, true]) {
      const cells = [];
      let cursor = 0, effect, releaseOld, reads = 0;
      globalThis.__orderHooks = {
        useState(initial) {
          const i = cursor++;
          if (!(i in cells)) cells[i] = initial;
          return [cells[i], value => { cells[i] = typeof value === 'function' ? value(cells[i]) : value; }];
        },
        useRef(initial) {
          const i = cursor++;
          if (!(i in cells)) cells[i] = { current: initial };
          return cells[i];
        },
        useCallback: fn => fn,
        useEffect: fn => { effect = fn; },
      };
      const oldSnapshot = { configured: false, connections: [], accounts: [], transactions: [] };
      const newSnapshot = { ...oldSnapshot, connections: [{ id: 'new-connection' }] };
      globalThis.__orderApi = {
        load: () => ++reads === 1 ? new Promise((resolve, reject) => {
          releaseOld = () => failOld ? reject(Error('outdated error')) : resolve(oldSnapshot);
        }) : Promise.resolve(newSnapshot),
        mutate: async () => ({}),
      };
      const controller = useBanking();
      effect();
      assert.equal(await controller.addConnection('synthetic', 'Synthetic'), true);
      assert.deepEqual(cells[0], newSnapshot);
      releaseOld();
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(cells[0], newSnapshot);
      assert.equal(cells[2], '');
    }
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
