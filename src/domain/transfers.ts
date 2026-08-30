import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Transaction } from "./types";

export function detectTransfers(transactions: Transaction[]): Transaction[] {
  const matched = new Set<string>();
  for (let left = 0; left < transactions.length; left += 1) {
    for (let right = left + 1; right < transactions.length; right += 1) {
      const a = transactions[left];
      const b = transactions[right];
      if (a.accountId === b.accountId || Math.abs(a.amount + b.amount) > 0.005) continue;
      if (Math.abs(differenceInCalendarDays(parseISO(a.postedAt), parseISO(b.postedAt))) <= 3) {
        matched.add(a.id);
        matched.add(b.id);
        break;
      }
    }
  }
  return transactions.map((transaction) => matched.has(transaction.id)
    ? { ...transaction, excludedFromSpending: true, exclusionReason: "transfer" }
    : transaction);
}
