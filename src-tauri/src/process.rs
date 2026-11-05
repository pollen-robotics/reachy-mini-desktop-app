use std::{ffi::OsStr, process::Command};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Build a process command without showing a console window on Windows.
pub(crate) fn without_console(program: impl AsRef<OsStr>) -> Command {
    // Only mutated on Windows.
    #[cfg_attr(not(target_os = "windows"), allow(unused_mut))]
    let mut command = Command::new(program);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        command.creation_flags(CREATE_NO_WINDOW);
    }

    command
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::without_console;

    const CHILD_TEST_MODE: &str = "REACHY_MINI_CONTROL_NO_CONSOLE_TEST_CHILD";

    #[link(name = "kernel32")]
    extern "system" {
        #[link_name = "GetConsoleWindow"]
        fn get_console_window() -> *mut std::ffi::c_void;
    }

    #[test]
    fn windows_command_starts_child_without_a_console() {
        if std::env::var_os(CHILD_TEST_MODE).is_some() {
            // SAFETY: GetConsoleWindow has no preconditions and returns a handle or null.
            let has_console = !unsafe { get_console_window() }.is_null();
            std::process::exit(if has_console { 1 } else { 0 });
        }

        // Without a console window of our own (CI runners, IDEs), a child spawned
        // without CREATE_NO_WINDOW has no console window either, so the check
        // below would pass even if the flag were missing. Only a terminal run can tell.
        // SAFETY: same as above.
        if unsafe { get_console_window() }.is_null() {
            eprintln!("skipped: the test runner has no console window, run it from a terminal");
            return;
        }

        let test_executable = std::env::current_exe().expect("test executable path");
        let output = without_console(test_executable)
            .args([
                "--exact",
                "process::tests::windows_command_starts_child_without_a_console",
                "--nocapture",
            ])
            .env(CHILD_TEST_MODE, "1")
            .output()
            .expect("start child test process");

        assert!(
            output.status.success(),
            "child process unexpectedly has a console: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
}
