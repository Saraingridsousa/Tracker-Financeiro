import { DatabaseSync } from 'node:sqlite';

export class Store {
  constructor(filename = ':memory:') {
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 1) { this.db.close(); throw new Error('Versão do banco não suportada.'); }
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
    ); PRAGMA user_version = 1;`);
    this.schemaVersion = 1;
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
      for (const transaction of batch.transactions) {
        if (!Number.isSafeInteger(transaction.amountCents) || transaction.amountCents < 0) throw new Error('Valor em centavos inválido.');
        const owner = this.db.prepare('SELECT item_id FROM accounts WHERE id=?').get(transaction.accountId)?.item_id;
        const existingAccount = this.db.prepare('SELECT account_id FROM transactions WHERE id=?').get(transaction.id)?.account_id;
        if (owner !== itemId || (existingAccount && existingAccount !== transaction.accountId)) throw new Error('Transação pertence a outra conta ou item.');
        const { amountCents, amount, ...data } = transaction;
        this.db.prepare(`INSERT INTO transactions VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET
          amount_cents=excluded.amount_cents,data=excluded.data`).run(transaction.id, transaction.accountId, amountCents, JSON.stringify(data));
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
      FROM transactions t LEFT JOIN overrides o ON t.id=o.transaction_id WHERE COALESCE(o.hidden,0)=0 ORDER BY t.id`).all().map(r => ({
      ...JSON.parse(r.data), amountCents: r.amount_cents, amount: r.amount_cents / 100,
      ...(r.manual_category ? { categoryId: r.category_id, manualCategory: true } : {}),
      ...(r.manual_description !== null ? { description: r.manual_description } : {}),
    }));
    return { configured: Boolean(configured), connections: this.connections(), accounts, transactions };
  }

  requireTransaction(id) {
    if (!this.db.prepare('SELECT id FROM transactions WHERE id=?').get(id)) throw new Error('Transação não encontrada.');
  }

  patchTransaction(id, patch) {
    this.requireTransaction(id);
    if (!patch || !Object.keys(patch).length || Object.keys(patch).some(k => !['categoryId','description'].includes(k))) throw new Error('Campos de edição inválidos.');
    if ('description' in patch && (typeof patch.description !== 'string' || !patch.description.trim() || patch.description.length > 1000)) throw new Error('Descrição inválida.');
    if ('categoryId' in patch && patch.categoryId !== null && (typeof patch.categoryId !== 'string' || !patch.categoryId.trim() || patch.categoryId.length > 120)) throw new Error('Categoria inválida.');
    this.db.prepare('INSERT OR IGNORE INTO overrides(transaction_id) VALUES (?)').run(id);
    if ('description' in patch) this.db.prepare('UPDATE overrides SET description=? WHERE transaction_id=?').run(patch.description, id);
    if ('categoryId' in patch) this.db.prepare('UPDATE overrides SET category_id=?,manual_category=1 WHERE transaction_id=?').run(patch.categoryId, id);
  }

  hideTransaction(id) {
    this.requireTransaction(id);
    this.db.prepare('INSERT INTO overrides(transaction_id,hidden) VALUES (?,1) ON CONFLICT(transaction_id) DO UPDATE SET hidden=1').run(id);
  }

  backup() {
    return { schemaVersion: this.schemaVersion, exportedAt: new Date().toISOString(), connections: this.connections(),
      accounts: this.snapshot(false).accounts,
      transactions: this.db.prepare('SELECT * FROM transactions ORDER BY id').all().map(r => ({ ...JSON.parse(r.data), amountCents: r.amount_cents })),
      overrides: this.db.prepare('SELECT * FROM overrides ORDER BY transaction_id').all().map(r => ({
        transactionId: r.transaction_id, categoryId: r.category_id, manualCategory: Boolean(r.manual_category), description: r.description, hidden: Boolean(r.hidden),
      })),
    };
  }

  close() { this.db.close(); }
}
