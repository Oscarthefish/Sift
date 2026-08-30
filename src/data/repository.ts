import { invoke } from "@tauri-apps/api/core";
import type { MerchantRule, Transaction } from "../domain/types";

export interface ImportSummary { inserted: number; duplicates: number }
export interface SiftRepository {
  listTransactions(): Promise<Transaction[]>;
  importTransactions(items: Transaction[]): Promise<ImportSummary>;
  updateTransaction(item: Transaction): Promise<void>;
  listRules(): Promise<MerchantRule[]>;
  saveRule(rule: MerchantRule): Promise<void>;
  deleteRule(id: string): Promise<void>;
}

const TRANSACTIONS_KEY = "sift.dev.transactions";
const RULES_KEY = "sift.dev.rules";
const browserRepository: SiftRepository = {
  async listTransactions() { return JSON.parse(localStorage.getItem(TRANSACTIONS_KEY) ?? "[]"); },
  async importTransactions(items) {
    const current = await this.listTransactions();
    const fingerprints = new Set(current.map((item) => item.sourceFingerprint));
    const additions = items.filter((item) => !fingerprints.has(item.sourceFingerprint));
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify([...current, ...additions]));
    return { inserted: additions.length, duplicates: items.length - additions.length };
  },
  async updateTransaction(item) {
    const current = await this.listTransactions();
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(current.map((existing) => existing.id === item.id ? item : existing)));
  },
  async listRules() { return JSON.parse(localStorage.getItem(RULES_KEY) ?? "[]"); },
  async saveRule(rule) {
    const current = await this.listRules();
    localStorage.setItem(RULES_KEY, JSON.stringify([...current.filter((item) => item.id !== rule.id), rule]));
  },
  async deleteRule(id) {
    const current = await this.listRules();
    localStorage.setItem(RULES_KEY, JSON.stringify(current.filter((item) => item.id !== id)));
  },
};

const tauriRepository: SiftRepository = {
  listTransactions: () => invoke("list_transactions"),
  importTransactions: (transactions) => invoke("import_transactions", { transactions }),
  updateTransaction: (item) => invoke("update_transaction", { item }),
  listRules: async () => (await invoke<Array<MerchantRule & { matchKind: "contains" | "exact"; matchValue: string }>>("list_rules")).map((rule) => ({ ...rule, match: { kind: rule.matchKind, value: rule.matchValue } })),
  saveRule: (rule) => invoke("save_rule", { rule: { ...rule, matchKind: rule.match.kind, matchValue: rule.match.value } }),
  deleteRule: (id) => invoke("delete_rule", { id }),
};

export const repository = "__TAURI_INTERNALS__" in window ? tauriRepository : browserRepository;
