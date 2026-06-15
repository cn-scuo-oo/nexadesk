#!/usr/bin/env pwsh
# NexaDesk One-Click Installer (Windows)
# Usage: iwr -useb https://raw.githubusercontent.com/cn-scuo-oo/nexadesk/main/install.ps1 | iex

$Repo = "cn-scuo-oo/nexadesk"
$AppName = "NexaDesk"

Write-Host "⚡ NexaDesk Installer" -ForegroundColor Green
Write-Host "================================"

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Warning "Recommended: Run this script as Administrator for system-wide install."
}

# Determine install directory
$InstallDir = "$env:LOCALAPPDATA\nexadesk"
if ($args -contains "--system") {
  $InstallDir = "$env:ProgramFiles\NexaDesk"
}

Write-Host "📦 Installing to: $InstallDir"

# Detect architecture
$arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }

# Get latest release
try {
  $release = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest"
  $asset = $release.assets | Where-Object { $_.name -like "*Setup*$arch*" -or $_.name -like "*$arch*Setup*" } | Select-Object -First 1

  if (-not $asset) {
    $asset = $release.assets | Where-Object { $_.name -like "*.exe" } | Select-Object -First 1
  }

  if (-not $asset) {
    Write-Error "No installer asset found in latest release."
    exit 1
  }

  $version = $release.tag_name
  $downloadUrl = $asset.browser_download_url
  $installerPath = "$env:TEMP\nexadesk-setup.exe"

  Write-Host "🔽 Downloading $AppName $version ($($asset.size / 1MB -as [int]) MB)..."
  Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath -UseBasicParsing

  Write-Host "🚀 Running installer..."
  Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait

  Write-Host "✅ $AppName $version installed successfully!" -ForegroundColor Green

} catch {
  # Fallback: try to build from source
  Write-Host "⚠️  Release download failed. Building from source..." -ForegroundColor Yellow
  Write-Host "Please ensure Node.js >= 22 is installed."

  $sourceDir = "$env:TEMP\nexadesk-source"
  if (Test-Path $sourceDir) { Remove-Item $sourceDir -Recurse -Force }

  & git clone "https://github.com/$Repo.git" $sourceDir 2>&1 | Out-Null
  Push-Location $sourceDir
  & npm install 2>&1 | Out-Null
  & npm run build:desktop 2>&1 | Out-Null
  Pop-Location

  Write-Host "✅ Build complete. Installer at: $sourceDir\release\" -ForegroundColor Green
}
