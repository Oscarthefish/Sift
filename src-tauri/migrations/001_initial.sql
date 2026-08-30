BEGIN IMMEDIATE;

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  posted_at TEXT NOT NULL,
  description TEXT NOT NULL,
  merchant TEXT NOT NULL,
  amount REAL NOT NULL,
  category_id TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  context TEXT NOT NULL CHECK (context IN ('personal', 'haven')),
  excluded_from_spending INTEGER NOT NULL DEFAULT 0,
  exclusion_reason TEXT,
  source_fingerprint TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactions_posted ON transactions(posted_at DESC);

CREATE TABLE merchant_rules (
  id TEXT PRIMARY KEY,
  match_kind TEXT NOT NULL CHECK (match_kind IN ('contains', 'exact')),
  match_value TEXT NOT NULL,
  category_id TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  context TEXT CHECK (context IN ('personal', 'haven')),
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

PRAGMA user_version=1;

COMMIT;
