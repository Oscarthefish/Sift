# Sift architecture

## Decision

Sift is a Tauri 2 desktop application with a React/TypeScript interface. Financial logic lives in pure TypeScript modules; the Rust shell owns operating-system capabilities such as file selection, the application data directory and, in a later milestone, SQLite access.

This split keeps the calculation layer easy to test while making the privacy boundary explicit. Ollama is an optional adapter, never a source of truth. All totals, transfer matches, trends and savings estimates are deterministic and must be available without a model.

## Data flow

1. A user selects a Westpac CSV through the desktop file picker.
2. An account-specific importer maps source columns into canonical transaction rows.
3. Normalisation creates merchant labels and stable fingerprints for duplicate prevention.
4. Rules apply categories, freeform tags and Personal/Haven context.
5. Transfer detection proposes equal-and-opposite cross-account matches for exclusion. User decisions remain reversible.
6. SQLite persists source metadata, canonical transactions, rules and review decisions in the OS application-data directory.
7. Deterministic selectors produce spending totals, trends and savings scenarios.
8. If enabled, a local Ollama adapter receives only an aggregated summary and returns commentary. Raw statement rows are not required.

## Module boundaries

- `src/domain/importers`: statement parsing and source-specific validation.
- `src/domain`: canonical types, rules, transfer matching and deterministic analysis.
- `src/fixtures`: conspicuously fake UI/demo data; safe to commit.
- `src-tauri`: narrowly scoped native capabilities and future persistence migrations.
- `docs`: architectural decisions and privacy notes.

## Persistence plan

The initial schema will separate `accounts`, `statement_imports`, `transactions`, `categories`, `tags`, `transaction_tags`, `merchant_rules`, `transfer_matches` and `settings`. Imported source files should not be copied by default. Database migrations may be committed; the database itself must never be committed.

## Guardrails

- No telemetry or cloud API dependency.
- No raw financial data in logs, fixtures, snapshots or error-reporting services.
- Content-based fingerprints prevent duplicate imports without storing an extra statement copy.
- Merchant rules and local configuration are user data, not source code.
- Any future export is an explicit user action and defaults outside the repository.
