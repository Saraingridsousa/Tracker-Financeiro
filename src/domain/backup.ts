import type { BackupPayload } from '../types/finance';

type Check = (value: unknown) => boolean;
type Fields = Record<string, Check>;

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText: Check = value => typeof value === 'string' && value.trim().length > 0;
const isString: Check = value => typeof value === 'string';
const isBoolean: Check = value => typeof value === 'boolean';
const isAmount: Check = value => typeof value === 'number' && Number.isFinite(value) && Number.isSafeInteger(Math.round(value * 100));
const isNonNegative: Check = value => isAmount(value) && (value as number) >= 0;
const isKeywords: Check = value => Array.isArray(value) && value.every(isString);
const oneOf = (...values: string[]): Check => value => typeof value === 'string' && values.includes(value);
const isAssetType = oneOf('Ações', 'FIIs', 'Tesouro Direto', 'Criptomoedas', 'ETFs', 'Renda Fixa', 'Outros');

const isDate: Check = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const isTimestamp: Check = value => typeof value === 'string' && isDate(value.slice(0, 10))
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const isTemporal: Check = value => isDate(value) || isTimestamp(value);

function validShape(value: unknown, required: Fields, optional: Fields = {}): boolean {
  if (!isRecord(value)) return false;
  const allowed = new Set([...Object.keys(required), ...Object.keys(optional)]);
  return Object.keys(value).every(key => allowed.has(key))
    && Object.entries(required).every(([key, check]) => key in value && check(value[key]))
    && Object.entries(optional).every(([key, check]) => !(key in value) || check(value[key]));
}

function validRecords(value: unknown, required: Fields, optional: Fields = {}): boolean {
  return Array.isArray(value) && value.every(record => validShape(record, required, optional))
    && new Set(value.map(record => record.id)).size === value.length;
}

const transactions: Check = value => validRecords(value, {
  id: isText, date: isDate, description: isString, amount: isAmount,
  type: oneOf('income', 'expense'), categoryId: isText, source: oneOf('manual', 'import'), createdAt: isTemporal,
}, {
  categoryName: isString, category: isString, updatedAt: isTemporal,
  isInternalTransfer: isBoolean, isSelfTransfer: isBoolean, isInvestment: isBoolean,
  isCreditCardPayment: isBoolean, isNeutral: isBoolean,
  paymentMethod: oneOf('CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'PIX', 'MANUAL'),
  bank: oneOf('Inter', 'Caixa', 'Sofisa', 'BB', 'Outro'), bankName: isString, sourceBank: isString, rawHash: isString,
});
const categories: Check = value => validRecords(value, {
  id: isText, name: isText, color: isText, keywords: isKeywords, type: oneOf('income', 'expense', 'both'),
}, { icon: isString, isDefault: isBoolean, isNeutral: isBoolean, excludeFromTotals: isBoolean });
const rules: Check = value => validRecords(value, { id: isText, categoryId: isText, keywords: isKeywords, isActive: isBoolean });
const assets: Check = value => validRecords(value, {
  id: isText, tickerOrName: isText, type: isAssetType, quantity: isNonNegative, avgPrice: isNonNegative, currentPrice: isNonNegative,
}, { targetAllocationPercent: value => isNonNegative(value) && (value as number) <= 100, createdAt: isTemporal, updatedAt: isTemporal });
const investmentOrders: Check = value => validRecords(value, {
  id: isText, assetId: isText, ticker: isText, type: isAssetType, operation: oneOf('BUY', 'SELL'),
  date: isDate, quantity: isNonNegative, unitPrice: isNonNegative, totalValue: isNonNegative,
});

export function parseLegacyBackup(text: string): BackupPayload {
  let payload: unknown;
  try { payload = JSON.parse(text); }
  catch { throw new Error('Formato de backup inválido: o arquivo não contém JSON válido. Nenhum dado foi alterado.'); }
  if (isRecord(payload) && ['schemaVersion', 'connections', 'accounts', 'overrides'].some(key => key in payload)) {
    throw new Error('Backup bancário não pode ser restaurado como histórico importado. Nenhum dado foi alterado.');
  }
  if (!validShape(payload, { transactions, categories, rules, exportedAt: isTimestamp }, { assets, investmentOrders })
    || !isRecord(payload) || ('assets' in payload) !== ('investmentOrders' in payload)) {
    throw new Error('Formato de backup do histórico inválido ou incompleto. Nenhum dado foi alterado.');
  }
  return payload as unknown as BackupPayload;
}
