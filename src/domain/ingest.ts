import { parse } from "date-fns";
import type { AccountKind, ImportedRow, MerchantRule, Transaction } from "./types";
import { applyMerchantRules } from "./rules";

function isoDate(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = parse(trimmed, "dd/MM/yyyy", new Date());
  if (Number.isNaN(parsed.getTime())) throw new Error(`Unsupported date: ${value}`);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function fingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `westpac-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function merchantName(description: string): string {
  return description.replace(/\b(VISA|DEBIT|PURCHASE|EFTPOS|NZ|NEW ZEALAND)\b/gi, " ")
    .replace(/\s{2,}/g, " ").trim().toLocaleLowerCase("en-NZ")
    .replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase("en-NZ"));
}

export function prepareImport(rows: ImportedRow[], accountKind: AccountKind, rules: MerchantRule[]): Transaction[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const postedAt = isoDate(row.date);
    const accountId = accountKind === "cheque" ? "westpac-cheque" : "westpac-card";
    const base = `${accountId}|${postedAt}|${row.description.trim()}|${row.amount.toFixed(2)}`;
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    const sourceFingerprint = fingerprint(`${base}|${occurrence}`);
    return applyMerchantRules({
      id: crypto.randomUUID(), accountId, postedAt, description: row.description.trim(),
      merchant: merchantName(row.description), amount: row.amount, tags: [], context: "personal",
      excludedFromSpending: row.amount > 0, exclusionReason: row.amount > 0 ? "income" : undefined,
      sourceFingerprint,
    }, rules);
  });
}
