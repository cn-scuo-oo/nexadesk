@echo off
echo ========================================
echo   NexaDesk Dev Server
echo ========================================
cd /d "%~dp0"

echo.
echo [1/3] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Install Node 22+ from https://nodejs.org
    pause
    exit /b 1
)
echo Node.js OK

echo.
echo [2/3] Installing dependencies...
call npm ci --include=dev
if errorlevel 1 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)

echo.
echo [3/3] Starting dev server...
echo.
echo ========================================
echo   Open http://localhost:5173 in browser
echo   Press Ctrl+C to stop
echo ========================================
echo.
call npm run dev
