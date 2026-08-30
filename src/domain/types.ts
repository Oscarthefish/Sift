export type AccountKind = "cheque" | "credit-card";
export type ExpenseContext = "personal" | "haven";

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  currency: "NZD";
}

export interface Category {
  id: string;
  name: string;
  parentId?: string;
  colour: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  postedAt: string;
  description: string;
  merchant: string;
  amount: number;
  categoryId?: string;
  tags: string[];
  context: ExpenseContext;
  excludedFromSpending: boolean;
  exclusionReason?: "transfer" | "credit-card-payment" | "refund" | "income";
  sourceFingerprint: string;
}

export interface MerchantRule {
  id: string;
  match: { kind: "contains" | "exact"; value: string };
  categoryId?: string;
  tags: string[];
  context?: ExpenseContext;
  priority: number;
}

export interface ImportedRow {
  date: string;
  description: string;
  amount: number;
  balance?: number;
}

export interface ImportResult {
  accountKind: AccountKind;
  transactions: ImportedRow[];
  warnings: string[];
}
