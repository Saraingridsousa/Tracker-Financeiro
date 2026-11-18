import * as XLSX from 'xlsx';

import type { Transaction } from '../types/finance';
import { MoneyParseError, parseMoney } from '../lib/parseMoney.ts';

const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();

const excelSerialToDate = (value: number): string | null => {
  if (!Number.isFinite(value)) return null;

  const baseDate = new Date(1899, 11, 30);
  const targetDate = new Date(baseDate.getTime() + value * 24 * 60 * 60 * 1000);
  if (Number.isNaN(targetDate.getTime())) return null;

  return targetDate.toISOString().slice(0, 10);
};

const parseDateValue = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return excelSerialToDate(value);
  }

  const raw = normalizeText(value);
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (isoMatch) {
    const day = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const year = isoMatch[3] ? Number(isoMatch[3]) : new Date().getFullYear();

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }

  const longMatch = raw.match(/^(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})$/i);
  if (longMatch) {
    const monthMap: Record<string, number> = {
      janeiro: 0,
      fevereiro: 1,
      marco: 2,
      março: 2,
      abril: 3,
      maio: 4,
      junho: 5,
      julho: 6,
      agosto: 7,
      setembro: 8,
      outubro: 9,
      novembro: 10,
      dezembro: 11,
    };

    const month = monthMap[longMatch[2].toLowerCase()];
    const day = Number(longMatch[1]);
    const year = Number(longMatch[3]);

    if (month === undefined || day < 1 || day > 31) return null;

    const date = new Date(year, month, day);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }

  if (typeof value === 'string' && /^[A-Za-z]{3,}\s+\d{1,2},\s*\d{4}$/.test(raw)) {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }

  return null;
};

const isInformationalRow = (row: string[]) => {
  const joined = row.join(' ').toLowerCase();

  if (!joined) return true;
  if (/saldo\s+(anterior|do\s+dia|em|total|atual|disponivel|disponível)/.test(joined)) return true;
  if (/^s\s*a\s*l\s*d\s*o$/.test(joined.replace(/\s+/g, '')) || /sald o/.test(joined)) return true;
  if (/total geral|total|valor total/.test(joined)) return true;
  if (/lancamento|histórico|descrição|detalhes|valor|tipo lancamento|tipo/.test(joined) && row.length >= 2) return false;

  return false;
};

const isHeaderRow = (row: string[]) => {
  const text = row.join(' ').toLowerCase();
  return /(data|lançamento|lancamento|histórico|historico|descrição|descricao|detalhes|valor|tipo lancamento|tipo)/.test(text);
};

const getCellValue = (row: unknown[], index: number) => row[index] ?? '';

const getDescription = (row: unknown[], mapping: Record<string, number>) => {
  const candidates = ['descricao', 'descrição', 'historico', 'histórico', 'detalhes', 'lancamento', 'lançamento', 'observacao', 'observação'];
  const parts: string[] = [];

  candidates.forEach((candidate) => {
    const idx = mapping[candidate];
    if (idx !== undefined && idx < row.length) {
      const val = normalizeText(row[idx]);
      if (val) parts.push(val);
    }
  });

  if (!parts.length) {
    const raw = row.filter((cell) => typeof cell !== 'number' && normalizeText(cell)).slice(0, 3).map(normalizeText);
    return raw.join(' ');
  }

  return parts.join(' ');
};

const resolveAmount = (row: unknown[], mapping: Record<string, number>) => {
  const directCandidates = ['valor', 'valor pago', 'valor movimentado', 'quantia', 'debito', 'crédito', 'credito', 'entrada', 'saida', 'saída'];

  for (const key of directCandidates) {
    const idx = mapping[key];
    if (idx !== undefined && idx >= 0) {
      const value = row[idx];
      return parseMoney(value, 'br');
    }
  }

  // A document number or balance must never be guessed to be a transaction amount.
  throw new MoneyParseError('coluna de valor ausente ou ambígua.');
};

const detectBankFromText = (text: string): Transaction['bank'] => {
  const normalized = text.toLowerCase();

  if (normalized.includes('sofisa')) return 'Sofisa';
  if (normalized.includes('caixa')) return 'Caixa';
  if (normalized.includes('banco do brasil') || normalized.includes('bb')) return 'BB';
  if (normalized.includes('inter')) return 'Inter';

  return 'Outro';
};

const determineType = (description: string, amount: number, row: unknown[], mapping: Record<string, number>): 'income' | 'expense' => {
  const normalized = description.toLowerCase();
  const typeCell = Object.entries(mapping).find(([key]) => /tipo|entrada|saida|saída/.test(key));
  if (typeCell) {
    const typeValue = normalizeText(row[typeCell[1]]).toLowerCase();
    if (/(entrada|credito|crédito|recebido|c)/.test(typeValue)) return 'income';
    if (/(saida|saída|debito|débito|enviado|pagamento)/.test(typeValue)) return 'expense';
  }

  if (/(pix recebido|recebimento de transferencia|credito evento b3|provento|rendimento|juros|resgate|recebimento|entrada)/i.test(normalized)) return 'income';
  if (/(pix enviado|pagamento|debito|saída|saida|envio de transferencia|aplicacao|aplicação|fatura)/i.test(normalized)) return 'expense';

  return amount >= 0 ? 'income' : 'expense';
};

export const parseExcelStatement = async (file: File): Promise<Transaction[]> => {
  if (!file || (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls'))) {
    return [];
  }

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];

    if (!rows.length) return [];

    let mapping: Record<string, number> | null = null;
    const imported: Transaction[] = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] as unknown[];
      const textualRow = row.map(normalizeText).filter(Boolean);
      if (!textualRow.length) continue;

      const normalizedRow = textualRow.map((value) => value.toLowerCase());
      const headerIndex = normalizedRow.findIndex((value) => /data|lançamento|lancamento|histórico|historico|descrição|descricao|detalhes|valor|tipo/.test(value));

      if (headerIndex >= 0 || isHeaderRow(row.map(normalizeText))) {
        const keys = row.map((cell) => normalizeText(cell).toLowerCase());

        mapping = {
          data: keys.findIndex((key) => /data/.test(key)),
          lancamento: keys.findIndex((key) => /lancamento|lançamento/.test(key)),
          historico: keys.findIndex((key) => /historico|histórico/.test(key)),
          descricao: keys.findIndex((key) => /descricao|descrição/.test(key)),
          detalhes: keys.findIndex((key) => /detalhes/.test(key)),
          valor: keys.findIndex((key) => /valor|quantia|debito|credito|entrada|saida/.test(key)),
          tipo: keys.findIndex((key) => /tipo/.test(key)),
        };

        continue;
      }

      if (!mapping || isInformationalRow(row.map(normalizeText))) continue;

      const rawDateValue = getCellValue(row, mapping.data ?? 0);
      const dateValue = parseDateValue(rawDateValue);
      if (!dateValue || normalizeText(rawDateValue) === '00/00/0000') continue;

      const description = getDescription(row, mapping).replace(/\s+/g, ' ').trim();
      if (!description || /saldo|total|lancamento|historico|descrição|descricao/.test(description.toLowerCase()) && description.length < 20) continue;

      let amount: number;
      try {
        amount = resolveAmount(row, mapping);
      } catch (error) {
        if (error instanceof MoneyParseError) throw new MoneyParseError(`${file.name}, linha ${index + 1}: ${error.message}`);
        throw error;
      }

      const typeValue = mapping.tipo !== undefined ? normalizeText(row[mapping.tipo]).toLowerCase() : '';
      let finalAmount = amount;
      if (/saída|saida/.test(typeValue) && finalAmount > 0) {
        finalAmount = -Math.abs(finalAmount);
      } else if (/entrada|credito|crédito|recebido/.test(typeValue) && finalAmount < 0) {
        finalAmount = Math.abs(finalAmount);
      }

      const descriptionComposite = [
        getCellValue(row, mapping.lancamento ?? -1),
        getCellValue(row, mapping.detalhes ?? -1),
      ]
        .map((value) => normalizeText(value))
        .filter(Boolean)
        .join(' ')
        .trim();

      const finalDescription = descriptionComposite || description;
      if (/saldo anterior|saldo do dia|s a l d o/.test(finalDescription.toLowerCase())) continue;

      const type = determineType(finalDescription, finalAmount, row, mapping);
      const bank = detectBankFromText(`${dateValue} ${finalDescription} ${row.map(normalizeText).join(' ')}`);
      const transaction: Transaction = {
        id: `${dateValue}-${finalDescription}-${index}-${Math.abs(finalAmount).toFixed(2)}`,
        date: dateValue,
        description: finalDescription,
        amount: Math.abs(Number(finalAmount.toFixed(2))),
        type,
        categoryId: 'uncategorized',
        source: 'import',
        bank,
        bankName: bank === 'Outro' ? 'Outro' : `Banco ${bank}`,
        sourceBank: bank === 'Outro' ? 'Outro' : `Banco ${bank}`,
        createdAt: new Date().toISOString(),
      };

      imported.push(transaction);
    }

    return imported;
  } catch (error) {
    if (error instanceof MoneyParseError) throw error;
    console.error('Erro ao ler planilha Excel:', error);
    throw new Error('Não foi possível ler esta planilha. Verifique se o arquivo é um Excel válido (.XLSX ou .XLS).');
  }
};
