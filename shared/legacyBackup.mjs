const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.trim().length > 0;
const isString = value => typeof value === 'string';
const isBoolean = value => typeof value === 'boolean';
const isAmount = value => typeof value === 'number' && Number.isFinite(value) && Number.isSafeInteger(Math.round(value * 100));
const isNonNegative = value => isAmount(value) && value >= 0;
const isKeywords = value => Array.isArray(value) && value.every(isString);
const oneOf = (...values) => value => typeof value === 'string' && values.includes(value);
const isAssetType = oneOf('Ações', 'FIIs', 'Tesouro Direto', 'Criptomoedas', 'ETFs', 'Renda Fixa', 'Outros');
const isDate = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const isTimestamp = value => typeof value === 'string' && isDate(value.slice(0, 10))
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const isTemporal = value => isDate(value) || isTimestamp(value);
function validShape(value, required, optional = {}) {
    if (!isRecord(value))
        return false;
    const allowed = new Set([...Object.keys(required), ...Object.keys(optional)]);
    return Object.keys(value).every(key => allowed.has(key))
        && Object.entries(required).every(([key, check]) => key in value && check(value[key]))
        && Object.entries(optional).every(([key, check]) => !(key in value) || check(value[key]));
}
function validRecords(value, required, optional = {}) {
    return Array.isArray(value) && value.every(record => validShape(record, required, optional))
        && new Set(value.map(record => record.id)).size === value.length;
}
const transactions = value => validRecords(value, {
    id: isText, date: isDate, description: isString, amount: isAmount,
    type: oneOf('income', 'expense'), categoryId: isText, source: oneOf('manual', 'import'), createdAt: isTemporal,
}, {
    categoryName: isString, category: isString, updatedAt: isTemporal,
    isInternalTransfer: isBoolean, isSelfTransfer: isBoolean, isInvestment: isBoolean,
    isCreditCardPayment: isBoolean, isNeutral: isBoolean,
    paymentMethod: oneOf('CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'PIX', 'MANUAL'),
    bank: oneOf('Inter', 'Caixa', 'Sofisa', 'BB', 'Outro'), bankName: isString, sourceBank: isString, rawHash: isString,
});
const categories = value => validRecords(value, {
    id: isText, name: isText, color: isText, keywords: isKeywords, type: oneOf('income', 'expense', 'both'),
}, { icon: isString, isDefault: isBoolean, isNeutral: isBoolean, excludeFromTotals: isBoolean });
const rules = value => validRecords(value, { id: isText, categoryId: isText, keywords: isKeywords, isActive: isBoolean });
const assets = value => validRecords(value, {
    id: isText, tickerOrName: isText, type: isAssetType, quantity: isNonNegative, avgPrice: isNonNegative, currentPrice: isNonNegative,
}, { targetAllocationPercent: value => isNonNegative(value) && value <= 100, createdAt: isTemporal, updatedAt: isTemporal });
const investmentOrders = value => validRecords(value, {
    id: isText, assetId: isText, ticker: isText, type: isAssetType, operation: oneOf('BUY', 'SELL'),
    date: isDate, quantity: isNonNegative, unitPrice: isNonNegative, totalValue: isNonNegative,
});
export function parseLegacyBackup(text) {
    let payload;
    try {
        payload = JSON.parse(text);
    }
    catch {
        throw new Error('Formato de backup inválido: o arquivo não contém JSON válido. Nenhum dado foi alterado.');
    }
    if (isRecord(payload) && ['schemaVersion', 'connections', 'accounts', 'overrides'].some(key => key in payload)) {
        throw new Error('Backup bancário não pode ser restaurado como histórico importado. Nenhum dado foi alterado.');
    }
    if (!validShape(payload, { transactions, categories, rules, exportedAt: isTimestamp }, { assets, investmentOrders })
        || !isRecord(payload) || ('assets' in payload) !== ('investmentOrders' in payload)) {
        throw new Error('Formato de backup do histórico inválido ou incompleto. Nenhum dado foi alterado.');
    }
    return payload;
}
