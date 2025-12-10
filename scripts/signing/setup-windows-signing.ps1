# Script to configure Windows Code Signing environment variables
# Usage: .\scripts\signing\setup-windows-signing.ps1
#
# ⚠️ SECURITY: This script does NOT log secrets in history
# Variables are exported only in the current session

param(
    [string]$CertificatePath = "",
    [string]$CertificatePassword = "",
    [string]$TimestampUrl = "http://timestamp.digicert.com"
)

$ErrorActionPreference = "Stop"

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PROJECT_DIR = Split-Path -Parent (Split-Path -Parent $SCRIPT_DIR)
Set-Location $PROJECT_DIR

# Colors
function Write-Info { Write-Host $args -ForegroundColor Blue }
function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Warning { Write-Host $args -ForegroundColor Yellow }
function Write-Error { Write-Host $args -ForegroundColor Red }

Write-Info "🔐 Windows Code Signing Configuration"
Write-Host ""

# Check for signtool.exe
$signtoolPath = $null
$possiblePaths = @(
    "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe",
    "${env:ProgramFiles}\Windows Kits\10\bin\*\x64\signtool.exe",
    "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe"
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
    Write-Warning "   Install Windows SDK or Visual Studio Build Tools"
    Write-Warning "   Download: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/"
    exit 1
}

Write-Success "✅ signtool.exe found: $signtoolPath"
$env:SIGNTOOL_PATH = $signtoolPath

# Look for certificate file
if ([string]::IsNullOrEmpty($CertificatePath)) {
    $certFiles = @(
        "certificate.pfx",
        "code-signing.pfx",
        "windows-certificate.pfx",
        "*.pfx"
    )
    
    foreach ($pattern in $certFiles) {
        $found = Get-ChildItem -Path $PROJECT_DIR -Filter $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) {
            $CertificatePath = $found.FullName
            break
        }
    }
}

if ([string]::IsNullOrEmpty($CertificatePath) -or -not (Test-Path $CertificatePath)) {
    Write-Error "❌ Certificate file not found"
    Write-Warning "   Place your .pfx certificate file at the project root"
    Write-Warning "   Or specify with: -CertificatePath 'path\to\cert.pfx'"
    exit 1
}

Write-Success "✅ Certificate found: $CertificatePath"

# Encode certificate in base64
Write-Info "📦 Encoding certificate in base64..."
$certBytes = [System.IO.File]::ReadAllBytes($CertificatePath)
$certBase64 = [Convert]::ToBase64String($certBytes)
$env:WINDOWS_CERTIFICATE_PFX = $certBase64

Write-Success "✅ Certificate encoded"

# Get certificate password
if ([string]::IsNullOrEmpty($CertificatePassword)) {
    Write-Info "📝 Please provide the certificate password:"
    $securePassword = Read-Host -AsSecureString "Certificate password"
    $CertificatePassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    )
}

$env:WINDOWS_CERTIFICATE_PASSWORD = $CertificatePassword

# Extract certificate thumbprint (optional, for auto-detection)
Write-Info "🔍 Extracting certificate information..."
try {
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(
        $CertificatePath,
        $CertificatePassword
    )
    
    $thumbprint = $cert.Thumbprint
    $subject = $cert.Subject
    $issuer = $cert.Issuer
    
    Write-Success "✅ Certificate information extracted:"
    Write-Host "   Subject: $subject"
    Write-Host "   Issuer: $issuer"
    Write-Host "   Thumbprint: $thumbprint"
    
    $env:WINDOWS_CERTIFICATE_THUMBPRINT = $thumbprint
} catch {
    Write-Warning "⚠️  Could not extract certificate information (password may be incorrect)"
    Write-Warning "   Error: $($_.Exception.Message)"
}

# Timestamp URL
$env:WINDOWS_TIMESTAMP_URL = $TimestampUrl
Write-Info "📅 Timestamp URL: $TimestampUrl"

# Verify certificate can be used for signing
Write-Info "🔍 Verifying certificate can be used for code signing..."
try {
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(
        $CertificatePath,
        $CertificatePassword
    )
    
    $hasCodeSigning = $false
    foreach ($usage in $cert.EnhancedKeyUsageList) {
        if ($usage.FriendlyName -like "*Code Signing*" -or $usage.Value -eq "1.3.6.1.5.5.7.3.3") {
            $hasCodeSigning = $true
            break
        }
    }
    
    if ($hasCodeSigning) {
        Write-Success "✅ Certificate is valid for code signing"
    } else {
        Write-Warning "⚠️  Certificate may not be valid for code signing"
        Write-Warning "   Check Enhanced Key Usage (EKU) extensions"
    }
} catch {
    Write-Warning "⚠️  Could not verify certificate: $($_.Exception.Message)"
}

Write-Host ""
Write-Success "===================================="
Write-Success "✅ Environment variables configured!"
Write-Success "===================================="
Write-Host ""
Write-Info "Exported variables (values masked for security):"
Write-Host "  SIGNTOOL_PATH=$signtoolPath"
Write-Host "  WINDOWS_CERTIFICATE_PFX=${certBase64.Substring(0, [Math]::Min(50, $certBase64.Length))}... ($($certBase64.Length) characters total)"
Write-Host "  WINDOWS_CERTIFICATE_PASSWORD=***masked***"
if ($env:WINDOWS_CERTIFICATE_THUMBPRINT) {
    Write-Host "  WINDOWS_CERTIFICATE_THUMBPRINT=$env:WINDOWS_CERTIFICATE_THUMBPRINT"
}
Write-Host "  WINDOWS_TIMESTAMP_URL=$TimestampUrl"
Write-Host ""
Write-Warning "⚠️  Full values are in environment variables but are not displayed here"
Write-Host ""
Write-Info "💡 To use these variables in another terminal:"
Write-Host "  .\scripts\signing\setup-windows-signing.ps1"
Write-Host ""
Write-Info "💡 To build with signature:"
Write-Host "  yarn tauri build"

