import Papa, { type ParseResult } from 'papaparse';

import type { Transaction, TransactionType } from '../types/finance';

const normalizeText = (value: string) => value?.trim().toLowerCase() ?? '';

const safeNumber = (value: string | number | undefined): number => {
  if (value === null || value === undefined || value === '') return 0;

  const cleaned = String(value)
    .replace(/[^0-9,.-]/g, '')
    .replace('.', '')
    .replace(',', '.');

  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDate = (value: string | undefined): string => {
  if (!value) return new Date().toISOString().slice(0, 10);

  const raw = String(value).trim();

  const formats = [
    /^\d{4}-\d{2}-\d{2}$/,
    /^\d{2}\/\d{2}\/\d{4}$/,
    /^\d{2}-\d{2}-\d{4}$/,
    /^\d{4}\/\d{2}\/\d{2}$/,
  ];

  if (formats.some((pattern) => pattern.test(raw))) {
    const date = new Date(raw.includes('/') ? raw.replace(/\//g, '-') : raw);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return new Date().toISOString().slice(0, 10);
};

const inferType = (amount: number, raw: Record<string, string>): TransactionType => {
  const text = Object.values(raw)
    .join(' ')
    .toLowerCase();

  if (text.includes('credit') || text.includes('credito') || text.includes('deposit') || text.includes('salary') || text.includes('salario')) {
    return 'income';
  }

  if (text.includes('debit') || text.includes('debito') || text.includes('expense') || text.includes('despesa')) {
    return 'expense';
  }

  return amount >= 0 ? 'income' : 'expense';
};

const findValueField = (row: Record<string, string>): { amount: number; type: TransactionType } => {
  const candidates = [
    'amount',
    'valor',
    'value',
    'total',
    'valortransacao',
    'valor_operacao',
    'amount_paid',
    'credit',
    'debit',
  ];

  for (const key of candidates) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      const numeric = safeNumber(value);
      return {
        amount: Math.abs(numeric),
        type: numeric >= 0 ? 'income' : 'expense',
      };
    }
  }

  return { amount: 0, type: 'expense' };
};

const findDateField = (row: Record<string, string>): string => {
  const candidates = ['date', 'posted_date', 'transaction_date', 'dtposted', 'date_time', 'data'];
  for (const key of candidates) {
    if (row[key]) return parseDate(row[key]);
  }

  return new Date().toISOString().slice(0, 10);
};

const findDescriptionField = (row: Record<string, string>): string => {
  const candidates = ['description', 'memo', 'name', 'details', 'descricao', 'historico'];
  for (const key of candidates) {
    if (row[key] && String(row[key]).trim()) return String(row[key]).trim();
  }

  return 'Transação sem descrição';
};

const createTransaction = (row: Record<string, string>, index: number): Transaction | null => {
  const date = findDateField(row);
  const description = findDescriptionField(row);
  const { amount, type } = findValueField(row);

  if (!amount || !description) return null;

  const normalizedDate = parseDate(date);
  const id = `${normalizedDate}-${description}-${index}-${Math.abs(amount).toFixed(2)}`;

  return {
    id,
    date: normalizedDate,
    description,
    amount: Number(amount.toFixed(2)),
    type,
    categoryId: 'uncategorized',
    source: 'import',
    createdAt: new Date().toISOString(),
  };
};

const parseCsv = (text: string): Record<string, string>[] => {
  const result: ParseResult<Record<string, string>> = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => normalizeText(header),
    transform: (value: string) => value?.trim() ?? '',
  });

  if (result.errors.length) {
    console.warn('CSV parse warnings:', result.errors);
  }

  return result.data.filter((row: Record<string, string>) =>
    Object.values(row).some((value) => value && String(value).trim() !== ''),
  );
};

const parseOfx = (text: string): Record<string, string>[] => {
  const lines = text
    .replace(/<\?ofx.*?\?>/gi, '')
    .replace(/<.*?>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/);

  const transactions: Record<string, string>[] = [];
  const entries: Record<string, string> = {};

  for (const line of lines) {
    if (!line) continue;

    if (line.toLowerCase().includes('trntype')) {
      const key = 'type';
      const value = line.split('=')[1] || '';
      entries[key] = value;
    }

    if (line.toLowerCase().includes('dtposted')) {
      const key = 'date';
      const value = line.split('=')[1] || '';
      entries[key] = value;
    }

    if (line.toLowerCase().includes('name')) {
      const key = 'description';
      const value = line.split('=')[1] || '';
      entries[key] = value;
    }

    if (line.toLowerCase().includes('trnamt')) {
      const key = 'amount';
      const value = line.split('=')[1] || '';
      entries[key] = value;
    }

    if (Object.keys(entries).length >= 4) {
      transactions.push({ ...entries });
      Object.keys(entries).forEach((key) => delete entries[key]);
    }
  }

  return transactions.filter((item) => item.amount || item.description || item.date);
};

export const parseBankFile = async (file: File): Promise<Transaction[]> => {
  const name = file.name.toLowerCase();
  const text = await file.text();

  const rows = name.endsWith('.csv') ? parseCsv(text) : parseOfx(text);

  const transactions = rows
    .map((row, index) => createTransaction(row, index))
    .filter((item): item is Transaction => Boolean(item));

  return transactions;
};
