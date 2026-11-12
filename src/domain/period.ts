import type { Transaction } from '../types/finance';

export type Period = 'month' | 'last2months' | 'quarter' | 'semester' | 'year' | 'all';
type PeriodReference = { source?: 'banking' | 'legacy'; now?: () => Date };

function transactionDate(value: string): Date | undefined {
  const iso = value.includes('/')
    ? value.split('/').reverse().map((part, index) => index === 0 ? part : part.padStart(2, '0')).join('-')
    : value.split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}

export function filterTransactionsByPeriod(items: Transaction[], period: Period, options: PeriodReference = {}): Transaction[] {
  if (period === 'all') return items;
  const now = (options.now ?? (() => new Date()))();
  const dates = items.map(item => ({ item, date: transactionDate(item.date) }));
  const latest = options.source === 'legacy'
    ? dates.reduce<Date | undefined>((previous, { date }) => date && (!previous || date > previous) ? date : previous, undefined)
    : undefined;
  const reference = latest ?? now;
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
  if (period === 'last2months') start.setMonth(start.getMonth() - 1);
  if (period === 'quarter') start.setMonth(start.getMonth() - 2);
  if (period === 'semester') start.setMonth(start.getMonth() - 5);
  if (period === 'year') start.setMonth(start.getMonth() - 11);
  return dates.filter(({ date }) => date && date >= start && date < end).map(({ item }) => item);
}
