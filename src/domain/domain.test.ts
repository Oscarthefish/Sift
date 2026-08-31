import { describe, expect, it } from "vitest";
import { parseWestpacCsv } from "./importers/westpac";
import { parseWestpacPdfLines, type PdfLine } from "./importers/westpac-pdf";
import { installPdfCompatibility } from "./importers/pdf-compat";
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
  it("installs the WebKit features required by the PDF engine", async () => {
    const prototype = ReadableStream.prototype as ReadableStream<unknown> & { [Symbol.asyncIterator]?: unknown };
    Object.defineProperty(prototype, Symbol.asyncIterator, { configurable: true, writable: true, value: undefined });
    installPdfCompatibility();
    expect(typeof (Promise as PromiseConstructor & { withResolvers?: unknown }).withResolvers).toBe("function");
    expect(typeof prototype[Symbol.asyncIterator]).toBe("function");
    const stream = new ReadableStream<string>({ start(controller) { controller.enqueue("ready"); controller.close(); } }) as ReadableStream<string> & { [Symbol.asyncIterator](): AsyncIterator<string> };
    const iterator = stream[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ value: "ready", done: false });
  });
  it("handles separate debit and credit columns", () => {
    const result = parseWestpacCsv("Date,Description,Debit,Credit,Balance\n28/08/2026,Shop,12.50,,100", "cheque");
    expect(result.transactions[0].amount).toBe(-12.5);
  });

  it("reads explicit withdrawal and deposit columns from PDF text", () => {
    const line = (text: string, values: Array<[string, number]>, y: number): PdfLine => ({ text, page: 1, tokens: values.map(([token, x]) => ({ text: token, x, y })) });
    const result = parseWestpacPdfLines([
      line("Statement period 1 August 2026", [["Statement period 1 August 2026", 20]], 700),
      line("DATE TYPE NAME OF OTHER PARTY TRANSACTION PARTICULARS MONEY OUT $ MONEY IN $ BALANCE $", [["DATE", 20], ["TYPE", 55], ["NAME OF OTHER PARTY", 90], ["TRANSACTION PARTICULARS", 210], ["MONEY OUT $", 300], ["MONEY IN $", 390], ["BALANCE $", 470]], 650),
      line("2 Aug PS SAMPLE CAFE CARD DETAIL 12.50 987.50", [["2 Aug", 20], ["PS", 55], ["SAMPLE CAFE", 90], ["CARD DETAIL", 210], ["12.50", 300], ["987.50", 470]], 620),
      line("3 Aug DC SAMPLE SALARY PAYROLL 500.00 1487.50", [["3 Aug", 20], ["DC", 55], ["SAMPLE SALARY", 90], ["PAYROLL", 210], ["500.00", 390], ["1487.50", 470]], 600),
    ], "cheque");
    expect(result.transactions.map((item) => item.amount)).toEqual([-12.5, 500]);
    expect(result.transactions[0].date).toBe("02/08/2026");
    expect(result.transactions[0].description).toBe("SAMPLE CAFE");
  });

  it("treats credit-card purchases as spending and CR rows as credits", () => {
    const rows: PdfLine[] = [
      { text: "Statement Period: 25/07/2026 to 24/08/2026", page: 1, tokens: [{ text: "Statement Period: 25/07/2026 to 24/08/2026", x: 20, y: 700 }] },
      { text: "TRANSACTION DATE PROCESS DATE DETAILS AMOUNT $", page: 1, tokens: [{ text: "TRANSACTION DATE", x: 20, y: 650 }, { text: "PROCESS DATE", x: 90, y: 650 }, { text: "DETAILS", x: 170, y: 650 }, { text: "AMOUNT $", x: 450, y: 650 }] },
      { text: "5 Aug 6 Aug SAMPLE SHOP 24.90", page: 1, tokens: [{ text: "5 Aug", x: 20, y: 600 }, { text: "6 Aug", x: 90, y: 600 }, { text: "SAMPLE SHOP", x: 170, y: 600 }, { text: "24.90", x: 450, y: 600 }] },
      { text: "6 Aug 6 Aug PAYMENT 100.00 CR", page: 1, tokens: [{ text: "6 Aug", x: 20, y: 580 }, { text: "6 Aug", x: 90, y: 580 }, { text: "PAYMENT", x: 170, y: 580 }, { text: "100.00 CR", x: 450, y: 580 }] },
    ];
    const result = parseWestpacPdfLines(rows, "credit-card");
    expect(result.transactions.map((item) => item.amount)).toEqual([-24.9, 100]);
    expect(result.transactions[0].description).toBe("SAMPLE SHOP");
  });

  it("assigns December rows to the prior year on a January statement", () => {
    const rows: PdfLine[] = [
      { text: "Statement Closing date: 24 January 2026", page: 1, tokens: [{ text: "Statement Closing date: 24 January 2026", x: 20, y: 700 }] },
      { text: "DATE DETAILS MONEY OUT $ MONEY IN $", page: 1, tokens: [{ text: "DATE", x: 20, y: 650 }, { text: "DETAILS", x: 100, y: 650 }, { text: "MONEY OUT $", x: 300, y: 650 }, { text: "MONEY IN $", x: 400, y: 650 }] },
      { text: "28 Dec SAMPLE 10.00", page: 1, tokens: [{ text: "28 Dec", x: 20, y: 600 }, { text: "SAMPLE", x: 100, y: 600 }, { text: "10.00", x: 300, y: 600 }] },
    ];
    expect(parseWestpacPdfLines(rows, "cheque").transactions[0].date).toBe("28/12/2025");
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
