import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import type { Transaction } from '../types/finance';
import { MoneyParseError, parseMoney } from '../lib/parseMoney.ts';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();

const normalizeBRNumber = (input: string): number => parseMoney(input, 'br');

const parseDateToken = (raw: string): string | null => {
  const text = raw.trim();
  if (!text) return null;

  const isoMatch = text.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
  if (isoMatch) {
    const day = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const year = isoMatch[3] ? Number(isoMatch[3]) : new Date().getFullYear();

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }

  const longDateMatch = text.match(/^(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})$/i);
  if (longDateMatch) {
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

    const day = Number(longDateMatch[1]);
    const month = monthMap[longDateMatch[2].toLowerCase()];
    const year = Number(longDateMatch[3]);

    if (month === undefined || day < 1 || day > 31) return null;

    const date = new Date(year, month, day);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }

  return null;
};

const isNoiseLine = (line: string) => {
  const normalized = normalizeText(line).toLowerCase();
  if (!normalized) return true;

  const noisePatterns = [
    /^(saldo|extrato|movimentacao|movimentações|rodape|telefone|atendimento|agencia|conta|banco|caixa|sac|ouvidoria|www|http)/,
    /saldo\s+(do\s+dia|em|anterior|atual|disponivel|disponível|total|dia)/,
    /telefone\s*[:\-]/,
    /\b(?:cpf|cnpj|cgc|limite|limite especial)\b/,
    /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}$/,
    /^sac\b/i,
    /^ouvidoria\b/i,
  ];

  return noisePatterns.some((pattern) => pattern.test(normalized));
};

const groupTextByY = (items: Array<{ str: string; transform: number[] }>) => {
  const groups = new Map<number, string[]>();

  items.forEach((item) => {
    const raw = item.str?.trim();
    if (!raw) return;

    const y = Number(item.transform?.[5]);
    if (!Number.isFinite(y)) return;

    const key = Math.round(y / 3) * 3;
    const group = groups.get(key) ?? [];
    group.push(raw);
    groups.set(key, group);
  });

  return Array.from(groups.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, values]) => values.join(' '));
};

const detectBankFromText = (text: string): Transaction['bank'] => {
  const normalized = text.toLowerCase();

  if (normalized.includes('sofisa')) return 'Sofisa';
  if (normalized.includes('caixa')) return 'Caixa';
  if (normalized.includes('banco do brasil') || normalized.includes('bb')) return 'BB';
  if (normalized.includes('inter')) return 'Inter';

  return 'Outro';
};

const detectTransaction = (
  line: string,
): { date: string; description: string; amount: number; type: 'income' | 'expense' } | null => {
  const normalized = normalizeText(line);
  if (!normalized || isNoiseLine(normalized)) return null;

  const longDateMatch = normalized.match(/(\d{1,2})\s+de\s+([A-Za-zç]+)\s+de\s+(\d{4})/i);
  if (longDateMatch) {
    return null;
  }

  const dateMatch = normalized.match(
    /^(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{1,2}\s+de\s+[a-zç]+\s+de\s+\d{4})/i,
  );
  if (!dateMatch) return null;

  const dateValue = parseDateToken(dateMatch[1]);
  if (!dateValue) return null;

  const afterDate = normalized.slice(dateMatch[0].length).trim();
  if (!afterDate) return null;

  // Capture the complete numeric token; never accept the tail of 1234,56 or 1..234,56.
  const valueMatch = afterDate.match(/(?<![\w.,+-])(?:[+-]?R\$\s*)?[+-]?\d[\d.,]*(?:[ \u00a0\u202f]\d{3})*[.,]\d+(?![\w.,])/i);
  if (!valueMatch) {
    if (/R\$/i.test(afterDate)) throw new MoneyParseError('valor ausente ou malformado no PDF.');
    return null;
  }

  const amountRaw = valueMatch[0];
  const amountValue = normalizeBRNumber(amountRaw);

  const indicatorText = afterDate.slice(0, afterDate.indexOf(valueMatch[0]) + valueMatch[0].length).toUpperCase();
  const indicator = /\b[CD]\b/.test(indicatorText) ? /\b[CD]\b/.exec(indicatorText)?.[0].toUpperCase() ?? null : null;

  let type: 'income' | 'expense' = amountValue >= 0 ? 'income' : 'expense';
  const upper = afterDate.toUpperCase();

  if (/PIX RECEBIDO|RECEBIMENTO DE TRANSFERENCIA|RECEBIMENTO DE TRANSFERÊNCIA|CREDITO EVENTO B3|CREDITO|CRÉDITO|RESGATE|APLICACAO|APLICAÇÃO|DIVIDENDO|DIVIDENDOS|PROV/.test(upper)) {
    type = 'income';
  }

  if (
    /PIX ENVIADO|ENVIO DE TRANSFERENCIA|ENVIO DE TRANSFERÊNCIA|PAGAMENTO EFETUADO|PAGAMENTO|DEBITO|DÉBITO|APLICACAO|APLICAÇÃO/.test(upper)
  ) {
    if (!/PIX RECEBIDO|RECEBIMENTO DE TRANSFERENCIA|RECEBIMENTO DE TRANSFERÊNCIA|CREDITO EVENTO B3|CREDITO|CRÉDITO|RESGATE/.test(upper)) {
      type = 'expense';
    }
  }

  if (indicator === 'C') type = 'income';
  if (indicator === 'D') type = 'expense';

  const description = afterDate
    .replace(valueMatch[0], '')
    .replace(/\b(?:C|D)\b/g, '')
    .replace(/[:\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!description || description.length < 3) return null;

  const containsBankAction = /(pix recebido|pix enviado|pagamento efetuado|paga.*fatura|recebimento de transferencia|envio de transferencia|credito evento b3|aplicacao|aplicação|resgate|cdb|lci|selic|prov|dividendos)/i.test(description);
  if (!containsBankAction && !/\d/.test(description) && !/[a-z]/i.test(description)) return null;

  const finalAmount = type === 'income' ? Math.abs(amountValue) : -Math.abs(amountValue);

  return {
    date: dateValue,
    description,
    amount: Number(finalAmount.toFixed(2)),
    type,
  };
};

const extractLines = async (file: File): Promise<string[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const lines: string[] = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const content = await page.getTextContent();

    const textItems = content.items.filter((item) => typeof (item as { str?: unknown }).str === 'string') as Array<{
      str: string;
      transform: number[];
    }>;

    const grouped = groupTextByY(
      textItems.map((item) => ({
        str: item.str,
        transform: Array.isArray(item.transform) ? item.transform : [0, 0, 0, 0, 0, 0],
      })),
    );

    lines.push(...grouped);
  }

  console.log('PDF Linhas extraídas:', lines);
  return lines;
};

export const parsePDFStatement = async (file: File): Promise<Transaction[]> => {
  if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
    return [];
  }

  try {
    const lines = await extractLines(file);
    const transactions: Transaction[] = [];
    let currentDate: string | null = null;

    lines.forEach((line, index) => {
      const normalized = normalizeText(line);
      if (!normalized) return;

      const longDateMatch = normalized.match(/(\d{1,2})\s+de\s+([A-Za-zç]+)\s+de\s+(\d{4})/i);
      if (longDateMatch) {
        const parsedDate = parseDateToken(longDateMatch[0]);
        if (parsedDate) {
          currentDate = parsedDate;
        }
        return;
      }

      const caixaMatch = normalized.match(/(\d{2}\/\d{2}\/\d{4})[^\s]*\s+(\d+)\s+(.*?)\s+([+-]?[\d.,]+)\s+([CD])\b/i);
      if (caixaMatch) {
        const [, dateText, , description, valueText, flag] = caixaMatch;
        if (/saldo dia|saldo anterior/i.test(normalized)) return;

        const date = parseDateToken(dateText);
        if (!date) return;

        const amount = normalizeBRNumber(valueText) * (flag.toUpperCase() === 'D' ? -1 : 1);
        transactions.push({
          id: `${date}-${description}-${index}-${Math.abs(amount).toFixed(2)}`,
          date,
          description: normalizeText(description),
          amount: Math.abs(Number(amount.toFixed(2))),
          type: amount >= 0 ? 'income' : 'expense',
          categoryId: 'uncategorized',
          source: 'import',
          createdAt: new Date().toISOString(),
        });
        return;
      }

      const interPattern = /(pagamento efetuado|pix recebido|pix enviado|credito evento b3|debito online td|aplicacao|resgate|debito|recebimento de transferencia|envio de transferencia|pagamento de fatura)/i;
      if (currentDate && interPattern.test(normalized) && !/(saldo do dia|saldo total|saldo disponivel|saldo disponível|fale com a gente)/i.test(normalized)) {
        const moneyMatch = normalized.match(/([+-]?R\$\s*[+-]?\d[\d.,]*(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)?)(?![\w.,])/i);
        if (!moneyMatch && /R\$/i.test(normalized)) throw new MoneyParseError('valor ausente ou malformado no PDF.');
        if (moneyMatch) {
          const parsedMoney = normalizeBRNumber(moneyMatch[1]);
          const amount = moneyMatch[1].includes('-') ? -Math.abs(parsedMoney) : Math.abs(parsedMoney);
          const description = normalizeText(normalized.split(moneyMatch[0])[0]).replace(/[:\-]+/g, ' ').trim();
          if (description && !/saldo|fale com a gente/i.test(description.toLowerCase())) {
            transactions.push({
              id: `${currentDate}-${description}-${index}-${Math.abs(amount).toFixed(2)}`,
              date: currentDate,
              description,
              amount: Math.abs(Number(amount.toFixed(2))),
              type: amount >= 0 ? 'income' : 'expense',
              categoryId: 'uncategorized',
              source: 'import',
              createdAt: new Date().toISOString(),
            });
          }
        }
        return;
      }

      const parsed = detectTransaction(normalized);
      if (!parsed) return;

      const bank = detectBankFromText(normalized);
      const isCreditCardPayment = /(pagamento fatura cartao|pagamento efetuado: pagamento fatura|pagamento efetuado|pagamento de fatura)/i.test(parsed.description);
      const id = `${parsed.date}-${parsed.description}-${index}-${Math.abs(parsed.amount).toFixed(2)}`;
      transactions.push({
        id,
        date: parsed.date,
        description: parsed.description,
        amount: Math.abs(Number(parsed.amount.toFixed(2))),
        type: parsed.type,
        categoryId: isCreditCardPayment ? 'pagamento_fatura' : 'uncategorized',
        source: 'import',
        bank,
        bankName: bank === 'Outro' ? 'Outro' : `Banco ${bank}`,
        sourceBank: bank === 'Outro' ? 'Outro' : `Banco ${bank}`,
        isCreditCardPayment,
        isNeutral: isCreditCardPayment,
        category: isCreditCardPayment ? 'Pagamento de Fatura' : undefined,
        createdAt: new Date().toISOString(),
      });
    });

    return transactions;
  } catch (error) {
    if (error instanceof MoneyParseError) throw error;
    console.error('Erro ao ler PDF:', error);
    throw new Error('Não foi possível ler este PDF. Verifique se o arquivo é um extrato bancário válido.');
  }
};
