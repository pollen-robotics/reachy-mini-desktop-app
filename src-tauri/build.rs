fn main() {
    // Link against AVFoundation framework on macOS
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-lib=framework=AVFoundation");
    }
    
    tauri_build::build()
}
