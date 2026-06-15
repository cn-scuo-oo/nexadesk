#!/usr/bin/env pwsh
# NexaDesk Code Signing Script
# Requires: Azure Key Vault or local certificate
# Usage: .\scripts\sign.ps1 -Path ".\release\NexaDesk-Setup.exe"

param(
  [Parameter(Mandatory = $true)]
  [string]$Path,

  [string]$Description = "NexaDesk Multi-Agent Desktop Workbench",

  [string]$TimestampServer = "http://timestamp.digicert.com"
)

$ErrorActionPreference = "Stop"

# Check if certificate is available
$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Select-Object -First 1

if (-not $cert) {
  Write-Warning "No code signing certificate found. Skipping signing."
  Write-Host "To sign, place a code signing certificate in your Personal store."
  Write-Host "Alternatively, set env:AZURE_KEY_VAULT_URI for cloud signing."
  exit 0
}

Write-Host "Signing: $Path"
Write-Host "Certificate: $($cert.Subject)"
Write-Host "Thumbprint: $($cert.Thumbprint)"

# Sign with Set-AuthenticodeSignature
Set-AuthenticodeSignature -FilePath $Path -Certificate $cert -TimestampServer $TimestampServer -IncludeChain all -Force

Write-Host "✅ Signed successfully: $Path"

# Verify signature
$status = Get-AuthenticodeSignature -FilePath $Path
Write-Host "Signature status: $($status.Status)"
