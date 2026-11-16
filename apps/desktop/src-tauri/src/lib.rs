//! Backend du lecteur QCM.
//!
//! Rôle volontairement réduit : ouvrir l'archive `.qcm`, renvoyer le texte brut de `data.yaml`
//! au frontend (qui le valide avec `@qcm/core`, seule source de vérité du schéma) et servir les
//! images `media/*.webp` par le protocole `qcm://`. La mise à jour de l'application est pilotée
//! par le frontend (`src/lib/updater.ts`) à travers `tauri-plugin-updater`.
//!
//! Deux ajouts autour de ce noyau :
//! - une copie de chaque QCM ouvert est rangée dans le dossier de données de l'application
//!   (`qcms/<empreinte>.qcm`) : la liste « Derniers QCM » continue de fonctionner même si le
//!   fichier d'origine est déplacé, renommé ou supprimé ;
//! - la bibliothèque en ligne (PocketBase) est interrogée d'ici, jamais depuis la webview :
//!   pas de CORS, pas d'ouverture de la CSP, et une seule adresse possible (`QCM_PB_URL`).

use std::{
    collections::HashMap,
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};

use percent_encoding::percent_decode_str;
use serde::Serialize;
use tauri::{http, AppHandle, Emitter, Manager, State, WebviewWindowBuilder};
use tauri_plugin_window_state::StateFlags;
use zip::ZipArchive;

/// Évènement envoyé au frontend quand un fichier attend d'être ouvert (`take_pending_file`).
const OPEN_FILE_EVENT: &str = "qcm-open-file";

// Mêmes limites que `ARCHIVE_LIMITS` dans `@qcm/core`.
const MAX_ARCHIVE_BYTES: u64 = 20 * 1024 * 1024;
const MAX_DATA_BYTES: u64 = 1024 * 1024;
const MAX_MEDIA_BYTES: u64 = 3 * 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 60 * 1024 * 1024;
const DATA_FILE: &str = "data.yaml";

/// Sous-dossier du dossier de données de l'application qui contient les copies des QCM ouverts.
const STORE_DIR: &str = "qcms";
/// Préfixe d'un téléchargement en attente de validation par le frontend.
const DOWNLOAD_PREFIX: &str = "download-";
/// Seules routes de la bibliothèque en ligne que le frontend peut lire.
const LIBRARY_RECORDS_PATH: &str = "/api/collections/qcms/records";
const LIBRARY_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_JSON_BYTES: u64 = 2 * 1024 * 1024;

/// Codes d'erreur partagés avec `QcmErrorCode` de `@qcm/core`.
#[derive(Debug, PartialEq, Eq)]
pub enum QcmError {
    Open,
    NotZip,
    NoData,
    TooBig,
    MediaInvalid,
}

impl QcmError {
    pub fn code(&self) -> &'static str {
        match self {
            QcmError::Open => "E_OPEN",
            QcmError::NotZip => "E_NOT_ZIP",
            QcmError::NoData => "E_NO_DATA",
            QcmError::TooBig => "E_TOO_BIG",
            QcmError::MediaInvalid => "E_MEDIA_INVALID",
        }
    }
}

#[derive(Default)]
pub struct AppState {
    /// Fichier reçu en argument, en attente de lecture par le frontend.
    pending_path: Mutex<Option<String>>,
    /// Images du QCM ouvert. Clé : `media/nom.webp`.
    media: Mutex<HashMap<String, Vec<u8>>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedQcm {
    path: String,
    file_name: String,
    yaml: String,
    media: Vec<String>,
}

/// Contenu utile d'une archive `.qcm`.
#[derive(Debug)]
pub struct QcmContent {
    pub yaml: String,
    pub media: HashMap<String, Vec<u8>>,
}

/// Premier argument qui ressemble à un fichier `.qcm` (le premier élément, l'exécutable, est ignoré).
/// Un chemin relatif est résolu par rapport à `cwd`.
pub fn qcm_path_from_args<I, S>(args: I, cwd: Option<&Path>) -> Option<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter().skip(1).find_map(|arg| {
        let arg = arg.as_ref();
        if arg.starts_with('-') || !arg.to_lowercase().ends_with(".qcm") {
            return None;
        }
        let path = PathBuf::from(arg);
        let path = match cwd {
            Some(cwd) if path.is_relative() => cwd.join(path),
            _ => path,
        };
        Some(path.to_string_lossy().into_owned())
    })
}

/// `media/<nom>.webp` avec `<nom>` de 1 à 64 caractères parmi `a-z 0-9 _ -`, sans commencer par `_` ou `-`.
pub fn is_media_path(name: &str) -> bool {
    let Some(stem) = name
        .strip_prefix("media/")
        .and_then(|rest| rest.strip_suffix(".webp"))
    else {
        return false;
    };
    let valid_char = |c: char| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-';
    let first_ok = stem
        .chars()
        .next()
        .is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit());
    first_ok && stem.len() <= 64 && stem.chars().all(valid_char)
}

fn is_webp(bytes: &[u8]) -> bool {
    bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP"
}

/// Lit une entrée en refusant de dépasser `limit` octets décompressés (protection anti « zip bomb »).
fn read_limited(entry: impl Read, limit: u64) -> Result<Vec<u8>, QcmError> {
    let mut buffer = Vec::new();
    entry
        .take(limit + 1)
        .read_to_end(&mut buffer)
        .map_err(|_| QcmError::NotZip)?;
    if buffer.len() as u64 > limit {
        return Err(QcmError::TooBig);
    }
    Ok(buffer)
}

/// Ouvre un fichier `.qcm` et en extrait `data.yaml` et les images autorisées. Tout le reste est ignoré.
pub fn read_qcm_file(path: &Path) -> Result<QcmContent, QcmError> {
    let file = File::open(path).map_err(|_| QcmError::Open)?;
    let size = file.metadata().map_err(|_| QcmError::Open)?.len();
    if size > MAX_ARCHIVE_BYTES {
        return Err(QcmError::TooBig);
    }
    let mut archive = ZipArchive::new(file).map_err(|_| QcmError::NotZip)?;

    let mut yaml: Option<String> = None;
    let mut media = HashMap::new();
    let mut total: u64 = 0;

    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|_| QcmError::NotZip)?;
        // Nom illisible (encodage invalide) : entrée ignorée.
        let name = match entry.name() {
            Ok(name) => name.into_owned(),
            Err(_) => continue,
        };
        let limit = if name == DATA_FILE {
            MAX_DATA_BYTES
        } else if is_media_path(&name) {
            MAX_MEDIA_BYTES
        } else {
            continue;
        };
        let bytes = read_limited(entry, limit)?;
        total += bytes.len() as u64;
        if total > MAX_TOTAL_BYTES {
            return Err(QcmError::TooBig);
        }
        if name == DATA_FILE {
            yaml = Some(String::from_utf8(bytes).map_err(|_| QcmError::NoData)?);
        } else {
            if !is_webp(&bytes) {
                return Err(QcmError::MediaInvalid);
            }
            media.insert(name, bytes);
        }
    }

    Ok(QcmContent {
        yaml: yaml.ok_or(QcmError::NoData)?,
        media,
    })
}

/// Charge un `.qcm` : renvoie le YAML brut et garde les images en mémoire pour `qcm://`.
#[tauri::command(async)]
fn load_qcm(path: String, state: State<'_, AppState>) -> Result<LoadedQcm, String> {
    let content = read_qcm_file(Path::new(&path)).map_err(|error| error.code().to_string())?;
    let mut names: Vec<String> = content.media.keys().cloned().collect();
    names.sort();
    *state.media.lock().expect("verrou media") = content.media;
    let file_name = Path::new(&path)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    Ok(LoadedQcm {
        path,
        file_name,
        yaml: content.yaml,
        media: names,
    })
}

// ---------------------------------------------------------------- QCM conservés

/// Empreinte produite par `qcmFingerprint` de `@qcm/core` : sert de nom de fichier, donc contrôlée.
pub fn is_store_key(key: &str) -> bool {
    (8..=32).contains(&key.len()) && key.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
}

/// Identifiant d'enregistrement PocketBase.
pub fn is_record_id(id: &str) -> bool {
    (1..=32).contains(&id.len()) && id.chars().all(|c| c.is_ascii_alphanumeric())
}

/// Nom de fichier PocketBase : un seul segment, sans séparateur ni `..`.
pub fn is_remote_file_name(name: &str) -> bool {
    (1..=200).contains(&name.len())
        && !name.starts_with('.')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
}

fn store_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "E_OPEN".to_string())?
        .join(STORE_DIR);
    fs::create_dir_all(&dir).map_err(|_| "E_OPEN".to_string())?;
    Ok(dir)
}

fn stored_path(dir: &Path, key: &str) -> Result<PathBuf, String> {
    if !is_store_key(key) {
        return Err("E_OPEN".into());
    }
    Ok(dir.join(format!("{key}.qcm")))
}

/// Range `source` dans `dir` sous le nom `<key>.qcm`. Un téléchargement en attente est déplacé,
/// tout autre fichier est copié (l'original de l'utilisateur n'est jamais touché).
pub fn store_file(dir: &Path, source: &Path, key: &str) -> Result<(), String> {
    let target = stored_path(dir, key)?;
    if source == target {
        return Ok(());
    }
    let is_download = source.parent() == Some(dir)
        && source
            .file_name()
            .is_some_and(|name| name.to_string_lossy().starts_with(DOWNLOAD_PREFIX));
    if is_download {
        if target.exists() {
            let _ = fs::remove_file(&target);
        }
        return fs::rename(source, &target).map_err(|_| "E_OPEN".to_string());
    }
    fs::copy(source, &target).map(|_| ()).map_err(|_| "E_OPEN".to_string())
}

/// Empreintes des QCM présents dans `dir`.
pub fn stored_keys(dir: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut keys: Vec<String> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            let key = name.strip_suffix(".qcm")?;
            is_store_key(key).then(|| key.to_string())
        })
        .collect();
    keys.sort();
    keys
}

/// Garde une copie du QCM qui vient d'être ouvert, sous son empreinte.
#[tauri::command(async)]
fn store_qcm(app: AppHandle, path: String, key: String) -> Result<(), String> {
    store_file(&store_dir(&app)?, Path::new(&path), &key)
}

/// Rouvre un QCM conservé.
#[tauri::command(async)]
fn load_stored_qcm(app: AppHandle, key: String, state: State<'_, AppState>) -> Result<LoadedQcm, String> {
    let path = stored_path(&store_dir(&app)?, &key)?;
    load_qcm(path.to_string_lossy().into_owned(), state)
}

/// Empreintes des QCM conservés sur cet ordinateur.
#[tauri::command(async)]
fn list_stored_qcms(app: AppHandle) -> Result<Vec<String>, String> {
    Ok(stored_keys(&store_dir(&app)?))
}

/// Retire la copie d'un QCM (le fichier d'origine de l'utilisateur n'est pas concerné).
#[tauri::command(async)]
fn remove_stored_qcm(app: AppHandle, key: String) -> Result<(), String> {
    let path = stored_path(&store_dir(&app)?, &key)?;
    if path.exists() {
        fs::remove_file(path).map_err(|_| "E_OPEN".to_string())?;
    }
    Ok(())
}

// ---------------------------------------------------------------- Bibliothèque en ligne

/// Adresse de PocketBase : variable `QCM_PB_URL` lue à l'exécution (développement), sinon celle
/// figée à la compilation (installateur). Absente : la bibliothèque en ligne est désactivée.
fn library_base_url() -> Option<String> {
    let url = std::env::var("QCM_PB_URL")
        .ok()
        .or_else(|| option_env!("QCM_PB_URL").map(str::to_string))?;
    let url = url.trim().trim_end_matches('/').to_string();
    (url.starts_with("https://") || url.starts_with("http://")).then_some(url)
}

/// `true` si `path` (chemin + requête) désigne la liste ou un enregistrement de la collection `qcms`.
pub fn is_library_path(path: &str) -> bool {
    match path.strip_prefix(LIBRARY_RECORDS_PATH) {
        Some(rest) => {
            let (segment, _query) = rest.split_once('?').unwrap_or((rest, ""));
            !path.contains(['#', '\\', ' '])
                && (segment.is_empty() || segment.strip_prefix('/').is_some_and(is_record_id))
        }
        None => false,
    }
}

fn library_client() -> Result<reqwest::Client, String> {
    // Même fournisseur de chiffrement que la mise à jour ; l'appel est sans effet s'il est déjà posé.
    let _ = rustls::crypto::ring::default_provider().install_default();
    reqwest::Client::builder()
        .user_agent(concat!("qcm-desktop/", env!("CARGO_PKG_VERSION")))
        .timeout(LIBRARY_TIMEOUT)
        .build()
        .map_err(|_| "E_OFFLINE".to_string())
}

/// Télécharge une réponse en refusant de dépasser `limit` octets.
async fn fetch_limited(url: &str, limit: u64) -> Result<Vec<u8>, String> {
    let mut response = library_client()?
        .get(url)
        .send()
        .await
        .map_err(|_| "E_OFFLINE".to_string())?;
    if !response.status().is_success() {
        return Err(if response.status() == reqwest::StatusCode::NOT_FOUND { "E_NOT_FOUND" } else { "E_OFFLINE" }.into());
    }
    if response.content_length().is_some_and(|length| length > limit) {
        return Err("E_TOO_BIG".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "E_OFFLINE".to_string())? {
        bytes.extend_from_slice(&chunk);
        if bytes.len() as u64 > limit {
            return Err("E_TOO_BIG".into());
        }
    }
    Ok(bytes)
}

/// `true` si l'application a été construite avec l'adresse de la bibliothèque en ligne.
#[tauri::command]
fn library_available() -> bool {
    library_base_url().is_some()
}

/// Lecture seule de la collection `qcms` : renvoie le JSON brut de PocketBase.
/// Rejets : `E_NO_LIBRARY` (non configurée), `E_OFFLINE` (pas de réseau ou serveur muet), `E_NOT_FOUND`.
#[tauri::command]
async fn library_get(path: String) -> Result<String, String> {
    let base = library_base_url().ok_or("E_NO_LIBRARY")?;
    if !is_library_path(&path) {
        return Err("E_NOT_FOUND".into());
    }
    let bytes = fetch_limited(&format!("{base}{path}"), MAX_JSON_BYTES).await?;
    String::from_utf8(bytes).map_err(|_| "E_OFFLINE".to_string())
}

/// Télécharge le fichier `.qcm` d'un enregistrement dans le dossier des QCM conservés et renvoie
/// son chemin provisoire. Le frontend le valide (`load_qcm`) puis le range (`store_qcm`).
#[tauri::command]
async fn library_download(app: AppHandle, record_id: String, file_name: String) -> Result<String, String> {
    let base = library_base_url().ok_or("E_NO_LIBRARY")?;
    if !is_record_id(&record_id) || !is_remote_file_name(&file_name) {
        return Err("E_NOT_FOUND".into());
    }
    let url = format!("{base}/api/files/qcms/{record_id}/{file_name}");
    let bytes = fetch_limited(&url, MAX_ARCHIVE_BYTES).await?;
    let path = store_dir(&app)?.join(format!("{DOWNLOAD_PREFIX}{record_id}.qcm"));
    fs::write(&path, bytes).map_err(|_| "E_OPEN".to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

// ---------------------------------------------------------------- Enregistrer sous…

/// Chemin choisi dans « Enregistrer sous » : on ajoute `.qcm` si l'élève l'a effacé.
pub fn with_qcm_extension(dest: &str) -> PathBuf {
    let path = PathBuf::from(dest);
    let has_extension = path
        .extension()
        .is_some_and(|ext| ext.to_string_lossy().eq_ignore_ascii_case("qcm"));
    if has_extension {
        path
    } else {
        let mut name = path.into_os_string();
        name.push(".qcm");
        PathBuf::from(name)
    }
}

/// Copie un QCM conservé sur l'ordinateur vers l'emplacement choisi par l'élève.
#[tauri::command(async)]
fn export_stored_qcm(app: AppHandle, key: String, dest: String) -> Result<(), String> {
    let source = stored_path(&store_dir(&app)?, &key)?;
    if !source.exists() {
        return Err("E_NOT_FOUND".into());
    }
    fs::copy(source, with_qcm_extension(&dest)).map(|_| ()).map_err(|_| "E_OPEN".to_string())
}

/// Télécharge un QCM de la bibliothèque en ligne directement vers l'emplacement choisi.
#[tauri::command]
async fn export_library_qcm(record_id: String, file_name: String, dest: String) -> Result<(), String> {
    let base = library_base_url().ok_or("E_NO_LIBRARY")?;
    if !is_record_id(&record_id) || !is_remote_file_name(&file_name) {
        return Err("E_NOT_FOUND".into());
    }
    let bytes = fetch_limited(&format!("{base}/api/files/qcms/{record_id}/{file_name}"), MAX_ARCHIVE_BYTES).await?;
    // Une archive .qcm est un zip : on n'écrit pas autre chose sur le disque de l'élève.
    if !bytes.starts_with(b"PK") {
        return Err("E_NOT_ZIP".into());
    }
    fs::write(with_qcm_extension(&dest), bytes).map_err(|_| "E_OPEN".to_string())
}

/// Renvoie (une seule fois) le chemin reçu par double-clic, au lancement ou à chaud.
#[tauri::command]
fn take_pending_file(state: State<'_, AppState>) -> Option<String> {
    state.pending_path.lock().expect("verrou pending").take()
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Écran « confortable » : au-dessus, la fenêtre s'ouvre à sa taille par défaut ; en dessous
/// (ordinateur portable 1366×768 par exemple), elle s'ouvre agrandie pour remplir la zone utile.
const COMFORT_WIDTH: f64 = 1500.0;
const COMFORT_HEIGHT: f64 = 900.0;
/// Part maximale de l'écran qu'une fenêtre non agrandie peut occuper (barre des tâches, titre).
const MAX_SCREEN_SHARE: f64 = 0.92;

/// `true` si l'écran (en pixels logiques) est trop petit pour la taille par défaut de la fenêtre.
pub fn is_small_screen(width: f64, height: f64) -> bool {
    width < COMFORT_WIDTH || height < COMFORT_HEIGHT
}

/// Ramène `size` dans `limit` (même unité), en gardant la place d'une barre des tâches.
pub fn clamp_to_screen(size: f64, limit: f64) -> f64 {
    size.min(limit * MAX_SCREEN_SHARE)
}

/// Crée la fenêtre principale. La taille et la position de la dernière fois sont rétablies par
/// `tauri-plugin-window-state` à la création ; au tout premier lancement, ou si l'écran a changé
/// depuis (portable branché sur un projecteur…), on s'assure que la fenêtre tient dans l'écran.
fn create_main_window(app: &tauri::App) -> tauri::Result<()> {
    let config = app.config().app.windows.first().cloned().expect("fenêtre principale dans tauri.conf.json");
    let mut builder = WebviewWindowBuilder::from_config(app, &config)?;

    let monitor = app.primary_monitor().ok().flatten();
    if let Some(monitor) = &monitor {
        let scale = monitor.scale_factor();
        let (width, height) = (monitor.size().width as f64 / scale, monitor.size().height as f64 / scale);
        if is_small_screen(width, height) {
            builder = builder.maximized(true);
        }
    }
    let window = builder.build()?;

    if !window.is_maximized().unwrap_or(false) {
        if let Ok(Some(monitor)) = window.current_monitor() {
            let scale = monitor.scale_factor();
            let (screen_w, screen_h) = (monitor.size().width as f64 / scale, monitor.size().height as f64 / scale);
            if let Ok(size) = window.outer_size() {
                let (width, height) = (size.width as f64 / scale, size.height as f64 / scale);
                let (fit_w, fit_h) = (clamp_to_screen(width, screen_w), clamp_to_screen(height, screen_h));
                if fit_w < width || fit_h < height {
                    let _ = window.set_size(tauri::LogicalSize::new(fit_w, fit_h));
                    let _ = window.center();
                }
            }
        }
    }
    Ok(())
}

/// Sert `qcm://localhost/media/x.webp` (Windows : `http://qcm.localhost/media/x.webp`).
fn serve_media(app: &AppHandle, request: &http::Request<Vec<u8>>) -> http::Response<Vec<u8>> {
    let raw = request.uri().path().trim_start_matches('/');
    let key = percent_decode_str(raw).decode_utf8_lossy();
    let state = app.state::<AppState>();
    let media = state.media.lock().expect("verrou media");
    let builder = http::Response::builder().header("Access-Control-Allow-Origin", "*");
    let response = match media.get(key.as_ref()) {
        Some(bytes) => builder
            .status(http::StatusCode::OK)
            .header(http::header::CONTENT_TYPE, "image/webp")
            .header(http::header::CACHE_CONTROL, "no-store")
            .body(bytes.clone()),
        None => builder.status(http::StatusCode::NOT_FOUND).body(Vec::new()),
    };
    response.expect("réponse HTTP valide")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Doit rester le PREMIER plugin : une 2e instance transmet ses arguments ici puis se ferme.
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            if let Some(path) = qcm_path_from_args(argv, Some(Path::new(&cwd))) {
                *app.state::<AppState>()
                    .pending_path
                    .lock()
                    .expect("verrou pending") = Some(path);
                let _ = app.emit(OPEN_FILE_EVENT, ());
            }
            focus_main_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        // Mise à jour : téléchargée et installée seulement quand l'élève clique sur « Mettre à jour ».
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Taille, position et état « agrandi » de la fenêtre : retrouvés à l'ouverture suivante.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
                .build(),
        )
        .manage(AppState::default())
        .register_uri_scheme_protocol("qcm", |context, request| {
            serve_media(context.app_handle(), &request)
        })
        .setup(|app| {
            create_main_window(app)?;
            // Démarrage à froid : Windows lance `QCM.exe "C:\...\fichier.qcm"` au double-clic.
            let cwd = std::env::current_dir().ok();
            if let Some(path) = qcm_path_from_args(std::env::args(), cwd.as_deref()) {
                *app.state::<AppState>()
                    .pending_path
                    .lock()
                    .expect("verrou pending") = Some(path);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_qcm,
            take_pending_file,
            store_qcm,
            load_stored_qcm,
            list_stored_qcms,
            remove_stored_qcm,
            library_available,
            library_get,
            library_download,
            export_stored_qcm,
            export_library_qcm
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de QCM");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    const WEBP: &[u8] = b"RIFF\x04\x00\x00\x00WEBP\x00\x00\x00\x00";

    fn write_qcm(name: &str, entries: &[(&str, &[u8])]) -> PathBuf {
        let path = std::env::temp_dir().join(format!("qcm-test-{}-{name}.qcm", std::process::id()));
        let mut writer = zip::ZipWriter::new(File::create(&path).unwrap());
        for (entry, bytes) in entries {
            writer.start_file(*entry, SimpleFileOptions::default()).unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap();
        path
    }

    #[test]
    fn small_screens_open_maximized_and_windows_fit() {
        assert!(is_small_screen(1366.0, 768.0));
        assert!(is_small_screen(1920.0, 880.0));
        assert!(!is_small_screen(1920.0, 1080.0));
        // Fenêtre 1100×780 sur un écran 1366×768 : ramenée sous la hauteur de l'écran.
        assert!(clamp_to_screen(780.0, 768.0) < 768.0);
        assert_eq!(clamp_to_screen(1100.0, 1920.0), 1100.0);
    }

    #[test]
    fn adds_qcm_extension_when_missing() {
        assert_eq!(with_qcm_extension("C:\\Cours\\fractions"), PathBuf::from("C:\\Cours\\fractions.qcm"));
        assert_eq!(with_qcm_extension("fractions.QCM"), PathBuf::from("fractions.QCM"));
        assert_eq!(with_qcm_extension("notes.v2"), PathBuf::from("notes.v2.qcm"));
    }

    #[test]
    fn finds_qcm_path_in_args() {
        let args = ["C:\\Program Files\\QCM\\QCM.exe", "--flag", "C:\\Users\\Léo\\Mes cours\\Fractions.QCM"];
        assert_eq!(
            qcm_path_from_args(args, None).as_deref(),
            Some("C:\\Users\\Léo\\Mes cours\\Fractions.QCM")
        );
        assert_eq!(qcm_path_from_args(["QCM.exe"], None), None);
        assert_eq!(qcm_path_from_args(["fichier.qcm"], None), None);
        assert_eq!(qcm_path_from_args(["QCM.exe", "notes.txt"], None), None);
    }

    #[test]
    fn resolves_relative_path_against_cwd() {
        let cwd = std::env::temp_dir();
        let found = qcm_path_from_args(["qcm", "cours.qcm"], Some(&cwd)).unwrap();
        assert_eq!(PathBuf::from(found), cwd.join("cours.qcm"));
    }

    #[test]
    fn validates_media_paths() {
        assert!(is_media_path("media/q1_schema.webp"));
        assert!(is_media_path("media/a.webp"));
        assert!(!is_media_path("media/Q1.webp"));
        assert!(!is_media_path("media/q1.png"));
        assert!(!is_media_path("media/../x.webp"));
        assert!(!is_media_path("media/sub/x.webp"));
        assert!(!is_media_path("media/.webp"));
        assert!(!is_media_path("media/_x.webp"));
        assert!(!is_media_path("x.webp"));
    }

    #[test]
    fn validates_store_keys_and_library_paths() {
        assert!(is_store_key("0abc123def456ghi789jkl"));
        assert!(!is_store_key("court"));
        assert!(!is_store_key("../../etc/passwd0000"));
        assert!(!is_store_key("ABCDEFGHIJKL"));
        assert!(is_record_id("a1B2c3d4e5f6g7h"));
        assert!(!is_record_id("a/b"));
        assert!(!is_record_id(""));
        assert!(is_remote_file_name("les_fractions_ab12cd.qcm"));
        assert!(!is_remote_file_name("../secret"));
        assert!(!is_remote_file_name(".cache"));
        assert!(is_library_path("/api/collections/qcms/records?page=1&filter=status%3D%22published%22"));
        assert!(is_library_path("/api/collections/qcms/records/a1b2c3d4e5f6g7h"));
        assert!(!is_library_path("/api/collections/users/records"));
        assert!(!is_library_path("/api/collections/qcms/records/../../users/records"));
        assert!(!is_library_path("/api/collections/qcms/recordsX"));
        assert!(!is_library_path("@evil.example/api/collections/qcms/records"));
    }

    #[test]
    fn stores_copies_and_moves_downloads() {
        let dir = std::env::temp_dir().join(format!("qcm-store-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let original = write_qcm("store", &[("data.yaml", b"version: 1\n")]);

        // Fichier de l'utilisateur : copié, l'original reste en place.
        store_file(&dir, &original, "aaaaaaaaaaaa").unwrap();
        assert!(original.exists());
        assert!(read_qcm_file(&dir.join("aaaaaaaaaaaa.qcm")).is_ok());
        // Rouvrir la copie elle-même ne casse rien.
        store_file(&dir, &dir.join("aaaaaaaaaaaa.qcm"), "aaaaaaaaaaaa").unwrap();

        // Téléchargement provisoire : déplacé.
        let download = dir.join("download-rec1.qcm");
        fs::copy(&original, &download).unwrap();
        store_file(&dir, &download, "bbbbbbbbbbbb").unwrap();
        assert!(!download.exists());

        assert_eq!(stored_keys(&dir), vec!["aaaaaaaaaaaa", "bbbbbbbbbbbb"]);
        assert!(store_file(&dir, &original, "../evil").is_err());

        fs::remove_file(original).unwrap();
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn reads_archive_and_ignores_unknown_entries() {
        let path = write_qcm(
            "ok",
            &[
                ("data.yaml", b"version: 1\n"),
                ("media/q1_schema.webp", WEBP),
                ("media/virus.exe", b"x"),
                ("notes.txt", b"x"),
            ],
        );
        let content = read_qcm_file(&path).unwrap();
        assert_eq!(content.yaml, "version: 1\n");
        assert_eq!(content.media.keys().collect::<Vec<_>>(), vec!["media/q1_schema.webp"]);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn reports_error_codes() {
        let missing = std::env::temp_dir().join("qcm-test-absent.qcm");
        assert_eq!(read_qcm_file(&missing).unwrap_err(), QcmError::Open);

        let not_zip = std::env::temp_dir().join(format!("qcm-test-{}-notzip.qcm", std::process::id()));
        std::fs::write(&not_zip, b"pas un zip").unwrap();
        assert_eq!(read_qcm_file(&not_zip).unwrap_err(), QcmError::NotZip);
        std::fs::remove_file(not_zip).unwrap();

        let no_data = write_qcm("nodata", &[("autre.txt", b"x")]);
        assert_eq!(read_qcm_file(&no_data).unwrap_err(), QcmError::NoData);
        std::fs::remove_file(no_data).unwrap();

        let bad_media = write_qcm("badmedia", &[("data.yaml", b"version: 1\n"), ("media/q1.webp", b"PNG")]);
        assert_eq!(read_qcm_file(&bad_media).unwrap_err(), QcmError::MediaInvalid);
        std::fs::remove_file(bad_media).unwrap();

        let big = vec![b' '; (MAX_DATA_BYTES + 1) as usize];
        let too_big = write_qcm("toobig", &[("data.yaml", &big)]);
        assert_eq!(read_qcm_file(&too_big).unwrap_err(), QcmError::TooBig);
        std::fs::remove_file(too_big).unwrap();
        assert_eq!(QcmError::TooBig.code(), "E_TOO_BIG");
    }
}
