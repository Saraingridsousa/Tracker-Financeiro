import assert from 'node:assert/strict';
import test from 'node:test';
import { filterConnectedPositions, formatOptionalCents, summarizeConnectedInvestments } from './connectedInvestments.ts';
import type { BankConnection, BankInvestment, BankingSnapshot } from '../types/banking';

// Synthetic fixtures only: no real institutions' values or identifiers.
const READ = '2026-11-17T12:00:00.000Z';
const NOW = new Date('2026-11-17T15:00:00.000Z');
const conn = (id: string, extra: Partial<BankConnection> = {}): BankConnection => ({
  id, label: 'Banco ' + id, status: 'UPDATED', lastFetchedAt: READ, providerUpdatedAt: READ, consentExpiresAt: null, lastError: null,
  lastSuccessfulSyncAt: READ, productStates: { investments: { state: 'available', returned: 1 } }, ...extra,
});
let seq = 0;
const inv = (itemId: string, extra: Partial<BankInvestment> = {}): BankInvestment => {
  const providerId = extra.providerId ?? 'p' + (++seq);
  return {
    id: itemId + ':' + providerId, providerId, itemId, name: 'CDB sintético', type: 'FIXED_INCOME', subtype: 'CDB', currencyCode: 'BRL',
    balanceCents: 10000, grossAmountCents: 10500, originalAmountCents: 9000, profitCents: null, quantity: 1, referenceDate: '2026-11-16',
    dueDate: null, status: 'ACTIVE', observedAt: READ, ...extra,
  };
};
const snap = (connections: BankConnection[], investments: BankInvestment[], accounts: BankingSnapshot['accounts'] = []): BankingSnapshot =>
  ({ configured: true, connections, accounts, transactions: [], products: { bills: [], investments } });

test('only ACTIVE positions returned in the latest read enter the current value', () => {
  const s = summarizeConnectedInvestments({ snapshot: snap([conn('a')], [
    inv('a', { balanceCents: 12345 }),
    inv('a', { status: 'TOTAL_WITHDRAWAL', balanceCents: 0 }),
    inv('a', { status: 'TOTAL_WITHDRAWAL', balanceCents: 500 }),
    inv('a', { status: 'PENDING', balanceCents: 700 }),
    inv('a', { status: 'UNKNOWN', balanceCents: 800 }),
    inv('a', { status: 'FROZEN', balanceCents: 900 }),
  ]) }, NOW);
  assert.equal(s.status, 'ready');
  assert.equal(s.primary?.cents, 12345);
  assert.equal(s.primary?.count, 1);
  assert.deepEqual(s.counts, { active: 1, pending: 1, withdrawn: 2, unknown: 2, notReturned: 0 });
  assert.equal(s.positions.length, 6);
  assert.ok(s.positions.filter((p) => p.situation === 'unknown').every((p) => !p.countsInCurrent));
});

test('a connection without bank accounts still contributes its investments', () => {
  const s = summarizeConnectedInvestments({ snapshot: snap([conn('a'), conn('noacc', { label: 'Corretora sem contas' })], [inv('noacc', { balanceCents: 4200 })]) }, NOW);
  assert.equal(s.primary?.cents, 4200);
  assert.deepEqual(s.byInstitution.map((g) => [g.label, g.cents]), [['Corretora sem contas', 4200]]);
  assert.equal(s.positions[0].institutionConfirmed, false);
});

test('identity uses item + provider id: replays do not duplicate, equal names stay distinct', () => {
  const first = inv('a', { providerId: 'same', balanceCents: 100, observedAt: '2026-11-16T12:00:00.000Z' });
  const replay = { ...first, balanceCents: 300, observedAt: READ };
  const twin = inv('a', { providerId: 'other', balanceCents: 200 });
  const otherItem = inv('b', { providerId: 'same', balanceCents: 50 });
  const s = summarizeConnectedInvestments({ snapshot: snap([conn('a'), conn('b')], [first, replay, twin, otherItem]) }, NOW);
  assert.equal(s.positions.length, 3);
  assert.equal(s.primary?.cents, 300 + 200 + 50);
});

test('different currencies are never summed together', () => {
  const s = summarizeConnectedInvestments({ snapshot: snap([conn('a')], [inv('a', { balanceCents: 1000 }), inv('a', { currencyCode: 'USD', balanceCents: 999 })]) }, NOW);
  assert.equal(s.primary?.cents, 1000);
  assert.deepEqual(s.totalsByCurrency, [{ currencyCode: 'BRL', cents: 1000, count: 1 }, { currencyCode: 'USD', cents: 999, count: 1 }]);
  assert.equal(s.otherCurrencies.length, 1);
  assert.equal(s.byClass.reduce((sum, g) => sum + g.cents, 0), 1000);
});

test('records absent from a complete latest read are not current; failed reads keep last values with partial coverage', () => {
  const old = '2026-11-10T12:00:00.000Z';
  const s = summarizeConnectedInvestments({ snapshot: snap([
    conn('ok'),
    conn('failed', { productStates: { investments: { state: 'error', returned: 0, message: 'falha' } } }),
  ], [inv('ok', { observedAt: old, balanceCents: 111 }), inv('ok', { balanceCents: 222 }), inv('failed', { observedAt: old, balanceCents: 333 })]) }, NOW);
  assert.equal(s.counts.notReturned, 1);
  assert.equal(s.primary?.cents, 222 + 333);
  assert.equal(s.positions.find((p) => p.balanceCents === 333)?.preserved, true);
  assert.equal(s.partial, true);
  assert.deepEqual(s.coverage.map((c) => c.state), ['complete', 'error']);
});

test('coverage: empty is complete, unavailable / not queried / sync error are partial', () => {
  const s = summarizeConnectedInvestments({ snapshot: snap([
    conn('empty', { productStates: { investments: { state: 'empty', returned: 0 } } }),
  ], []) }, NOW);
  assert.equal(s.status, 'ready');
  assert.equal(s.partial, false);
  assert.equal(s.primary?.cents, 0);
  for (const extra of [{ productStates: { investments: { state: 'unavailable' as const } } }, { productStates: {} }, { lastError: 'falhou', status: 'ERROR' }]) {
    const p = summarizeConnectedInvestments({ snapshot: snap([conn('empty', { productStates: { investments: { state: 'empty' } } }), conn('x', extra)], []) }, NOW);
    assert.equal(p.partial, true, JSON.stringify(extra));
    assert.deepEqual(p.partialLabels, ['Banco x']);
  }
});

test('loading, load errors, no connections and never queried never pretend a zero total', () => {
  assert.equal(summarizeConnectedInvestments({ snapshot: snap([], []), loaded: false }, NOW).status, 'loading');
  assert.equal(summarizeConnectedInvestments({ snapshot: snap([], []), loaded: false, error: 'x' }, NOW).status, 'loadError');
  assert.equal(summarizeConnectedInvestments({ snapshot: snap([], []) }, NOW).status, 'noConnections');
  const nq = summarizeConnectedInvestments({ snapshot: snap([conn('a', { productStates: undefined })], []) }, NOW);
  assert.equal(nq.status, 'notQueried');
  for (const s of [nq, summarizeConnectedInvestments({ snapshot: snap([], []), loaded: false }, NOW)]) assert.equal(s.primary, null);
});

test('classes keep subtype semantics; EQUITY without subtype is not called stocks', () => {
  const s = summarizeConnectedInvestments({ snapshot: snap([conn('a')], [
    inv('a', { type: 'EQUITY', subtype: null }), inv('a', { type: 'EQUITY', subtype: 'REAL_ESTATE_FUND' }), inv('a', { type: 'EQUITY', subtype: 'STOCK' }),
    inv('a', { type: 'FIXED_INCOME', subtype: 'TREASURY' }), inv('a', { type: 'NEW_TYPE', subtype: 'X' }),
  ]) }, NOW);
  const labels = s.positions.map((p) => p.classLabel);
  assert.deepEqual(labels, ['Renda variável · subtipo não informado', 'Renda variável · FII', 'Renda variável · Ações', 'Renda fixa · Tesouro Direto', 'NEW_TYPE · X']);
});

test('distributions add up to the primary total and stale reads are flagged', () => {
  const s = summarizeConnectedInvestments({ snapshot: snap([conn('a'), conn('b', { lastSuccessfulSyncAt: '2026-11-14T12:00:00.000Z' })], [
    inv('a', { balanceCents: 100 }), inv('a', { balanceCents: 50, type: 'EQUITY', subtype: 'STOCK' }), inv('b', { balanceCents: 25, observedAt: '2026-11-14T12:00:00.000Z' }),
  ]) }, NOW);
  assert.equal(s.byInstitution.reduce((sum, g) => sum + g.cents, 0), s.primary?.cents);
  assert.equal(s.byClass.reduce((sum, g) => sum + g.cents, 0), s.primary?.cents);
  assert.equal(s.stale, true);
  assert.equal(s.lastReadAt, READ);
  assert.equal(summarizeConnectedInvestments({ snapshot: snap([conn('a')], [inv('a')]) }, NOW).stale, false);
});

test('filters default to current positions and history is reachable by situation', () => {
  const s = summarizeConnectedInvestments({ snapshot: snap([conn('a'), conn('b')], [inv('a'), inv('a', { status: 'TOTAL_WITHDRAWAL', balanceCents: 0 }), inv('b', { type: 'EQUITY', subtype: 'STOCK' })]) }, NOW);
  assert.equal(filterConnectedPositions(s.positions, {}).length, 2);
  assert.equal(filterConnectedPositions(s.positions, { situation: 'withdrawn' }).length, 1);
  assert.equal(filterConnectedPositions(s.positions, { situation: 'all' }).length, 3);
  assert.equal(filterConnectedPositions(s.positions, { institution: 'b' }).length, 1);
  assert.equal(filterConnectedPositions(s.positions, { classKey: 'FIXED_INCOME/CDB', situation: 'all' }).length, 2);
});

test('missing optional amounts are shown as not informed, never as zero', () => {
  assert.equal(formatOptionalCents(null, 'BRL'), 'não informado');
  assert.match(formatOptionalCents(0, 'BRL'), /0,00/);
  const s = summarizeConnectedInvestments({ snapshot: snap([conn('a')], [inv('a', { originalAmountCents: null, profitCents: null })]) }, NOW);
  assert.equal(s.positions[0].originalAmountCents, null);
  assert.equal(s.positions[0].profitCents, null);
});


test('unknown lifecycle makes the total explicitly partial, even after a successful read', () => {
  const s = summarizeConnectedInvestments({ snapshot: snap([conn('a')], [inv('a', { status: 'UNRECOGNIZED', balanceCents: 5000 })]) }, NOW);
  assert.equal(s.partial, true);
  assert.deepEqual(s.partialLabels, ['Banco a']);
  assert.equal(s.primary?.cents, 0);
});
