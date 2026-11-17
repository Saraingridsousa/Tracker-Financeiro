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
const nullableText = (v:unknown) => v === null || text(v);
const optionalTime = (v:unknown) => v === undefined || timestamp(v);
const nullableCents = (v:unknown) => v === null || Number.isSafeInteger(v);
const optionalFlag = (v:unknown) => v === undefined || typeof v === 'boolean';
function productState(v:unknown):boolean {
  return record(v) && ['available','empty','unavailable','error'].includes(v.state as string)
    && (v.returned===undefined||(Number.isSafeInteger(v.returned)&&(v.returned as number)>=0))
    && (v.message===undefined||typeof v.message==='string');
}
function snapshot(body: unknown): BankingSnapshot {
  const invalid = () => { throw new Error('Resposta bancária inválida; os dados anteriores foram preservados.'); };
  if (!record(body) || typeof body.configured !== 'boolean' || !Array.isArray(body.connections) || !Array.isArray(body.accounts) || !Array.isArray(body.transactions)) return invalid();
  if (body.sharedStateAvailable !== undefined && typeof body.sharedStateAvailable !== 'boolean') return invalid();
  if (body.accessMode !== undefined && !['local','private'].includes(body.accessMode as string)) return invalid();
  if (!body.connections.every(c => record(c) && text(c.id) && text(c.label) && text(c.status) && timestamp(c.lastFetchedAt) && timestamp(c.providerUpdatedAt) && timestamp(c.consentExpiresAt) && (c.lastError === null || typeof c.lastError === 'string'))) return invalid();
  const connectionIds = new Set(body.connections.map(c => c.id));
  if (!body.accounts.every(a => record(a) && text(a.id) && connectionIds.has(a.itemId) && text(a.name) && ['BANK','CREDIT'].includes(a.type as string) && currency(a.currencyCode) && Number.isSafeInteger(a.balanceCents))) return invalid();
  const accountIds = new Set(body.accounts.map(a => a.id));
  const accountOwners = new Map(body.accounts.map(a => [a.id,a.itemId]));
  for(const c of body.connections) {
    if(![c.lastSuccessfulSyncAt,c.lastAttemptAt,c.lastFullSyncAt].every(optionalTime) || (c.syncMode!==undefined&&!['full','incremental'].includes(c.syncMode as string)) || (c.executionStatus!==undefined&&!nullableText(c.executionStatus)))return invalid();
    if(c.identification!==undefined) {
      const i=c.identification;
      if(!record(i)||!['confirmed','mismatch','partial','unverified'].includes(i.state as string)||(i.institutions!==undefined&&(!Array.isArray(i.institutions)||!i.institutions.every(text)))||(i.codes!==undefined&&(!Array.isArray(i.codes)||!i.codes.every(v=>typeof v==='string'&&/^\d{3}$/.test(v)))))return invalid();
    }
    if(c.productStates!==undefined) {
      if(!record(c.productStates))return invalid();
      for(const key of ['bills','investments']) {
        const state=c.productStates[key];if(state===undefined)continue;
        if(!productState(state))return invalid();
        if(record(state)&&state.accounts!==undefined&&(!Array.isArray(state.accounts)||!state.accounts.every(a=>record(a)&&accountOwners.get(a.accountId)===c.id&&productState(a))))return invalid();
      }
    }
  }
  for(const a of body.accounts) {
    const i=a.institution;
    if(i!==undefined&&(!record(i)||!nullableText(i.name)||!(i.code===null||(typeof i.code==='string'&&/^\d{3}$/.test(i.code)))||!nullableText(i.family)||!['bankData.transferNumber','account.name','unavailable'].includes(i.source as string)||!['identified','reported','unverified'].includes(i.state as string)))return invalid();
    const credit=a.creditData;
    if(credit!==undefined&&(!record(credit)||!nullableCents(credit.creditLimitCents)||!nullableCents(credit.availableCreditLimitCents)||!(credit.dueDate===null||civilDate(credit.dueDate))))return invalid();
  }
  if (!body.transactions.every(t => record(t) && text(t.id) && text(t.providerTransactionId) && accountIds.has(t.accountId) && civilDate(t.date) && typeof t.description === 'string' && Number.isSafeInteger(t.amountCents) && (t.amountCents as number) >= 0 && t.amount === (t.amountCents as number) / 100 && ['income','expense'].includes(t.type as string) && t.source === 'pluggy' && ['POSTED','PENDING'].includes(t.providerStatus as string) && currency(t.currencyCode) && typeof t.manualCategory === 'boolean' && (t.categoryId === null || text(t.categoryId)))) return invalid();
  for (const rows of [body.connections, body.accounts, body.transactions]) if (new Set(rows.map(r => r.id)).size !== rows.length) return invalid();
  if (body.products !== undefined) {
    if(!record(body.products)||!Array.isArray(body.products.bills)||!Array.isArray(body.products.investments))return invalid();
    if(!body.products.bills.every(b=>record(b)&&text(b.id)&&connectionIds.has(b.itemId)&&accountOwners.get(b.accountId)===b.itemId&&civilDate(b.dueDate)&&currency(b.currencyCode)&&Number.isSafeInteger(b.totalAmountCents)&&(b.minimumPaymentCents===null||Number.isSafeInteger(b.minimumPaymentCents))&&(b.closingDate===null||civilDate(b.closingDate))&&optionalTime(b.observedAt)))return invalid();
    if(!body.products.investments.every(i=>record(i)&&text(i.id)&&connectionIds.has(i.itemId)&&text(i.name)&&text(i.type)&&currency(i.currencyCode)&&Number.isSafeInteger(i.balanceCents)&&(i.referenceDate===null||civilDate(i.referenceDate))&&text(i.status)&&(i.dueDate===null||civilDate(i.dueDate))&&[i.grossAmountCents,i.originalAmountCents,i.profitCents].every(nullableCents)&&(i.quantity===null||(typeof i.quantity==='number'&&Number.isFinite(i.quantity)))&&optionalTime(i.observedAt)))return invalid();
    for(const rows of [body.products.bills,body.products.investments])if(new Set(rows.map(r=>r.id)).size!==rows.length)return invalid();
  }
  if(!body.transactions.every(t=>(t.notes===undefined||(typeof t.notes==='string'&&t.notes.length<=2000))&&optionalFlag(t.isSelfTransfer)&&optionalFlag(t.manualSelfTransfer)))return invalid();
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
