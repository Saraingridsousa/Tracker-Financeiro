import type { BankInvestment, BankingSnapshot } from '../types/banking';

export type Situation = 'active' | 'pending' | 'withdrawn' | 'unknown' | 'notReturned';
export type ConnectedPosition = BankInvestment & { situation: Situation; countsInCurrent: boolean; preserved: boolean; institutionLabel: string; institutionConfirmed: boolean; classKey: string; classLabel: string };
const types: Record<string, string> = { FIXED_INCOME: 'Renda fixa', EQUITY: 'Renda variável', MUTUAL_FUND: 'Fundos', SECURITY: 'Previdência', ETF: 'ETF', COE: 'COE', OTHER: 'Outros' };
const subtypes: Record<string, string> = { STOCK: 'Ações', BDR: 'BDR', REAL_ESTATE_FUND: 'FII', TREASURY: 'Tesouro Direto', RETIREMENT: 'Previdência privada', MULTIMARKET_FUND: 'Multimercado', INVESTMENT_FUND: 'Fundo de investimento' };
export const situationLabels: Record<Situation, string> = { active: 'Atual', pending: 'Pendente', withdrawn: 'Resgatado / encerrado', unknown: 'Situação desconhecida', notReturned: 'Não retornado na última leitura' };
export const formatOptionalCents = (cents: number | null | undefined, currency: string) => cents == null ? 'não informado' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100);
const time = (s?: string | null) => s ? Date.parse(s) : NaN;
export function summarizeConnectedInvestments({ snapshot, loaded = true, error = '' }: { snapshot: BankingSnapshot; loaded?: boolean; error?: string }, now = new Date()) {
  const coverage = snapshot.connections.map(c => {
    const product = c.productStates?.investments;
    const state = product?.state === 'available' ? 'complete' : product?.state ?? 'notQueried';
    const readAt = c.lastSuccessfulSyncAt ?? c.lastFetchedAt;
    return { id: c.id, label: c.label, state, readAt, partial: Boolean(c.lastError) || !['complete', 'empty'].includes(state), stale: Number.isFinite(time(readAt)) && now.getTime() - time(readAt) > 48 * 3600000 };
  });
  const unique = new Map<string, BankInvestment>();
  for (const i of snapshot.products?.investments ?? []) {
    const key = JSON.stringify([i.itemId, i.providerId]);
    const previous = unique.get(key);
    if (!previous || !(time(previous.observedAt) > time(i.observedAt))) unique.set(key, i);
  }
  const positions: ConnectedPosition[] = [...unique.values()].map(i => {
    const c = snapshot.connections.find(c => c.id === i.itemId);
    const state = c?.productStates?.investments?.state;
    const readAt = c?.lastSuccessfulSyncAt ?? c?.lastFetchedAt;
    // A successful transaction read does not make a failed investment read current.
    const notReturned = ['available', 'empty'].includes(state ?? '') && Number.isFinite(time(readAt)) && (!Number.isFinite(time(i.observedAt)) || time(i.observedAt) < time(readAt));
    const situation: Situation = notReturned ? 'notReturned' : i.status === 'ACTIVE' ? 'active' : i.status === 'PENDING' ? 'pending' : i.status === 'TOTAL_WITHDRAWAL' ? 'withdrawn' : 'unknown';
    const preserved = !['available', 'empty'].includes(state ?? '') || Boolean(c?.lastError);
    return { ...i, situation, countsInCurrent: situation === 'active', preserved, institutionLabel: c?.label ?? 'Conexão não identificada', institutionConfirmed: c?.identification?.state === 'confirmed', classKey: i.type + '/' + (i.subtype ?? ''), classLabel: (types[i.type] ?? i.type) + ' · ' + (i.subtype ? subtypes[i.subtype] ?? i.subtype : 'subtipo não informado') };
  });
  for (const c of coverage) {
    if (positions.some(p => p.itemId === c.id && p.situation === 'unknown')) c.partial = true;
  }
  const counts = { active: 0, pending: 0, withdrawn: 0, unknown: 0, notReturned: 0 };
  positions.forEach(p => counts[p.situation]++);
  const currencyMap = new Map<string, { currencyCode: string; cents: number; count: number }>();
  for (const p of positions.filter(p => p.countsInCurrent)) {
    const total = currencyMap.get(p.currencyCode) ?? { currencyCode: p.currencyCode, cents: 0, count: 0 };
    total.cents += p.balanceCents; total.count++; currencyMap.set(p.currencyCode, total);
  }
  const queried = coverage.some(c => c.state === 'complete' || c.state === 'empty');
  const status = error && !loaded ? 'loadError' : !loaded ? 'loading' : !coverage.length ? 'noConnections' : !queried && !positions.length ? 'notQueried' : 'ready';
  const primary = status === 'ready' ? currencyMap.get('BRL') ?? (queried ? { currencyCode: 'BRL', cents: 0, count: 0 } : null) : null;
  const totalsByCurrency = [...currencyMap.values()].sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
  const group = (kind: 'institution' | 'class') => {
    const groups = new Map<string, { key: string; label: string; cents: number; count: number }>();
    for (const p of positions.filter(p => p.countsInCurrent && p.currencyCode === 'BRL')) {
      const key = kind === 'institution' ? p.itemId : p.classKey;
      const g = groups.get(key) ?? { key, label: kind === 'institution' ? p.institutionLabel : p.classLabel, cents: 0, count: 0 };
      g.cents += p.balanceCents; g.count++; groups.set(key, g);
    }
    return [...groups.values()];
  };
  return { status, primary, positions, counts, totalsByCurrency, otherCurrencies: totalsByCurrency.filter(t => t.currencyCode !== 'BRL'), byInstitution: group('institution'), byClass: group('class'), coverage, partial: Boolean(error) || coverage.some(c => c.partial), partialLabels: coverage.filter(c => c.partial).map(c => c.label), stale: coverage.some(c => c.stale), lastReadAt: coverage.map(c => c.readAt).filter((s): s is string => Boolean(s)).sort((a, b) => time(b) - time(a))[0] ?? null };
}
export type ConnectedSummary = ReturnType<typeof summarizeConnectedInvestments>;
export function filterConnectedPositions(positions: ConnectedPosition[], { institution, classKey, situation = 'active' }: { institution?: string; classKey?: string; situation?: Situation | 'all' }) {
  return positions.filter(p => (!institution || p.itemId === institution) && (!classKey || p.classKey === classKey) && (situation === 'all' || p.situation === situation));
}
