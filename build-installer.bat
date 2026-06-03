@echo off
echo ========================================
echo   NexaDesk Windows Installer Builder
echo ========================================
cd /d "%~dp0"

echo.
echo [1/4] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Install Node 22+ from https://nodejs.org
    pause
    exit /b 1
)

echo.
echo [2/4] Installing dependencies...
call npm ci --include=dev
if errorlevel 1 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)

echo.
echo [3/4] Building desktop app...
call npm run build:desktop
if errorlevel 1 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo [4/4] Packaging Windows installer...
call npm run dist:win
if errorlevel 1 (
    echo ERROR: Packaging failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Done! Installer in release\ folder
echo ========================================
echo.
pause
