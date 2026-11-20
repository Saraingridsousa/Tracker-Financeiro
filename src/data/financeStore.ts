import { useSyncExternalStore } from 'react';
import { defaultCategories } from './defaultCategories';
import { DataValidationError, makeSnapshot, parseBackup, parseData, parseSnapshot, type FinanceData, type FinanceSnapshot } from './snapshot';

export const SNAPSHOT_KEY = 'tracker-financeiro:snapshot:v1';
export const RECOVERY_KEY = 'tracker-financeiro:recovery';
export const LEGACY_KEYS = ['tracker-financeiro:data', 'tracker-financeiro:rules', 'tracker-financeiro:investments', 'tracker-financeiro:investment-orders'] as const;
type StorageIO = Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'key' | 'length'>>;
type Lock = <T>(work: () => Promise<T>) => Promise<T>;
export interface StoreStatus { snapshot: FinanceSnapshot; error: string | null; blocked: boolean }
const emptyData = (): FinanceData => ({ transactions: [], categories: structuredClone(defaultCategories), rules: [], assets: [], investmentOrders: [] });
const safeLock: Lock = async work => {
  if (typeof navigator === 'undefined' || !navigator.locks) return Promise.reject(new Error('Este navegador não oferece bloqueio seguro entre abas. Use um navegador atualizado em localhost.'));
  return await navigator.locks.request('tracker-financeiro-write-v1', work);
};

/** No mount-time autosave. One validated atomic document, with cross-tab writer serialization. */
export class FinanceStore {
  private status: StoreStatus = { snapshot: makeSnapshot(emptyData()), error: null, blocked: false };
  private raw: string | null = null;
  private legacy: Record<string, string | null> = {};
  private listeners = new Set<() => void>();
  private queue = Promise.resolve();
  constructor(private storage: StorageIO, private lock: Lock = safeLock) {
    try {
      this.raw = storage.getItem(SNAPSHOT_KEY);
      for (const key of LEGACY_KEYS) this.legacy[key] = storage.getItem(key);
      if (this.raw !== null) this.status.snapshot = parseSnapshot(JSON.parse(this.raw));
      else {
        const main = this.legacy[LEGACY_KEYS[0]];
        const initial = emptyData();
        if (main !== null) {
          const parsed: unknown = JSON.parse(main);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('transactions' in parsed) || !('categories' in parsed)) throw new Error('Formato legado inválido.');
          Object.assign(initial, { transactions: parsed.transactions, categories: parsed.categories });
        }
        const [, ruleKey, assetKey, orderKey] = LEGACY_KEYS;
        if (this.legacy[ruleKey] !== null) initial.rules = JSON.parse(this.legacy[ruleKey]!);
        if (this.legacy[assetKey] !== null) initial.assets = JSON.parse(this.legacy[assetKey]!);
        if (this.legacy[orderKey] !== null) initial.investmentOrders = JSON.parse(this.legacy[orderKey]!);
        this.status.snapshot = makeSnapshot(parseData(initial));
      }
    } catch {
      this.status = { ...this.status, blocked: true, error: 'Não foi possível validar/ler os dados salvos. Os originais foram preservados; gravações estão bloqueadas. Exporte a recuperação e restaure um backup válido.' };
    }
  }
  getStatus = () => this.status;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(status: StoreStatus) { this.status = status; for (const listener of this.listeners) listener(); }
  private fail(error: unknown): never {
    const message = error instanceof Error ? error.message : 'Falha no armazenamento.';
    // Never include raw stored values or arbitrary browser/IO exception messages in logs.
    const invalidEdit = error instanceof DataValidationError;
    this.publish({ ...this.status, blocked: this.status.blocked || !invalidEdit, error: invalidEdit ? message : 'Gravação bloqueada: falha de armazenamento, conflito entre abas ou bloqueio indisponível. Exporte os dados antes de recarregar.' });
    throw new Error(this.status.error!);
  }
  private enqueue(work: () => Promise<void>): Promise<void> {
    const pending = this.queue.then(() => this.lock(work));
    this.queue = pending.catch(() => {});
    const result = pending.catch(error => this.fail(error));
    void result.catch(() => { /* Errors remain awaitable and are also exposed to the recovery UI. */ });
    return result;
  }
  update(change: (data: FinanceData) => FinanceData, archivePrevious = false): Promise<void> {
    return this.enqueue(async () => {
      if (this.status.blocked) throw new Error('Armazenamento bloqueado.');
      let data: FinanceData;
      try { data = parseData(change(structuredClone(this.status.snapshot.data))); }
      catch (error) { throw error instanceof DataValidationError ? error : new DataValidationError('Operação inválida. Nenhum dado foi alterado.'); }
      await this.commit(data, false, archivePrevious);
    });
  }
  /** A validated preview changes nothing, even when other collections are malformed. */
  previewBackup(value: unknown) { return parseBackup(value, this.status.snapshot.data); }
  restore(value: unknown, confirmed: boolean): Promise<void> {
    const input: unknown = structuredClone(value);
    this.previewBackup(input);
    if (!confirmed) return Promise.reject(new Error('A restauração precisa de confirmação explícita.'));
    return this.enqueue(async () => this.commit(this.previewBackup(input).data, true));
  }
  resetAll() { return this.update(() => emptyData(), true); }
  private async commit(data: FinanceData, restoring: boolean, archivePrevious = restoring) {
    const currentRaw = this.storage.getItem(SNAPSHOT_KEY);
    if (currentRaw !== this.raw) throw new Error('Conflito entre abas.');
    if (currentRaw === null) for (const key of LEGACY_KEYS) if (this.storage.getItem(key) !== this.legacy[key]) throw new Error('Dados legados alterados por outra aba.');
    let revision = this.status.snapshot.revision;
    if (currentRaw !== null) {
      try { revision = parseSnapshot(JSON.parse(currentRaw)).revision; }
      catch { if (!restoring) throw new Error('Snapshot corrompido.'); }
    }
    const next = makeSnapshot(data, revision + 1);
    const serialized = JSON.stringify(next);
    const recovery = JSON.stringify({ family: 'tracker-financeiro-recovery', savedAt: new Date().toISOString(), previousSnapshot: currentRaw, legacy: this.legacy });
    // Recovery failure aborts BEFORE touching the primary document or React state.
    if (archivePrevious) {
      const archiveKey = `${RECOVERY_KEY}:${crypto.randomUUID()}`;
      this.storage.setItem(archiveKey, recovery);
      if (this.storage.getItem(archiveKey) !== recovery) throw new Error('Arquivo de recuperação não confirmado.');
    }
    this.storage.setItem(RECOVERY_KEY, recovery);
    if (this.storage.getItem(RECOVERY_KEY) !== recovery) throw new Error('Recuperação não confirmada.');
    this.storage.setItem(SNAPSHOT_KEY, serialized);
    if (this.storage.getItem(SNAPSHOT_KEY) !== serialized) throw new Error('Snapshot não confirmado.');
    this.raw = serialized;
    this.publish({ snapshot: next, blocked: false, error: null });
  }
  handleStorageEvent = (key: string | null) => {
    if (key !== null && key !== SNAPSHOT_KEY && !LEGACY_KEYS.some(k => k === key)) return;
    try {
      const raw = this.storage.getItem(SNAPSHOT_KEY);
      if (raw === this.raw && (raw !== null || LEGACY_KEYS.every(k => this.storage.getItem(k) === this.legacy[k]))) return;
      // Keep this tab's version downloadable. Never silently overwrite unsaved local intent.
      this.publish({ ...this.status, blocked: true, error: 'Os dados foram alterados em outra aba. Exporte esta versão se necessário e recarregue antes de editar.' });
    } catch { this.publish({ ...this.status, blocked: true, error: 'Falha ao ler uma alteração do armazenamento. Dados desta aba preservados.' }); }
  };
  previousSnapshot(): FinanceSnapshot {
    const raw = this.storage.getItem(RECOVERY_KEY);
    if (!raw) throw new DataValidationError('Nenhuma cópia de recuperação anterior disponível.');
    const saved = JSON.parse(raw);
    if (saved?.family !== 'tracker-financeiro-recovery') throw new DataValidationError('Formato de recuperação inválido. Exporte a evidência original.');
    if (typeof saved.previousSnapshot === 'string') return parseSnapshot(JSON.parse(saved.previousSnapshot));
    const legacy = saved.legacy;
    if (!legacy || typeof legacy !== 'object') throw new DataValidationError('Cópia legada incompleta.');
    const recovered = new FinanceStore({ getItem: key => key === SNAPSHOT_KEY ? null : legacy[key] ?? null, setItem: () => { throw new Error('Read-only recovery preview.'); } }, this.lock);
    if (recovered.getStatus().blocked) throw new DataValidationError('A cópia anterior contém dados inválidos. Exporte a evidência original antes de corrigir.');
    return recovered.getStatus().snapshot;
  }
  exportRecovery() {
    let previousSaved: string | null = null;
    const archives: Record<string, string | null> = {};
    let archiveReadFailed = false;
    try {
      previousSaved = this.storage.getItem(RECOVERY_KEY);
      if (this.storage.key && this.storage.length !== undefined) {
        for (let i = 0; i < this.storage.length; i++) {
          const key = this.storage.key(i);
          if (key?.startsWith(`${RECOVERY_KEY}:`)) archives[key] = this.storage.getItem(key);
        }
      }
    } catch { archiveReadFailed = true; /* Keep captured data available even when reads fail. */ }
    return { family: 'tracker-financeiro-recovery', snapshot: this.status.snapshot, originalSnapshot: this.raw, legacy: this.legacy, previousSaved, archives, archiveReadFailed };
  }
}
let browserStore: FinanceStore | undefined;
export function getFinanceStore(): FinanceStore {
  if (!browserStore) {
    // Obtaining localStorage itself can throw (privacy/security policy).
    const storage: StorageIO = { getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value), key: index => window.localStorage.key(index), get length() { return window.localStorage.length; } };
    browserStore = new FinanceStore(storage);
    window.addEventListener('storage', e => browserStore?.handleStorageEvent(e.key));
  }
  return browserStore;
}
export function useFinanceState() {
  const store = getFinanceStore();
  return { store, ...useSyncExternalStore(store.subscribe, store.getStatus, store.getStatus) };
}
export function useFinanceCollection<K extends keyof FinanceData>(key: K): [FinanceData[K], (value: FinanceData[K] | ((previous: FinanceData[K]) => FinanceData[K])) => Promise<void>] {
  const { store, snapshot } = useFinanceState();
  const set = (value: FinanceData[K] | ((previous: FinanceData[K]) => FinanceData[K])) => {
    const pending = store.update(data => ({ ...data, [key]: typeof value === 'function' ? value(data[key]) : value }));
    void pending.catch(() => { /* visible store error, callers can also await the original promise */ });
    return pending;
  };
  return [snapshot.data[key], set];
}
