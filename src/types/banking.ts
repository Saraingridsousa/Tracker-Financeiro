import type { Transaction } from './finance';

export interface ProductState { state: 'available' | 'empty' | 'unavailable' | 'error'; returned?: number; message?: string; accounts?: (ProductState & {accountId:string})[]; }
export interface AccountInstitution { name: string | null; code: string | null; family: string | null; source: string; state: string; }
export interface BankBill {
  id:string;
  providerId:string;
  itemId:string;
  accountId:string;
  dueDate:string;
  closingDate:string|null;
  totalAmountCents:number;
  currencyCode:string;
  minimumPaymentCents:number|null;
  payments?: { date:string|null; amountCents:number; currencyCode:string; valueType:string|null }[];
  financeCharges?: { type:string|null; amountCents:number; currencyCode:string }[];
  observedAt?:string;
}
export interface BankInvestment { code?:string|null; id:string; providerId:string; itemId:string; name:string; type:string; subtype:string|null; currencyCode:string; balanceCents:number; grossAmountCents:number|null; originalAmountCents:number|null; profitCents:number|null; quantity:number|null; referenceDate:string|null; dueDate:string|null; status:string; observedAt?:string; }
export interface BankConnection {
  id: string;
  label: string;
  status: string;
  lastFetchedAt: string | null;
  providerUpdatedAt: string | null;
  consentExpiresAt: string | null;
  lastError: string | null;
  lastSuccessfulSyncAt?:string;
  lastAttemptAt?:string;
  lastFullSyncAt?:string|null;
  syncMode?:string;
  executionStatus?:string|null;
  identification?:{state:string;institutions?:string[];codes?:string[]};
  productStates?:{bills?:ProductState;investments?:ProductState};
}
export interface BankAccount {
  id: string;
  itemId: string;
  name: string;
  type: 'BANK' | 'CREDIT';
  currencyCode: string;
  balanceCents: number;
  updatedAt?: string;
  institution?:AccountInstitution;
  subtype?:string;
  creditData?:{brand?:string;status?:string;creditLimitCents:number|null;availableCreditLimitCents:number|null;dueDate:string|null};
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
  products?:{bills:BankBill[];investments:BankInvestment[]};
}
