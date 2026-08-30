import { ArrowDownToLine, ChevronRight, CircleHelp, Search, Settings2 } from "lucide-react";
import { categorySpend, savingsOpportunities } from "./domain/analysis";
import { categories, transactions } from "./fixtures/demo";

const money = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" });
const spend = categorySpend(transactions, categories);
const total = spend.reduce((sum, item) => sum + item.amount, 0);
const opportunities = savingsOpportunities(spend);

export default function App() {
  return <div className="app-shell">
    <aside className="rail">
      <div className="wordmark"><span>S</span>Sift</div>
      <nav aria-label="Primary">
        <a className="active" href="#overview">Overview</a>
        <a href="#review">Review <b>1</b></a>
        <a href="#trends">Trends</a>
        <a href="#rules">Rules</a>
      </nav>
      <div className="rail-bottom">
        <button><Settings2 size={16} /> Settings</button>
        <button><CircleHelp size={16} /> About your data</button>
        <div className="privacy"><i /> Stored on this Mac</div>
      </div>
    </aside>

    <main>
      <header>
        <div><p className="eyebrow">August 2026</p><h1>Where your money went.</h1></div>
        <div className="header-actions"><button className="search" aria-label="Search"><Search size={18} /></button><button className="import"><ArrowDownToLine size={17} /> Import statement</button></div>
      </header>

      <section className="summary" id="overview">
        <div><span>Personal spending</span><strong>{money.format(total - 27)}</strong><small>6.4% less than July</small></div>
        <div><span>Haven spending</span><strong>{money.format(27)}</strong><small>1 tagged expense</small></div>
        <div className="review-note"><span>Needs review</span><strong>1</strong><small>Unfamiliar merchant</small></div>
      </section>

      <section className="workbench">
        <article className="spending-panel">
          <div className="section-heading"><div><p className="eyebrow">The shape of the month</p><h2>Spending by category</h2></div><button>Personal <ChevronRight size={15} /></button></div>
          <div className="bars">
            {spend.map((item) => <div className="bar-row" key={item.id}>
              <span className="dot" style={{ background: item.colour }} />
              <span className="category">{item.name}</span>
              <div className="bar-track"><i style={{ width: `${Math.max(item.share * 100, 3)}%`, background: item.colour }} /></div>
              <strong>{money.format(item.amount)}</strong>
              <small>{Math.round(item.share * 100)}%</small>
            </div>)}
          </div>
        </article>

        <aside className="insight-panel">
          <p className="eyebrow">Worth noticing</p>
          <h2>A quieter month for cafés.</h2>
          <p>You spent 18% less on cafés and dining than the recent monthly average. Keeping that rhythm could leave roughly <strong>{money.format(opportunities[0]?.yearly ?? 420)}</strong> more across a year.</p>
          <div className="rule" />
          <p className="ollama-label">Local commentary</p>
          <p className="muted">Optional Ollama insights are off. Sift's totals and trends never depend on AI.</p>
          <button className="text-button">Set up Ollama <ChevronRight size={15} /></button>
        </aside>
      </section>

      <section className="recent" id="review">
        <div className="section-heading"><div><p className="eyebrow">Latest activity</p><h2>Recent transactions</h2></div><button>Review all <ChevronRight size={15} /></button></div>
        <div className="transaction-list">
          {transactions.slice(0, 6).map((item) => <div className="transaction" key={item.id}>
            <time>{new Date(`${item.postedAt}T12:00:00`).toLocaleDateString("en-NZ", { day: "2-digit", month: "short" })}</time>
            <div><strong>{item.merchant}</strong><small>{item.context === "haven" ? "Haven · " : ""}{categories.find((category) => category.id === item.categoryId)?.name ?? "Needs review"}</small></div>
            <span className={item.categoryId ? "status" : "status attention"}>{item.categoryId ? "Filed" : "Review"}</span>
            <b>{money.format(Math.abs(item.amount))}</b>
          </div>)}
        </div>
      </section>
    </main>
  </div>;
}
