#!/usr/bin/env bash
# NexaDesk One-Click Installer (macOS / Linux)
# Usage: curl -fsSL https://raw.githubusercontent.com/cn-scuo-oo/nexadesk/main/install.sh | sh

set -e

REPO="cn-scuo-oo/nexadesk"
APP_NAME="NexaDesk"

echo "⚡ $APP_NAME Installer"
echo "================================"

# Check for Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js is not installed. Please install Node.js >= 22 first."
  echo "   https://nodejs.org/en/download/"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  echo "⚠️  Node.js version $(node -v) detected. Version 22+ is recommended."
fi

# Determine install directory
INSTALL_DIR="${HOME}/.nexadesk"
if [ "$1" = "--system" ]; then
  INSTALL_DIR="/opt/nexadesk"
  if [ "$(id -u)" -ne 0 ]; then
    echo "⚠️  System install requires root. Using user directory instead."
    INSTALL_DIR="${HOME}/.nexadesk"
  fi
fi

echo "📦 Installing to: $INSTALL_DIR"

# Try to download prebuilt binary
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$ARCH" in
  x86_64) ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo "⚠️  Unsupported architecture: $ARCH. Will build from source." ;;
esac

LATEST_URL="https://api.github.com/repos/$REPO/releases/latest"
echo "🔍 Checking for latest release..."
if command -v curl &> /dev/null; then
  RELEASE_JSON=$(curl -s "$LATEST_URL" 2>/dev/null || echo "")
elif command -v wget &> /dev/null; then
  RELEASE_JSON=$(wget -q -O - "$LATEST_URL" 2>/dev/null || echo "")
else
  RELEASE_JSON=""
fi

DOWNLOAD_URL=$(echo "$RELEASE_JSON" | grep -o '"browser_download_url": *"[^"]*"' | grep -i "$OS.*$ARCH" | head -1 | sed 's/"browser_download_url": *"\(.*\)"/\1/')

if [ -n "$DOWNLOAD_URL" ]; then
  VERSION=$(echo "$RELEASE_JSON" | grep -o '"tag_name": *"[^"]*"' | head -1 | sed 's/"tag_name": *"\(.*\)"/\1/')
  echo "🔽 Downloading $APP_NAME $VERSION..."

  mkdir -p "$INSTALL_DIR"
  if command -v curl &> /dev/null; then
    curl -L "$DOWNLOAD_URL" -o "$INSTALL_DIR/nexadesk.AppImage" 2>&1
  else
    wget -O "$INSTALL_DIR/nexadesk.AppImage" "$DOWNLOAD_URL" 2>&1
  fi
  chmod +x "$INSTALL_DIR/nexadesk.AppImage"
  echo "✅ $APP_NAME installed to $INSTALL_DIR"
  echo "   Run: $INSTALL_DIR/nexadesk.AppImage"
else
  echo "⚠️  No prebuilt binary found. Building from source..."
  echo "   Make sure Node.js >= 22 and npm are installed."

  SOURCE_DIR="/tmp/nexadesk-source"
  rm -rf "$SOURCE_DIR"
  git clone "https://github.com/$REPO.git" "$SOURCE_DIR"
  cd "$SOURCE_DIR"
  npm install
  npm run build:desktop

  echo "✅ Build complete. Output in: $SOURCE_DIR/release/"
fi

echo ""
echo "🎉 $APP_NAME is ready!"
