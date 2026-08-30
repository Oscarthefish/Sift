#[tauri::command]
fn app_data_location(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    app.path().app_data_dir().map(|path| path.display().to_string()).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![app_data_location])
        .run(tauri::generate_context!())
        .expect("error while running Sift");
}
