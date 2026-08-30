import type { AccountKind, ImportResult, ImportedRow } from "../types";

const normalise = (value: string) => value.trim().replace(/^"|"$/g, "");

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) {
      cells.push(current);
      current = "";
    } else current += character;
  }
  cells.push(current);
  return cells.map(normalise);
}

const money = (value: string) =>
  Number(value.replace(/[,$]/g, "").replace(/^\((.*)\)$/, "-$1"));

export function parseWestpacCsv(csv: string, accountKind: AccountKind): ImportResult {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("The statement contains no transaction rows.");

  const headings = parseCsvLine(lines[0]).map((heading) => heading.toLowerCase());
  const find = (...names: string[]) => headings.findIndex((heading) => names.includes(heading));
  const dateIndex = find("date", "transaction date", "processed date");
  const descriptionIndex = find("description", "details", "transaction details", "memo");
  const amountIndex = find("amount", "transaction amount");
  const debitIndex = find("debit", "withdrawal");
  const creditIndex = find("credit", "deposit");
  const balanceIndex = find("balance", "running balance");

  if (dateIndex < 0 || descriptionIndex < 0 || (amountIndex < 0 && debitIndex < 0)) {
    throw new Error("This does not look like a supported Westpac CSV export.");
  }

  const warnings: string[] = [];
  const transactions = lines.slice(1).flatMap<ImportedRow>((line, rowIndex) => {
    const cells = parseCsvLine(line);
    const debit = debitIndex >= 0 ? money(cells[debitIndex] || "0") : 0;
    const credit = creditIndex >= 0 ? money(cells[creditIndex] || "0") : 0;
    const amount = amountIndex >= 0 ? money(cells[amountIndex]) : credit - debit;
    if (!cells[dateIndex] || !cells[descriptionIndex] || Number.isNaN(amount)) {
      warnings.push(`Skipped row ${rowIndex + 2}: missing or invalid fields.`);
      return [];
    }
    return [{
      date: cells[dateIndex],
      description: cells[descriptionIndex],
      amount,
      balance: balanceIndex >= 0 ? money(cells[balanceIndex]) : undefined,
    }];
  });

  return { accountKind, transactions, warnings };
}
