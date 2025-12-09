use tauri::{Manager, AppHandle};

#[tauri::command]
pub fn apply_transparent_titlebar(_app: AppHandle, _window_label: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if let Some(window) = _app.get_webview_window(&_window_label) {
            use cocoa::base::{id, YES};
            use objc::{msg_send, sel, sel_impl};
            
            let ns_window_result = window.ns_window();
            match ns_window_result {
                Ok(ns_window_ptr) => {
                    unsafe {
                        let ns_window = ns_window_ptr as id;
                        
                        // Transparent titlebar and fullscreen content
                        let _: () = msg_send![ns_window, setTitlebarAppearsTransparent: YES];
                        
                        // Full size content view so content goes under titlebar
                        let style_mask: u64 = msg_send![ns_window, styleMask];
                        let new_style = style_mask | (1 << 15); // NSWindowStyleMaskFullSizeContentView
                        let _: () = msg_send![ns_window, setStyleMask: new_style];
                    }
                    Ok(())
                }
                Err(e) => Err(format!("Failed to get ns_window: {}", e)),
            }
        } else {
            Err(format!("Window '{}' not found", _window_label))
        }
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        // No-op on non-macOS
        Ok(())
    }
}

#[tauri::command]
pub fn close_window(app: AppHandle, window_label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&window_label) {
        // Use close() method - this should work for WebviewWindow
        window.close().map_err(|e| format!("Failed to close window '{}': {}", window_label, e))?;
        println!("✅ Window '{}' closed successfully", window_label);
    } else {
        return Err(format!("Window '{}' not found", window_label));
    }
    Ok(())
}

