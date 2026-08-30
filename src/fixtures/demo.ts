import type { Account, Category, Transaction } from "../domain/types";

export const accounts: Account[] = [
  { id: "everyday", name: "Everyday", kind: "cheque", currency: "NZD" },
  { id: "card", name: "Credit card", kind: "credit-card", currency: "NZD" },
];

export const categories: Category[] = [
  { id: "groceries", name: "Groceries", parentId: "food", colour: "#315c49" },
  { id: "dining", name: "Cafés & dining", parentId: "food", colour: "#cb704a" },
  { id: "transport", name: "Transport", colour: "#d9a441" },
  { id: "home", name: "Home", colour: "#4a7180" },
  { id: "subscriptions", name: "Subscriptions", colour: "#725c7e" },
  { id: "shopping", name: "Shopping", colour: "#9d685f" },
];

const row = (id: string, accountId: string, postedAt: string, merchant: string, amount: number, categoryId?: string, context: "personal" | "haven" = "personal"): Transaction => ({
  id, accountId, postedAt, merchant, description: merchant.toUpperCase(), amount, categoryId,
  tags: context === "haven" ? ["reimbursable"] : [], context, excludedFromSpending: false,
  sourceFingerprint: `demo-${id}`,
});

export const transactions: Transaction[] = [
  row("t1", "card", "2026-08-28", "Daily Bread", -14.8, "dining"),
  row("t2", "everyday", "2026-08-27", "New World", -126.45, "groceries"),
  row("t3", "card", "2026-08-25", "Z Energy", -92.1, "transport"),
  row("t4", "card", "2026-08-24", "Figma", -27, "subscriptions", "haven"),
  row("t5", "everyday", "2026-08-22", "Mercury", -184.32, "home"),
  row("t6", "card", "2026-08-21", "Unity Books", -46.9, "shopping"),
  row("t7", "card", "2026-08-18", "Amano", -83.4, "dining"),
  row("t8", "everyday", "2026-08-16", "Farro", -86.2, "groceries"),
  row("t9", "card", "2026-08-11", "Spotify", -18.99, "subscriptions"),
  row("t10", "card", "2026-08-06", "Best Ugly Bagels", -22.5, "dining"),
  row("t11", "everyday", "2026-08-03", "Pak'nSave", -154.7, "groceries"),
  row("t12", "card", "2026-08-01", "Unfamiliar merchant", -31.2),
];
