import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Transaction } from "./types";

export interface TransferSuggestion {
  id: string;
  outgoing: Transaction;
  incoming: Transaction;
  dayDifference: number;
}

export function suggestTransfers(transactions: Transaction[]): TransferSuggestion[] {
  const suggestions: TransferSuggestion[] = [];
  const used = new Set<string>();
  for (let left = 0; left < transactions.length; left += 1) {
    for (let right = left + 1; right < transactions.length; right += 1) {
      const a = transactions[left];
      const b = transactions[right];
      const dayDifference = Math.abs(differenceInCalendarDays(parseISO(a.postedAt), parseISO(b.postedAt)));
      const aFinalised = a.excludedFromSpending && a.exclusionReason !== "income";
      const bFinalised = b.excludedFromSpending && b.exclusionReason !== "income";
      if (used.has(a.id) || used.has(b.id) || aFinalised || bFinalised || a.accountId === b.accountId || Math.abs(a.amount + b.amount) > 0.005 || dayDifference > 3) continue;
      const outgoing = a.amount < 0 ? a : b;
      const incoming = a.amount > 0 ? a : b;
      suggestions.push({ id: `${outgoing.id}:${incoming.id}`, outgoing, incoming, dayDifference });
      used.add(a.id);
      used.add(b.id);
      break;
    }
  }
  return suggestions;
}

export function detectTransfers(transactions: Transaction[]): Transaction[] {
  const matched = new Set(suggestTransfers(transactions).flatMap((suggestion) => [suggestion.outgoing.id, suggestion.incoming.id]));
  return transactions.map((transaction) => matched.has(transaction.id)
    ? { ...transaction, excludedFromSpending: true, exclusionReason: "transfer" }
    : transaction);
}
