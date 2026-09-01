import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';

import type { Transaction } from '../types/finance';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();

const normalizeBRNumber = (input: string): number => {
  const cleaned = String(input)
    .replace(/[^0-9,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace('.', '')
    .replace(',', '.');

  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDateToken = (raw: string): string | null => {
  const text = raw.trim();
  if (!text) return null;

  const match = text.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3] ? Number(match[3]) : new Date().getFullYear();

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
};

const isNoiseLine = (line: string) => {
  const normalized = normalizeText(line).toLowerCase();
  if (!normalized) return true;

  if (/^(saldo|extrato|movimentacao|movimentações|rodape|telefone|atendimento|agencia|conta|banco|caixa|sac|www|http)/.test(normalized)) return true;
  if (/saldo\s+(dia|anterior|atual|disponivel|disponível)/.test(normalized)) return true;
  if (/telefone\s*[:\-]/.test(normalized)) return true;
  if (/\b(?:cpf|cnpj|cgc)\b/.test(normalized)) return true;
  if (/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}$/i.test(normalized)) return true;

  return false;
};

const parseLine = (line: string): { date: string; description: string; amount: number; type: 'income' | 'expense' } | null => {
  const normalized = normalizeText(line);
  if (!normalized) return null;
  if (isNoiseLine(normalized)) return null;

  const dateMatch = normalized.match(/^(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)/);
  if (!dateMatch) return null;

  const dateValue = parseDateToken(dateMatch[1]);
  if (!dateValue) return null;

  const afterDate = normalized.slice(dateMatch[0].length).trim();
  if (!afterDate) return null;

  const amountMatch = afterDate.match(/(?:R\$\s*)?(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})\s*(?:C|D)?$/i);
  if (!amountMatch) return null;

  const amountRaw = amountMatch[1];
  const amountValue = normalizeBRNumber(amountRaw);
  const indicatorMatch = afterDate.match(/\b([CD])\b\s*$/i);
  const indicator = indicatorMatch ? indicatorMatch[1].toUpperCase() : null;

  let finalAmount = Math.abs(amountValue);
  let type: 'income' | 'expense' = 'expense';

  if (indicator === 'C' || afterDate.toUpperCase().includes('CREDITO') || afterDate.toUpperCase().includes('CRÉDITO')) {
    type = 'income';
  } else if (indicator === 'D' || afterDate.toUpperCase().includes('DEBITO') || afterDate.toUpperCase().includes('DÉBITO')) {
    type = 'expense';
  } else {
    type = amountValue >= 0 ? 'income' : 'expense';
  }

  finalAmount = type === 'income' ? finalAmount : -finalAmount;

  const description = afterDate
    .replace(new RegExp(String.raw`(?:R\$\s*)?${amountMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s*(?:[CD])?\s*$`, 'i'), '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!description || description.length < 3) return null;

  const isInformational = /(salario|dep|deposito|transferencia|transferência|limite|saldo|empréstimo|taxa|juros|anuidade|conta)/i.test(description);
  if (isInformational && !/[0-9]/.test(description) && !/[A-Z]/i.test(description)) return null;

  return {
    date: dateValue,
    description,
    amount: Number(finalAmount.toFixed(2)),
    type,
  };
};

const extractLines = async (file: File): Promise<string[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  const lines: string[] = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');

    const splitLines = pageText
      .replace(/\s*\n\s*/g, '\n')
      .split(/\n|\r/)
      .map((line) => normalizeText(line))
      .filter(Boolean);

    lines.push(...splitLines);
  }

  return lines;
};

export const parsePDFStatement = async (file: File): Promise<Transaction[]> => {
  if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
    return [];
  }

  try {
    const lines = await extractLines(file);
    const transactions: Transaction[] = [];

    lines.forEach((line, index) => {
      const parsed = parseLine(line);
      if (!parsed) return;

      const id = `${parsed.date}-${parsed.description}-${index}-${Math.abs(parsed.amount).toFixed(2)}`;
      transactions.push({
        id,
        date: parsed.date,
        description: parsed.description,
        amount: Math.abs(Number(parsed.amount.toFixed(2))),
        type: parsed.type,
        categoryId: 'uncategorized',
        source: 'import',
        createdAt: new Date().toISOString(),
      });
    });

    return transactions;
  } catch (error) {
    console.error('Erro ao ler PDF:', error);
    throw new Error('Não foi possível ler este PDF. Verifique se o arquivo é um extrato bancário válido.');
  }
};
