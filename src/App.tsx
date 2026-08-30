import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Check, ChevronRight, CircleHelp, FileText, Search, Settings2, X } from "lucide-react";
import { categorySpend, savingsOpportunities } from "./domain/analysis";
import { prepareImport } from "./domain/ingest";
import { parseWestpacCsv } from "./domain/importers/westpac";
import { learnMerchantRule } from "./domain/rules";
import { detectTransfers } from "./domain/transfers";
import type { AccountKind, MerchantRule, Transaction } from "./domain/types";
import { repository, type ImportSummary } from "./data/repository";
import { categories } from "./fixtures/demo";

const money = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" });
type View = "overview" | "review" | "rules";

export default function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [rules, setRules] = useState<MerchantRule[]>([]);
  const [view, setView] = useState<View>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const [storedTransactions, storedRules] = await Promise.all([repository.listTransactions(), repository.listRules()]);
    setTransactions(storedTransactions);
    setRules(storedRules);
  };
  useEffect(() => { refresh().catch((reason) => setError(String(reason))).finally(() => setLoading(false)); }, []);

  const reviewCount = transactions.filter((item) => !item.categoryId && item.amount < 0 && !item.excludedFromSpending).length;
  const personal = transactions.filter((item) => item.context === "personal");
  const spend = categorySpend(personal, categories);
  const personalTotal = spend.reduce((sum, item) => sum + item.amount, 0);
  const havenTotal = categorySpend(transactions.filter((item) => item.context === "haven"), categories).reduce((sum, item) => sum + item.amount, 0);
  const opportunities = savingsOpportunities(spend);
  const month = transactions[0]?.postedAt ? new Date(`${transactions[0].postedAt}T12:00:00`).toLocaleDateString("en-NZ", { month: "long", year: "numeric" }) : "Ready when you are";

  const update = async (item: Transaction, remember = false) => {
    setError("");
    await repository.updateTransaction(item);
    if (remember) {
      const rule = learnMerchantRule(item);
      await repository.saveRule(rule);
      setRules((current) => [rule, ...current]);
      const matching = transactions.filter((candidate) => candidate.id !== item.id && candidate.description.toLowerCase().includes(rule.match.value.toLowerCase()));
      await Promise.all(matching.map((candidate) => repository.updateTransaction({ ...candidate, categoryId: item.categoryId, tags: [...new Set([...candidate.tags, ...item.tags])], context: item.context })));
    }
    await refresh();
  };

  const findTransfers = async () => {
    const detected = detectTransfers(transactions);
    const changed = detected.filter((item) => item.excludedFromSpending !== transactions.find((existing) => existing.id === item.id)?.excludedFromSpending);
    await Promise.all(changed.map((item) => repository.updateTransaction(item)));
    await refresh();
    setNotice(changed.length ? `${changed.length / 2} transfer pair${changed.length === 2 ? "" : "s"} excluded. You can restore either transaction in Review.` : "No new transfer pairs found.");
  };

  return <div className="app-shell">
    <aside className="rail">
      <div className="wordmark"><span>S</span>Sift</div>
      <nav aria-label="Primary">
        <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>Overview</button>
        <button className={view === "review" ? "active" : ""} onClick={() => setView("review")}>Review {reviewCount > 0 && <b>{reviewCount}</b>}</button>
        <button className={view === "rules" ? "active" : ""} onClick={() => setView("rules")}>Rules <small>{rules.length}</small></button>
      </nav>
      <div className="rail-bottom"><button><Settings2 size={16} /> Settings</button><button><CircleHelp size={16} /> About your data</button><div className="privacy"><i /> Stored on this Mac</div></div>
    </aside>
    <main>
      <header><div><p className="eyebrow">{month}</p><h1>{view === "overview" ? "Where your money went." : view === "review" ? "Review the details." : "What Sift remembers."}</h1></div>
        <div className="header-actions"><button className="search" aria-label="Search"><Search size={18} /></button><button className="import" onClick={() => setImportOpen(true)}><ArrowDownToLine size={17} /> Import statement</button></div></header>
      {error && <div className="banner error"><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div>}
      {notice && <div className="banner"><span>{notice}</span><button onClick={() => setNotice("")}><X size={15} /></button></div>}
      {loading ? <div className="empty"><p>Opening your local ledger…</p></div> : view === "overview" ? <Overview transactions={transactions} spend={spend} personalTotal={personalTotal} havenTotal={havenTotal} reviewCount={reviewCount} opportunities={opportunities} onReview={() => setView("review")} onImport={() => setImportOpen(true)} /> : view === "review" ? <Review transactions={transactions} onUpdate={update} onFindTransfers={findTransfers} /> : <Rules rules={rules} />}
    </main>
    {importOpen && <ImportDialog rules={rules} fileRef={fileRef} onClose={() => setImportOpen(false)} onComplete={async (summary) => { await refresh(); setImportOpen(false); setNotice(`${summary.inserted} transaction${summary.inserted === 1 ? "" : "s"} imported${summary.duplicates ? `; ${summary.duplicates} duplicate${summary.duplicates === 1 ? "" : "s"} skipped` : ""}.`); }} />}
  </div>;
}

function Overview({ transactions, spend, personalTotal, havenTotal, reviewCount, opportunities, onReview, onImport }: any) {
  if (!transactions.length) return <div className="empty"><div className="empty-mark"><FileText size={24} /></div><p className="eyebrow">Your ledger is empty</p><h2>Start with a Westpac CSV.</h2><p>Sift reads the statement, saves transactions to its private local database, then lets you review every decision before it becomes a rule.</p><button className="primary" onClick={onImport}>Choose a statement</button></div>;
  return <><section className="summary"><div><span>Personal spending</span><strong>{money.format(personalTotal)}</strong><small>Transfers and income excluded</small></div><div><span>Haven spending</span><strong>{money.format(havenTotal)}</strong><small>{transactions.filter((item: Transaction) => item.context === "haven").length} tagged expenses</small></div><div className="review-note"><span>Needs review</span><strong>{reviewCount}</strong><small>{reviewCount ? "Uncategorised expenses" : "Everything is filed"}</small></div></section>
    <section className="workbench"><article className="spending-panel"><div className="section-heading"><div><p className="eyebrow">The shape of the month</p><h2>Spending by category</h2></div><button onClick={onReview}>Review <ChevronRight size={15} /></button></div><div className="bars">{spend.map((item: any) => <div className="bar-row" key={item.id}><span className="dot" style={{ background: item.colour }} /><span className="category">{item.name}</span><div className="bar-track"><i style={{ width: `${Math.max(item.share * 100, 3)}%`, background: item.colour }} /></div><strong>{money.format(item.amount)}</strong><small>{Math.round(item.share * 100)}%</small></div>)}</div></article>
      <aside className="insight-panel"><p className="eyebrow">Worth considering</p><h2>{opportunities[0] ? `${opportunities[0].category} is the clearest lever.` : "A useful pattern will emerge."}</h2><p>{opportunities[0] ? <>Reducing this category by 15% would retain roughly <strong>{money.format(opportunities[0].yearly)}</strong> across a year.</> : "Import and review more spending to reveal considered savings opportunities."}</p><div className="rule" /><p className="ollama-label">Local commentary</p><p className="muted">Optional Ollama insights are off. Totals and trends never depend on AI.</p></aside></section>
    <section className="recent"><div className="section-heading"><div><p className="eyebrow">Latest activity</p><h2>Recent transactions</h2></div><button onClick={onReview}>Review all <ChevronRight size={15} /></button></div><TransactionRows transactions={transactions.slice(0, 6)} /></section></>;
}

function TransactionRows({ transactions }: { transactions: Transaction[] }) {
  return <div className="transaction-list">{transactions.map((item) => <div className="transaction" key={item.id}><time>{new Date(`${item.postedAt}T12:00:00`).toLocaleDateString("en-NZ", { day: "2-digit", month: "short" })}</time><div><strong>{item.merchant}</strong><small>{item.context === "haven" ? "Haven · " : ""}{item.excludedFromSpending ? `Excluded · ${item.exclusionReason}` : categories.find((category) => category.id === item.categoryId)?.name ?? "Needs review"}</small></div><span className={item.categoryId || item.excludedFromSpending ? "status" : "status attention"}>{item.excludedFromSpending ? "Excluded" : item.categoryId ? "Filed" : "Review"}</span><b className={item.amount > 0 ? "positive" : ""}>{item.amount > 0 ? "+" : ""}{money.format(Math.abs(item.amount))}</b></div>)}</div>;
}

function Review({ transactions, onUpdate, onFindTransfers }: { transactions: Transaction[]; onUpdate: (item: Transaction, remember?: boolean) => Promise<void>; onFindTransfers: () => Promise<void> }) {
  const [selected, setSelected] = useState<Transaction | null>(transactions.find((item) => !item.categoryId && item.amount < 0 && !item.excludedFromSpending) ?? transactions[0] ?? null);
  const [tagText, setTagText] = useState("");
  useEffect(() => setSelected((current) => current ? transactions.find((item) => item.id === current.id) ?? null : transactions[0] ?? null), [transactions]);
  return <section className="review-layout"><div className="review-list"><div className="review-tools"><span>{transactions.length} transactions</span><button onClick={onFindTransfers}>Find transfers</button></div>{transactions.map((item) => <button key={item.id} className={`review-row ${selected?.id === item.id ? "selected" : ""}`} onClick={() => { setSelected(item); setTagText(""); }}><span className={!item.categoryId && item.amount < 0 && !item.excludedFromSpending ? "review-dot attention" : "review-dot"} /><span><strong>{item.merchant}</strong><small>{item.postedAt} · {item.accountId.replace("westpac-", "")}</small></span><b>{money.format(Math.abs(item.amount))}</b></button>)}</div>
    <aside className="editor">{selected ? <><p className="eyebrow">Transaction details</p><h2>{selected.merchant}</h2><p className="original">{selected.description}</p><label>Category<select value={selected.categoryId ?? ""} onChange={(event) => setSelected({ ...selected, categoryId: event.target.value || undefined })}><option value="">Needs review</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Use<select value={selected.context} onChange={(event) => setSelected({ ...selected, context: event.target.value as "personal" | "haven" })}><option value="personal">Personal</option><option value="haven">Haven</option></select></label><label>Tags<input value={tagText} placeholder={selected.tags.join(", ") || "e.g. reimbursable, holiday"} onChange={(event) => setTagText(event.target.value)} /></label><label className="check"><input type="checkbox" checked={selected.excludedFromSpending} onChange={(event) => setSelected({ ...selected, excludedFromSpending: event.target.checked, exclusionReason: event.target.checked ? "transfer" : undefined })} /> Exclude from spending</label><div className="editor-actions"><button onClick={() => onUpdate({ ...selected, tags: tagText ? tagText.split(",").map((tag) => tag.trim()).filter(Boolean) : selected.tags })}>Save once</button><button className="primary" disabled={!selected.categoryId} onClick={() => onUpdate({ ...selected, tags: tagText ? tagText.split(",").map((tag) => tag.trim()).filter(Boolean) : selected.tags }, true)}><Check size={15} /> Save & remember</button></div><small className="privacy-copy">Remembering creates a local merchant rule and updates matching transactions. Nothing leaves this Mac.</small></> : <p>Select a transaction.</p>}</aside></section>;
}

function Rules({ rules }: { rules: MerchantRule[] }) { return <section className="rules-page"><p className="eyebrow">Local merchant learning</p><h2>{rules.length ? `${rules.length} remembered decision${rules.length === 1 ? "" : "s"}.` : "No rules yet."}</h2><p>Use “Save & remember” while reviewing to categorise matching merchants automatically.</p>{rules.map((rule) => <div className="rule-row" key={rule.id}><span>If description contains</span><strong>{rule.match.value}</strong><ChevronRight size={15} /><span>{categories.find((category) => category.id === rule.categoryId)?.name ?? "Uncategorised"} · {rule.context}</span></div>)}</section>; }

function ImportDialog({ rules, fileRef, onClose, onComplete }: { rules: MerchantRule[]; fileRef: React.RefObject<HTMLInputElement | null>; onClose: () => void; onComplete: (summary: ImportSummary) => Promise<void> }) {
  const [accountKind, setAccountKind] = useState<AccountKind>("cheque");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [prepared, setPrepared] = useState<Transaction[]>([]);
  useEffect(() => { if (!file) return; file.text().then((text) => setPrepared(prepareImport(parseWestpacCsv(text, accountKind).transactions, accountKind, rules))).catch((reason) => { setPrepared([]); setError(String(reason)); }); }, [file, accountKind, rules]);
  return <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><button className="modal-close" onClick={onClose}><X size={18} /></button><p className="eyebrow">Private local import</p><h2 id="import-title">Add a Westpac statement</h2><p>The selected file is read in memory. Sift stores normalised transactions, not a copy of the statement.</p><div className="account-choice"><button className={accountKind === "cheque" ? "selected" : ""} onClick={() => setAccountKind("cheque")}>Cheque account</button><button className={accountKind === "credit-card" ? "selected" : ""} onClick={() => setAccountKind("credit-card")}>Credit card</button></div><input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(event) => { setError(""); setFile(event.target.files?.[0] ?? null); }} /><button className="file-picker" onClick={() => fileRef.current?.click()}><FileText size={20} /><span><strong>{file?.name ?? "Choose a CSV statement"}</strong><small>{file ? `${prepared.length} readable rows` : "Westpac CSV export"}</small></span><ChevronRight size={18} /></button>{error && <p className="inline-error">{error}</p>}{prepared.length > 0 && <div className="import-preview">{prepared.slice(0, 4).map((item) => <div key={item.id}><span>{item.postedAt}</span><strong>{item.merchant}</strong><b>{money.format(Math.abs(item.amount))}</b></div>)}{prepared.length > 4 && <small>and {prepared.length - 4} more…</small>}</div>}<div className="modal-actions"><button onClick={onClose}>Cancel</button><button className="primary" disabled={!prepared.length || saving} onClick={async () => { setSaving(true); try { await onComplete(await repository.importTransactions(prepared)); } catch (reason) { setError(String(reason)); setSaving(false); } }}>{saving ? "Importing…" : `Import ${prepared.length || ""} transactions`}</button></div></section></div>;
}
