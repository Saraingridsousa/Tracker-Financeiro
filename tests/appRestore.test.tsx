
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { defaultCategories } from '../src/data/defaultCategories';
import { makeSnapshot } from '../src/data/snapshot';
import { SNAPSHOT_KEY, RECOVERY_KEY } from '../src/data/financeStore';
// Only visualization components are replaced: finance, persistence, hooks and App callbacks are real.
vi.mock('../src/components/CategoryPieChart', () => ({ CategoryPieChart: () => <div /> }));
vi.mock('../src/components/MonthlyBarChart', () => ({ MonthlyBarChart: () => <div /> }));
const snapshot = () => makeSnapshot({ transactions: [{ id: 't', date: '2026-11-01', description: 'Synthetic', amount: 10, type: 'expense', categoryId: 'uncategorized', source: 'import', bank: 'Inter', createdAt: '2026-11-01T12:00:00.000Z' }], categories: defaultCategories, rules: [], assets: [{ id: 'a', tickerOrName: 'TEST', type: 'Ações', quantity: 2, avgPrice: 10, currentPrice: 12 }], investmentOrders: [] });
beforeEach(() => { cleanup(); localStorage.clear(); vi.resetModules(); vi.spyOn(window, 'alert').mockImplementation(() => {}); vi.spyOn(window, 'confirm').mockReturnValue(false); Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_: string, work: () => Promise<unknown>) => work() } }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function mount() { const App = (await import('../src/App')).default; return render(<App />); }
function selectBackup(view: ReturnType<typeof render>, value: unknown) { const input = view.container.querySelector('input[accept*=".json"]'); expect(input).not.toBeNull(); fireEvent.change(input!, { target: { files: [{ size: 100, text: async () => JSON.stringify(value) }] } }); }
describe('actual App restore UI', () => {
  it('rejects unrelated JSON without a write or confirmation dialog', async () => { const view = await mount(); selectBackup(view, { unrelated: true }); await waitFor(() => expect(window.alert).toHaveBeenCalled()); expect(window.confirm).not.toHaveBeenCalled(); expect(localStorage.getItem(SNAPSHOT_KEY)).toBeNull(); });
  it('rejects malformed investments before any module is changed', async () => { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot())); const original = localStorage.getItem(SNAPSHOT_KEY); const view = await mount(); const bad = snapshot(); (bad.data.assets[0] as any).quantity = -1; selectBackup(view, bad); await waitFor(() => expect(window.alert).toHaveBeenCalled()); expect(localStorage.getItem(SNAPSHOT_KEY)).toBe(original); expect(window.confirm).not.toHaveBeenCalled(); });
  it('canceling valid preview preserves existing data and recovery slot', async () => { const original = JSON.stringify(snapshot()); localStorage.setItem(SNAPSHOT_KEY, original); const view = await mount(); selectBackup(view, snapshot()); await waitFor(() => expect(window.confirm).toHaveBeenCalled()); expect(localStorage.getItem(SNAPSHOT_KEY)).toBe(original); expect(localStorage.getItem(RECOVERY_KEY)).toBeNull(); });
  it('confirmed restore persists one unified snapshot for both screens', async () => { vi.mocked(window.confirm).mockReturnValue(true); const view = await mount(); const incoming = snapshot(); selectBackup(view, incoming); await waitFor(() => expect(localStorage.getItem(SNAPSHOT_KEY)).not.toBeNull()); const saved = JSON.parse(localStorage.getItem(SNAPSHOT_KEY)!); expect(saved.data).toEqual(incoming.data); expect(saved.schemaVersion).toBe(1); expect(saved.revision).toBe(1); expect(localStorage.getItem(RECOVERY_KEY)).not.toBeNull(); expect(window.alert).not.toHaveBeenCalled(); });
  it('denied localStorage still mounts the recovery UI instead of crashing', async () => { vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); }); await mount(); expect(screen.getByRole('alert').textContent).toContain('preservados'); expect(screen.getByRole('button', { name: 'Exportar recuperação' })).toBeTruthy(); });
});
