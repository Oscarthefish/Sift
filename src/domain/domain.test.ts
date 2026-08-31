import { describe, expect, it } from "vitest";
import { parseWestpacCsv } from "./importers/westpac";
import { parseWestpacPdfLines, type PdfLine } from "./importers/westpac-pdf";
import { merchantName, prepareImport } from "./ingest";
import { applyMerchantRules } from "./rules";
import { detectTransfers, suggestTransfers } from "./transfers";
import { availableMonths, monthlySpend } from "./analysis";
import type { Transaction } from "./types";

const transaction = (id: string, accountId: string, amount: number, postedAt = "2026-08-01"): Transaction => ({
  id, accountId, postedAt, amount, description: "NEW WORLD SAMPLE", merchant: "New World",
  tags: [], context: "personal", excludedFromSpending: false, sourceFingerprint: id,
});

describe("Westpac imports", () => {
  it("handles separate debit and credit columns", () => {
    const result = parseWestpacCsv("Date,Description,Debit,Credit,Balance\n28/08/2026,Shop,12.50,,100", "cheque");
    expect(result.transactions[0].amount).toBe(-12.5);
  });

  it("reads explicit withdrawal and deposit columns from PDF text", () => {
    const line = (text: string, values: Array<[string, number]>, y: number): PdfLine => ({ text, page: 1, tokens: values.map(([token, x]) => ({ text: token, x, y })) });
    const result = parseWestpacPdfLines([
      line("Statement period 1 August 2026", [["Statement period 1 August 2026", 20]], 700),
      line("Date Details Withdrawals Deposits Balance", [["Date", 20], ["Details", 90], ["Withdrawals", 300], ["Deposits", 390], ["Balance", 470]], 650),
      line("2 Aug SAMPLE CAFE 12.50 987.50", [["2 Aug", 20], ["SAMPLE CAFE", 90], ["12.50", 300], ["987.50", 470]], 620),
      line("3 Aug SAMPLE SALARY 500.00 1487.50", [["3 Aug", 20], ["SAMPLE SALARY", 90], ["500.00", 390], ["1487.50", 470]], 600),
    ], "cheque");
    expect(result.transactions.map((item) => item.amount)).toEqual([-12.5, 500]);
    expect(result.transactions[0].date).toBe("02/08/2026");
  });

  it("treats credit-card purchases as spending and CR rows as credits", () => {
    const rows: PdfLine[] = [
      { text: "Statement 2026", page: 1, tokens: [{ text: "Statement 2026", x: 20, y: 700 }] },
      { text: "5 Aug SAMPLE SHOP 24.90", page: 1, tokens: [{ text: "5 Aug", x: 20, y: 600 }, { text: "SAMPLE SHOP", x: 100, y: 600 }, { text: "24.90", x: 450, y: 600 }] },
      { text: "6 Aug PAYMENT 100.00 CR", page: 1, tokens: [{ text: "6 Aug", x: 20, y: 580 }, { text: "PAYMENT", x: 100, y: 580 }, { text: "100.00 CR", x: 450, y: 580 }] },
    ];
    expect(parseWestpacPdfLines(rows, "credit-card").transactions.map((item) => item.amount)).toEqual([-24.9, 100]);
  });

  it("normalises dates, merchants and repeated-row fingerprints", () => {
    const rows = [{ date: "28/08/2026", description: "VISA DAILY BREAD NZ", amount: -14.8 }, { date: "28/08/2026", description: "VISA DAILY BREAD NZ", amount: -14.8 }];
    const result = prepareImport(rows, "credit-card", []);
    expect(result[0].postedAt).toBe("2026-08-28");
    expect(result[0].merchant).toBe("Daily Bread");
    expect(result[0].sourceFingerprint).not.toBe(result[1].sourceFingerprint);
    expect(merchantName("EFTPOS NEW WORLD NEW ZEALAND")).toBe("New World");
  });
});

describe("merchant rules", () => {
  it("applies the highest-priority matching rule", () => {
    const result = applyMerchantRules(transaction("1", "a", -12), [
      { id: "r1", match: { kind: "contains", value: "world" }, categoryId: "groceries", tags: ["weekly"], context: "personal", priority: 10 },
    ]);
    expect(result.categoryId).toBe("groceries");
    expect(result.tags).toContain("weekly");
  });
});

describe("transfer detection", () => {
  it("excludes equal and opposite movements between accounts", () => {
    const result = detectTransfers([transaction("out", "cheque", -500), transaction("in", "card", 500, "2026-08-02")]);
    expect(result.every((item) => item.excludedFromSpending)).toBe(true);
  });

  it("proposes pairs without changing their state", () => {
    const rows = [transaction("out", "cheque", -500), transaction("in", "card", 500, "2026-08-02")];
    const suggestions = suggestTransfers(rows);
    expect(suggestions).toHaveLength(1);
    expect(rows.every((item) => !item.excludedFromSpending)).toBe(true);
  });

  it("can match an incoming row initially marked as income", () => {
    const incoming = { ...transaction("in", "card", 500, "2026-08-02"), excludedFromSpending: true, exclusionReason: "income" as const };
    expect(suggestTransfers([transaction("out", "cheque", -500), incoming])).toHaveLength(1);
  });
});

describe("monthly analysis", () => {
  it("orders months newest-first and separates personal from Haven", () => {
    const august = transaction("aug", "card", -100, "2026-08-02");
    const july = { ...transaction("jul", "card", -40, "2026-07-02"), context: "haven" as const };
    expect(availableMonths([july, august])).toEqual(["2026-08", "2026-07"]);
    expect(monthlySpend([july, august])).toEqual([
      { month: "2026-08", personal: 100, haven: 0, total: 100 },
      { month: "2026-07", personal: 0, haven: 40, total: 40 },
    ]);
  });
});
