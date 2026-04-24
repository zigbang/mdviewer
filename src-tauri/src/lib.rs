use serde::Serialize;
use std::fs;
use std::path::Path;

// ── 파일트리 구조 ────────────────────────────────────────
#[derive(Serialize, Clone)]
#[serde(tag = "type")]
pub enum FileNode {
    #[serde(rename = "file")]
    File { name: String, path: String },
    #[serde(rename = "dir")]
    Dir {
        name: String,
        path: String,
        children: Vec<FileNode>,
    },
}

fn build_tree(path: &Path) -> Option<FileNode> {
    let name = path.file_name()?.to_string_lossy().to_string();

    if path.is_file() {
        let ext = path.extension()?.to_string_lossy().to_lowercase();
        if ext != "md" && ext != "markdown" {
            return None;
        }
        return Some(FileNode::File {
            name,
            path: path.to_string_lossy().to_string(),
        });
    }

    if path.is_dir() {
        if name.starts_with('.') || name == "node_modules" {
            return None;
        }
        let mut children: Vec<FileNode> = fs::read_dir(path)
            .ok()?
            .filter_map(|e| e.ok())
            .filter_map(|e| build_tree(&e.path()))
            .collect();

        children.sort_by(|a, b| {
            let type_ord = match (a, b) {
                (FileNode::Dir { .. }, FileNode::File { .. }) => std::cmp::Ordering::Less,
                (FileNode::File { .. }, FileNode::Dir { .. }) => std::cmp::Ordering::Greater,
                _ => std::cmp::Ordering::Equal,
            };
            if type_ord != std::cmp::Ordering::Equal {
                return type_ord;
            }
            let a_name = match a {
                FileNode::File { name, .. } | FileNode::Dir { name, .. } => name,
            };
            let b_name = match b {
                FileNode::File { name, .. } | FileNode::Dir { name, .. } => name,
            };
            a_name.to_lowercase().cmp(&b_name.to_lowercase())
        });

        if children.is_empty() {
            return None;
        }

        return Some(FileNode::Dir {
            name,
            path: path.to_string_lossy().to_string(),
            children,
        });
    }

    None
}

// ── Tauri commands ───────────────────────────────────────

#[tauri::command]
fn build_file_tree(dir_path: String) -> Option<FileNode> {
    build_tree(Path::new(&dir_path))
}

#[tauri::command]
async fn open_folder_dialog(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Open Markdown Folder")
        .pick_folder(move |path| {
            let _ = tx.send(path);
        });
    let folder = rx.await.map_err(|e| e.to_string())?;
    match folder {
        Some(path) => {
            let root_path = path.to_string();
            let tree = build_tree(Path::new(&root_path));
            Ok(Some(serde_json::json!({
                "rootPath": root_path,
                "tree": tree
            })))
        }
        None => Ok(None),
    }
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_path_cmd(path: String) -> Result<(), String> {
    open::that(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_file(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path).map_err(|e| format!("path=[{}] err={}", file_path, e))
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
fn resolve_relative(from_file: String, rel_path: String) -> String {
    let parent = Path::new(&from_file)
        .parent()
        .unwrap_or(Path::new(""));
    let resolved = parent.join(&rel_path);
    let canon = resolved.canonicalize().unwrap_or(resolved);
    let s = canon.to_string_lossy().to_string();
    // Windows canonicalize는 \\?\C:\... UNC 경로를 반환 — asset 프로토콜/OS open이 꺼림
    s.strip_prefix(r"\\?\").map(String::from).unwrap_or(s)
}

#[tauri::command]
fn toggle_fullscreen(window: tauri::Window) {
    if let Ok(is_fullscreen) = window.is_fullscreen() {
        let _ = window.set_fullscreen(!is_fullscreen);
    }
}

#[tauri::command]
async fn translate_markdown(
    markdown: String,
    target_lang: String,
    api_token: String,
) -> Result<String, String> {
    let lang_name = match target_lang.as_str() {
        "zh-CN" => "Simplified Chinese",
        "en" => "English",
        "ko" => "Korean",
        _ => &target_lang,
    };

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 8192,
        "messages": [{
            "role": "user",
            "content": format!(
                "Translate the following Markdown document to {}. \
                 Keep all Markdown formatting, code blocks, links, and mermaid diagrams intact. \
                 Only translate the human-readable text. \
                 Return ONLY the translated Markdown, no explanations.\n\n{}",
                lang_name, markdown
            )
        }]
    });

    let res = client
        .post("https://api.anthropic.com/v1/messages")
        .header("Content-Type", "application/json")
        .header("x-api-key", &api_token)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, text));
    }

    let data: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    data["content"][0]["text"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Unexpected API response".to_string())
}

// ── App entry ────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            build_file_tree,
            open_folder_dialog,
            read_file,
            resolve_relative,
            path_exists,
            open_external,
            open_path_cmd,
            toggle_fullscreen,
            translate_markdown,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
