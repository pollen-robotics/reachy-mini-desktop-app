# Network Permissions Report - Tauri Application

## Executive Summary

**Issue**: Users report no internet access in bundled versions on Windows and macOS.

**Status**: ⚠️ **MISSING CONFIGURATION** - The application is not properly configured for network access in Tauri v2.

---

## Current Configuration Analysis

### 1. Tauri Configuration (`tauri.conf.json`)

**Current State:**
- ✅ **CSP is null** - No Content Security Policy blocking (allows all network)
- ✅ **Updater plugin configured** - Uses HTTPS to GitHub
- ⚠️ **No explicit network scope** - But this is OK for Tauri v2 (uses native fetch)

**Note**: Tauri v2 doesn't require explicit `allowHttp` configuration like v1. Network access is controlled by platform permissions (macOS Info.plist, Windows Firewall).

### 2. macOS Configuration

**Info.plist:**
- ✅ `NSAllowsLocalNetworking: true` - Allows localhost connections
- ✅ `NSAllowsArbitraryLoads: true` - Allows all HTTP/HTTPS (⚠️ too permissive)
- ✅ `NSLocalNetworkUsageDescription` - Has description for local network
- ✅ Network entitlements in `entitlements.plist`

**Status**: ✅ **macOS is properly configured** for network access

### 3. Windows Configuration

**Current State:**
- ❌ **No Windows-specific network configuration found**
- ❌ **No firewall rules configuration**
- ❌ **No manifest file for network permissions**

**Status**: ❌ **Windows is NOT properly configured** for network access

### 4. Frontend Network Usage

**Identified Network Requests:**
1. **Localhost HTTP** (`http://localhost:8000`):
   - Daemon API calls (fetch)
   - WebSocket connections (`ws://localhost:8000`)
   - Used extensively throughout the app

2. **External HTTPS**:
   - GitHub Releases (updater)
   - HuggingFace API (if used)

---

## Tauri v2 Best Practices

### How Tauri v2 Handles Network Access

**Important**: In Tauri v2, the webview uses the native browser's `fetch()` API. Network access is controlled by:

1. **Webview Security Policy** - CSP and security settings
2. **Platform-specific permissions** - macOS Info.plist, Windows Firewall
3. **No explicit `allowHttp` in Tauri v2** - Unlike Tauri v1, v2 doesn't require explicit HTTP scope configuration for webview fetch

### Key Difference: Tauri v1 vs v2

- **Tauri v1**: Required explicit `allowHttp` scope configuration
- **Tauri v2**: Uses native browser fetch, permissions handled by platform

### What Actually Controls Network Access

1. **macOS**: `Info.plist` (NSAppTransportSecurity) - ✅ Already configured
2. **Windows**: Windows Firewall + Application manifest
3. **Linux**: No special configuration needed (AppImage runs with user permissions)

### The Real Issue

The problem is likely:
- **Windows Firewall** blocking the application
- **No application manifest** for Windows network permissions
- **Webview CSP** might be blocking (but it's set to `null`, so should be OK)

---

## Platform-Specific Issues

### macOS

**Current Status**: ✅ Mostly OK
- Entitlements configured
- Info.plist allows network
- **Potential Issue**: `NSAllowsArbitraryLoads` is too permissive (security risk)

**Recommendation**: 
- Keep `NSAllowsLocalNetworking: true`
- Consider removing `NSAllowsArbitraryLoads` and use specific domains instead

### Windows

**Current Status**: ❌ **CRITICAL ISSUE**
- No explicit network permissions in Tauri config
- Windows Firewall may block the app
- No manifest configuration

**Required Actions**:
1. **Windows Firewall**: Ensure MSI installer creates firewall exception or prompts user
2. **Application Manifest**: May need to add network capabilities to Windows manifest
3. **Testing**: Verify network access works after installation on clean Windows system

---

## Recommendations

### Immediate Actions

1. **Windows: Add Application Manifest** (if not already present):
   - Create or update `src-tauri/wix/main.wxs` or add manifest to bundle configuration
   - Ensure Windows Firewall rules are created during installation
   - MSI installer should prompt user for firewall exception

2. **Verify Windows Firewall Configuration**:
   - Check if MSI installer creates firewall rules
   - Consider adding explicit firewall rule in installer script
   - Test with Windows Firewall enabled/disabled

3. **macOS: Verify Network Permissions**:
   - Current config should work, but verify `NSLocalNetworkUsageDescription` is visible
   - Test if users see network permission prompt (they shouldn't with current config)

4. **Add Debug Logging**:
   - Log network errors with clear messages
   - Help users understand if it's a firewall/permission issue vs network issue

### Security Considerations

- ✅ **Good**: Using localhost for daemon (secure)
- ⚠️ **Warning**: `NSAllowsArbitraryLoads: true` on macOS is too permissive
- ✅ **Good**: Updater uses HTTPS to GitHub

### User Experience

**Current Behavior**:
- Users report no internet access (likely Windows Firewall blocking)
- Network requests may fail silently
- No clear error messages about network access
- macOS should work (permissions configured)

**Expected Behavior After Fix**:
- **macOS**: Should work immediately (already configured)
- **Windows**: May show one-time firewall prompt (expected and normal)
- **Linux**: Should work (no special permissions needed)
- Clear error messages if network is unavailable

---

## Testing Checklist

After implementing fixes:

- [ ] Test HTTP requests to `localhost:8000` on Windows
- [ ] Test WebSocket connections on Windows
- [ ] Test HTTP requests to `localhost:8000` on macOS
- [ ] Test WebSocket connections on macOS
- [ ] Verify no firewall prompts after first run (Windows)
- [ ] Test with firewall enabled/disabled
- [ ] Test with network disconnected (should show clear errors)

---

## References

- Tauri v2 Security Documentation
- Tauri v2 Network Permissions
- Windows Firewall Configuration
- macOS Network Entitlements

---

**Report Generated**: 2025-11-26
**Configuration Version**: Tauri v2.9.2
**Status**: ⚠️ Action Required

