import type { AssetPosition, Category, InvestmentOrder, Rule, Transaction } from '../types/finance';

export interface FinanceData {
  transactions: Transaction[];
  categories: Category[];
  rules: Rule[];
  assets: AssetPosition[];
  investmentOrders: InvestmentOrder[];
}
export interface FinanceSnapshot {
  family: 'tracker-financeiro';
  schemaVersion: 1;
  revision: number;
  savedAt: string;
  data: FinanceData;
}
export class DataValidationError extends Error {}
const fail = (field: string): never => { throw new DataValidationError(`Dados inválidos: ${field}. Nada foi restaurado.`); };
const object = (x: unknown, field: string): Record<string, unknown> => {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return fail(field);
  return x as Record<string, unknown>;
};
const text = (x: unknown, field: string) => { if (typeof x !== 'string' || !x.trim() || x.length > 20000) fail(field); };
const number = (x: unknown, field: string) => { if (typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > Number.MAX_SAFE_INTEGER / 100) fail(field); };
export const validDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
const timestamp = (x: unknown, field: string) => { if (typeof x !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(x) || !validDate(x.slice(0, 10)) || !Number.isFinite(Date.parse(x))) fail(field); };
const optional = (r: Record<string, unknown>, keys: string[], check: (x: unknown, field: string) => void) => { for (const k of keys) if (r[k] !== undefined) check(r[k], k); };
const boolean = (x: unknown, field: string) => { if (typeof x !== 'boolean') fail(field); };
const oneOf = (x: unknown, values: readonly string[], field: string) => { if (typeof x !== 'string' || !values.includes(x)) fail(field); };
const strings = (x: unknown, field: string) => { if (!Array.isArray(x) || x.length > 10000 || x.some(v => typeof v !== 'string')) fail(field); };
const assetTypes = ['Ações', 'FIIs', 'Tesouro Direto', 'Criptomoedas', 'ETFs', 'Renda Fixa', 'Outros'];
function collection(value: unknown, field: string, check: (r: Record<string, unknown>) => void) {
  if (!Array.isArray(value) || value.length > 200000) return fail(field);
  const ids = new Set<string>();
  for (const valueRow of value) {
    const r = object(valueRow, field);
    text(r.id, `${field}.id`);
    if (ids.has(r.id as string)) fail(`${field}: ID duplicado`);
    ids.add(r.id as string);
    check(r);
  }
}
export function parseData(value: unknown): FinanceData {
  const d = object(value, 'data');
  collection(d.transactions, 'transactions', r => {
    if (!validDate(r.date)) fail('transaction.date');
    text(r.description, 'description'); number(r.amount, 'amount');
    oneOf(r.type, ['income', 'expense'], 'type'); text(r.categoryId, 'categoryId');
    oneOf(r.source, ['manual', 'import'], 'source'); timestamp(r.createdAt, 'createdAt');
    optional(r, ['updatedAt'], timestamp);
    optional(r, ['isInternalTransfer', 'isSelfTransfer', 'isInvestment', 'isCreditCardPayment', 'isNeutral', 'categoryManuallyAssigned', 'identityAmbiguous'], boolean);
    optional(r, ['bank', 'bankName', 'sourceBank', 'rawHash', 'categoryName', 'category', 'accountId', 'providerId', 'providerTransactionId', 'sourceRecordId', 'importSourceId', 'identityScope', 'currency'], text);
    if (r.manualOverrides !== undefined) {
      const overrides = object(r.manualOverrides, 'manualOverrides');
      const allowed = ['description', 'categoryId', 'bank', 'amount', 'date', 'type', 'isNeutral', 'isInternalTransfer', 'isSelfTransfer', 'isInvestment', 'isCreditCardPayment'];
      if (Object.keys(overrides).some(key => !allowed.includes(key))) fail('manualOverrides: campo desconhecido');
      optional(overrides, ['description', 'categoryId', 'bank'], text);
      optional(overrides, ['amount'], number);
      optional(overrides, ['isNeutral', 'isInternalTransfer', 'isSelfTransfer', 'isInvestment', 'isCreditCardPayment'], boolean);
      if (overrides.date !== undefined && !validDate(overrides.date)) fail('manualOverrides.date');
      if (overrides.type !== undefined) oneOf(overrides.type, ['income', 'expense'], 'manualOverrides.type');
    }
    if (r.paymentMethod !== undefined) oneOf(r.paymentMethod, ['CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'PIX', 'MANUAL'], 'paymentMethod');
  });
  collection(d.categories, 'categories', r => {
    text(r.name, 'category.name'); text(r.color, 'category.color'); strings(r.keywords, 'category.keywords');
    oneOf(r.type, ['income', 'expense', 'both'], 'category.type');
    optional(r, ['isDefault', 'isNeutral', 'excludeFromTotals'], boolean); optional(r, ['icon'], text);
  });
  collection(d.rules, 'rules', r => { text(r.categoryId, 'rule.categoryId'); strings(r.keywords, 'rule.keywords'); boolean(r.isActive, 'rule.isActive'); });
  collection(d.assets, 'assets', r => {
    text(r.tickerOrName, 'asset.name'); oneOf(r.type, assetTypes, 'asset.type');
    for (const k of ['quantity', 'avgPrice', 'currentPrice']) number(r[k], `asset.${k}`);
    if (r.targetAllocationPercent !== undefined) { number(r.targetAllocationPercent, 'allocation'); if ((r.targetAllocationPercent as number) > 100) fail('allocation'); }
    optional(r, ['createdAt', 'updatedAt'], timestamp);
  });
  collection(d.investmentOrders, 'investmentOrders', r => {
    text(r.assetId, 'order.assetId'); text(r.ticker, 'order.ticker'); oneOf(r.type, assetTypes, 'order.type');
    oneOf(r.operation, ['BUY', 'SELL'], 'order.operation'); if (!validDate(r.date)) fail('order.date');
    for (const k of ['quantity', 'unitPrice', 'totalValue']) number(r[k], `order.${k}`);
  });
  // Preserve optional/provenance fields and historical orphan references without inventing records.
  // Classification and reconciliation are separate, explicit domain operations.
  return JSON.parse(JSON.stringify(d)) as FinanceData;
}
export function parseSnapshot(value: unknown): FinanceSnapshot {
  const r = object(value, 'snapshot');
  if (r.family !== 'tracker-financeiro' || r.schemaVersion !== 1) fail('família ou versão incompatível');
  if (!Number.isSafeInteger(r.revision) || (r.revision as number) < 0) fail('revision');
  timestamp(r.savedAt, 'savedAt');
  return { family: 'tracker-financeiro', schemaVersion: 1, revision: r.revision as number, savedAt: r.savedAt as string, data: parseData(r.data) };
}
export function makeSnapshot(data: FinanceData, revision = 0): FinanceSnapshot {
  return parseSnapshot({ family: 'tracker-financeiro', schemaVersion: 1, revision, savedAt: new Date().toISOString(), data });
}
export function parseBackup(value: unknown, current: FinanceData): FinanceSnapshot {
  const r = object(value, 'backup');
  if ('family' in r || 'schemaVersion' in r) return parseSnapshot(r);
  // Known historical transaction backup only; unrelated/partial JSON is never an empty backup.
  if (!('transactions' in r) || !('categories' in r) || !('rules' in r)) return fail('formato de backup desconhecido');
  timestamp(r.exportedAt, 'exportedAt');
  if (('assets' in r) !== ('investmentOrders' in r)) fail('backup de investimentos incompleto');
  const hasInvestments = 'assets' in r;
  return makeSnapshot(parseData({ transactions: r.transactions, categories: r.categories, rules: r.rules, assets: hasInvestments ? r.assets : current.assets, investmentOrders: hasInvestments ? r.investmentOrders : current.investmentOrders }));
}
