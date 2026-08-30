# Sift

**Sift is a local-first expense review and budgeting application that helps you understand where your money goes.** It imports bank transactions, makes monthly review quick, separates personal and business spending, surfaces trends, and identifies realistic opportunities to reduce expenses. Budget targets and over-budget highlighting are planned once there is enough history to make them useful.

Sift is a private desktop utility, not an “AI finance” product. Its calculations are deterministic. Optional Ollama commentary can explain trends in plain language, but the app remains fully useful with AI switched off.

> Sift is in active development. Statement import, local persistence and review are working, but do not rely on it as your only financial record.

## What Sift is for

- Importing Westpac NZ cheque-account and credit-card CSV exports.
- Reviewing, correcting and categorising transactions efficiently.
- Combining hierarchical categories with freeform tags.
- Separating `Personal` and `Haven` business expenses.
- Remembering merchant decisions as editable rules for future imports.
- Detecting transfers between your own accounts and excluding them from spending.
- Showing category totals, month-to-month trends and potential monthly/yearly savings.
- Adding optional, strictly local Ollama commentary to deterministic analysis.

## Privacy model

Financial data stays on your computer. Sift is designed to store its database in the operating system's private application-data directory, outside this repository. It has no telemetry and no required cloud service.

The repository contains generic application code, schemas, UI assets and fake fixtures only. It must never contain real statements, transaction exports, tags, merchant rules, databases, generated reports, backups or local configuration. The `.gitignore` provides layered protection for these, but it is not a substitute for checking every commit.

Before committing, run:

```sh
git status --short
git diff --cached
```

If sensitive data was ever committed, deleting the working file is not enough; assume it remains in Git history and remediate accordingly.

## Supported imports

The first importer targets Westpac CSV exports for standard cheque/everyday accounts and credit-card accounts. The parser accepts common date, description, amount, debit, credit and balance headings. It previews normalised rows before saving and uses stable source fingerprints to skip duplicate imports. The sample files in `fixtures/` are invented and exist solely for development. Real exports belong outside the repository (a local `statements/` directory is ignored if you choose to use one).

PDF, OFX and automatic bank connections are intentionally out of scope for the initial version.

## Development

Prerequisites are Node.js 22 or newer, Rust stable, and the platform prerequisites for [Tauri 2](https://v2.tauri.app/start/prerequisites/).

```sh
npm install
npm test
npm run build
```

Use `npm run dev` for quick interface work, or `npm run tauri dev` to run the desktop app. Copy `.env.example` to `.env.local` only if you want local Ollama commentary. Local environment files are ignored.

## Architecture

Sift uses a Tauri desktop shell, a React/TypeScript interface and pure domain modules for importing, classification and analysis. The native boundary owns a migrated SQLite database in Tauri's operating-system application-data directory. This keeps the product maintainable and gives privacy-sensitive capabilities one narrow, auditable home. Browser-only development uses local storage; the packaged desktop app uses SQLite.

See [the architecture decision](docs/architecture.md) for the data flow, module boundaries, persistence plan and privacy guardrails.

```text
src/
  domain/        canonical models, importers, rules, transfers, analysis
  fixtures/      fake demonstration data only
  App.tsx        initial review-desk interface
src-tauri/       native desktop boundary
fixtures/        fake Westpac-shaped CSV samples
docs/            architecture and product notes
```

## Ollama

Ollama support is optional and local. The planned adapter will send aggregated facts—such as category totals and changes over time—to a model running at `127.0.0.1`. It should not need raw statement rows or merchant-level history. Model output is commentary, clearly labelled as such; it cannot alter transaction data or financial calculations.

## Backups

The eventual local database will be important user data. Sift will support explicit backup and restore, but backup files will remain ignored by Git. Until that workflow exists, include the OS application-data directory in an encrypted local backup such as Time Machine. Never use a public Git repository as a financial-data backup.

## Roadmap

1. Validate import mapping against anonymised variants of Westpac's current exports.
2. Add month navigation and multi-month trend comparisons.
3. Add rule editing/deletion and explainable transfer suggestions before confirmation.
4. Add optional Ollama commentary with an explicit local-only status.
5. Introduce budgets and calm visual over-budget signals after the analysis workflow is proven.
6. Add encrypted backup/restore and broader accessibility testing.

## Licence and status

Sift is currently an internal, private-use project. No licence is granted unless one is added explicitly.
