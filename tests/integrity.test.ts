import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';

export const tx = (id = 'one') => ({ id, date: '2026-11-01', description: 'Purchase', amount: 12.34, type: 'expense' as const, categoryId: 'other', source: 'import' as const, createdAt: '2026-11-01T12:00:00.000Z' });
export const data = () => ({ transactions: [tx()], categories: [{ id: 'other', name: 'Other', color: '#000000', keywords: [], type: 'both' as const }], rules: [], assets: [{ id: 'asset', tickerOrName: 'TEST', type: 'Ações' as const, quantity: 2, avgPrice: 10, currentPrice: 12 }], investmentOrders: [] });
export const snapshot = () => ({ family: 'tracker-financeiro', schemaVersion: 1, revision: 0, savedAt: '2026-11-01T12:00:00.000Z', data: data() });

describe('shared snapshot boundary', () => {
  it('validates the versioned unified contract without changing BRL magnitudes', async () => {
    expect(existsSync('src/data/snapshot.ts'), 'shared snapshot contract exists').toBe(true);
    const modulePath = '../src/data/snapshot';
    const contract = await import(modulePath);
    expect(contract.parseSnapshot(snapshot())).toEqual(snapshot());
    expect(contract.parseSnapshot(snapshot()).data.transactions[0].amount).toBe(12.34);
    for (const value of [{}, [], { ...snapshot(), family: 'unrelated' }, { ...snapshot(), schemaVersion: 2 }]) {
      expect(() => contract.parseSnapshot(value)).toThrow();
    }
  });
});
