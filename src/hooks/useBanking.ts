import { useCallback, useEffect, useRef, useState } from 'react';
import { createBankingApi } from '../lib/bankingApi';
import type { BankingSnapshot } from '../types/banking';

const api = createBankingApi();
const empty: BankingSnapshot = { configured: false, connections: [], accounts: [], transactions: [] };

export function useBanking() {
  const [snapshot, setSnapshot] = useState<BankingSnapshot>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const requestGeneration = ++generation.current;
    try {
      const next = await api.load();
      if (requestGeneration !== generation.current) return false;
      setSnapshot(next); setLoaded(true); setError(''); return true;
    } catch (err) {
      if (requestGeneration === generation.current) { setError(err instanceof Error ? err.message : 'Erro ao ler os dados bancários.'); }
      return false;
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  async function mutate(method: 'POST' | 'PATCH' | 'DELETE', path: string, body: unknown = {}) {
    ++generation.current; // A snapshot started before this write cannot supersede it.
    setBusy(true); setError('');
    try { await api.mutate(method, path, body); return await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Operação não concluída.'); return false; }
    finally { setBusy(false); }
  }
  async function downloadBackup() {
    setBusy(true);
    try {
      const blob = new Blob([JSON.stringify(await api.backup(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url;
      link.download = `tracker-bancos-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
      return true;
    } catch { setError('Não foi possível exportar os dados bancários.'); return false; }
    finally { setBusy(false); }
  }
  return { snapshot, loaded, busy, error, refresh, downloadBackup,
    addConnection: (itemId: string, label: string) => mutate('POST', '/api/connections', { itemId, label }),
    sync: (id: string) => mutate('POST', `/api/connections/${encodeURIComponent(id)}/sync`),
    updateTransaction: (id: string, updates: { categoryId?: string; description?: string }) => mutate('PATCH', `/api/transactions/${encodeURIComponent(id)}`, updates),
    hideTransaction: (id: string) => mutate('DELETE', `/api/transactions/${encodeURIComponent(id)}`),
  };
}
export type BankingController = ReturnType<typeof useBanking>;
