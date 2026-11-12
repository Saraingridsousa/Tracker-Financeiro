import { DatabaseSync } from 'node:sqlite';
import { isDeepStrictEqual } from 'node:util';

export class Store {
  constructor(filename = ':memory:') {
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 2) { this.db.close(); throw new Error('Versão do banco não suportada.'); }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec(`CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY, label TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'REGISTERED',
      last_fetched_at TEXT, provider_updated_at TEXT, consent_expires_at TEXT, last_error TEXT
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES connections(id),
      balance_cents INTEGER NOT NULL CHECK(typeof(balance_cents) = 'integer'), data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
      amount_cents INTEGER NOT NULL CHECK(typeof(amount_cents) = 'integer' AND amount_cents >= 0), data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS overrides (
      transaction_id TEXT PRIMARY KEY REFERENCES transactions(id), category_id TEXT,
      manual_category INTEGER NOT NULL DEFAULT 0, description TEXT, hidden INTEGER NOT NULL DEFAULT 0
    );`);
      if (version < 2) this.db.exec(`
        ALTER TABLE transactions ADD COLUMN identity_id TEXT;
        ALTER TABLE transactions ADD COLUMN superseded_by TEXT REFERENCES transactions(id);
        UPDATE transactions SET identity_id=id;
        CREATE TABLE transaction_reconciliations (
          id INTEGER PRIMARY KEY, from_id TEXT NOT NULL REFERENCES transactions(id), to_id TEXT NOT NULL REFERENCES transactions(id),
          provider_id TEXT NOT NULL, reconciled_at TEXT NOT NULL, revoked_at TEXT
        );
        PRAGMA user_version = 2;
      `);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); this.db.close(); throw error; }
    this.schemaVersion = 2;
  }

  registerConnection({ itemId, label }) {
    if (typeof itemId !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(itemId)) throw new Error('itemId deve ser um UUID válido.');
    if (typeof label !== 'string' || !label.trim() || label.length > 120) throw new Error('Informe um nome de até 120 caracteres.');
    if (this.connections().some(c => c.id.toLowerCase() === itemId.toLowerCase())) throw new Error('Item já registrado.');
    if (this.connections().length >= 5) throw new Error('Limite de cinco conexões.');
    this.db.prepare('INSERT INTO connections(id,label) VALUES (?,?)').run(itemId, label);
    return this.connections().find(c => c.id === itemId);
  }

  connections() {
    return this.db.prepare(`SELECT id,label,status,last_fetched_at AS lastFetchedAt,
      provider_updated_at AS providerUpdatedAt,consent_expires_at AS consentExpiresAt,
      last_error AS lastError FROM connections ORDER BY rowid`).all().map(r => ({ ...r }));
  }

  applySync(itemId, batch, fetchedAt) {
    if (!this.connections().some(c => c.id === itemId)) throw new Error('Conexão não encontrada.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const account of batch.accounts) {
        const owner = this.db.prepare('SELECT item_id FROM accounts WHERE id=?').get(account.id)?.item_id;
        if (account.itemId !== itemId || (owner && owner !== itemId)) throw new Error('Conta pertence a outro item.');
        if (!Number.isSafeInteger(account.balanceCents)) throw new Error('Valor em centavos inválido.');
        const { balanceCents, ...data } = account;
        this.db.prepare(`INSERT INTO accounts VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET
          balance_cents=excluded.balance_cents,data=excluded.data`).run(account.id, itemId, balanceCents, JSON.stringify(data));
      }
      // Only exact, nonempty providerId within one account is linkable. providerCode
      // (e.g. NSU) and amount/date/description are not identity keys. Inspect the
      // complete batch before writing so simultaneous collisions cannot be merged.
      const byId = new Map();
      for (const transaction of batch.transactions) {
        const duplicate = byId.get(transaction.id);
        if (duplicate && !isDeepStrictEqual(duplicate, transaction)) throw new Error('Identidade conflitante no mesmo lote.');
        byId.set(transaction.id, transaction);
      }
      const incoming = groupByProviderId(batch.transactions);
      const incomingIds = new Set(batch.transactions.map(transaction => transaction.id));
      // A later collision can invalidate an earlier 1:1 inference. Restore any
      // co-observed retired IDs instead of silently hiding a legitimate purchase.
      const history = this.db.prepare(`SELECT t.* FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE a.item_id=?`).all(itemId);
      let revoked = false;
      for (const row of history) {
        const group = incoming.get(providerIdentityKey(JSON.parse(row.data)));
        if (row.superseded_by && group?.size > 1 && group.has(row.id)) {
          this.db.prepare('UPDATE transactions SET superseded_by=NULL WHERE id=?').run(row.id);
          this.db.prepare('UPDATE transaction_reconciliations SET revoked_at=? WHERE from_id=? AND revoked_at IS NULL').run(fetchedAt, row.id);
          revoked = true;
        }
      }
      if (revoked) refreshIdentityRoots(this.db, itemId);
      const previous = this.db.prepare(`SELECT t.* FROM transactions t JOIN accounts a ON a.id=t.account_id
        WHERE a.item_id=? AND t.superseded_by IS NULL`).all(itemId);
      const previousByKey = groupByProviderId(previous.map(row => ({ ...JSON.parse(row.data), identityId: row.identity_id })));
      for (const transaction of batch.transactions) {
        if (!Number.isSafeInteger(transaction.amountCents) || transaction.amountCents < 0) throw new Error('Valor em centavos inválido.');
        const owner = this.db.prepare('SELECT item_id FROM accounts WHERE id=?').get(transaction.accountId)?.item_id;
        const existing = this.db.prepare('SELECT * FROM transactions WHERE id=?').get(transaction.id);
        if (owner !== itemId || (existing && existing.account_id !== transaction.accountId)) throw new Error('Transação pertence a outra conta ou item.');
        if (existing?.superseded_by) continue; // Retired provider versions remain immutable audit records.
        const key = providerIdentityKey(transaction);
        const candidates = previousByKey.get(key);
        const candidate = candidates?.size === 1 ? [...candidates.values()][0] : null;
        const replaces = !existing && incoming.get(key)?.size === 1 && candidate && !incomingIds.has(candidate.id) ? candidate : null;
        const { amountCents, amount, ...data } = transaction;
        this.db.prepare(`INSERT INTO transactions(id,account_id,amount_cents,data,identity_id) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
          amount_cents=excluded.amount_cents,data=excluded.data`).run(transaction.id, transaction.accountId, amountCents, JSON.stringify(data), replaces?.identityId || transaction.id);
        if (replaces) {
          this.db.prepare('UPDATE transactions SET superseded_by=? WHERE id=?').run(transaction.id, replaces.id);
          this.db.prepare('INSERT INTO transaction_reconciliations(from_id,to_id,provider_id,reconciled_at) VALUES (?,?,?,?)').run(replaces.id, transaction.id, transaction.providerId, fetchedAt);
          this.db.prepare(`INSERT INTO overrides(transaction_id,category_id,manual_category,description,hidden)
            SELECT ?,category_id,manual_category,description,hidden FROM overrides WHERE transaction_id=?`).run(transaction.id, replaces.id);
        }
      }
      this.db.prepare(`UPDATE connections SET status=?,last_fetched_at=?,provider_updated_at=?,
        consent_expires_at=?,last_error=NULL WHERE id=?`).run(batch.status, fetchedAt, batch.providerUpdatedAt ?? null, batch.consentExpiresAt ?? null, itemId);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  recordSyncError(itemId, message) {
    this.db.prepare("UPDATE connections SET status='ERROR',last_error=? WHERE id=?").run(message, itemId);
  }

  snapshot(configured) {
    const accounts = this.db.prepare('SELECT * FROM accounts ORDER BY id').all().map(r => ({ ...JSON.parse(r.data), balanceCents: r.balance_cents }));
    const transactions = this.db.prepare(`SELECT t.*,o.category_id,o.manual_category,o.description AS manual_description
      FROM transactions t LEFT JOIN overrides o ON t.id=o.transaction_id WHERE t.superseded_by IS NULL AND COALESCE(o.hidden,0)=0 ORDER BY t.id`).all().map(r => ({
      ...JSON.parse(r.data), identityId: r.identity_id, amountCents: r.amount_cents, amount: r.amount_cents / 100,
      ...(r.manual_category ? { categoryId: r.category_id, manualCategory: true } : {}),
      ...(r.manual_description !== null ? { description: r.manual_description } : {}),
    }));
    return { configured: Boolean(configured), connections: this.connections(), accounts, transactions };
  }

  requireTransaction(id) {
    const seen = new Set();
    while (!seen.has(id)) {
      seen.add(id);
      const row = this.db.prepare('SELECT id,superseded_by FROM transactions WHERE id=?').get(id);
      if (!row) throw new Error('Transação não encontrada.');
      if (!row.superseded_by) return row.id;
      id = row.superseded_by;
    }
    throw new Error('Ciclo de identidade inválido.');
  }

  patchTransaction(id, patch) {
    id = this.requireTransaction(id);
    if (!patch || !Object.keys(patch).length || Object.keys(patch).some(k => !['categoryId','description'].includes(k))) throw new Error('Campos de edição inválidos.');
    if ('description' in patch && (typeof patch.description !== 'string' || !patch.description.trim() || patch.description.length > 1000)) throw new Error('Descrição inválida.');
    if ('categoryId' in patch && patch.categoryId !== null && (typeof patch.categoryId !== 'string' || !patch.categoryId.trim() || patch.categoryId.length > 120)) throw new Error('Categoria inválida.');
    this.db.prepare('INSERT OR IGNORE INTO overrides(transaction_id) VALUES (?)').run(id);
    if ('description' in patch) this.db.prepare('UPDATE overrides SET description=? WHERE transaction_id=?').run(patch.description, id);
    if ('categoryId' in patch) this.db.prepare('UPDATE overrides SET category_id=?,manual_category=1 WHERE transaction_id=?').run(patch.categoryId, id);
  }

  hideTransaction(id) {
    id = this.requireTransaction(id);
    this.db.prepare('INSERT INTO overrides(transaction_id,hidden) VALUES (?,1) ON CONFLICT(transaction_id) DO UPDATE SET hidden=1').run(id);
  }

  backup() {
    return { schemaVersion: this.schemaVersion, exportedAt: new Date().toISOString(), connections: this.connections(),
      accounts: this.snapshot(false).accounts,
      transactions: this.db.prepare('SELECT * FROM transactions ORDER BY id').all().map(r => ({ ...JSON.parse(r.data), identityId: r.identity_id, supersededBy: r.superseded_by, amountCents: r.amount_cents })),
      reconciliations: this.db.prepare('SELECT * FROM transaction_reconciliations ORDER BY id').all().map(r => ({
        fromId: r.from_id, toId: r.to_id, providerId: r.provider_id, reconciledAt: r.reconciled_at, revokedAt: r.revoked_at,
      })),
      overrides: this.db.prepare('SELECT * FROM overrides ORDER BY transaction_id').all().map(r => ({
        transactionId: r.transaction_id, categoryId: r.category_id, manualCategory: Boolean(r.manual_category), description: r.description, hidden: Boolean(r.hidden),
      })),
    };
  }

  close() { this.db.close(); }
}

// Opaque IDs are deliberately not trimmed, coerced, or synthesized.
const providerIdentityKey = transaction => typeof transaction.providerId === 'string' && transaction.providerId.trim().length > 0
  ? JSON.stringify([transaction.accountId, transaction.providerId]) : null;
function groupByProviderId(transactions) {
  const groups = new Map();
  for (const transaction of transactions) {
    const key = providerIdentityKey(transaction);
    if (key === null) continue;
    if (!groups.has(key)) groups.set(key, new Map());
    groups.get(key).set(transaction.id, transaction);
  }
  return groups;
}

function refreshIdentityRoots(db, itemId) {
  const rows = db.prepare(`SELECT t.id,t.superseded_by FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE a.item_id=?`).all(itemId);
  const byId = new Map(rows.map(row => [row.id, row]));
  const targets = new Set(rows.map(row => row.superseded_by));
  for (const root of rows.filter(row => !targets.has(row.id))) {
    let row = root;
    while (row) {
      db.prepare('UPDATE transactions SET identity_id=? WHERE id=?').run(root.id, row.id);
      row = byId.get(row.superseded_by);
    }
  }
}
