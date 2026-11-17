import type { BankingSnapshot } from '../types/banking';

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const currency = (value: unknown) => typeof value === 'string' && /^[A-Z]{3}$/.test(value);
const timestamp = (value: unknown) => value === null || (text(value) && Number.isFinite(Date.parse(value)));
const civilDate = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
function snapshot(body: unknown): BankingSnapshot {
  const invalid = () => { throw new Error('Resposta bancária inválida; os dados anteriores foram preservados.'); };
  if (!record(body) || typeof body.configured !== 'boolean' || !Array.isArray(body.connections) || !Array.isArray(body.accounts) || !Array.isArray(body.transactions)) return invalid();
  if (body.sharedStateAvailable !== undefined && typeof body.sharedStateAvailable !== 'boolean') return invalid();
  if (body.accessMode !== undefined && !['local','private'].includes(body.accessMode as string)) return invalid();
  if (!body.connections.every(c => record(c) && text(c.id) && text(c.label) && text(c.status) && timestamp(c.lastFetchedAt) && timestamp(c.providerUpdatedAt) && timestamp(c.consentExpiresAt) && (c.lastError === null || typeof c.lastError === 'string'))) return invalid();
  const connectionIds = new Set(body.connections.map(c => c.id));
  if (!body.accounts.every(a => record(a) && text(a.id) && connectionIds.has(a.itemId) && text(a.name) && ['BANK','CREDIT'].includes(a.type as string) && currency(a.currencyCode) && Number.isSafeInteger(a.balanceCents))) return invalid();
  const accountIds = new Set(body.accounts.map(a => a.id));
  if (!body.transactions.every(t => record(t) && text(t.id) && text(t.providerTransactionId) && accountIds.has(t.accountId) && civilDate(t.date) && typeof t.description === 'string' && Number.isSafeInteger(t.amountCents) && (t.amountCents as number) >= 0 && t.amount === (t.amountCents as number) / 100 && ['income','expense'].includes(t.type as string) && t.source === 'pluggy' && ['POSTED','PENDING'].includes(t.providerStatus as string) && currency(t.currencyCode) && typeof t.manualCategory === 'boolean' && (t.categoryId === null || text(t.categoryId)))) return invalid();
  for (const rows of [body.connections, body.accounts, body.transactions]) if (new Set(rows.map(r => r.id)).size !== rows.length) return invalid();
  return body as unknown as BankingSnapshot;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Sem credenciais Pluggy: fala apenas com a API privada da própria aplicação. */
export function createBankingApi(fetcher: FetchLike = (path, init) => fetch(path, init)) {
  async function request(path: string, init?: RequestInit): Promise<unknown> {
    let response: Response;
    try { response = await fetcher(path, { credentials: 'same-origin', ...init }); }
    catch { throw new Error('Backend indisponível. Inicie o aplicativo com npm run dev.'); }
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) throw new Error((typeof body?.error === 'string' ? body.error : '') || `Não foi possível concluir a operação (HTTP ${response.status}).`);
    if (body === null) throw new Error('Resposta local inválida; os dados anteriores foram preservados.');
    return body;
  }
  return {
    async load(): Promise<BankingSnapshot> {
      return snapshot(await request('/api/banking'));
    },
    async mutate(method: 'POST' | 'PATCH' | 'DELETE', path: string, body: unknown = {}) {
      const session = await request('/api/session') as { csrfToken?: string };
      if (!text(session?.csrfToken)) throw new Error('Sessão local inválida. Reabra o aplicativo.');
      return snapshot(await request(path, { method, headers: { 'Content-Type': 'application/json', 'X-Tracker-CSRF': session.csrfToken }, body: JSON.stringify(body) }));
    },
    backup: () => request('/api/backup'),
  };
}
