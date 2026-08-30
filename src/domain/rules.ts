import type { MerchantRule, Transaction } from "./types";

export function applyMerchantRules(
  transaction: Transaction,
  rules: MerchantRule[],
): Transaction {
  const description = transaction.description.toLocaleLowerCase("en-NZ");
  const rule = [...rules]
    .sort((left, right) => right.priority - left.priority)
    .find(({ match }) => {
      const value = match.value.toLocaleLowerCase("en-NZ");
      return match.kind === "exact" ? description === value : description.includes(value);
    });

  if (!rule) return transaction;
  return {
    ...transaction,
    categoryId: rule.categoryId ?? transaction.categoryId,
    tags: [...new Set([...transaction.tags, ...rule.tags])],
    context: rule.context ?? transaction.context,
  };
}

export function learnMerchantRule(transaction: Transaction): MerchantRule {
  return {
    id: crypto.randomUUID(),
    match: { kind: "contains", value: transaction.merchant || transaction.description },
    categoryId: transaction.categoryId,
    tags: transaction.tags,
    context: transaction.context,
    priority: 100,
  };
}
