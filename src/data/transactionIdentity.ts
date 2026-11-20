import type { Transaction } from '../types/finance';

const editableFields = ['date', 'description', 'amount', 'type', 'categoryId', 'bank', 'isNeutral', 'isInternalTransfer', 'isSelfTransfer', 'isInvestment', 'isCreditCardPayment'] as const;
export function pickManualOverrides(updates: Partial<Transaction>): NonNullable<Transaction['manualOverrides']> {
  return Object.fromEntries(Object.entries(updates).filter(([key]) => editableFields.some(field => field === key)));
}

/** A weak date/merchant/amount match is NOT proof of duplicate identity. */
export function transactionIdentity(t: Transaction): string {
  return JSON.stringify([t.source, transactionScope(t), t.providerTransactionId ?? t.sourceRecordId ?? t.id]);
}
export function transactionScope(t: Transaction): string | undefined {
  // A bank name cannot distinguish two accounts at the same institution.
  const context = t.accountId ?? t.importSourceId;
  return t.identityScope ?? (context ? JSON.stringify([t.providerId ?? 'legacy-import', context]) : undefined);
}
export function upsertTransactions(previous: Transaction[], incoming: Transaction[]): Transaction[] {
  const result = previous.map(t => ({ ...t }));
  const byIdentity = new Map<string, number[]>();
  result.forEach((t, i) => { const key = transactionIdentity(t); byIdentity.set(key, [...(byIdentity.get(key) ?? []), i]); });
  const ids = new Set(result.map(t => t.id));
  for (const row of incoming) {
    const identity = transactionIdentity(row);
    const matches = byIdentity.get(identity) ?? [];
    const index = matches.length === 1 && (transactionScope(row) || row.source === 'manual') ? matches[0] : undefined;
    if (index !== undefined) {
      const old = result[index];
      // The old UI stamped updatedAt only on manual edits, before override metadata existed.
      const legacyEdited = !old.manualOverrides && !old.sourceRecordId && !old.providerId && old.source === 'import' && !!old.updatedAt;
      const overrides = old.manualOverrides ?? (legacyEdited ? pickManualOverrides(old) : undefined);
      const categoryManuallyAssigned = old.categoryManuallyAssigned || legacyEdited;
      result[index] = { ...old, ...row, ...pickManualOverrides(overrides ?? {}), id: old.id, identityScope: transactionScope(old), createdAt: old.createdAt, manualOverrides: overrides, categoryManuallyAssigned };
      if (categoryManuallyAssigned) result[index].categoryId = old.categoryId;
    } else {
      const id = ids.has(row.id) ? crypto.randomUUID() : row.id;
      const next = { ...row, id, identityScope: transactionScope(row), sourceRecordId: row.sourceRecordId ?? row.id, identityAmbiguous: matches.length > 0 || undefined };
      ids.add(id); byIdentity.set(identity, [...matches, result.length]); result.push(next);
    }
  }
  return result.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
