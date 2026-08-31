import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import type { AccountKind, ImportResult, ImportedRow } from "../types";

pdfjs.GlobalWorkerOptions.workerSrc = typeof process !== "undefined" && process.versions?.node
  ? new URL("../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).href
  : workerUrl;

export interface PdfToken { text: string; x: number; y: number }
export interface PdfLine { text: string; tokens: PdfToken[]; page: number }

const DATE = /^(\d{1,2})[\s/-]([A-Za-z]{3,9}|\d{1,2})(?:[\s/-](\d{2,4}))?\b/;
const MONEY = /^\$?-?[\d,]+\.\d{2}(?:\s*(?:CR|DR))?$/i;

function money(value: string): number {
  const credit = /CR$/i.test(value.trim());
  const debit = /DR$/i.test(value.trim());
  const amount = Number(value.replace(/[$,\s]|CR|DR/gi, ""));
  return credit ? Math.abs(amount) : debit ? -Math.abs(amount) : amount;
}

function dateValue(value: string, closingMonth: number, fallbackYear: number): string {
  const match = value.match(DATE);
  if (!match) throw new Error(`Unsupported statement date: ${value}`);
  const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const month = /^\d+$/.test(match[2]) ? Number(match[2]) : monthNames.indexOf(match[2].slice(0, 3).toLowerCase()) + 1;
  let year = match[3] ? Number(match[3]) : fallbackYear;
  if (year < 100) year += 2000;
  if (!match[3] && month > closingMonth) year -= 1;
  if (!month || month > 12) throw new Error(`Unsupported statement date: ${value}`);
  return `${String(match[1]).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

async function extractLines(file: File): Promise<PdfLine[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data: bytes }).promise;
  const lines: PdfLine[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const tokens = content.items.flatMap((item) => {
      if (!("str" in item) || !item.str.trim()) return [];
      return [{ text: item.str.trim(), x: item.transform[4], y: item.transform[5] }];
    });
    const groups: PdfToken[][] = [];
    tokens.sort((a, b) => b.y - a.y || a.x - b.x).forEach((token) => {
      const group = groups.find((candidate) => Math.abs(candidate[0].y - token.y) <= 2);
      if (group) group.push(token); else groups.push([token]);
    });
    groups.forEach((group) => {
      group.sort((a, b) => a.x - b.x);
      lines.push({ text: group.map((token) => token.text).join(" "), tokens: group, page: pageNumber });
    });
  }
  return lines;
}

function nearestColumn(token: PdfToken, columns: Record<string, number>): string {
  return Object.entries(columns).sort(([, a], [, b]) => Math.abs(a - token.x) - Math.abs(b - token.x))[0]?.[0] ?? "";
}

function statementYear(lines: PdfLine[]): number {
  const years = lines.flatMap((line) => line.text.match(/\b20\d{2}\b/g) ?? []).map(Number);
  return years.length ? Math.max(...years) : new Date().getFullYear();
}

function closingPeriod(lines: PdfLine[]): { month: number; year: number } {
  const text = lines.filter((line) => line.page === 1).map((line) => line.text).join(" ");
  const named = text.match(/Statement Closing date:\s*\d{1,2}\s+([A-Za-z]+)\s+(20\d{2})/i);
  const numeric = [...text.matchAll(/(?:Statement Period:|\bto)\s*(\d{1,2})\/(\d{1,2})\/(20\d{2})/gi)].at(-1);
  if (named) {
    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    return { month: monthNames.indexOf(named[1].slice(0, 3).toLowerCase()) + 1, year: Number(named[2]) };
  }
  if (numeric) return { month: Number(numeric[2]), year: Number(numeric[3]) };
  return { month: 12, year: statementYear(lines) };
}

export function parseWestpacPdfLines(lines: PdfLine[], accountKind: AccountKind): ImportResult {
  if (!lines.length) throw new Error("No selectable text was found. This may be a scanned PDF and would need OCR.");

  const warnings: string[] = [];
  const period = closingPeriod(lines);
  const header = lines.find((line) => /withdrawal|money out|debit/i.test(line.text) && /deposit|money in|credit/i.test(line.text));
  const creditHeader = lines.find((line) => /details/i.test(line.text) && /amount/i.test(line.text));
  const columns: Record<string, number> = {};
  header?.tokens.forEach((token) => {
    if (/withdrawal|money out|debit/i.test(token.text)) columns.debit = token.x;
    if (/deposit|money in|credit/i.test(token.text)) columns.credit = token.x;
    if (/balance/i.test(token.text)) columns.balance = token.x;
    if (/name of other party/i.test(token.text)) columns.name = token.x;
    if (/transaction particulars/i.test(token.text)) columns.particulars = token.x;
  });
  creditHeader?.tokens.forEach((token) => {
    if (/details/i.test(token.text)) columns.details = token.x;
    if (/amount/i.test(token.text)) columns.amount = token.x;
  });

  const transactions: ImportedRow[] = [];
  let current: ImportedRow | null = null;
  let currentPage = 0;
  for (const line of lines) {
    if (line.page !== currentPage) { current = null; currentPage = line.page; }
    const dateMatch = line.text.match(DATE);
    if (!dateMatch) {
      if (current && line.tokens.length && !/page|statement|balance|continued|westpac|CR Credit|DD Direct debit|ways to pay/i.test(line.text)) current.description += ` ${line.text}`;
      continue;
    }
    const monetary = line.tokens.filter((token) => MONEY.test(token.text));
    if (!monetary.length) continue;
    const dateText = dateMatch[0];
    const descriptionTokens = line.tokens.filter((token) => {
      if (MONEY.test(token.text) || DATE.test(token.text)) return false;
      if (accountKind === "credit-card" && columns.details !== undefined) return token.x >= columns.details && (columns.amount === undefined || token.x < columns.amount);
      if (accountKind === "cheque" && columns.name !== undefined) return token.x >= columns.name && (columns.particulars === undefined || token.x < columns.particulars);
      return token.x > (line.tokens[0]?.x ?? 0);
    });
    const description = descriptionTokens.map((token) => token.text).join(" ").trim() || "Statement transaction";
    let amount: number | undefined;
    let balance: number | undefined;

    if (accountKind === "credit-card") {
      const value = money(monetary[monetary.length - 1].text);
      amount = /CR$/i.test(monetary[monetary.length - 1].text) || /payment|refund|credit/i.test(description) ? Math.abs(value) : -Math.abs(value);
    } else if (Object.keys(columns).length) {
      monetary.forEach((token) => {
        const column = nearestColumn(token, columns);
        if (column === "debit") amount = -Math.abs(money(token.text));
        if (column === "credit") amount = Math.abs(money(token.text));
        if (column === "balance") balance = money(token.text);
      });
    } else {
      const values = monetary.map((token) => money(token.text));
      const candidate = values.length > 1 ? values[values.length - 2] : values[0];
      balance = values.length > 1 ? values[values.length - 1] : undefined;
      amount = /deposit|salary|interest|transfer from|credit/i.test(description) ? Math.abs(candidate) : -Math.abs(candidate);
      if (!warnings.includes("Money-in and money-out columns could not be located; inferred direction from transaction descriptions.")) warnings.push("Money-in and money-out columns could not be located; inferred direction from transaction descriptions.");
    }
    if (amount === undefined || Number.isNaN(amount)) continue;
    current = { date: dateValue(dateText, period.month, period.year), description, amount, balance };
    transactions.push(current);
  }

  if (!transactions.length) throw new Error("Sift could read this PDF but could not identify its transaction table. Export transactions as CSV, or provide an anonymised page so this layout can be supported safely.");
  return { accountKind, transactions, warnings };
}

export async function parseWestpacPdf(file: File, accountKind: AccountKind): Promise<ImportResult> {
  return parseWestpacPdfLines(await extractLines(file), accountKind);
}
