import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Check, ChevronLeft, ChevronRight, CircleHelp, FileText, Pencil, Search, Settings2, Trash2, X } from "lucide-react";
import { availableMonths, categorySpend, inMonth, monthlySpend, savingsOpportunities } from "./domain/analysis";
import { prepareImport } from "./domain/ingest";
import { parseWestpacCsv } from "./domain/importers/westpac";
import { learnMerchantRule } from "./domain/rules";
import { suggestTransfers, type TransferSuggestion } from "./domain/transfers";
import type { AccountKind, MerchantRule, Transaction } from "./domain/types";
import { repository, type ImportSummary } from "./data/repository";
import { categories } from "./fixtures/demo";

const money = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" });
type View = "overview" | "review" | "trends" | "rules";

export default function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [rules, setRules] = useState<MerchantRule[]>([]);
  const [view, setView] = useState<View>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [transferSuggestions, setTransferSuggestions] = useState<TransferSuggestion[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const [storedTransactions, storedRules] = await Promise.all([repository.listTransactions(), repository.listRules()]);
    setTransactions(storedTransactions);
    setRules(storedRules);
  };
  useEffect(() => { refresh().catch((reason) => setError(String(reason))).finally(() => setLoading(false)); }, []);

  const months = availableMonths(transactions);
  useEffect(() => { if (!selectedMonth && months[0]) setSelectedMonth(months[0]); }, [months, selectedMonth]);

  const monthTransactions = selectedMonth ? inMonth(transactions, selectedMonth) : transactions;
  const reviewCount = monthTransactions.filter((item) => !item.categoryId && item.amount < 0 && !item.excludedFromSpending).length;
  const personal = monthTransactions.filter((item) => item.context === "personal");
  const spend = categorySpend(personal, categories);
  const personalTotal = spend.reduce((sum, item) => sum + item.amount, 0);
  const havenTotal = categorySpend(monthTransactions.filter((item) => item.context === "haven"), categories).reduce((sum, item) => sum + item.amount, 0);
  const opportunities = savingsOpportunities(spend);
  const month = selectedMonth ? new Date(`${selectedMonth}-01T12:00:00`).toLocaleDateString("en-NZ", { month: "long", year: "numeric" }) : "Ready when you are";

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

  const confirmTransfers = async (accepted: TransferSuggestion[]) => {
    const changed = accepted.flatMap((suggestion) => [suggestion.outgoing, suggestion.incoming]).map((item) => ({ ...item, excludedFromSpending: true, exclusionReason: "transfer" as const }));
    await Promise.all(changed.map((item) => repository.updateTransaction(item)));
    await refresh();
    setTransferSuggestions(null);
    setNotice(`${accepted.length} transfer pair${accepted.length === 1 ? "" : "s"} excluded from spending.`);
  };

  const changeMonth = (offset: number) => {
    const index = months.indexOf(selectedMonth);
    const next = months[index + offset];
    if (next) setSelectedMonth(next);
  };

  return <div className="app-shell">
    <aside className="rail">
      <div className="wordmark"><span>S</span>Sift</div>
      <nav aria-label="Primary">
        <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>Overview</button>
        <button className={view === "review" ? "active" : ""} onClick={() => setView("review")}>Review {reviewCount > 0 && <b>{reviewCount}</b>}</button>
        <button className={view === "trends" ? "active" : ""} onClick={() => setView("trends")}>Trends</button>
        <button className={view === "rules" ? "active" : ""} onClick={() => setView("rules")}>Rules <small>{rules.length}</small></button>
      </nav>
      <div className="rail-bottom"><button><Settings2 size={16} /> Settings</button><button><CircleHelp size={16} /> About your data</button><div className="privacy"><i /> Stored on this Mac</div></div>
    </aside>
    <main>
      <header><div><p className="eyebrow">{view === "trends" ? `${months.length} months of history` : month}</p><h1>{view === "overview" ? "Where your money went." : view === "review" ? "Review the details." : view === "trends" ? "How spending is changing." : "What Sift remembers."}</h1></div>
        <div className="header-actions">{view !== "trends" && months.length > 0 && <div className="month-switcher"><button disabled={months.indexOf(selectedMonth) >= months.length - 1} onClick={() => changeMonth(1)} aria-label="Previous month"><ChevronLeft size={17} /></button><span>{month}</span><button disabled={months.indexOf(selectedMonth) <= 0} onClick={() => changeMonth(-1)} aria-label="Next month"><ChevronRight size={17} /></button></div>}<button className="search" aria-label="Search"><Search size={18} /></button><button className="import" onClick={() => setImportOpen(true)}><ArrowDownToLine size={17} /> Import statement</button></div></header>
      {error && <div className="banner error"><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div>}
      {notice && <div className="banner"><span>{notice}</span><button onClick={() => setNotice("")}><X size={15} /></button></div>}
      {loading ? <div className="empty"><p>Opening your local ledger…</p></div> : view === "overview" ? <Overview transactions={monthTransactions} spend={spend} personalTotal={personalTotal} havenTotal={havenTotal} reviewCount={reviewCount} opportunities={opportunities} onReview={() => setView("review")} onImport={() => setImportOpen(true)} /> : view === "review" ? <Review transactions={monthTransactions} onUpdate={update} onFindTransfers={() => setTransferSuggestions(suggestTransfers(transactions))} /> : view === "trends" ? <Trends transactions={transactions} /> : <Rules rules={rules} onSave={async (rule) => { await repository.saveRule(rule); await refresh(); setNotice("Rule updated."); }} onDelete={async (id) => { await repository.deleteRule(id); await refresh(); setNotice("Rule deleted. Existing transactions were left unchanged."); }} />}
    </main>
    {importOpen && <ImportDialog rules={rules} fileRef={fileRef} onClose={() => setImportOpen(false)} onComplete={async (summary) => { await refresh(); setImportOpen(false); setNotice(`${summary.inserted} transaction${summary.inserted === 1 ? "" : "s"} imported${summary.duplicates ? `; ${summary.duplicates} duplicate${summary.duplicates === 1 ? "" : "s"} skipped` : ""}.`); }} />}
    {transferSuggestions && <TransferDialog suggestions={transferSuggestions} onClose={() => setTransferSuggestions(null)} onConfirm={confirmTransfers} />}
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

function Review({ transactions, onUpdate, onFindTransfers }: { transactions: Transaction[]; onUpdate: (item: Transaction, remember?: boolean) => Promise<void>; onFindTransfers: () => void | Promise<void> }) {
  const [selected, setSelected] = useState<Transaction | null>(transactions.find((item) => !item.categoryId && item.amount < 0 && !item.excludedFromSpending) ?? transactions[0] ?? null);
  const [tagText, setTagText] = useState("");
  useEffect(() => setSelected((current) => current ? transactions.find((item) => item.id === current.id) ?? null : transactions[0] ?? null), [transactions]);
  return <section className="review-layout"><div className="review-list"><div className="review-tools"><span>{transactions.length} transactions</span><button onClick={onFindTransfers}>Find transfers</button></div>{transactions.map((item) => <button key={item.id} className={`review-row ${selected?.id === item.id ? "selected" : ""}`} onClick={() => { setSelected(item); setTagText(""); }}><span className={!item.categoryId && item.amount < 0 && !item.excludedFromSpending ? "review-dot attention" : "review-dot"} /><span><strong>{item.merchant}</strong><small>{item.postedAt} · {item.accountId.replace("westpac-", "")}</small></span><b>{money.format(Math.abs(item.amount))}</b></button>)}</div>
    <aside className="editor">{selected ? <><p className="eyebrow">Transaction details</p><h2>{selected.merchant}</h2><p className="original">{selected.description}</p><label>Category<select value={selected.categoryId ?? ""} onChange={(event) => setSelected({ ...selected, categoryId: event.target.value || undefined })}><option value="">Needs review</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Use<select value={selected.context} onChange={(event) => setSelected({ ...selected, context: event.target.value as "personal" | "haven" })}><option value="personal">Personal</option><option value="haven">Haven</option></select></label><label>Tags<input value={tagText} placeholder={selected.tags.join(", ") || "e.g. reimbursable, holiday"} onChange={(event) => setTagText(event.target.value)} /></label><label className="check"><input type="checkbox" checked={selected.excludedFromSpending} onChange={(event) => setSelected({ ...selected, excludedFromSpending: event.target.checked, exclusionReason: event.target.checked ? "transfer" : undefined })} /> Exclude from spending</label><div className="editor-actions"><button onClick={() => onUpdate({ ...selected, tags: tagText ? tagText.split(",").map((tag) => tag.trim()).filter(Boolean) : selected.tags })}>Save once</button><button className="primary" disabled={!selected.categoryId} onClick={() => onUpdate({ ...selected, tags: tagText ? tagText.split(",").map((tag) => tag.trim()).filter(Boolean) : selected.tags }, true)}><Check size={15} /> Save & remember</button></div><small className="privacy-copy">Remembering creates a local merchant rule and updates matching transactions. Nothing leaves this Mac.</small></> : <p>Select a transaction.</p>}</aside></section>;
}

function Trends({ transactions }: { transactions: Transaction[] }) {
  const history = monthlySpend(transactions);
  const maximum = Math.max(...history.map((item) => item.total), 1);
  const latest = history[0];
  const previous = history[1];
  const change = latest && previous && previous.total ? (latest.total - previous.total) / previous.total : null;
  return <section className="trends-page"><div className="trend-summary"><div><p className="eyebrow">Latest month</p><strong>{money.format(latest?.total ?? 0)}</strong><small>{change === null ? "Add another month to compare" : `${Math.abs(change * 100).toFixed(1)}% ${change <= 0 ? "less" : "more"} than the month before`}</small></div><div><p className="eyebrow">Monthly average</p><strong>{money.format(history.length ? history.reduce((sum, item) => sum + item.total, 0) / history.length : 0)}</strong><small>Across {history.length} imported month{history.length === 1 ? "" : "s"}</small></div></div>
    <div className="trend-chart"><div className="section-heading"><div><p className="eyebrow">Monthly movement</p><h2>Personal and Haven spending</h2></div><div className="legend"><span><i className="personal-key" /> Personal</span><span><i className="haven-key" /> Haven</span></div></div><div className="columns">{[...history].reverse().map((item) => <div className="month-column" key={item.month}><div className="column-value">{money.format(item.total)}</div><div className="column-track"><i className="personal-bar" style={{ height: `${item.personal / maximum * 100}%` }} /><i className="haven-bar" style={{ height: `${item.haven / maximum * 100}%` }} /></div><strong>{new Date(`${item.month}-01T12:00:00`).toLocaleDateString("en-NZ", { month: "short" })}</strong><small>{item.month.slice(0, 4)}</small></div>)}</div></div>
    {history.length < 2 && <div className="trend-note"><p className="eyebrow">A little more history needed</p><p>Import another month's statement to unlock comparisons and direction-of-travel insights.</p></div>}</section>;
}

function Rules({ rules, onSave, onDelete }: { rules: MerchantRule[]; onSave: (rule: MerchantRule) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [editing, setEditing] = useState<MerchantRule | null>(null);
  return <section className="rules-page"><p className="eyebrow">Local merchant learning</p><h2>{rules.length ? `${rules.length} remembered decision${rules.length === 1 ? "" : "s"}.` : "No rules yet."}</h2><p>Rules apply on future imports. Editing or deleting a rule leaves already-reviewed transactions unchanged.</p>{rules.map((rule) => <div className="rule-row" key={rule.id}><span>If description {rule.match.kind === "exact" ? "equals" : "contains"}</span><strong>{rule.match.value}</strong><ChevronRight size={15} /><span>{categories.find((category) => category.id === rule.categoryId)?.name ?? "Uncategorised"} · {rule.context}</span><div className="rule-actions"><button aria-label="Edit rule" onClick={() => setEditing({ ...rule })}><Pencil size={14} /></button><button aria-label="Delete rule" onClick={() => onDelete(rule.id)}><Trash2 size={14} /></button></div></div>)}{editing && <div className="rule-editor"><button className="modal-close" onClick={() => setEditing(null)}><X size={17} /></button><p className="eyebrow">Edit remembered decision</p><h2>{editing.match.value}</h2><label>Match<select value={editing.match.kind} onChange={(event) => setEditing({ ...editing, match: { ...editing.match, kind: event.target.value as "contains" | "exact" } })}><option value="contains">Description contains</option><option value="exact">Description exactly equals</option></select></label><label>Merchant text<input value={editing.match.value} onChange={(event) => setEditing({ ...editing, match: { ...editing.match, value: event.target.value } })} /></label><label>Category<select value={editing.categoryId ?? ""} onChange={(event) => setEditing({ ...editing, categoryId: event.target.value || undefined })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Use<select value={editing.context ?? "personal"} onChange={(event) => setEditing({ ...editing, context: event.target.value as "personal" | "haven" })}><option value="personal">Personal</option><option value="haven">Haven</option></select></label><div className="editor-actions"><button onClick={() => setEditing(null)}>Cancel</button><button className="primary" onClick={async () => { await onSave(editing); setEditing(null); }}>Save rule</button></div></div>}</section>;
}

function TransferDialog({ suggestions, onClose, onConfirm }: { suggestions: TransferSuggestion[]; onClose: () => void; onConfirm: (accepted: TransferSuggestion[]) => Promise<void> }) {
  const [accepted, setAccepted] = useState(() => new Set(suggestions.map((item) => item.id)));
  const selected = suggestions.filter((item) => accepted.has(item.id));
  return <div className="modal-backdrop"><section className="modal transfer-modal" role="dialog" aria-modal="true" aria-labelledby="transfer-title"><button className="modal-close" onClick={onClose}><X size={18} /></button><p className="eyebrow">Suggested matches only</p><h2 id="transfer-title">Review transfers</h2><p>Sift found equal and opposite movements across your accounts within three days. Confirm each pair before it is excluded.</p>{suggestions.length ? <div className="transfer-pairs">{suggestions.map((suggestion) => <label key={suggestion.id} className="transfer-pair"><input type="checkbox" checked={accepted.has(suggestion.id)} onChange={() => setAccepted((current) => { const next = new Set(current); next.has(suggestion.id) ? next.delete(suggestion.id) : next.add(suggestion.id); return next; })} /><span><strong>{money.format(Math.abs(suggestion.outgoing.amount))}</strong><small>{suggestion.outgoing.accountId.replace("westpac-", "")} → {suggestion.incoming.accountId.replace("westpac-", "")} · {suggestion.dayDifference === 0 ? "same day" : `${suggestion.dayDifference} day${suggestion.dayDifference === 1 ? "" : "s"} apart`}</small><em>{suggestion.outgoing.description} / {suggestion.incoming.description}</em></span></label>)}</div> : <div className="no-suggestions">No unreviewed transfer pairs were found.</div>}<div className="modal-actions"><button onClick={onClose}>Cancel</button><button className="primary" disabled={!selected.length} onClick={() => onConfirm(selected)}>Exclude {selected.length} pair{selected.length === 1 ? "" : "s"}</button></div></section></div>;
}

function ImportDialog({ rules, fileRef, onClose, onComplete }: { rules: MerchantRule[]; fileRef: React.RefObject<HTMLInputElement | null>; onClose: () => void; onComplete: (summary: ImportSummary) => Promise<void> }) {
  const [accountKind, setAccountKind] = useState<AccountKind>("cheque");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [prepared, setPrepared] = useState<Transaction[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  useEffect(() => {
    if (!file) return;
    setPrepared([]); setWarnings([]); setError("");
    const parseFile = async () => file.name.toLowerCase().endsWith(".pdf")
      ? (await import("./domain/importers/westpac-pdf")).parseWestpacPdf(file, accountKind)
      : parseWestpacCsv(await file.text(), accountKind);
    parseFile().then((result) => { setWarnings(result.warnings); setPrepared(prepareImport(result.transactions, accountKind, rules)); }).catch((reason) => { setPrepared([]); setError(reason instanceof Error ? reason.message : String(reason)); });
  }, [file, accountKind, rules]);
  return <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><button className="modal-close" onClick={onClose}><X size={18} /></button><p className="eyebrow">Private local import</p><h2 id="import-title">Add a Westpac statement</h2><p>Choose a PDF statement or CSV transaction export. The file is read in memory; Sift stores normalised transactions, not a copy.</p><div className="account-choice"><button className={accountKind === "cheque" ? "selected" : ""} onClick={() => setAccountKind("cheque")}>Cheque account</button><button className={accountKind === "credit-card" ? "selected" : ""} onClick={() => setAccountKind("credit-card")}>Credit card</button></div><input ref={fileRef} type="file" accept=".csv,.pdf,text/csv,application/pdf" hidden onChange={(event) => { setError(""); setFile(event.target.files?.[0] ?? null); }} /><button className="file-picker" onClick={() => fileRef.current?.click()}><FileText size={20} /><span><strong>{file?.name ?? "Choose a PDF or CSV"}</strong><small>{file ? `${prepared.length} readable transactions` : "Westpac statement or transaction export"}</small></span><ChevronRight size={18} /></button>{error && <p className="inline-error">{error}</p>}{warnings.map((warning) => <p className="inline-warning" key={warning}>{warning} Check the preview carefully.</p>)}{prepared.length > 0 && <div className="import-preview">{prepared.slice(0, 4).map((item) => <div key={item.id}><span>{item.postedAt}</span><strong>{item.merchant}</strong><b className={item.amount > 0 ? "positive" : ""}>{item.amount > 0 ? "+" : "-"}{money.format(Math.abs(item.amount))}</b></div>)}{prepared.length > 4 && <small>and {prepared.length - 4} more…</small>}</div>}<div className="modal-actions"><button onClick={onClose}>Cancel</button><button className="primary" disabled={!prepared.length || saving} onClick={async () => { setSaving(true); try { await onComplete(await repository.importTransactions(prepared)); } catch (reason) { setError(String(reason)); setSaving(false); } }}>{saving ? "Importing…" : `Import ${prepared.length || ""} transactions`}</button></div></section></div>;
}
