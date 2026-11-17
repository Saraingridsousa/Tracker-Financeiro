import type { Transaction } from './finance';

export interface BankConnection {
  id: string;
  label: string;
  status: string;
  lastFetchedAt: string | null;
  providerUpdatedAt: string | null;
  consentExpiresAt: string | null;
  lastError: string | null;
}
export interface BankAccount {
  id: string;
  itemId: string;
  name: string;
  type: 'BANK' | 'CREDIT';
  currencyCode: string;
  balanceCents: number;
  updatedAt?: string;
}
export interface BankTransaction extends Omit<Transaction, 'categoryId'> {
  source: 'pluggy';
  categoryId: string | null;
  providerTransactionId: string;
  accountId: string;
  amountCents: number;
  manualCategory: boolean;
  providerStatus: 'POSTED' | 'PENDING';
  currencyCode: string;
}
export interface BankingSnapshot {
  sharedStateAvailable?: boolean;
  accessMode?: 'local' | 'private';
  configured: boolean;
  connections: BankConnection[];
  accounts: BankAccount[];
  transactions: BankTransaction[];
}
