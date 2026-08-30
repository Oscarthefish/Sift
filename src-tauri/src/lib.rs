use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Transaction {
    id: String, account_id: String, posted_at: String, description: String, merchant: String,
    amount: f64, category_id: Option<String>, tags: Vec<String>, context: String,
    excluded_from_spending: bool, exclusion_reason: Option<String>, source_fingerprint: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MerchantRule {
    id: String, match_kind: String, match_value: String, category_id: Option<String>,
    tags: Vec<String>, context: Option<String>, priority: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportSummary { inserted: usize, duplicates: usize }

fn connection(app: &tauri::AppHandle) -> Result<Connection, String> {
    let directory = app.path().app_data_dir().map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let database = Connection::open(directory.join("sift.sqlite3")).map_err(|error| error.to_string())?;
    database.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;").map_err(|error| error.to_string())?;
    let version: i64 = database.query_row("PRAGMA user_version", [], |row| row.get(0)).map_err(|error| error.to_string())?;
    if version < 1 {
        database.execute_batch(include_str!("../migrations/001_initial.sql")).map_err(|error| error.to_string())?;
    }
    Ok(database)
}

#[tauri::command]
fn app_data_location(app: tauri::AppHandle) -> Result<String, String> {
    app.path().app_data_dir().map(|path| path.display().to_string()).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_transactions(app: tauri::AppHandle) -> Result<Vec<Transaction>, String> {
    let database = connection(&app)?;
    let mut statement = database.prepare("SELECT id, account_id, posted_at, description, merchant, amount, category_id, tags_json, context, excluded_from_spending, exclusion_reason, source_fingerprint FROM transactions ORDER BY posted_at DESC, created_at DESC").map_err(|error| error.to_string())?;
    let rows = statement.query_map([], |row| Ok(Transaction {
        id: row.get(0)?, account_id: row.get(1)?, posted_at: row.get(2)?, description: row.get(3)?, merchant: row.get(4)?, amount: row.get(5)?, category_id: row.get(6)?,
        tags: serde_json::from_str(&row.get::<_, String>(7)?).unwrap_or_default(), context: row.get(8)?, excluded_from_spending: row.get(9)?, exclusion_reason: row.get(10)?, source_fingerprint: row.get(11)?,
    })).map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())
}

#[tauri::command]
fn import_transactions(app: tauri::AppHandle, transactions: Vec<Transaction>) -> Result<ImportSummary, String> {
    let mut database = connection(&app)?;
    let db_transaction = database.transaction().map_err(|error| error.to_string())?;
    let mut inserted = 0;
    for item in &transactions {
        inserted += db_transaction.execute("INSERT OR IGNORE INTO transactions (id, account_id, posted_at, description, merchant, amount, category_id, tags_json, context, excluded_from_spending, exclusion_reason, source_fingerprint) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)", params![item.id, item.account_id, item.posted_at, item.description, item.merchant, item.amount, item.category_id, serde_json::to_string(&item.tags).unwrap_or_else(|_| "[]".into()), item.context, item.excluded_from_spending, item.exclusion_reason, item.source_fingerprint]).map_err(|error| error.to_string())?;
    }
    db_transaction.commit().map_err(|error| error.to_string())?;
    Ok(ImportSummary { inserted, duplicates: transactions.len() - inserted })
}

#[tauri::command]
fn update_transaction(app: tauri::AppHandle, item: Transaction) -> Result<(), String> {
    connection(&app)?.execute("UPDATE transactions SET category_id=?2, tags_json=?3, context=?4, excluded_from_spending=?5, exclusion_reason=?6, merchant=?7 WHERE id=?1", params![item.id, item.category_id, serde_json::to_string(&item.tags).unwrap_or_else(|_| "[]".into()), item.context, item.excluded_from_spending, item.exclusion_reason, item.merchant]).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_rules(app: tauri::AppHandle) -> Result<Vec<MerchantRule>, String> {
    let database = connection(&app)?;
    let mut statement = database.prepare("SELECT id, match_kind, match_value, category_id, tags_json, context, priority FROM merchant_rules ORDER BY priority DESC").map_err(|error| error.to_string())?;
    let rows = statement.query_map([], |row| Ok(MerchantRule { id: row.get(0)?, match_kind: row.get(1)?, match_value: row.get(2)?, category_id: row.get(3)?, tags: serde_json::from_str(&row.get::<_, String>(4)?).unwrap_or_default(), context: row.get(5)?, priority: row.get(6)? })).map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())
}

#[tauri::command]
fn save_rule(app: tauri::AppHandle, rule: MerchantRule) -> Result<(), String> {
    connection(&app)?.execute("INSERT OR REPLACE INTO merchant_rules (id, match_kind, match_value, category_id, tags_json, context, priority) VALUES (?1,?2,?3,?4,?5,?6,?7)", params![rule.id, rule.match_kind, rule.match_value, rule.category_id, serde_json::to_string(&rule.tags).unwrap_or_else(|_| "[]".into()), rule.context, rule.priority]).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_rule(app: tauri::AppHandle, id: String) -> Result<(), String> {
    connection(&app)?.execute("DELETE FROM merchant_rules WHERE id=?1", [id]).map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![app_data_location, list_transactions, import_transactions, update_transaction, list_rules, save_rule, delete_rule])
        .run(tauri::generate_context!()).expect("error while running Sift");
}
