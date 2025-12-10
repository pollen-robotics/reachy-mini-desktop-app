# Script to sign all binaries in Windows app bundle and MSI
# Usage: .\scripts\signing\sign-windows-binaries.ps1 <path-to-exe-or-msi> [certificate-thumbprint]
#
# This script signs:
# - Main executable (.exe)
# - All DLL files (.dll)
# - MSI installer (.msi)
#
# Requires: signtool.exe, certificate PFX, and password

param(
    [Parameter(Mandatory=$true)]
    [string]$TargetPath,
    
    [string]$CertificatePath = "",
    [string]$CertificatePassword = "",
    [string]$TimestampUrl = "http://timestamp.digicert.com",
    [string]$CertificateThumbprint = ""
)

$ErrorActionPreference = "Stop"

# Colors
function Write-Info { Write-Host $args -ForegroundColor Blue }
function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Warning { Write-Host $args -ForegroundColor Yellow }
function Write-Error { Write-Host $args -ForegroundColor Red }

# Find signtool.exe
$signtoolPath = $null
$possiblePaths = @(
    "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe",
    "${env:ProgramFiles}\Windows Kits\10\bin\*\x64\signtool.exe"
)

foreach ($path in $possiblePaths) {
    $found = Get-ChildItem -Path $path -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) {
        $signtoolPath = $found.FullName
        break
    }
}

if (-not $signtoolPath) {
    Write-Error "❌ signtool.exe not found"
    Write-Warning "   Install Windows SDK: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/"
    exit 1
}

Write-Info "🔐 Signing Windows binaries"
Write-Host "   Using signtool: $signtoolPath"
Write-Host "   Target: $TargetPath"

# Get certificate from environment or parameters
if ([string]::IsNullOrEmpty($CertificatePath)) {
    if ($env:WINDOWS_CERTIFICATE_PFX) {
        # Certificate is base64 encoded in environment
        $certBase64 = $env:WINDOWS_CERTIFICATE_PFX
        $tempCertPath = [System.IO.Path]::GetTempFileName() + ".pfx"
        try {
            $certBytes = [Convert]::FromBase64String($certBase64)
            [System.IO.File]::WriteAllBytes($tempCertPath, $certBytes)
            $CertificatePath = $tempCertPath
            Write-Info "📦 Using certificate from environment variable"
        } catch {
            Write-Error "❌ Failed to decode certificate from environment"
            exit 1
        }
    } elseif ($env:WINDOWS_CERTIFICATE_THUMBPRINT) {
        # Use certificate from certificate store by thumbprint
        $CertificateThumbprint = $env:WINDOWS_CERTIFICATE_THUMBPRINT
        Write-Info "📦 Using certificate from certificate store (thumbprint)"
    } else {
        Write-Error "❌ No certificate provided"
        Write-Warning "   Set WINDOWS_CERTIFICATE_PFX environment variable"
        Write-Warning "   Or provide -CertificatePath parameter"
        exit 1
    }
}

# Get password from environment or parameters
if ([string]::IsNullOrEmpty($CertificatePassword)) {
    $CertificatePassword = $env:WINDOWS_CERTIFICATE_PASSWORD
    if ([string]::IsNullOrEmpty($CertificatePassword)) {
        Write-Error "❌ Certificate password not provided"
        Write-Warning "   Set WINDOWS_CERTIFICATE_PASSWORD environment variable"
        Write-Warning "   Or provide -CertificatePassword parameter"
        exit 1
    }
}

# Timestamp URL
if ([string]::IsNullOrEmpty($TimestampUrl)) {
    $TimestampUrl = $env:WINDOWS_TIMESTAMP_URL
    if ([string]::IsNullOrEmpty($TimestampUrl)) {
        $TimestampUrl = "http://timestamp.digicert.com"
    }
}

$ErrorCount = 0

# Function to sign a file
function Sign-File {
    param(
        [string]$FilePath,
        [string]$CertPath,
        [string]$CertPassword,
        [string]$Thumbprint,
        [string]$Timestamp
    )
    
    if (-not (Test-Path $FilePath)) {
        Write-Warning "⚠️  File not found: $FilePath"
        return $false
    }
    
    Write-Info "   Signing: $FilePath"
    
    # Build signtool command
    $signArgs = @(
        "sign"
        "/fd", "sha256"
        "/tr", $Timestamp
        "/td", "sha256"
    )
    
    if (-not [string]::IsNullOrEmpty($Thumbprint)) {
        # Use certificate from store
        $signArgs += "/sha1", $Thumbprint
    } else {
        # Use PFX file
        $signArgs += "/f", $CertPath
        $signArgs += "/p", $CertPassword
    }
    
    $signArgs += $FilePath
    
    try {
        $process = Start-Process -FilePath $signtoolPath -ArgumentList $signArgs -Wait -NoNewWindow -PassThru -RedirectStandardOutput ([System.IO.Path]::GetTempFileName()) -RedirectStandardError ([System.IO.Path]::GetTempFileName())
        
        if ($process.ExitCode -eq 0) {
            Write-Success "   ✓ Signed: $FilePath"
            return $true
        } else {
            Write-Warning "   ⚠️  Failed to sign: $FilePath (exit code: $($process.ExitCode))"
            return $false
        }
    } catch {
        Write-Warning "   ⚠️  Error signing $FilePath : $($_.Exception.Message)"
        return $false
    }
}

# Function to verify signature
function Verify-Signature {
    param([string]$FilePath)
    
    $verifyArgs = @("verify", "/pa", "/v", $FilePath)
    
    try {
        $process = Start-Process -FilePath $signtoolPath -ArgumentList $verifyArgs -Wait -NoNewWindow -PassThru -RedirectStandardOutput ([System.IO.Path]::GetTempFileName()) -RedirectStandardError ([System.IO.Path]::GetTempFileName())
        return $process.ExitCode -eq 0
    } catch {
        return $false
    }
}

# Determine what to sign
if (Test-Path $TargetPath -PathType Container) {
    # Directory: sign all executables and DLLs
    Write-Info "📦 Signing all binaries in directory..."
    
    # Sign all .exe files
    Get-ChildItem -Path $TargetPath -Filter "*.exe" -Recurse | ForEach-Object {
        if (-not (Sign-File -FilePath $_.FullName -CertPath $CertificatePath -CertPassword $CertificatePassword -Thumbprint $CertificateThumbprint -Timestamp $TimestampUrl)) {
            $script:ErrorCount++
        }
    }
    
    # Sign all .dll files
    Get-ChildItem -Path $TargetPath -Filter "*.dll" -Recurse | ForEach-Object {
        if (-not (Sign-File -FilePath $_.FullName -CertPath $CertificatePath -CertPassword $CertificatePassword -Thumbprint $CertificateThumbprint -Timestamp $TimestampUrl)) {
            $script:ErrorCount++
        }
    }
    
    # Sign all .pyd files (Python extensions - equivalent to .so on Linux/macOS)
    # These are DLLs but with .pyd extension, critical for Python to load extensions
    Get-ChildItem -Path $TargetPath -Filter "*.pyd" -Recurse | ForEach-Object {
        if (-not (Sign-File -FilePath $_.FullName -CertPath $CertificatePath -CertPassword $CertificatePassword -Thumbprint $CertificateThumbprint -Timestamp $TimestampUrl)) {
            $script:ErrorCount++
        }
    }
} elseif ($TargetPath -like "*.exe") {
    # Single executable
    Write-Info "📦 Signing executable..."
    if (-not (Sign-File -FilePath $TargetPath -CertPath $CertificatePath -CertPassword $CertificatePassword -Thumbprint $CertificateThumbprint -Timestamp $TimestampUrl)) {
        $ErrorCount++
    }
} elseif ($TargetPath -like "*.msi") {
    # MSI installer
    Write-Info "📦 Signing MSI installer..."
    if (-not (Sign-File -FilePath $TargetPath -CertPath $CertificatePath -CertPassword $CertificatePassword -Thumbprint $CertificateThumbprint -Timestamp $TimestampUrl)) {
        $ErrorCount++
    }
} elseif ($TargetPath -like "*.pyd") {
    # Python extension (DLL with .pyd extension)
    Write-Info "📦 Signing Python extension..."
    if (-not (Sign-File -FilePath $TargetPath -CertPath $CertificatePath -CertPassword $CertificatePassword -Thumbprint $CertificateThumbprint -Timestamp $TimestampUrl)) {
        $ErrorCount++
    }
} else {
    Write-Error "❌ Unknown file type: $TargetPath"
    Write-Warning "   Expected: .exe, .dll, .pyd, .msi, or directory"
    exit 1
}

# Verify signatures
Write-Info "✅ Verifying signatures..."
if (Test-Path $TargetPath -PathType Container) {
    $allVerified = $true
    Get-ChildItem -Path $TargetPath -Include "*.exe", "*.dll", "*.pyd" -Recurse | ForEach-Object {
        if (-not (Verify-Signature -FilePath $_.FullName)) {
            Write-Warning "   ⚠️  Signature verification failed: $($_.FullName)"
            $allVerified = $false
        }
    }
    if (-not $allVerified) {
        Write-Error "❌ Some signatures failed verification"
        exit 1
    }
} else {
    if (-not (Verify-Signature -FilePath $TargetPath)) {
        Write-Error "❌ Signature verification failed"
        exit 1
    }
}

# Cleanup temp certificate file if created
if ($tempCertPath -and (Test-Path $tempCertPath)) {
    Remove-Item $tempCertPath -Force
}

# Summary
if ($ErrorCount -gt 0) {
    Write-Warning "⚠️  Warning: $ErrorCount files failed to sign (may not be critical)"
} else {
    Write-Success "✅ All binaries signed successfully!"
}

Write-Host ""
Write-Info "📋 Signed files summary:"
if (Test-Path $TargetPath -PathType Container) {
    Get-ChildItem -Path $TargetPath -Include "*.exe", "*.dll", "*.pyd" -Recurse | ForEach-Object {
        Write-Host "   $($_.FullName)"
    }
} else {
    Write-Host "   $TargetPath"
}

