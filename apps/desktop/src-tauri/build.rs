fn main() {
    // Adresse de la bibliothèque en ligne (PocketBase), figée à la compilation. Voir `library_base_url`.
    println!("cargo:rerun-if-env-changed=QCM_PB_URL");
    tauri_build::build()
}
