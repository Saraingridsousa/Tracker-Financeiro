export function toCents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Valor monetário inválido.');
  const sign = value < 0 ? -1 : 1;
  const [mantissa, exponent = '0'] = Math.abs(value).toString().toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const digits = BigInt(whole + fraction);
  const power = Number(exponent) - fraction.length + 2;
  const divisor = 10n ** BigInt(Math.max(0, -power));
  const cents = power >= 0 ? digits * 10n ** BigInt(power) : (digits + divisor / 2n) / divisor;
  const result = Number(cents) * sign;
  if (!Number.isSafeInteger(result)) throw new Error('Valor monetário fora do limite.');
  return result;
}
