export type MoneyFormat = 'auto' | 'br' | 'international' | 'ofx';

export class MoneyParseError extends Error {
  constructor(reason: string) {
    super(`Valor monetário inválido: ${reason}`);
    this.name = 'MoneyParseError';
  }
}

const invalid = (reason: string): never => { throw new MoneyParseError(reason); };

/** Locale only resolves ambiguous grouping; unambiguous decimal formats are accepted.
 * OFX never has thousands separators. Amounts must fit in safe integer cents.
 * Extra nonzero decimal places are rejected instead of silently rounded.
 */
export const parseMoney = (value: unknown, format: MoneyFormat = 'auto'): number => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return invalid('número não finito.');
    // Numeric Excel cells already have a decimal value; never strip their dots.
    const cents = Math.round(value * 100);
    if (!Number.isSafeInteger(cents) || Math.abs(value) * Number.EPSILON >= 0.01 ||
      Math.abs(cents / 100 - value) > Number.EPSILON * Math.max(1, Math.abs(value))) {
      return invalid('precisão ou magnitude não suportada.');
    }
    return cents === 0 ? 0 : cents / 100;
  }
  if (typeof value !== 'string' || !value.trim()) return invalid('valor vazio ou ausente.');

  let raw = value.trim();
  let sign = 1;
  if (format === 'ofx') {
    if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(raw)) return invalid('OFX exige decimal sem moeda ou separadores de milhar.');
  } else {
    // Currency is allowed only as a prefix, with a single optional sign on either side.
    const decorated = raw.match(/^([+-]?)\s*(?:(R\$|BRL|US\$|USD|EUR|GBP|\$|€|£)\s*)?([+-]?)\s*(\d[\d., \u00a0\u202f]*)$/i);
    if (!decorated || (decorated[1] && decorated[3])) return invalid('sintaxe malformada.');
    sign = (decorated[1] || decorated[3]) === '-' ? -1 : 1;
    raw = decorated[4].trim().replace(/[\u00a0\u202f]/g, ' ');
  }
  if (format === 'ofx') {
    sign = raw.startsWith('-') ? -1 : 1;
    raw = raw.replace(/^[+-]/, '');
  }

  const dot = raw.lastIndexOf('.');
  const comma = raw.lastIndexOf(',');
  let decimal: string | undefined;
  if (format === 'ofx') {
    decimal = dot >= 0 ? '.' : comma >= 0 ? ',' : undefined;
  } else if (dot >= 0 && comma >= 0) {
    decimal = dot > comma ? '.' : ',';
  } else if (dot >= 0 || comma >= 0) {
    const separator = dot >= 0 ? '.' : ',';
    const parts = raw.split(separator);
    if (parts.length === 2 && parts[1].length <= 2) {
      decimal = separator;
    } else {
      if (format === 'auto') return invalid('separador ambíguo; informe o formato de origem ou use duas casas decimais.');
      if (separator === (format === 'br' ? ',' : '.')) decimal = separator;
    }
  }

  const parts = decimal ? raw.split(decimal) : [raw];
  if (parts.length > 2) return invalid('separador decimal repetido.');
  const [integer, fraction = ''] = parts;
  if (decimal && !/^\d+$/.test(fraction)) return invalid('parte decimal malformada.');
  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) return invalid('mais de duas casas decimais.');

  const grouping = decimal === '.' ? ',' : decimal === ',' ? '.' : format === 'br' ? '.' : ',';
  const escaped = grouping === '.' ? '\\.' : ',';
  const grouped = new RegExp(`^\\d{1,3}(?:${escaped}\\d{3})+$`);
  if (!/^\d+$/.test(integer) && !/^\d{1,3}(?: \d{3})+$/.test(integer) && !grouped.test(integer)) {
    return invalid('agrupamento de milhares malformado.');
  }
  const digits = integer.replace(/[., ]/g, '');
  // Build integer cents from digits to avoid parseFloat truncation and rounding.
  const cents = Number(`${digits}${fraction.slice(0, 2).padEnd(2, '0')}`);
  if (!Number.isSafeInteger(cents) || cents / 100 * Number.EPSILON >= 0.01) {
    return invalid('valor excede a precisão segura em centavos.');
  }
  if (BigInt((cents / 100).toFixed(2).replace('.', '')) !== BigInt(cents)) {
    return invalid('valor não representável em centavos.');
  }
  return cents === 0 ? 0 : sign * cents / 100;
};
