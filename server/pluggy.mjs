export class PluggyError extends Error {
  constructor(code, message) { super(message); this.name = 'PluggyError'; this.code = code; }
}

export class PluggyClient {
  constructor({ clientId, clientSecret, fetchImpl = globalThis.fetch, now = Date.now, maxPages = 1000, timeoutMs = 15000 } = {}) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.fetch = fetchImpl;
    this.now = now;
    this.configured = Boolean(clientId && clientSecret);
    this.apiKey = null;
    this.keyExpiresAt = 0;
    this.maxPages = maxPages;
    this.timeoutMs = timeoutMs;
  }

  async transport(path, options) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await this.fetch(`https://api.pluggy.ai${path}`, { ...options, redirect: 'error', signal: controller.signal });
          if (!response.ok) { await response.body?.cancel?.(); return { status: response.status, ok: false }; }
          return { status: response.status, ok: true, data: await response.json() };
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new PluggyError('TIMEOUT', 'A consulta à Pluggy excedeu o tempo limite. Tente novamente.')); }, this.timeoutMs); }),
      ]);
    } catch (error) {
      if (error instanceof PluggyError) throw error;
      throw new PluggyError('NETWORK', 'Não foi possível consultar a Pluggy. Tente novamente.');
    } finally { clearTimeout(timer); }
  }

  async authenticate() {
    if (!this.configured) throw new PluggyError('CONFIG', 'Configure as credenciais Pluggy no servidor.');
    const auth = await this.transport('/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: this.clientId, clientSecret: this.clientSecret }) });
    if (!auth.ok) throw new PluggyError('AUTH', 'Não foi possível autenticar na Pluggy. Confira as credenciais no servidor.');
    const data = auth.data;
    if (typeof data.apiKey !== 'string' || !data.apiKey) throw new PluggyError('AUTH', 'Resposta de autenticação inválida.');
    this.apiKey = data.apiKey;
    this.keyExpiresAt = this.now() + 2 * 60 * 60 * 1000 - 60 * 1000;
  }

  async request(path) {
    if (!this.apiKey || this.now() >= this.keyExpiresAt) await this.authenticate();
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.transport(path, { method: 'GET', headers: { 'X-API-KEY': this.apiKey } });
      if (response.status === 401) {
        this.apiKey = null;
        this.keyExpiresAt = 0;
        if (attempt === 0) { await this.authenticate(); continue; }
        throw new PluggyError('AUTH', 'Não foi possível autenticar na Pluggy. Confira as credenciais no servidor.');
      }
      if (!response.ok) throw new PluggyError('PROVIDER', 'Não foi possível consultar os dados na Pluggy. Tente novamente.');
      return response.data;
    }
  }

  async readItem(itemId) {
    const item = await this.request(`/items/${encodeURIComponent(itemId)}`);
    if (!item || typeof item.status !== 'string') throw new PluggyError('DATA', 'Dados de item inválidos recebidos da Pluggy.');
    if (item.consentExpiresAt && Date.parse(item.consentExpiresAt) <= this.now()) throw new PluggyError('CONSENT_EXPIRED', 'Consentimento expirado. Renove o acesso no Meu Pluggy antes de consultar novamente.');
    const rawAccounts = [];
    for (let page = 1, totalPages = 1; page <= totalPages; page++) {
      const result = await this.request(`/accounts?itemId=${encodeURIComponent(itemId)}&page=${page}`);
      if (!Array.isArray(result?.results)) throw new PluggyError('DATA', 'Página de contas inválida recebida da Pluggy.');
      rawAccounts.push(...result.results);
      totalPages = result.totalPages || 1;
      if (!Number.isInteger(totalPages) || totalPages < 1 || totalPages > this.maxPages) throw new PluggyError('PAGINATION', 'Limite de paginação excedido.');
    }
    const transactions = [];
    for (const account of rawAccounts) {
      let query = `?accountId=${encodeURIComponent(account.id)}`;
      const cursors = new Set();
      while (query) {
        if (cursors.has(query) || cursors.size >= this.maxPages) throw new Error('Loop ou limite de paginação de cursor.');
        cursors.add(query);
        const result = await this.request(`/v2/transactions${query}`);
        if (!Array.isArray(result?.results)) throw new PluggyError('DATA', 'Página de transações inválida recebida da Pluggy.');
        transactions.push(...result.results.map(t => normalizeTransaction(t, account, item.connector?.name)));
        query = result.next;
        if (query != null) {
          if (typeof query !== 'string' || !query.startsWith('?') || query.length > 8192 || /[#\r\n]/.test(query)) throw new Error('Cursor de paginação inválido.');
          const params = new URLSearchParams(query);
          if (params.getAll('accountId').length !== 1 || params.get('accountId') !== account.id || params.getAll('after').length !== 1 || !params.get('after') || [...params.keys()].some(k => !['accountId','after'].includes(k))) throw new Error('Cursor de paginação inválido.');
        }
      }
    }
    return { accounts: rawAccounts.map(a => normalizeAccount(a, itemId)), transactions, status: item.status,
      providerUpdatedAt: item.lastUpdatedAt || item.updatedAt || null, consentExpiresAt: item.consentExpiresAt || null };
  }
}

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

export function normalizeAccount(account, itemId) {
  if ((account.itemId !== undefined && account.itemId !== itemId) || !validId(account.id) || !['BANK','CREDIT'].includes(account.type) || typeof account.name !== 'string' || !currency(account.currencyCode)) throw new Error('Dados de conta inválidos.');
  return { id: account.id, itemId, name: account.name, type: account.type,
    currencyCode: account.currencyCode, balanceCents: toCents(account.balance) };
}

export function normalizeTransaction(transaction, account, bankName = '') {
  if ((transaction.accountId !== undefined && transaction.accountId !== account.id) || !validId(transaction.id) || typeof transaction.description !== 'string' || !validTransactionDate(transaction.date) || !['POSTED','PENDING'].includes(transaction.status || 'POSTED') || !currency(transaction.currencyCode || account.currencyCode)) throw new Error('Dados de transação inválidos.');
  const originalAmountCents = toCents(transaction.amount);
  const converted = transaction.currencyCode && transaction.currencyCode !== account.currencyCode && transaction.amountInAccountCurrency != null;
  const value = converted ? transaction.amountInAccountCurrency : transaction.amount;
  const type = account.type === 'CREDIT'
    ? (transaction.amount < 0 ? 'income' : 'expense')
    : transaction.type === 'DEBIT' ? 'expense' : transaction.type === 'CREDIT' ? 'income' : transaction.amount < 0 ? 'expense' : 'income';
  return { id: `${encodeURIComponent(account.id)}:${encodeURIComponent(transaction.id)}`, providerTransactionId: transaction.id, accountId: account.id,
    providerId: transaction.providerId ?? null, providerCode: transaction.providerCode ?? null,
    originalAmountCents, originalCurrencyCode: transaction.currencyCode || account.currencyCode,
    amountSource: converted ? 'provider.amountInAccountCurrency' : 'provider.amount', providerDate: transaction.date,
    date: transaction.date.slice(0, 10), description: transaction.description, amountCents: Math.abs(toCents(value)),
    type, categoryId: null, manualCategory: false, source: 'pluggy', providerStatus: transaction.status || 'POSTED',
    currencyCode: converted ? account.currencyCode : transaction.currencyCode || account.currencyCode, bankName, createdAt: transaction.createdAt || transaction.date,
    providerCategory: transaction.category ?? null, providerCategoryId: transaction.categoryId ?? null,
    providerUpdatedAt: transaction.updatedAt ?? null, operationType: transaction.operationType ?? null,
    paymentData: pick(transaction.paymentData, ['paymentMethod','referenceNumber','reason','receiverReferenceId']),
    creditCardMetadata: { ...pick(transaction.creditCardMetadata, ['installmentNumber','totalInstallments','purchaseDate','billId']),
      ...(transaction.creditCardMetadata?.totalAmount != null ? { totalAmountCents: toCents(transaction.creditCardMetadata.totalAmount) } : {}),
    },
    isCreditCardPayment: /^(?:pagamento (?:de )?fatura|credit card payment|invoice payment|statement payment)$/i.test(transaction.description.trim()) || /^(?:credit card payment|pagamento de fatura)$/i.test(transaction.category || '') || /^(?:PAGAMENTO_FATURA|CREDIT_CARD_PAYMENT)$/.test(transaction.operationType || ''),
  };
}

function validTransactionDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const civil = value.slice(0, 10);
  const parsed = new Date(civil + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === civil;
}

const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f]/.test(value);
const currency = value => typeof value === 'string' && /^[A-Z]{3}$/.test(value);
const pick = (value, keys) => Object.fromEntries(keys.filter(k => value?.[k] !== undefined && ['string','number','boolean'].includes(typeof value[k])).map(k => [k, value[k]]));
