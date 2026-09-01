export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  date: string; // ISO date YYYY-MM-DD
  description: string;
  amount: number; // positive value in cents or units; use number for simplicity
  type: TransactionType;
  categoryId: string;
  categoryName?: string;
  source: 'manual' | 'import';
  bankName?: string;
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

export interface BackupPayload {
  transactions: Transaction[];
  categories: Category[];
  rules: Rule[];
  exportedAt: string;
}

export interface DashboardSummary {
  balance: number;
  income: number;
  expenses: number;
  averageExpense: number;
  monthCount: number;
  neutralTotal: number;
}
