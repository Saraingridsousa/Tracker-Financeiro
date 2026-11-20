export type TransactionType = 'income' | 'expense';
export type AssetType = 'Ações' | 'FIIs' | 'Tesouro Direto' | 'Criptomoedas' | 'ETFs' | 'Renda Fixa' | 'Outros';

export type BankName = 'Inter' | 'Caixa' | 'Sofisa' | 'BB' | 'Outro';

export interface Transaction {
  id: string;
  date: string; // ISO date YYYY-MM-DD
  description: string;
  amount: number; // Non-negative BRL major units (reais), never cents. Direction is `type`.
  currency?: string; // Legacy records are BRL; other currencies must not be summed as BRL.
  accountId?: string;
  providerId?: string;
  providerTransactionId?: string;
  sourceRecordId?: string;
  identityScope?: string; // Immutable import namespace, not an asserted real bank-account identity.
  identityAmbiguous?: boolean;
  importSourceId?: string;
  categoryManuallyAssigned?: boolean;
  manualOverrides?: Partial<Pick<Transaction, 'date' | 'description' | 'amount' | 'type' | 'categoryId' | 'bank' | 'isNeutral' | 'isInternalTransfer' | 'isSelfTransfer' | 'isInvestment' | 'isCreditCardPayment'>>;
  type: TransactionType;
  categoryId: string;
  categoryName?: string;
  source: 'manual' | 'import';
  isInternalTransfer?: boolean;
  isSelfTransfer?: boolean;
  isInvestment?: boolean;
  isCreditCardPayment?: boolean;
  isNeutral?: boolean;
  category?: string;
  paymentMethod?: 'CREDIT_CARD' | 'DEBIT_CARD' | 'BANK_TRANSFER' | 'PIX' | 'MANUAL';
  bank?: BankName;
  bankName?: string;
  sourceBank?: string;
  rawHash?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon?: string;
  keywords: string[];
  type: TransactionType | 'both';
  isDefault?: boolean;
  isNeutral?: boolean;
  excludeFromTotals?: boolean;
}

export interface Rule {
  id: string;
  categoryId: string;
  keywords: string[];
  isActive: boolean;
}

export interface AssetPosition {
  id: string;
  tickerOrName: string;
  type: AssetType;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  targetAllocationPercent?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface InvestmentOrder {
  id: string;
  assetId: string;
  ticker: string;
  type: AssetType;
  operation: 'BUY' | 'SELL';
  date: string;
  quantity: number;
  unitPrice: number;
  totalValue: number;
}

export interface InvestmentBackupPayload {
  assets: AssetPosition[];
  investmentOrders: InvestmentOrder[];
  exportedAt: string;
}

export interface BackupPayload {
  transactions: Transaction[];
  categories: Category[];
  rules: Rule[];
  assets?: AssetPosition[];
  investmentOrders?: InvestmentOrder[];
  exportedAt: string;
}

export interface DashboardSummary {
  balance: number;
  income: number;
  expenses: number;
  averageExpense: number;
  monthCount: number;
  neutralTotal: number;
  totalInvested: number;
}
