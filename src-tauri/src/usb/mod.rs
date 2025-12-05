use serialport;

#[tauri::command]
pub fn check_usb_robot() -> Result<Option<String>, String> {
    match serialport::available_ports() {
        Ok(ports) => {
            // Look for USB device with VID:PID = 1a86:55d3 (Reachy Mini CH340)
            for port in ports {
                if let serialport::SerialPortType::UsbPort(usb_info) = &port.port_type {
                    if usb_info.vid == 0x1a86 && usb_info.pid == 0x55d3 {
                        return Ok(Some(port.port_name.clone()));
                    }
                }
            }
            Ok(None)
        }
        Err(e) => Err(format!("USB detection error: {}", e)),
    }
}

