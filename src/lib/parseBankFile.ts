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

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split('-');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  if (/^\d{4}\/\d{2}\/\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  if (/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    const [datePart] = raw.split(' ');
    const [day, month, year] = datePart.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const normalized = parsed.toISOString().slice(0, 10);
    if (normalized) return normalized;
  }

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

const stripAccent = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const cleanDescription = (value: string): string => {
  if (!value) return 'Transação sem descrição';

  let cleaned = String(value).trim().replace(/\s+/g, ' ');
  cleaned = cleaned.replace(/\s+[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý\s.-]*\s+BRA$/i, '');
  cleaned = cleaned.replace(/\s+BRA$/i, '');

  return cleaned || 'Transação sem descrição';
};

const findDescriptionField = (row: Record<string, string>): string => {
  const candidates = [
    'Lançamento',
    'Lancamento',
    'lançamento',
    'lancamento',
    'Descrição',
    'Descricao',
    'Histórico',
    'Historico',
    'description',
    'memo',
    'name',
    'details',
    'descricao',
    'descrição',
    'historico',
    'histórico',
  ];

  for (const key of candidates) {
    const value = row[key];
    if (value && String(value).trim()) return cleanDescription(String(value));
  }

  for (const [entryKey, value] of Object.entries(row)) {
    const normalizedKey = stripAccent(String(entryKey)).toLowerCase();
    if (
      ['lancamento', 'descricao', 'historico', 'description', 'memo', 'name', 'details'].includes(normalizedKey) &&
      value && String(value).trim()
    ) {
      return cleanDescription(String(value));
    }
  }

  return 'Transação sem descrição';
};

const detectBankFromText = (text: string): Transaction['bank'] => {
  const normalized = text.toLowerCase();

  if (normalized.includes('sofisa')) return 'Sofisa';
  if (normalized.includes('caixa')) return 'Caixa';
  if (normalized.includes('banco do brasil') || normalized.includes('bb ')) return 'BB';
  if (normalized.includes('inter')) return 'Inter';

  return 'Outro';
};

const createTransaction = (row: Record<string, string>, index: number, fileName: string): Transaction | null => {
  const date = findDateField(row);
  const description = findDescriptionField(row);
  const { amount, type } = findValueField(row);

  if (!amount || !description) return null;

  const normalizedDate = parseDate(date);
  const id = `${normalizedDate}-${description}-${index}-${Math.abs(amount).toFixed(2)}`;
  const bank = detectBankFromText(`${fileName} ${Object.values(row).join(' ')}`);
  const normalizedDescription = description.toLowerCase();
  const isSelfTransfer = /(sara ingrid|sara i s o afonso|sara afonso|sara ingrid sousa|sara sousa|cp\s*:\s*\d{7,8}|pix (recebido|enviado).*sara|recebimento de transfer.*via pix.*sara|envio de transfer.*via pix.*sara|para sara|de sara)/i.test(normalizedDescription);
  const isCreditCardPayment = /(pagamento on line|pagamento online|pagamento de fatura|pagamento efetuado|pagamento efetuada|paga.*fatura)/i.test(normalizedDescription);

  return {
    id,
    date: normalizedDate,
    description,
    amount: Number(amount.toFixed(2)),
    type,
    categoryId: isCreditCardPayment ? 'pagamento_fatura' : 'uncategorized',
    source: 'import',
    bank,
    bankName: bank === 'Outro' ? 'Outro' : `Banco ${bank}`,
    sourceBank: bank === 'Outro' ? 'Outro' : `Banco ${bank}`,
    isInternalTransfer: isSelfTransfer,
    isSelfTransfer,
    isCreditCardPayment,
    isNeutral: isCreditCardPayment || isSelfTransfer,
    category: isCreditCardPayment ? 'Pagamento de Fatura' : undefined,
    createdAt: new Date().toISOString(),
  };
};

const parseInterCreditCardCsv = (text: string): Record<string, string>[] => {
  const result: ParseResult<Record<string, string>> = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => normalizeText(header),
    transform: (value: string) => value?.trim() ?? '',
  });

  if (result.errors.length) {
    console.warn('Inter credit card CSV parse warnings:', result.errors);
  }

  return result.data
    .filter((row: Record<string, string>) =>
      Object.values(row).some((value) => value && String(value).trim() !== ''),
    )
    .map((row) => {
      const descricao = findDescriptionField(row);
      return {
        data: row.data ?? row.date ?? '',
        lancamento: descricao === 'Transação sem descrição' ? row.lancamento ?? row['lançamento'] ?? row.descricao ?? row['descrição'] ?? row.description ?? '' : descricao,
        categoria: row.categoria ?? row.category ?? '',
        tipo: row.tipo ?? row.type ?? '',
        valor: row.valor ?? row.value ?? row.amount ?? '',
      };
    });
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

const prettifyCategoryName = (input?: string) => {
  if (!input) return null;

  const text = String(input).trim();
  if (!text || text.toUpperCase() === 'OUTROS') return null;

  const map: Record<string, string> = {
    SUPERMERCADO: 'Supermercado',
    MERCADO: 'Supermercado',
    TRANSPORTE: 'Transporte',
    RESTAURANTES: 'Alimentação',
    BARES: 'Alimentação',
    CULTURA: 'Lazer / Cultura',
    ENTRETENIMENTO: 'Lazer / Cultura',
    DROGARIA: 'Saúde',
    SAUDE: 'Saúde',
    VESTUARIO: 'Compras',
    VESTUÁRIO: 'Compras',
    COMPRAS: 'Compras',
    SERVICOS: 'Serviços',
    SERVIÇOS: 'Serviços',
    ENSINO: 'Educação',
    LIVRARIAS: 'Educação',
  };

  const upper = text.toUpperCase();
  return map[upper] ?? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

const createInterCreditCardTransaction = (row: Record<string, string>, index: number): Transaction | null => {
  const date = parseDate(row.data);
  const description = cleanDescription(
    row.lancamento ?? row['lançamento'] ?? row.descricao ?? row['descrição'] ?? row.historico ?? row['histórico'] ?? row.description ?? row.memo ?? 'Transação sem descrição',
  );
  const rawValue = row.valor ?? row.value ?? row.amount ?? '0';
  const numericValue = safeNumber(rawValue);
  const categoryLabel = prettifyCategoryName(row.categoria ?? row.category);

  if (!description || !Number.isFinite(numericValue)) return null;

  const amount = Math.abs(Number(numericValue.toFixed(2)));
  const isSelfTransfer = /(sara ingrid|sara i s o afonso|sara afonso|sara ingrid sousa|sara sousa|cp\s*:\s*\d{7,8}|pix (recebido|enviado).*sara|recebimento de transfer.*via pix.*sara|envio de transfer.*via pix.*sara|para sara|de sara)/i.test(description);
  const isCreditCardPayment = /(pagamento on line|pagamento online|pagamento fatura cartao|pagamento de fatura|pagamento efetuado.*pagamento fatura|pagamento efetuado: pagamento fatura)/i.test(description);

  const transaction: Transaction = {
    id: `${date}-${description}-${index}-${amount.toFixed(2)}`,
    date,
    description,
    amount,
    type: 'expense',
    categoryId: isCreditCardPayment ? 'pagamento_fatura' : 'uncategorized',
    categoryName: isCreditCardPayment ? 'Pagamento de Fatura' : categoryLabel ?? 'Sem categoria',
    source: 'import',
    bank: 'Inter',
    bankName: 'Banco Inter',
    sourceBank: 'Banco Inter',
    paymentMethod: 'CREDIT_CARD',
    isInternalTransfer: isSelfTransfer,
    isSelfTransfer,
    isInvestment: false,
    isCreditCardPayment,
    isNeutral: isCreditCardPayment || isSelfTransfer,
    category: categoryLabel ?? (isCreditCardPayment ? 'Pagamento de Fatura' : 'Sem categoria'),
    createdAt: new Date().toISOString(),
  };

  return transaction;
};

export const parseBankFile = async (file: File): Promise<Transaction[]> => {
  const name = file.name.toLowerCase();
  const text = await file.text();

  const isInterInvoiceCsv = name.includes('inter-from-') && name.endsWith('.csv');
  const rows = isInterInvoiceCsv ? parseInterCreditCardCsv(text) : name.endsWith('.csv') ? parseCsv(text) : parseOfx(text);

  const transactions = rows
    .map((row, index) => (isInterInvoiceCsv ? createInterCreditCardTransaction(row, index) : createTransaction(row, index, file.name)))
    .filter((item): item is Transaction => Boolean(item));

  return transactions;
};
