#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            allow_last_project_file(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Grant the remembered project path (string, not a Chrome handle) so autostart
/// can read it. Does not allow C:\ wholesale.
fn allow_last_project_file(app: &tauri::App) {
    use tauri::Manager;
    use tauri_plugin_fs::FsExt;
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    let last = dir.join("last-project.json");
    let Ok(text) = std::fs::read_to_string(&last) else {
        return;
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else {
        return;
    };
    let Some(path) = value.get("path").and_then(|p| p.as_str()) else {
        return;
    };
    if path.is_empty() {
        return;
    }
    let _ = app.fs_scope().allow_file(path);
}

