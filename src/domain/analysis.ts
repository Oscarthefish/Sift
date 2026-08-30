import type { Category, Transaction } from "./types";

export interface CategorySpend { id: string; name: string; colour: string; amount: number; share: number }

export function categorySpend(
  transactions: Transaction[],
  categories: Category[],
): CategorySpend[] {
  const spending = transactions.filter((item) => item.amount < 0 && !item.excludedFromSpending);
  const total = spending.reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const amounts = new Map<string, number>();
  spending.forEach((item) => amounts.set(item.categoryId ?? "uncategorised", (amounts.get(item.categoryId ?? "uncategorised") ?? 0) + Math.abs(item.amount)));
  return [...amounts.entries()].map(([id, amount]) => {
    const category = categories.find((item) => item.id === id);
    return { id, name: category?.name ?? "Uncategorised", colour: category?.colour ?? "#aaa49a", amount, share: total ? amount / total : 0 };
  }).sort((left, right) => right.amount - left.amount);
}

export function savingsOpportunities(spend: CategorySpend[]) {
  return spend.filter((item) => ["dining", "subscriptions", "shopping"].includes(item.id)).map((item) => ({
    category: item.name,
    monthly: item.amount * 0.15,
    yearly: item.amount * 0.15 * 12,
    rationale: `A measured 15% reduction in ${item.name.toLowerCase()}.`,
  })).sort((left, right) => right.yearly - left.yearly);
}
