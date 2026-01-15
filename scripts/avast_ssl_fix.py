"""
Avast SSL Fix Wrapper
======================

This wrapper prevents permission errors caused by Avast antivirus injecting
the SSLKEYLOGFILE environment variable into Python processes.

Background:
- Avast injects SSLKEYLOGFILE pointing to \\.\aswMonFltProxy\...
- When Python's ssl.create_default_context() tries to write to this path
- Result: PermissionError [Errno 13] Permission denied

This script MUST run before any SSL-using module is imported (aiohttp, requests, etc.)

See: https://stackoverflow.com/questions/70288084/permission-denied-ssl-log-in-python
     https://github.com/urllib3/urllib3/issues/2015
"""

import os
import sys


def fix_avast_ssl_injection():
    """Remove Avast's injected SSLKEYLOGFILE to prevent permission errors."""
    try:
        if "SSLKEYLOGFILE" in os.environ:
            keylog_path = os.environ["SSLKEYLOGFILE"]
            
            # Check if this is Avast's injected path (contains aswMonFltProxy)
            # or if the directory doesn't exist (invalid path)
            is_avast_path = "aswMonFltProxy" in keylog_path
            is_invalid_path = False
            
            # Check if directory exists (safely handle errors)
            try:
                dirname = os.path.dirname(keylog_path)
                if dirname and not os.path.exists(dirname):
                    is_invalid_path = True
            except (OSError, ValueError):
                is_invalid_path = True
            
            if is_avast_path or is_invalid_path:
                print(f"🛡️  Detected problematic SSLKEYLOGFILE: {keylog_path}")
                if is_avast_path:
                    print("    → Avast antivirus injection detected (aswMonFltProxy)")
                if is_invalid_path:
                    print("    → Invalid or inaccessible path")
                print("🔧 Removing SSLKEYLOGFILE to prevent permission errors")
                del os.environ["SSLKEYLOGFILE"]
            else:
                print(f"ℹ️  SSLKEYLOGFILE set to valid path: {keylog_path}")
    except Exception as e:
        # Don't fail if we can't fix it - just log and continue
        print(f"⚠️  Warning: Could not check SSLKEYLOGFILE: {e}")


if __name__ == "__main__":
    try:
        # Fix Avast SSL injection before running the daemon
        fix_avast_ssl_injection()
        
        # Reconstruct sys.argv to pass arguments to the daemon module
        # sys.argv[0] will be this script, sys.argv[1:] are the daemon arguments
        # We need to make sys.argv look like it was called as "python -m reachy_mini.daemon.app.main <args>"
        daemon_args = sys.argv[1:]  # Get all arguments passed to this wrapper
        sys.argv = ["reachy_mini.daemon.app.main"] + daemon_args
        
        # Now run the actual daemon module
        import runpy
        sys.exit(runpy.run_module("reachy_mini.daemon.app.main", run_name="__main__"))
    except Exception as e:
        # If anything fails, print error and exit with error code
        print(f"❌ Fatal error in avast_ssl_fix wrapper: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
