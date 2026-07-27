use tauri::{AppHandle, LogicalSize, Manager, Size};

/// Apply transparent titlebar + full-size content view on a macOS NSWindow.
/// No-op on other platforms.
#[cfg(target_os = "macos")]
pub fn setup_transparent_titlebar(window: &tauri::WebviewWindow) {
    use cocoa::base::{id, YES};
    use objc::{msg_send, sel, sel_impl};

    if let Ok(ns_window_ptr) = window.ns_window() {
        unsafe {
            let ns_window = ns_window_ptr as id;
            let _: () = msg_send![ns_window, setTitlebarAppearsTransparent: YES];
            let style_mask: u64 = msg_send![ns_window, styleMask];
            let new_style = style_mask | (1 << 15); // NSWindowStyleMaskFullSizeContentView
            let _: () = msg_send![ns_window, setStyleMask: new_style];
        }
    }
}

/// Workaround for WKWebView web content process termination (macOS).
/// When macOS kills the WebView's render process (memory pressure, idle, sleep),
/// the WebView goes white with no JS running. This hooks into the WKNavigationDelegate
/// to auto-reload when that happens.
/// See: https://github.com/tauri-apps/tauri/issues/14371
#[cfg(target_os = "macos")]
pub fn setup_content_process_handler(window: &tauri::WebviewWindow) {
    use cocoa::base::{id, nil};
    use objc::runtime::{Class, Object, Sel};
    use objc::{msg_send, sel, sel_impl};
    use std::os::raw::c_char;

    extern "C" {
        fn class_replaceMethod(
            cls: *const Class,
            name: Sel,
            imp: extern "C" fn(&Object, Sel, id),
            types: *const c_char,
        ) -> *const std::ffi::c_void;
    }

    if let Ok(ns_window_ptr) = window.ns_window() {
        unsafe {
            let ns_window = ns_window_ptr as id;
            let content_view: id = msg_send![ns_window, contentView];
            let wk_webview = find_wkwebview_in_view(content_view);

            if wk_webview == nil {
                log::warn!("[WKWebView] Could not find WKWebView in view hierarchy");
                return;
            }

            let delegate: id = msg_send![wk_webview, navigationDelegate];
            if delegate == nil {
                log::warn!("[WKWebView] No navigation delegate on WKWebView");
                return;
            }

            let cls: *const Class = objc::runtime::object_getClass(delegate);

            extern "C" fn on_content_process_terminate(_this: &Object, _cmd: Sel, webview: id) {
                log::warn!("[WKWebView] Web content process terminated - reloading webview");
                unsafe {
                    let _: () = msg_send![webview, reload];
                }
            }

            let sel = sel!(webViewWebContentProcessDidTerminate:);
            let types = c"v@:@".as_ptr() as *const c_char;
            class_replaceMethod(cls, sel, on_content_process_terminate, types);
            log::info!("[WKWebView] Content process termination handler installed");
        }
    }
}

#[cfg(target_os = "macos")]
unsafe fn find_wkwebview_in_view(view: cocoa::base::id) -> cocoa::base::id {
    use cocoa::base::{id, nil, BOOL, YES};
    use objc::runtime::Class;
    use objc::{msg_send, sel, sel_impl};

    if view == nil {
        return nil;
    }

    if let Some(wk_class) = Class::get("WKWebView") {
        let is_wkwebview: BOOL = msg_send![view, isKindOfClass: wk_class];
        if is_wkwebview == YES {
            return view;
        }
    }

    let subviews: id = msg_send![view, subviews];
    let count: usize = msg_send![subviews, count];

    for i in 0..count {
        let subview: id = msg_send![subviews, objectAtIndex: i];
        let found = find_wkwebview_in_view(subview);
        if found != nil {
            return found;
        }
    }

    nil
}

#[tauri::command]
pub fn apply_transparent_titlebar(_app: AppHandle, _window_label: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if let Some(window) = _app.get_webview_window(&_window_label) {
            setup_transparent_titlebar(&window);
            Ok(())
        } else {
            Err(format!("Window '{}' not found", _window_label))
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(())
    }
}

#[tauri::command]
pub fn close_window(app: AppHandle, window_label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&window_label) {
        // Use close() method - this should work for WebviewWindow
        window
            .close()
            .map_err(|e| format!("Failed to close window '{}': {}", window_label, e))?;
        log::info!("Window '{}' closed successfully", window_label);
    } else {
        return Err(format!("Window '{}' not found", window_label));
    }
    Ok(())
}

/// Resize and optionally center the main application window.
/// Used when switching between compact (450px) and expanded (900px) layouts.
#[tauri::command]
pub fn resize_main_window(
    app: AppHandle,
    width: f64,
    height: f64,
    center: Option<bool>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    #[cfg(not(target_os = "macos"))]
    {
        window
            .set_resizable(true)
            .map_err(|e| format!("set_resizable failed: {e}"))?;
        window
            .set_maximizable(true)
            .map_err(|e| format!("set_maximizable failed: {e}"))?;
    }

    let size = Size::Logical(LogicalSize::new(width, height));
    window
        .set_min_size(Some(size))
        .map_err(|e| format!("set_min_size failed: {e}"))?;
    window
        .set_size(size)
        .map_err(|e| format!("set_size failed: {e}"))?;

    if center.unwrap_or(true) {
        window.center().map_err(|e| format!("center failed: {e}"))?;
    }

    log::info!(
        "[window] Resized main window to {}x{} (center={})",
        width,
        height,
        center.unwrap_or(true)
    );
    Ok(())
}
