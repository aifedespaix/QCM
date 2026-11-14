//! Backend du lecteur QCM.
//!
//! Rôle volontairement réduit : ouvrir l'archive `.qcm`, renvoyer le texte brut de `data.yaml`
//! au frontend (qui le valide avec `@qcm/core`, seule source de vérité du schéma) et servir les
//! images `media/*.webp` par le protocole `qcm://`. La mise à jour de l'application est pilotée
//! par le frontend (`src/lib/updater.ts`) à travers `tauri-plugin-updater`.

use std::{
    collections::HashMap,
    fs::File,
    io::Read,
    path::{Path, PathBuf},
    sync::Mutex,
};

use percent_encoding::percent_decode_str;
use serde::Serialize;
use tauri::{http, AppHandle, Emitter, Manager, State};
use zip::ZipArchive;

/// Évènement envoyé au frontend quand un fichier attend d'être ouvert (`take_pending_file`).
const OPEN_FILE_EVENT: &str = "qcm-open-file";

// Mêmes limites que `ARCHIVE_LIMITS` dans `@qcm/core`.
const MAX_ARCHIVE_BYTES: u64 = 20 * 1024 * 1024;
const MAX_DATA_BYTES: u64 = 1024 * 1024;
const MAX_MEDIA_BYTES: u64 = 3 * 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 60 * 1024 * 1024;
const DATA_FILE: &str = "data.yaml";

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
        .manage(AppState::default())
        .register_uri_scheme_protocol("qcm", |context, request| {
            serve_media(context.app_handle(), &request)
        })
        .setup(|app| {
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
        .invoke_handler(tauri::generate_handler![load_qcm, take_pending_file])
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
