import { describe, expect, it } from 'vitest';
import { FinanceStore, RECOVERY_KEY } from '../src/data/financeStore';
import { defaultCategories } from '../src/data/defaultCategories';
import { makeSnapshot, parseSnapshot } from '../src/data/snapshot';
const data = () => ({ transactions: [], categories: defaultCategories, rules: [], assets: [], investmentOrders: [] });
class IO { values = new Map<string, string>(); getItem = (k: string) => this.values.get(k) ?? null; setItem = (k: string, v: string) => { this.values.set(k, v); }; }
const lock = async <T,>(work: () => Promise<T>) => work();
describe('recovery retention, queued restore and complete validation', () => {
  it('keeps restore recovery archived after later edits', async () => { const io = new IO(); const store = new FinanceStore(io, lock); await store.restore(makeSnapshot(data()), true); const saved = io.getItem(RECOVERY_KEY); await store.update(d => d); expect([...io.values.entries()].some(([key, value]) => key.startsWith(RECOVERY_KEY + ':') && value === saved)).toBe(true); });
  it('legacy restore preserves investment updates queued before it', async () => { const io = new IO(); const store = new FinanceStore(io, lock); const asset = { id: 'a', tickerOrName: 'TEST', type: 'Ações' as const, quantity: 2, avgPrice: 10, currentPrice: 20 }; const first = store.update(d => ({ ...d, assets: [asset] })); const second = store.restore({ transactions: [], categories: defaultCategories, rules: [], exportedAt: new Date().toISOString() }, true); await Promise.all([first, second]); expect(store.getStatus().snapshot.data.assets).toEqual([asset]); });
  it.each([{ amount: -1 }, { amount: '100' }, { categoryId: [] }, { isNeutral: 'yes' }, { date: '2026-02-30' }])('rejects invalid nested manual overrides', overrides => { const s = makeSnapshot(data()); (s.data.transactions as unknown[]).push({ id: 't', date: '2026-11-01', description: 'Synthetic', amount: 1, type: 'expense', categoryId: 'uncategorized', source: 'import', createdAt: new Date().toISOString(), manualOverrides: overrides }); expect(() => parseSnapshot(s)).toThrow(); });
});
