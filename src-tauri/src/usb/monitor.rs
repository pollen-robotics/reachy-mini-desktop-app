/// USB Device Monitor - Event-driven USB detection for Windows
/// 
/// This module provides event-driven USB device detection using Windows WM_DEVICECHANGE messages.
/// This completely eliminates the need for polling, preventing terminal flicker issues on Windows.

#[cfg(target_os = "windows")]
use std::sync::{Arc, Mutex};

#[cfg(target_os = "windows")]
use windows::{
    core::*,
    Win32::Foundation::*,
    Win32::System::LibraryLoader::GetModuleHandleA,
    Win32::UI::WindowsAndMessaging::*,
};

/// Shared state for USB device monitoring
#[cfg(target_os = "windows")]
pub struct UsbMonitorState {
    /// Current Reachy Mini port (VID:PID = 1a86:55d3)
    pub reachy_port: Option<String>,
    /// All available serial ports with their info
    pub available_ports: Vec<serialport::SerialPortInfo>,
}

#[cfg(target_os = "windows")]
impl UsbMonitorState {
    pub fn new() -> Self {
        UsbMonitorState {
            reachy_port: None,
            available_ports: Vec::new(),
        }
    }

    /// Update the list of available ports and find Reachy Mini
    pub fn update(&mut self) {
        match serialport::available_ports() {
            Ok(ports) => {
                self.available_ports = ports.clone();
                
                // Find Reachy Mini port (VID:PID = 1a86:55d3 - CH340 USB-to-serial)
                self.reachy_port = ports.iter()
                    .find_map(|port| {
                        if let serialport::SerialPortType::UsbPort(usb_info) = &port.port_type {
                            if usb_info.vid == 0x1a86 && usb_info.pid == 0x55d3 {
                                return Some(port.port_name.clone());
                            }
                        }
                        None
                    });
            }
            Err(e) => {
                eprintln!("[USB Monitor] Failed to enumerate ports: {}", e);
            }
        }
    }
}

#[cfg(target_os = "windows")]
pub type UsbMonitorStateArc = Arc<Mutex<UsbMonitorState>>;

#[cfg(target_os = "windows")]
lazy_static::lazy_static! {
    /// Global USB monitor state
    static ref USB_MONITOR: UsbMonitorStateArc = Arc::new(Mutex::new(UsbMonitorState::new()));
}

/// Get the current Reachy Mini port from the monitor
pub fn get_reachy_port() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        USB_MONITOR.lock().ok()?.reachy_port.clone()
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        // Fallback to direct check on non-Windows platforms
        match serialport::available_ports() {
            Ok(ports) => {
                ports.iter().find_map(|port| {
                    if let serialport::SerialPortType::UsbPort(usb_info) = &port.port_type {
                        if usb_info.vid == 0x1a86 && usb_info.pid == 0x55d3 {
                            return Some(port.port_name.clone());
                        }
                    }
                    None
                })
            }
            Err(_) => None
        }
    }
}

/// Force an immediate update of the USB device list
#[cfg(target_os = "windows")]
pub fn force_update() {
    if let Ok(mut state) = USB_MONITOR.lock() {
        state.update();
    }
}

#[cfg(target_os = "windows")]
/// Window procedure for handling device change messages
extern "system" fn wnd_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match msg {
        WM_DEVICECHANGE => {
            const DBT_DEVICEARRIVAL: u32 = 0x8000;
            const DBT_DEVICEREMOVECOMPLETE: u32 = 0x8004;
            
            let event = wparam.0 as u32;
            
            // Update port list on device arrival or removal
            if event == DBT_DEVICEARRIVAL || event == DBT_DEVICEREMOVECOMPLETE {
                // Device change detected - update port list
                // We update on all device changes since serial port events may not always have detailed type info
                if let Ok(mut state) = USB_MONITOR.lock() {
                    state.update();
                }
            }
            
            LRESULT(0)
        }
        WM_DESTROY => {
            unsafe { PostQuitMessage(0) };
            LRESULT(0)
        }
        _ => unsafe { DefWindowProcA(hwnd, msg, wparam, lparam) },
    }
}

#[cfg(target_os = "windows")]
/// Start the USB device monitor in a background thread
/// This creates a hidden message-only window to receive WM_DEVICECHANGE messages
pub fn start_monitor() -> std::result::Result<(), String> {
    std::thread::spawn(|| {
        unsafe {
            let result: windows::core::Result<()> = (|| {
                // Get module handle - use A version following official Microsoft sample
                let h_instance = GetModuleHandleA(None)?;

                // Register window class using WNDCLASSA (following official Microsoft windows-rs sample)
                // See: https://github.com/microsoft/windows-rs/blob/0.58.0/crates/samples/windows/create_window/src/main.rs
                let class_name = s!("ReachyUsbMonitorWindow");
                let wnd_class = WNDCLASSA {
                    lpfnWndProc: Some(wnd_proc),
                    hInstance: h_instance.into(),
                    lpszClassName: class_name,
                    ..Default::default()
                };

                let atom = RegisterClassA(&wnd_class);
                if atom == 0 {
                    return Err(Error::from_win32());
                }

                // Create message-only window (HWND_MESSAGE parent makes it invisible)
                // CreateWindowExA returns Result<HWND> in windows 0.58
                let hwnd = CreateWindowExA(
                    WINDOW_EX_STYLE::default(),
                    class_name,
                    s!("Reachy USB Monitor"),
                    WINDOW_STYLE::default(),
                    0, 0, 0, 0,
                    HWND_MESSAGE, // Message-only window (completely invisible)
                    None,
                    h_instance,
                    None,
                )?;

                // Register for device notifications (all device interfaces)
                // Note: We use a simpler approach without DEV_BROADCAST_DEVICEINTERFACE 
                // since WM_DEVICECHANGE will fire anyway for USB events
                println!("[USB Monitor] Event-driven monitor started successfully on window {:?}", hwnd);

                // Do an initial scan
                if let Ok(mut state) = USB_MONITOR.lock() {
                    state.update();
                    if let Some(port) = &state.reachy_port {
                        println!("[USB Monitor] Reachy Mini detected at: {}", port);
                    }
                }

                // Message loop
                let mut msg = MSG::default();
                while GetMessageA(&mut msg, None, 0, 0).into() {
                    DispatchMessageA(&msg);
                }

                Ok(())
            })();

            if let Err(e) = result {
                eprintln!("[USB Monitor] Failed to start monitor: {}", e);
            }
        }
    });

    Ok(())
}

#[cfg(not(target_os = "windows"))]
/// Dummy function for non-Windows platforms
pub fn start_monitor() -> Result<(), String> {
    println!("[USB Monitor] Event-driven monitoring not available on this platform, using direct checks");
    Ok(())
}
