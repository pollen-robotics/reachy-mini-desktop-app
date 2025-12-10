# Script to prepare GitHub Actions secrets values for Windows code signing
# Usage: .\scripts\signing\prepare-windows-secrets.ps1 [CERTIFICATE_PATH] [PASSWORD]
#        If password is not provided, it will be requested interactively

param(
    [string]$CertificatePath = "",
    [string]$Password = ""
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

Write-Info "🔐 Preparing GitHub Actions Secrets for Windows Code Signing"
Write-Host ""

# Look for certificate file
if ([string]::IsNullOrEmpty($CertificatePath)) {
    $certFiles = @(
        "certificate.pfx",
        "code-signing.pfx",
        "windows-certificate.pfx"
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
    Write-Error "❌ Certificate file not found (.pfx)"
    Write-Warning "   Place certificate.pfx or code-signing.pfx at the project root"
    Write-Warning "   Or specify with: -CertificatePath 'path\to\cert.pfx'"
    exit 1
}

Write-Info "📁 File found: $CertificatePath"
Write-Host ""

# Encode certificate in base64
Write-Info "📦 Encoding certificate in base64..."
$certBytes = [System.IO.File]::ReadAllBytes($CertificatePath)
$certBase64 = [Convert]::ToBase64String($certBytes)

# Get password if not provided
if ([string]::IsNullOrEmpty($Password)) {
    Write-Info "📝 Please provide the certificate password:"
    $securePassword = Read-Host -AsSecureString "Certificate password"
    $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    )
}

# Extract certificate information
Write-Info "🔍 Extracting certificate information..."
try {
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(
        $CertificatePath,
        $Password
    )
    
    $thumbprint = $cert.Thumbprint
    $subject = $cert.Subject
    
    Write-Success "✅ Certificate information extracted"
    Write-Host "   Subject: $subject"
    Write-Host "   Thumbprint: $thumbprint"
} catch {
    Write-Error "❌ Error during extraction. Check the password."
    Write-Error "   Error: $($_.Exception.Message)"
    exit 1
}

Write-Host ""
Write-Success "===================================="
Write-Success "📋 Values for GitHub Secrets"
Write-Success "===================================="
Write-Host ""
Write-Warning "1. Go to GitHub → Settings → Secrets and variables → Actions"
Write-Warning "2. Add these 3 secrets:"
Write-Host ""

Write-Info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Info "Secret: WINDOWS_CERTIFICATE_PFX"
Write-Info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host $certBase64
Write-Host ""

Write-Info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Info "Secret: WINDOWS_CERTIFICATE_PASSWORD"
Write-Info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host $Password
Write-Host ""
Write-Warning "⚠️  Copy the password above"
Write-Host ""

Write-Info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Info "Secret: WINDOWS_CERTIFICATE_THUMBPRINT (Optional)"
Write-Info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host $thumbprint
Write-Host ""
Write-Info "💡 This is optional but can be useful for certificate store lookup"
Write-Host ""

Write-Success "✅ Once these secrets are added, GitHub Actions will sign automatically!"
Write-Host ""

